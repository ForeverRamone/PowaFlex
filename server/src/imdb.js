import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { db, getSetting, setSetting } from './db.js';

/**
 * Notas y votos de IMDb, del volcado no comercial que IMDb publica a diario.
 *
 * Es la fuente más completa de las tres que maneja la app (TMDB, Letterboxd vía
 * MDBList, IMDb) y la única que no gasta ni una petición de API: un solo
 * fichero de unos 8 MB comprimidos con el catálogo entero.
 *
 * Se procesa EN STREAMING —descarga → gunzip → línea a línea— sin escribir
 * nada en disco ni cargar el fichero en memoria: en un N100 eso importa.
 *
 * Uso personal y no comercial, que es justo lo que es esto.
 */

const URL_RATINGS = 'https://datasets.imdbws.com/title.ratings.tsv.gz';

export const imdbStatus = {
  running: false,
  rows: 0,
  updatedAt: Number(getSetting('imdb_ratings_at') || 0) || null,
  error: null,
};

/** Cuántas notas hay guardadas y de cuándo son. */
export function imdbInfo() {
  const { n } = db.prepare('SELECT COUNT(*) n FROM imdb_ratings').get();
  return {
    rows: n,
    updatedAt: Number(getSetting('imdb_ratings_at') || 0) || null,
    running: imdbStatus.running,
    error: imdbStatus.error,
  };
}

/**
 * Descarga el volcado y lo vuelca en la tabla. Devuelve cuántas filas entraron.
 * `onProgress` se llama cada 200.000 líneas para poder pintar avance.
 */
export async function importImdbRatings({ onProgress = null } = {}) {
  // Devolver el estado a secas hacía que el paso nocturno escribiera «0 títulos»
  // EN VERDE, como si hubiera ido bien, cuando lo que pasaba es que ya había una
  // importación en marcha. Ahora se distingue.
  if (imdbStatus.running) return { ok: false, running: true, rows: imdbStatus.rows };
  Object.assign(imdbStatus, { running: true, rows: 0, error: null });
  try {
    const res = await fetch(URL_RATINGS, { signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error(`IMDb respondió ${res.status}`);

    const lineas = readline.createInterface({
      input: Readable.fromWeb(res.body).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });

    const ins = db.prepare('INSERT OR REPLACE INTO imdb_ratings (tconst, rating, votes) VALUES (?, ?, ?)');
    let n = 0;
    let lote = [];
    // en transacciones de 20.000: una por fila tardaría una eternidad y una
    // sola transacción de 1,6 millones se come la memoria
    const volcar = db.transaction((filas) => {
      for (const f of filas) ins.run(f[0], f[1], f[2]);
    });

    for await (const linea of lineas) {
      if (!linea || linea.startsWith('tconst')) continue; // cabecera
      const [tconst, rating, votes] = linea.split('\t');
      if (!tconst) continue;
      lote.push([tconst, Number(rating) || null, Number(votes) || 0]);
      if (lote.length >= 20000) {
        volcar(lote);
        n += lote.length;
        lote = [];
        if (onProgress) onProgress(n);
      }
    }
    if (lote.length) {
      volcar(lote);
      n += lote.length;
    }

    setSetting('imdb_ratings_at', String(Date.now()));
    Object.assign(imdbStatus, { rows: n, updatedAt: Date.now() });
    return { ok: true, rows: n };
  } catch (err) {
    imdbStatus.error = String(err.message || err);
    throw err;
  } finally {
    imdbStatus.running = false;
  }
}

/** ¿Toca refrescar? Semanal: los datos se mueven poco y son 8 MB. */
export function imdbNecesitaRefresco(dias = 7) {
  const at = Number(getSetting('imdb_ratings_at') || 0);
  if (!at) return true;
  return Date.now() - at > dias * 24 * 3600 * 1000;
}

/**
 * Votos de IMDb de un conjunto de películas, por id de IMDb. Devuelve un Map
 * tconst → { rating, votes } para poder cruzarlo sin una consulta por fila.
 */
export function votosPorImdbId(ids) {
  const out = new Map();
  const limpios = [...new Set(ids.filter(Boolean))];
  if (!limpios.length) return out;
  const trozo = 800; // el límite de variables de SQLite es 999
  for (let i = 0; i < limpios.length; i += trozo) {
    const parte = limpios.slice(i, i + trozo);
    const q = db.prepare(
      `SELECT tconst, rating, votes FROM imdb_ratings WHERE tconst IN (${parte.map(() => '?').join(',')})`
    );
    for (const r of q.all(...parte)) out.set(r.tconst, { rating: r.rating, votes: r.votes });
  }
  return out;
}
