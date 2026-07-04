import { db, getSetting } from './db.js';
import { tmdbGet, collectionDetails } from './tmdb.js';

const DAY = 24 * 3600 * 1000;
const lang = () => getSetting('language') || 'es-ES';
const today = () => new Date().toISOString().slice(0, 10);

export const sagaScanStatus = {
  running: false,
  total: 0,
  done: 0,
  scanned: 0,
  finishedAt: null,
  error: null,
};

/**
 * Rework of "Sagas" (#11): instead of Plex's sparse manual collections, derive
 * franchises from each library movie's real TMDB `belongs_to_collection`. This
 * scan is resumable and budgeted, and its results power a "franchises you've
 * started but not finished" view — far more useful than Plex collection tags.
 */
export async function scanSagas({ budget = 800, force = false } = {}) {
  if (sagaScanStatus.running) return sagaScanStatus;
  Object.assign(sagaScanStatus, { running: true, error: null, done: 0, scanned: 0, finishedAt: null });
  try {
    if (force) db.prepare('DELETE FROM movie_saga').run();
    const pending = db
      .prepare(
        `SELECT m.rating_key, m.tmdb_id FROM movies m
         LEFT JOIN movie_saga s ON s.movie_id = m.rating_key
         WHERE m.tmdb_id IS NOT NULL AND s.movie_id IS NULL`
      )
      .all();
    sagaScanStatus.total = pending.length;
    const work = pending.slice(0, budget);

    const ins = db.prepare(
      `INSERT OR REPLACE INTO movie_saga (movie_id, tmdb_id, collection_id, collection_name, scanned_at)
       VALUES (?, ?, ?, ?, ?)`
    );

    let i = 0;
    async function worker() {
      for (;;) {
        const idx = i++;
        if (idx >= work.length) return;
        const m = work[idx];
        try {
          const det = await tmdbGet(
            `/movie/${m.tmdb_id}`,
            {},
            { cacheKey: `movie:${m.tmdb_id}:${lang()}`, cacheMs: 30 * DAY }
          );
          const coll = det.belongs_to_collection || null;
          ins.run(m.rating_key, m.tmdb_id, coll?.id || null, coll?.name || null, Date.now());
          sagaScanStatus.scanned++;
        } catch {
          // leave unscanned; a later run will retry
        }
        sagaScanStatus.done++;
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
  } catch (err) {
    sagaScanStatus.error = String(err.message || err);
  } finally {
    sagaScanStatus.running = false;
    sagaScanStatus.finishedAt = Date.now();
  }
  return sagaScanStatus;
}

export function sagaScanState() {
  const total = db.prepare('SELECT COUNT(*) n FROM movies WHERE tmdb_id IS NOT NULL').get().n;
  const scanned = db.prepare('SELECT COUNT(*) n FROM movie_saga').get().n;
  const collections = db
    .prepare('SELECT COUNT(DISTINCT collection_id) n FROM movie_saga WHERE collection_id IS NOT NULL')
    .get().n;
  return { ...sagaScanStatus, totalMovies: total, scanned, collections };
}

/** Franchises present in the library, ranked by how many parts you own. */
export function sagaList() {
  return db
    .prepare(
      `SELECT s.collection_id, s.collection_name, COUNT(*) owned,
              GROUP_CONCAT(m.rating_key) rating_keys
       FROM movie_saga s JOIN movies m ON m.rating_key = s.movie_id
       WHERE s.collection_id IS NOT NULL
       GROUP BY s.collection_id
       HAVING owned >= 1
       ORDER BY owned DESC, s.collection_name`
    )
    .all()
    .map((r) => ({
      collection_id: r.collection_id,
      name: r.collection_name,
      owned: r.owned,
    }));
}

/** Full franchise from TMDB, crossed with the library (owned/missing/upcoming). */
export async function sagaComplete(collectionId) {
  const det = await collectionDetails(collectionId);
  const inLib = new Set(
    db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id)
  );
  const now = today();
  const parts = (det.parts || [])
    .filter((p) => !p.video)
    .map((p) => ({
      tmdb_id: p.id,
      title: p.title,
      date: p.release_date || null,
      released: !!p.release_date && p.release_date <= now,
      owned: inLib.has(p.id),
      poster_path: p.poster_path,
      vote: p.vote_average,
    }))
    .sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : 1);
  const released = parts.filter((p) => p.released);
  return {
    collection_id: det.id,
    name: det.name,
    poster_path: det.poster_path,
    overview: det.overview,
    parts,
    stats: {
      total: parts.length,
      released: released.length,
      owned: released.filter((p) => p.owned).length,
      upcoming: parts.filter((p) => !p.released).length,
    },
  };
}
