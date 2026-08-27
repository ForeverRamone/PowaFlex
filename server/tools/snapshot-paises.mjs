/**
 * EMPAQUETADOR DEL ÍNDICE POR PAÍSES.
 *
 *   npm run snapshot:paises              # todos los que estén construidos
 *   npm run snapshot:paises -- --pais=JP
 *
 * Vuelca a `server/src/data/paises/XX.js` el índice que `construirPais` dejó en
 * la base, para que viaje con el software y el contenedor de Ramón NO tenga que
 * construirlo: construir un país son minutos de TMDB y unas cuatro mil
 * peticiones de MDBList, y su cupo son veinte mil al día. Empaquetado, la página
 * abre hecha y sin gastar nada.
 *
 * UN FICHERO POR PAÍS, y no uno solo con todos, por dos razones: se van
 * añadiendo de uno en uno según se construyen —el cupo diario no da para más—, y
 * la aplicación solo carga el que se está mirando en vez de meterse nueve megas
 * en memoria.
 *
 * SE GUARDA LO SERVIBLE, no todo lo construido. `construirPais` admite mil y
 * pico películas por país y la consulta recorta a las cien del top y las veinte
 * de cada año; aquí se guarda justo esa unión, que es un 20% menos.
 *
 * Cada fila es una TUPLA y no un objeto: con las claves puestas, Alemania ocupa
 * 205 KB y en tuplas 133 KB. El orden va en `CAMPOS`, y lo lee `paises.js`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/db.js';
import { PAISES, TIERS, tierDe, esPaisConocido } from '../src/paises.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const carpeta = path.join(raiz, 'src/data/paises');
const arg = (nombre) => {
  const m = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return m ? m.slice(nombre.length + 3) : null;
};

// El orden de la tupla. Si cambia, hay que subir PAQUETE_VERSION en paises.js.
export const CAMPOS = ['rank_global', 'rank_anio', 'tmdb_id', 'year', 'lb', 'lb_votes', 'sigma', 'avales', 'ganados', 'motivo', 'title', 'poster', 'director'];
const MOTIVOS = { director: 1, origen: 2, manual: 3 };

fs.mkdirSync(carpeta, { recursive: true });

const construidos = db
  .prepare("SELECT iso FROM country_builds WHERE fuente = 'lb' AND guardadas > 0 ORDER BY iso")
  .all()
  .map((r) => r.iso)
  .filter((iso) => esPaisConocido(iso));

const pedidos = arg('pais') ? [arg('pais').toUpperCase()] : construidos;
let total = 0;

for (const iso of pedidos) {
  if (!construidos.includes(iso)) {
    console.error(`  ${iso}: no está construido en esta base, se salta`);
    continue;
  }
  const tier = tierDe(iso);
  const filas = db
    .prepare(
      `SELECT * FROM country_films
       WHERE iso = ? AND fuente = 'lb' AND (rank_global <= ? OR rank_anio <= ?)
       ORDER BY rank_global`
    )
    .all(iso, tier.global, tier.anio);

  const build = db.prepare("SELECT * FROM country_builds WHERE iso = ? AND fuente = 'lb'").get(iso);
  const tuplas = filas.map((f) => [
    f.rank_global, f.rank_anio, f.tmdb_id, f.year, f.lb, f.lb_votes, f.sigma,
    f.avales, f.ganados, MOTIVOS[f.motivo] || 2, f.title, f.poster, f.director,
  ]);

  const cuerpo = [
    '/**',
    ` * ${PAISES[iso].es.toUpperCase()} — índice empaquetado.`,
    ' *',
    ' * Generado por server/tools/snapshot-paises.mjs — no se edita a mano.',
    ' * El orden de cada tupla está en CAMPOS, dentro de esa herramienta.',
    ' */',
    `export const PAIS = ${JSON.stringify({
      iso,
      hasta: new Date().toISOString().slice(0, 10),
      candidatos: build?.candidatos ?? 0,
      con_nota: build?.con_nota ?? 0,
      guardadas: build?.guardadas ?? 0,
      del_palmares: build?.del_palmares ?? 0,
      filas: tuplas,
    })};`,
    '',
  ].join('\n');

  const destino = path.join(carpeta, `${iso}.js`);
  fs.writeFileSync(destino, cuerpo);
  total += cuerpo.length;
  console.log(
    `  ${iso} ${PAISES[iso].es.padEnd(20)} ${String(filas.length).padStart(5)} filas  ${String(Math.round(cuerpo.length / 1024)).padStart(4)} KB`
  );
}

/**
 * EL MANIFIESTO: qué países vienen hechos y con cuántas películas.
 *
 * Va aparte para que el selector pueda decir «viene hecho» sin cargar los nueve
 * megas de datos: se lee entero al arrancar y pesa unos pocos cientos de bytes.
 * Se regenera mirando la carpeta, no la lista de esta pasada, para que empaquetar
 * un país suelto no borre a los demás del índice.
 */
const enCarpeta = fs
  .readdirSync(carpeta)
  .filter((n) => /^[A-Z]{2}\.js$/.test(n))
  .map((n) => n.slice(0, 2));

const manifiesto = {};
for (const iso of enCarpeta.sort()) {
  const txt = fs.readFileSync(path.join(carpeta, `${iso}.js`), 'utf8');
  const datos = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  manifiesto[iso] = { hasta: datos.hasta, guardadas: datos.guardadas, filas: datos.filas.length };
}
fs.writeFileSync(
  path.join(carpeta, 'index.js'),
  [
    '/**',
    ' * QUÉ PAÍSES VIENEN HECHOS. Generado por snapshot-paises.mjs.',
    ' *',
    ' * Solo el resumen: el selector necesita saber qué hay construido y con',
    ' * cuántas películas, y cargar los datos de los setenta y dos para eso serían',
    ' * nueve megas en memoria para pintar una lista desplegable.',
    ' */',
    `export const PAQUETES = ${JSON.stringify(manifiesto)};`,
    '',
  ].join('\n')
);

console.log(`\n${pedidos.length} países empaquetados en esta pasada. La carpeta tiene ${enCarpeta.length}: ${(total / 1024 / 1024).toFixed(2)} MB escritos.`);
