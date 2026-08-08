import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, getSetting } from './db.js';

/**
 * Copia de seguridad automática.
 *
 * La copia manual ya existía en Ajustes, pero había que acordarse de pulsarla.
 * Esto la hace sola al final del pase nocturno, cuando la base ya tiene lo del
 * día, y va rotando para no llenar el disco.
 *
 * Se usa `db.backup()` de better-sqlite3 y NUNCA se copia el fichero vivo: con
 * WAL activo, copiarlo a pelo puede dar una base corrupta.
 */

export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export const copiasActivadas = () => getSetting('backup_auto') === '1';

/** Cuántas se guardan antes de empezar a borrar las viejas. */
export function copiasRetenidas() {
  const n = Number(getSetting('backup_keep') || 7);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : 7;
}

const ES_COPIA = /^powaflex-\d{4}-\d{2}-\d{2}(-\d{6})?\.db$/;
/**
 * La marca de tiempo que lleva el propio nombre, normalizada a «AAAAMMDDHHMMSS»
 * para que ordene bien como texto. Rellenar con ceros sin quitar los guiones
 * ponía «2026-08-08-054407» (la de la tarde) ANTES que «2026-08-080000000» (la
 * de la mañana), porque el guion ordena antes que el cero: la poda se llevaba
 * la copia fresca y conservaba la vieja.
 */
const selloDe = (f) => f.replace(/^powaflex-|\.db$/g, '').replace(/-/g, '').padEnd(14, '0');

/** Las copias que hay ahora mismo, de la más reciente a la más vieja. */
export function listarCopias() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => ES_COPIA.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, bytes: st.size, at: st.mtimeMs, sello: selloDe(f) };
    })
    // Ordenadas por la FECHA DEL NOMBRE, no por la del fichero: copiarlas a un
    // NAS o restaurarlas cambia el mtime, y con ese criterio la poda se cargaba
    // las copias buenas y conservaba las viejas.
    .sort((a, b) => b.sello.localeCompare(a.sello));
}

/**
 * Hace una copia y poda las sobrantes. El nombre lleva la fecha; si ya hay una
 * de hoy (porque lanzaste «Actualizar todo» a mano), se le añade la hora en vez
 * de pisarla.
 */
export async function hacerCopia({ fecha = new Date() } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dia = fecha.toISOString().slice(0, 10);
  let nombre = `powaflex-${dia}.db`;
  if (fs.existsSync(path.join(BACKUP_DIR, nombre))) {
    const hora = fecha.toISOString().slice(11, 19).replace(/:/g, '');
    nombre = `powaflex-${dia}-${hora}.db`;
  }
  const destino = path.join(BACKUP_DIR, nombre);
  try {
    await db.backup(destino);
  } catch (err) {
    // Si el disco se llena a mitad, better-sqlite3 deja un fichero truncado con
    // un nombre que la rotación da por bueno: en dos o tres noches las copias
    // VÁLIDAS habrían desaparecido para hacerle sitio a la basura.
    // el destino y su diario: SQLite suele limpiar el primero, pero el
    // «-journal» se queda ahí ocupando sitio tras cada intento fallido
    for (const f of [destino, `${destino}-journal`]) {
      try { fs.unlinkSync(f); } catch {}
    }
    throw err;
  }
  const bytes = fs.statSync(destino).size;

  // poda: se queda con las N más recientes
  const sobrantes = listarCopias().slice(copiasRetenidas());
  for (const c of sobrantes) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, c.file));
    } catch {
      // una copia que no se deja borrar no puede tumbar el pase nocturno
    }
  }
  return { file: nombre, bytes, kept: Math.min(listarCopias().length, copiasRetenidas()) };
}
