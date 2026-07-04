import { db, getSetting, setSetting } from './db.js';
import { resolvePerson, personCredits } from './tmdb.js';
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
export async function runAutoRadarr({ months = 6, dryRun = false } = {}) {
  if (autoRadarrStatus.running) return autoRadarrStatus;
  Object.assign(autoRadarrStatus, { running: true, error: null, considered: 0, added: 0, log: [] });
  try {
    const directors = db
      .prepare(
        `SELECT DISTINCT p.id, p.name FROM tracked_people t
         JOIN people p ON p.id = t.person_id
         JOIN movie_people mp ON mp.person_id = p.id AND mp.role = 'director'
         WHERE p.deathday IS NULL`
      )
      .all();

    const owned = new Set(radarrOwnedIds().tmdbIds);
    const inLib = new Set(
      db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id)
    );
    const now = today();
    const horizon = new Date(Date.now() + months * 30 * DAY).toISOString().slice(0, 10);

    const toAdd = new Map();
    for (const d of directors) {
      try {
        const resolved = await resolvePerson(d.id);
        if (!resolved?.tmdb_id) continue;
        const credits = await personCredits(resolved.tmdb_id);
        for (const c of (credits.crew || []).filter((x) => x.job === 'Director')) {
          if (c.video) continue;
          const date = c.release_date || null;
          if (!date || date < now || date > horizon) continue; // only dated, within horizon
          if (inLib.has(c.id) || owned.has(c.id)) continue;
          if (!toAdd.has(c.id)) toAdd.set(c.id, { tmdb_id: c.id, title: c.title, date, director: d.name });
        }
      } catch {}
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
    lastRun: Number(getSetting('auto_radarr_last_run') || 0) || null,
  };
}
