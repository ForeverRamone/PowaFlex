/**
 * GENERADOR DEL RANKING EMPAQUETADO DE FILMAFFINITY.
 *
 *   npm run snapshot:fa               # todos los países con ranking
 *   npm run snapshot:fa -- --pais=ES  # uno suelto, o para rematar los que falten
 *
 * Baja los rankings por país de FilmAffinity, los empareja con TMDB y escribe
 * `server/src/data/filmaffinity-2026.js` con el `tmdb_id` ya resuelto. A partir
 * de ahí la aplicación sirve esas listas SIN salir a internet.
 *
 * POR QUÉ EMPAQUETADO Y NO EN VIVO. El servidor no puede bajarlo: FilmAffinity
 * está detrás de Cloudflare y responde 403 a las peticiones de Node —distingue
 * por la huella TLS del cliente, no por las cabeceras— mientras que a curl le
 * responde 200. Perseguir esa diferencia sería pelearse con su detección de
 * bots, y encima dejaría la función colgando de que mañana siga funcionando en
 * el Beelink. Empaquetado se baja UNA vez, aquí, y lo que viaja al contenedor
 * es un fichero de datos: el mismo trato que los palmareses de Wikipedia.
 *
 * Por eso la descarga va por `curl` y no por `fetch`. Se pide igual que su
 * propia página: el POST que dispara la flecha de «ver más» (`from`, `count`,
 * `rankingId`), que es lo que sirve las cien de una tacada.
 *
 * Se usa la edición inglesa (`/en/`) a propósito: da los títulos en inglés, que
 * es contra lo que sabe emparejar `resolveFilms` —la casa ya aprendió que TMDB
 * compara con el título original y con el traducido, nunca con el inglés, si le
 * pides español.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RANKINGS, parsearFichas } from '../src/filmaffinity.js';
import { FA_RANKINGS } from '../src/data/filmaffinity-2026.js';
import { resolveFilms } from '../src/festivals.js';
import { movieDetail } from '../src/tmdb.js';
import { normName } from '../src/names.js';

/**
 * Lo que delata a una ficha DERIVADA de la película, no la película.
 *
 * Las que se colaban duraban lo que un largometraje y compartían año, así que
 * ni la duración ni la fecha las cazaban: «Sonata de otoño» acabó apuntando a
 * «The Making of Autumn Sonata» (206 minutos, 1978) y «Guerra y paz» a su
 * Parte II. Lo que las delata es que el título de TMDB AÑADE algo que el de
 * FilmAffinity no dice.
 */
// Lo que NUNCA es la película: el making-of, la prueba de cámara, el reportaje.
const DERIVADAS = ['makingof', 'behindthescenes', 'screentest', 'bakom', 'comosehizo', 'elrodajede'];

/**
 * Y las marcas de PARTE, que son otra cosa y piden más cuidado.
 *
 * Una ficha que dice «Parte II» cuando el ranking pedía la película entera es
 * un emparejado falso («Guerra y paz» apuntaba a la Parte II). Pero si el
 * ranking YA pedía una parte —«Ivan the Terrible. Part II»— entonces la ficha
 * con parte es la correcta, y rechazarla es el error contrario.
 *
 * Como el título de la ficha llega en el idioma de la aplicación y el del
 * ranking viene en inglés, no se pueden comparar marca a marca: «Part II» y
 * «segunda parte» son la misma cosa escrita en dos sitios distintos. Así que la
 * pregunta no es cuál coincide, sino si el título de origen habla de partes EN
 * ABSOLUTO.
 */
// Se comprueba sobre el título CRUDO y con límites de palabra, no sobre el
// normalizado: normName quita los espacios, y buscando «parti» ahí dentro se
// rechazaban «Una jornada PARTIcular», «Sin señas PARTIculares» y «Desierto
// PARTIcular», que son las películas correctas.
const PARTE = /\b(part|parte|vol|volume)\.?\s*(i{1,3}|iv|v|one|two|three|dos|tres|\d{1,2})\b|\b(primera|segunda|tercera|first|second|third|fourth)\s+(parte|part)\b/i;

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nombre, pordefecto = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return m ? m.slice(nombre.length + 3) : pordefecto;
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const CUANTAS = Number(arg('cuantas', 100));
const destino = path.join(raiz, 'src/data/filmaffinity-2026.js');

