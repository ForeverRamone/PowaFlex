/**
 * GENERADOR DEL TOP 1000 DE FILMAFFINITY.
 *
 *   npm run snapshot:fa1000 -- --csv="F:/FA to Letterboxd/fa-top1000-letterboxd.csv"
 *
 * Lee el CSV del ranking (Title, Year, Directors), lo empareja con TMDB y
 * escribe `server/src/data/fa-top1000.js`. A partir de ahí el canon se sirve sin
 * salir a internet, como Sight & Sound o las 1001.
 *
 * POR QUÉ DE UN CSV Y NO DE LA WEB. El ranking vive en
 * https://www.filmaffinity.com/en/ranking.php?rn=ranking_fa_movies y su servidor
 * contesta 403 a Node —distingue por la huella TLS del cliente—, así que bajarlo
 * en caliente no es una opción (el porqué largo está en la cabecera de
 * `snapshot-filmaffinity.mjs`). El CSV lo exportó Ramón y trae exactamente los
 * tres campos que `resolveFilms` sabe usar.
 *
 * LA VERIFICACIÓN NO ES OPCIONAL. El emparejador de la casa da por buena una
 * ficha cuando el nombre de quien dirige casa aunque el título no, y en el
 * ranking por países eso metió once películas que eran OTRA: una prueba de
 * cámara de cuatro minutos por «El ángel azul», el making-of de «Sonata de
 * otoño» por la película, la Parte II de «Guerra y paz» por la entera. Aquí se
 * comprueba lo mismo: fecha, duración, distancia de año y marcas de obra
 * derivada. Manda la regla de la casa — mejor sin ficha que la ficha de otra.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { resolveFilms } from '../src/festivals.js';
import { movieDetail } from '../src/tmdb.js';
import { normName } from '../src/names.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nombre, pordefecto = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return m ? m.slice(nombre.length + 3) : pordefecto;
};

const origen = arg('csv');
if (!origen) {
  console.error('Falta el CSV: --csv="ruta/al/fa-top1000-letterboxd.csv"');
  process.exit(1);
}

// Lo mismo que en el ranking por países: lo derivado nunca es la película, y
// una parte suelta solo vale si la lista pedía una parte.
const DERIVADAS = ['makingof', 'behindthescenes', 'screentest', 'bakom', 'comosehizo', 'elrodajede'];
const PARTE =
  /\b(part|parte|vol|volume)\.?\s*(i{1,3}|iv|v|one|two|three|dos|tres|\d{1,2})\b|\b(primera|segunda|tercera|first|second|third|fourth)\s+(parte|part)\b/i;

async function sospechosa(id, fila) {
  try {
    const d = await movieDetail(id);
    const anio = Number(String(d.release_date || '').slice(0, 4)) || null;
    if (!anio) return 'sin fecha';
    if (fila.year && Math.abs(anio - fila.year) > 2) return `año ${anio} frente a ${fila.year}`;
    if ((d.runtime || 0) > 0 && d.runtime < 40) return `${d.runtime} min: no es un largometraje`;
    if ((d.vote_count || 0) === 0 && (d.runtime || 0) === 0) return 'ficha vacía';
    const deLaFicha = `${normName(d.title)} ${normName(d.original_title || '')}`;
    const suyo = normName(fila.title);
    for (const marca of DERIVADAS) {
      if (deLaFicha.includes(marca) && !suyo.includes(marca)) return `«${d.title}» no es la película`;
    }
    const fichaEsParte = PARTE.test(d.title || '') || PARTE.test(d.original_title || '');
    if (fichaEsParte && !PARTE.test(fila.title)) return `«${d.title}» es solo una parte`;
    return null;
  } catch {
    return null; // si TMDB no contesta no se condena a nadie
  }
}

/**
 * LAS QUE HAY QUE EMPAREJAR A MANO, con el porqué de cada una.
 *
 * El emparejador automático no llega a estas veinte, y no por ser oscuras: casi
 * todas fallan por el TÍTULO. FilmAffinity escribe «The Downfall: Hitler and
 * the End of the Third Reich» donde TMDB dice «Downfall», «Love» donde TMDB
 * dice «Amour», «The Cry» donde dice «Il grido». Se verificaron una a una
 * contra TMDB (año, dirección y duración) antes de escribirlas aquí.
 *
 * Van en el código y no en la base porque el dataset viaja al contenedor: una
 * corrección guardada en `match_overrides` vive solo en la máquina donde se
 * hizo, y regenerar el paquete en otra la perdería.
 */
