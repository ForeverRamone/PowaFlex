import { db, getSetting, setSetting } from './db.js';
import { resolvePerson, personCredits, enrichRuntimes } from './tmdb.js';
import { radarrAdd, radarrOwnedIds } from './radarr.js';

const DAY = 24 * 3600 * 1000;
const today = () => new Date().toISOString().slice(0, 10);

export const autoRadarrStatus = {
  running: false,
  lastRun: Number(getSetting('auto_radarr_last_run') || 0) || null,
  considered: 0,
  added: 0,
  error: null,
  log: [],
};

/**
 * Daily automation (#3): for every FAVORITE, LIVING director, add to Radarr the
 * films they direct that release within the next `months` months and that we
 * don't already own or have queued. Dead directors are skipped (no new work).
 */
export async function runAutoRadarr({ months = 6, lookbackDays = 0, dryRun = false } = {}) {
  if (autoRadarrStatus.running) return autoRadarrStatus;
  Object.assign(autoRadarrStatus, { running: true, error: null, considered: 0, added: 0, log: [] });
  try {
    // Favorites who direct in the library, PLUS favorites with no library titles
    // at all (TMDB-added "emerging directors": exactly who this job exists for).
    // Library-only actors keep being excluded; their credit loop below would
    // yield no Director jobs anyway.
    const directors = db
      .prepare(
        `SELECT DISTINCT p.id, p.name FROM tracked_people t
         JOIN people p ON p.id = t.person_id
         WHERE p.deathday IS NULL
           AND (EXISTS (SELECT 1 FROM movie_people mp WHERE mp.person_id = p.id AND mp.role = 'director')
                OR NOT EXISTS (SELECT 1 FROM movie_people mp WHERE mp.person_id = p.id))`
      )
      .all();

    const owned = new Set(radarrOwnedIds().tmdbIds);
    const inLib = new Set(
      db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id)
    );
    const now = today();
    // TMDB often dates small/festival films only after release; a lookback
    // window catches those instead of skipping them forever
    const floor = lookbackDays > 0 ? new Date(Date.now() - lookbackDays * DAY).toISOString().slice(0, 10) : now;
    const horizon = new Date(Date.now() + months * 30 * DAY).toISOString().slice(0, 10);
    const includeDocs = getSetting('auto_radarr_include_docs') === '1';

    const toAdd = new Map();
    for (const d of directors) {
      try {
        const resolved = await resolvePerson(d.id);
        if (!resolved?.tmdb_id) continue;
        const credits = await personCredits(resolved.tmdb_id);
        for (const c of (credits.crew || []).filter((x) => x.job === 'Director')) {
          if (c.video) continue;
          const g = c.genre_ids || [];
          if (!includeDocs && g.includes(99)) continue; // documentary
          if (g.includes(10770)) continue; // TV movie
          const date = c.release_date || null;
          if (!date || date < floor || date > horizon) continue; // only dated, within window
          if (inLib.has(c.id) || owned.has(c.id)) continue;
          if (!toAdd.has(c.id)) toAdd.set(c.id, { tmdb_id: c.id, title: c.title, date, director: d.name });
        }
      } catch {}
    }

    // runtime is not in credit lists: one cached pass to drop known shorts
    const candidates = [...toAdd.values()];
    await enrichRuntimes(candidates);
    // enrichRuntimes re-reads the real genres, so concert films surface here too
    for (const item of candidates.filter(
      (c) => c.isShort || (!includeDocs && (c.isDocumentary || c.isMusic)) || c.isTvMovie
    )) {
      toAdd.delete(item.tmdb_id);
    }

    autoRadarrStatus.considered = toAdd.size;
    for (const item of toAdd.values()) {
      if (dryRun) {
        autoRadarrStatus.log.push(`(simulado) ${item.title} · ${item.date} — dir. ${item.director}`);
        continue;
      }
      try {
        await radarrAdd(item.tmdb_id);
        owned.add(item.tmdb_id);
        autoRadarrStatus.added++;
        autoRadarrStatus.log.push(`✓ ${item.title} (${item.date}) — dir. ${item.director}`);
      } catch (err) {
        const msg = String(err.message || err);
        if (/already/i.test(msg)) continue;
        autoRadarrStatus.log.push(`⚠️ ${item.title}: ${msg}`);
      }
    }
    autoRadarrStatus.log = autoRadarrStatus.log.slice(0, 100);
    autoRadarrStatus.lastRun = Date.now();
    setSetting('auto_radarr_last_run', String(Date.now()));
  } catch (err) {
    autoRadarrStatus.error = String(err.message || err);
  } finally {
    autoRadarrStatus.running = false;
  }
  return autoRadarrStatus;
}

/** Whether the daily auto-Radarr job is enabled and its horizon. */
export function autoRadarrConfig() {
  return {
    enabled: getSetting('auto_radarr_enabled') === '1',
    months: Number(getSetting('auto_radarr_months') || 6),
    lookbackDays: Number(getSetting('auto_radarr_lookback_days') || 0),
    includeDocs: getSetting('auto_radarr_include_docs') === '1',
    lastRun: Number(getSetting('auto_radarr_last_run') || 0) || null,
  };
}
