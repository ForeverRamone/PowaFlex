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
 * La descarga y la comprobación de que la ficha emparejada es LA PELÍCULA
 * viven en `fa-comun.mjs`, compartidas con las otras dos herramientas de
 * FilmAffinity: son la misma regla y tenerla por triplicado era tenerla tres
 * veces distinta dentro de dos versiones.
 *
 * Se usa la edición inglesa (`/en/`) a propósito: da los títulos en inglés, que
 * es contra lo que sabe emparejar `resolveFilms` —la casa ya aprendió que TMDB
 * compara con el título original y con el traducido, nunca con el inglés, si le
 * pides español.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RANKINGS, parsearFichas, esSerieFA } from '../src/filmaffinity.js';
import { FA_RANKINGS } from '../src/data/filmaffinity-2026.js';
import { resolveFilms } from '../src/festivals.js';
import { bajarRanking, esSospechosa, esperar, rescatarPorDireccion } from './fa-comun.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nombre, pordefecto = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return m ? m.slice(nombre.length + 3) : pordefecto;
};

const CUANTAS = Number(arg('cuantas', 100));
const destino = path.join(raiz, 'src/data/filmaffinity-2026.js');

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
  const filas = parsearFichas(bajarRanking(rankingId, 0, CUANTAS));
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

  // La ficha emparejada se verifica contra TMDB antes de darla por buena: manda
  // la regla de la casa, MEJOR SIN FICHA QUE LA FICHA DE OTRA. Lo que no pasa el
  // filtro se guarda con el id a null y se cuenta como no emparejada. El porqué
  // de cada comprobación está en `esSospechosa` (fa-comun.mjs).

  const rows = [];
  const vistos = new Set();
  let tiradas = 0;
  let rescatadas = 0;
  for (let i = 0; i < films.length; i++) {
    const orig = filas[i];
    const f = films[i];
    // sin ficha de TMDB no hay cartel ni id con el que cruzar tu Plex: se
    // guarda igual, con el id a null, para poder DECIR cuántas faltan en vez
    // de que la lista encoja en silencio
    let id = f?.tmdb_id && !vistos.has(f.tmdb_id) ? f.tmdb_id : null;
    // el emparejado por título no llegó: se pregunta por quien firma (ver
    // `rescatarPorDireccion`), que es lo que rescata los títulos que
    // FilmAffinity traduce por su cuenta y TMDB no usa
    if (!id && !esSerieFA(orig.marca)) {
      const rescatado = await rescatarPorDireccion(orig);
      if (rescatado && !vistos.has(rescatado) && !(await esSospechosa(rescatado, orig))) {
        id = rescatado;
        rescatadas++;
      }
    }
    if (id) {
      const fallo = await esSospechosa(id, orig);
      if (fallo) {
        console.error(`    ✕ #${i + 1} «${orig.title}» → tmdb ${id}: ${fallo.motivo}`);
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
  if (rescatadas) process.stdout.write(`(${rescatadas} rescatadas por dirección) `);
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