const CORRECCIONES = {
  // El título y la dirección son exactos; TMDB la fecha en 2011, que es cuando
  // se proyectó el montaje único, y FilmAffinity en 2004. Es la misma.
  10: 414419,
  135: 34528, // TMDB la titula sin el «The» de «The Road to Eternity»
  141: 614, // el automático cogía un making-of de 14 minutos
  223: 12761, // cogía «The Making of Autumn Sonata»
  362: 228, // cogía una prueba de cámara de Marlene Dietrich, de 4 minutos
  534: 25538, // TMDB la llama solo «Yi Yi»
  587: 489412, // el «(Film)» del título se leía como título original
  601: 86837, // «Love» a secas casa con cientos: es «Amour»
  626: 149871, // TMDB dice «The Tale of THE Princess Kaguya»
  676: 1640, // TMDB la fecha en 2005 (se estrenó en Toronto en 2004)
  694: 31023, // el paréntesis era un título alternativo, no el original
  769: 10494, // TMDB acredita a Satoshi Kon como 今敏 y su nombre latino no está entre sus alias
  796: 22549, // TMDB la titula «Ulysses’ Gaze»
  800: 10754, // el automático le daba la ficha de «A Short Film About Love»
  891: 46594, // este lo dio Ramón
  925: 41054, // es «Il grido»
  942: 613, // TMDB la llama solo «Downfall»
  949: 65544, // TMDB solo tiene «Trapito», que es la misma de García Ferré
  // Los dos OVA de Rurouni Kenshin se quedan SIN ficha a propósito: en TMDB son
  // televisión (la serie 313336), y su entrada de película es un duplicado con
  // cero minutos y siete votos. Una serie en un canon no es una película que
  // buscar, como ya pasaba con las miniseries de Criterion.
  258: null,
  892: null,
};

const filas = parse(fs.readFileSync(origen, 'utf8'), { columns: true, skip_empty_lines: true, bom: true })
  .map((r, i) => ({
    rank: i + 1,
    title: String(r.Title || '').trim(),
    year: Number(r.Year) || null,
    // el CSV junta a los codirectores con coma: al emparejador le vale el
    // primero, que es con quien compara `directorsMatch`
    director: String(r.Directors || '').split(',')[0].trim() || null,
  }))
  .filter((r) => r.title);

console.log(`${filas.length} filas leídas de ${path.basename(origen)}. Emparejando con TMDB…`);

const { films } = await resolveFilms(filas, (r) => r.year);

const out = [];
const vistos = new Set();
let casadas = 0;
let tiradas = 0;
for (let i = 0; i < filas.length; i++) {
  const fila = filas[i];
  let id = films[i]?.tmdb_id || null;
  // la mano manda sobre el automático, en los dos sentidos
  if (Object.hasOwn(CORRECCIONES, fila.rank)) {
    id = CORRECCIONES[fila.rank];
    if (id) {
      vistos.add(id);
      casadas++;
      out.push({ rank: fila.rank, title: fila.title, year: fila.year, director: fila.director, tmdb_id: id });
    } else {
      out.push({ rank: fila.rank, title: fila.title, year: fila.year, director: fila.director });
    }
    continue;
  }
  if (id && vistos.has(id)) {
    console.error(`    ↺ #${fila.rank} «${fila.title}»: ese id ya lo tiene otra fila`);
    id = null;
  }
  if (id) {
    const motivo = await sospechosa(id, fila);
    if (motivo) {
      console.error(`    ✕ #${fila.rank} «${fila.title}» → tmdb ${id}: ${motivo}`);
      tiradas++;
      id = null;
    }
  }
  if (id) {
    vistos.add(id);
    casadas++;
  }
  out.push({ rank: fila.rank, title: fila.title, year: fila.year, director: fila.director, ...(id ? { tmdb_id: id } : {}) });
  if (fila.rank % 100 === 0) process.stdout.write(`  ${fila.rank}/${filas.length}\r`);
}

const CABECERA = [
  '/**',
  ' * EL TOP 1000 DE FILMAFFINITY, EMPAQUETADO.',
  ' *',
  ' * Generado por server/tools/snapshot-fa-top1000.mjs desde el CSV del ranking',
  ' * — no se edita a mano.',
  ' *',
  ' * Cada fila: rank = puesto, title, year, director y tmdb_id (ausente cuando no',
  ' * se pudo emparejar con seguridad: mejor sin ficha que la ficha de otra).',
  ' */',
].join('\n');

const destino = path.join(raiz, 'src/data/fa-top1000.js');
fs.writeFileSync(destino, `${CABECERA}\nexport const FA_TOP1000 = ${JSON.stringify(out, null, 0)};\n`);
console.log(
  `\nEscrito ${destino}: ${casadas}/${out.length} con ficha` +
    (tiradas ? ` (${tiradas} descartadas por no ser la película)` : '')
);