/** Una tanda del ranking, pedida como la pide su propia página. */
function bajar(rankingId, from, count) {
  return execFileSync(
    'curl',
    [
      '-s', '-m', '40', '-A', UA,
      '-X', 'POST', 'https://www.filmaffinity.com/en/ranking.php',
      '--data', `from=${from}&count=${count}&rankingId=${rankingId}&chv=0`,
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// La cabecera del fichero generado, en trozos para no anidar plantillas.
const CABECERA = [
  '/**',
  ' * RANKINGS POR PAÍS DE FILMAFFINITY, EMPAQUETADOS.',
  ' *',
  ' * Generado por server/tools/snapshot-filmaffinity.mjs — no se edita a mano.',
  ' *',
  ' * Cada fila: p = puesto, t = título, y = año, d = dirección, i = id de TMDB',
  ' * (null si no se pudo emparejar: mejor sin ficha que la ficha de otra) y o =',
  ' * el título original, cuando FilmAffinity lo trae entre paréntesis.',
  ' *',
  ' * El porqué de que esto viaje empaquetado y no se baje en caliente está en la',
  ' * cabecera de la herramienta que lo genera.',
  ' */',
].join('\n');

/**
 * Se PARTE de lo ya empaquetado, y se escribe DESPUÉS DE CADA PAÍS.
 *
 * Las dos cosas por el mismo motivo, y las dos aprendidas perdiéndolo: la
 * primera versión guardaba una sola vez al terminar y machacaba el fichero
 * entero, así que un corte a mitad —el proceso muerto, un Ctrl+C, FilmAffinity
 * cerrando el grifo— tiraba los trece países ya bajados, y volver a pasarla
 * para uno suelto borraba los otros trece.
 */
const salida = { ...FA_RANKINGS };

function escribir() {
  const cuerpo = `${CABECERA}\nexport const FA_RANKINGS = ${JSON.stringify(salida, null, 0)};\n`;
  fs.writeFileSync(destino, cuerpo);
  return cuerpo.length;
}

const paises = arg('pais') ? [arg('pais').toUpperCase()] : Object.keys(RANKINGS);

for (const iso of paises) {
  const rankingId = RANKINGS[iso];
  if (!rankingId) {
    console.error(`  ${iso}: FilmAffinity no tiene ranking, se salta`);
    continue;
  }
  process.stdout.write(`${iso}: bajando… `);
  const filas = parsearFichas(bajar(rankingId, 0, CUANTAS));
  if (!filas.length) {
    // No es un fallo de red: es una página sin fichas. Pasa cuando se le piden
    // muchos países seguidos, y pasaría también si cambiaran la plantilla.
    console.log('SIN FICHAS (¿va muy rápido, o cambió la página?)');
    continue;
  }
  process.stdout.write(`${filas.length} · emparejando… `);

  const { films } = await resolveFilms(
    // el título original va aparte cuando lo trae entre paréntesis: sin eso se
    // pierden «La lengua de las mariposas» y las de su clase
    filas.map((f) => ({ title: f.title, original_title: f.original_title, year: f.year, director: f.director })),
    (r) => r.year
  );

  /**
   * LA FICHA EMPAREJADA, VERIFICADA CONTRA TMDB.
   *
   * El emparejador de la casa acepta una ficha con el nombre de quien dirige
   * aunque el título no case, y con eso se colaron once películas que eran
   * OTRA: el screen test de Marlene Dietrich de cuatro minutos por «El ángel
   * azul», el making-of de «Sonata de otoño» por la película, un esbozo vacío
   * chino por «El crack» de Garci. Todas comparten la misma pinta —fichas
   * huérfanas: sin votos, sin duración de largometraje, o con un año que no es
   * el que dice FilmAffinity—, así que se comprueban aquí una a una.
   *
   * Manda la regla de la casa: MEJOR SIN FICHA QUE LA FICHA DE OTRA. Lo que no
   * pasa el filtro se guarda con el id a null y se cuenta como no emparejada.
   */
  const sospechosa = async (id, orig) => {
    try {
      const d = await movieDetail(id);
      const anio = Number(String(d.release_date || '').slice(0, 4)) || null;
      if (!anio) return 'sin fecha';
      if (orig.year && Math.abs(anio - orig.year) > 2) return `año ${anio} frente a ${orig.year}`;
      if ((d.runtime || 0) > 0 && d.runtime < 40) return `${d.runtime} min: no es un largometraje`;
      if ((d.vote_count || 0) === 0 && (d.runtime || 0) === 0) return 'ficha vacía';
      const deLaFicha = `${normName(d.title)} ${normName(d.original_title || '')}`;
      const deOrigen = [orig.title, orig.original_title].filter(Boolean).join(' ');
      const suyo = normName(deOrigen);
      // 1. lo derivado nunca es la película
      for (const marca of DERIVADAS) {
        if (deLaFicha.includes(marca) && !suyo.includes(marca)) return `«${d.title}» no es la película`;
      }
      // 2. una parte suelta solo vale si el ranking pedía una parte
      const fichaEsParte = PARTE.test(d.title || '') || PARTE.test(d.original_title || '');
      if (fichaEsParte && !PARTE.test(deOrigen)) return `«${d.title}» es solo una parte`;
      return null;
    } catch {
      return null; // si TMDB no contesta no se condena a nadie
    }
  };

  const rows = [];
  const vistos = new Set();
  let tiradas = 0;
  for (let i = 0; i < films.length; i++) {
    const orig = filas[i];
    const f = films[i];
    // sin ficha de TMDB no hay cartel ni id con el que cruzar tu Plex: se
    // guarda igual, con el id a null, para poder DECIR cuántas faltan en vez
    // de que la lista encoja en silencio
    let id = f?.tmdb_id && !vistos.has(f.tmdb_id) ? f.tmdb_id : null;
    if (id) {
      const motivo = await sospechosa(id, orig);
      if (motivo) {
        console.error(`    ✕ #${i + 1} «${orig.title}» → tmdb ${id}: ${motivo}`);
        tiradas++;
        id = null;
      }
    }
    if (id) vistos.add(id);
    rows.push({
      p: i + 1,
      t: orig.title,
      y: orig.year,
      d: orig.director,
      i: id,
      ...(orig.original_title ? { o: orig.original_title } : {}),
    });
  }
  if (tiradas) process.stdout.write(`(${tiradas} descartadas por no ser la película) `);

  salida[iso] = { hasta: new Date().toISOString().slice(0, 10), rows };
  escribir();
  console.log(`${rows.filter((r) => r.i).length}/${rows.length} con ficha`);

  // Un respiro largo entre países. Con segundo y medio, FilmAffinity devolvía
  // páginas vacías a partir del tercero o el cuarto y el paquete salía con
  // países a medias sin que nada lo dijera.
  await esperar(6000);
}

const bytes = escribir();
const faltan = Object.keys(RANKINGS).filter((iso) => !salida[iso]?.rows?.length);
console.log(`\nEscrito ${destino} (${Object.keys(salida).length} países, ${(bytes / 1024).toFixed(0)} KB)`);
if (faltan.length) console.log(`Sin bajar todavía: ${faltan.join(', ')} — vuelve a pasarla con --pais=XX`);
