/**
 * GENERADOR DEL PALMARÉS EMPAQUETADO.
 *
 *   DATA_DIR=/ruta/a/una/base npm run snapshot -- --hasta=2024
 *
 * Corre los parsers y el emparejado DE SIEMPRE sobre cada premio y guarda el
 * resultado en `server/src/data/palmares-2026.js` con el `tmdb_id` ya resuelto.
 * A partir de ahí la app sirve los años cerrados sin preguntar nada a nadie y
 * deja Wikipedia para lo que se mueve (ver `filasEmpaquetadas` en festivals.js).
 *
 * Necesita una base con clave de TMDB puesta —el emparejado es el mismo que el
 * de la app, con su caché por película— y tarda lo que tarde la primera vez;
 * las siguientes se apoyan en `film_match` y vuelan.
 *
 * NO guarda cartel ni fecha a propósito: eso cambia en TMDB y quedaría viejo.
 * El `tmdb_id` no cambia, y es lo que se llevaba las cuatro mil búsquedas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY, anuarioKeys, filasVivasDePremio, resolveFilms } from '../src/festivals.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nombre, pordefecto) => {
  const m = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return m ? m.split('=')[1] : pordefecto;
};

// Por defecto se empaqueta hasta hace dos años: el año en curso y el anterior
// siguen vivos, que es donde Wikipedia todavía completa tablas y donde se
// falla la temporada de premios.
const HASTA = Number(arg('hasta', new Date().getFullYear() - 2));
const SOLO = arg('solo', '') ? arg('solo', '').split(',') : null;
const DESTINO = path.join(raiz, 'src/data/palmares-2026.js');

/** La fila, en su forma corta. Lo que no aporta nada, fuera. */
const comprimir = (f, row) => ({
  y: Number(row.year),
  t: row.title,
  ...(row.original_title && row.original_title !== row.title ? { o: row.original_title } : {}),
  ...(row.director ? { d: row.director } : {}),
  ...(row.country ? { c: row.country } : {}),
  ...(f.tmdb_id ? { i: f.tmdb_id } : {}),
  ...(row.winner ? { w: 1 } : {}),
  ...(row.tv ? { tv: 1 } : {}),
  ...(row.rank ? { r: row.rank } : {}),
  ...(row.tied ? { x: 1 } : {}),
});

const claves = (SOLO || anuarioKeys()).filter((k) => {
  const f = REGISTRY[k];
  // los datasets que ya viven en el árbol (el Óscar) no se reempaquetan
  return f && !f.staticAward && !f.staticList && f.awardPage;
});

console.log(`Empaquetando ${claves.length} palmareses hasta ${HASTA}…\n`);
const salida = {};
let totalFilas = 0;
let sinFicha = 0;

for (const key of claves) {
  const t0 = Date.now();
  let filas;
  try {
    filas = await filasVivasDePremio(key);
  } catch (err) {
    console.log(`  ✗ ${key}: ${String(err.message || err)}`);
    continue;
  }
  const viejas = filas.filter((r) => Number(r.year) <= HASTA);
  if (!viejas.length) {
    console.log(`  · ${key}: nada anterior a ${HASTA}`);
    continue;
  }
  const { films, errors } = await resolveFilms(viejas, (r) => r.year);
  if (errors) {
    // un 429 a mitad dejaría medio premio sin id y se guardaría así para
    // siempre: mejor no empaquetarlo y volver a intentarlo
    console.log(`  ✗ ${key}: ${errors} fallos de red, NO se empaqueta`);
    continue;
  }
  const rows = films.map((f, i) => comprimir(f, viejas[i]));
  const huecos = rows.filter((r) => !r.i && !r.tv).length;
  salida[key] = { hasta: HASTA, rows };
  totalFilas += rows.length;
  sinFicha += huecos;
  console.log(
    `  ✓ ${key.padEnd(16)} ${String(rows.length).padStart(4)} filas` +
      `  ${String(rows.length - huecos).padStart(4)} con ficha` +
      `  ${huecos ? `${huecos} sin casar` : ''}`.padEnd(16) +
      `${((Date.now() - t0) / 1000).toFixed(1)} s`
  );
}

const cabecera = `/**
 * PALMARESES EMPAQUETADOS CON LA APP. Generado por \`npm run snapshot\` el ${new Date().toISOString().slice(0, 10)}.
 * NO se edita a mano: se regenera con la temporada de premios nueva.
 *
 * Cada premio dice hasta qué año está cerrado (\`hasta\`); de ahí en adelante
 * manda Wikipedia. La explicación larga está en \`festivals.js\`, junto a
 * \`filasEmpaquetadas\`.
 *
 * Campos: y=año, t=título, o=título original (solo si difiere), d=dirección,
 * c=país, i=tmdb_id, w=ganadora, tv=no es película, r=puesto (Cahiers), x=empate.
 *
 * ${totalFilas} filas de ${Object.keys(salida).length} premios, hasta ${HASTA}.
 */
export const PALMARES = `;

fs.writeFileSync(DESTINO, cabecera + JSON.stringify(salida, null, 1) + ';\n');
const kb = (fs.statSync(DESTINO).size / 1024).toFixed(0);
console.log(`\n${totalFilas} filas de ${Object.keys(salida).length} premios · ${sinFicha} sin ficha en TMDB · ${kb} KB`);
console.log(`escrito en ${path.relative(process.cwd(), DESTINO)}`);
