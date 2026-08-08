import { db, getSetting, setSetting } from './db.js';
import { today } from './dates.js';
import { resolvePerson, personCredits, enrichRuntimes } from './tmdb.js';
import { radarrAdd, radarrOwnedIds } from './radarr.js';

const DAY = 24 * 3600 * 1000;

export const autoRadarrStatus = {
  running: false,
  lastRun: Number(getSetting('auto_radarr_last_run') || 0) || null,
  considered: 0,
  added: 0,
  error: null,
  log: [],
};

/**
 * Lo que el pase automático NO debe tocar, por decisión explícita tuya:
 *
 *  - `auto_radarr_vetoed`: el 🚫 de una ficha de Cine venidero. La película se
 *    sigue viendo y se puede mandar a Radarr a mano; solo el robot la ignora.
 *  - `dismissed_movies`: el ✕ «no me interesa» de Descubrir y Estrenos. Antes
 *    el automático NO lo miraba, así que algo que habías descartado a mano
 *    podía aparecerte descargado esa misma noche.
 *
 * Devuelve un Map id → motivo para poder decir en el log POR QUÉ se saltó cada
 * una: un «0 candidatas» sin explicación es indistinguible de una avería.
 */
export function autoRadarrExcluidas() {
  const out = new Map();
  for (const r of db.prepare('SELECT tmdb_id FROM dismissed_movies').all()) out.set(r.tmdb_id, 'descartada');
  // el veto manda sobre el descarte: es el motivo más específico
  for (const r of db.prepare('SELECT tmdb_id FROM auto_radarr_vetoed').all()) out.set(r.tmdb_id, 'vetada');
  return out;
}

/**
 * Daily automation (#3): for every FAVORITE, LIVING director, add to Radarr the
 * films they direct that release within the next `months` months and that we
 * don't already own or have queued. Dead directors are skipped (no new work).
 */
export async function runAutoRadarr({ months = 6, lookbackDays = 0, dryRun = false } = {}) {
  if (autoRadarrStatus.running) return autoRadarrStatus;
  Object.assign(autoRadarrStatus, { running: true, error: null, considered: 0, added: 0, skipped: 0, log: [] });
  try {
    // Favoritos SEGUIDOS COMO DIRECTORES que dirigen en tu biblioteca, más los
    // seguidos como directores sin títulos aún (los emergentes añadidos desde
    // TMDB: exactamente para quien existe esta tarea).
    //
    // El filtro `t.role = 'director'` es imprescindible desde la 1.04: sin él,
    // la segunda rama recogía a TODO favorito sin créditos en Plex, que es la
    // única forma de seguir a un director de fotografía, un compositor o un
    // montador. Si esa persona había dirigido algo alguna vez, el pase nocturno
    // te lo descargaba sin que hubieras seguido a nadie como director.
    const directors = db
      .prepare(
        `SELECT DISTINCT p.id, p.name FROM tracked_people t
         JOIN people p ON p.id = t.person_id
         WHERE p.deathday IS NULL
           AND t.role = 'director'
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
    const excluidas = autoRadarrExcluidas();
    const saltadas = new Map(); // id → motivo, para contarlas y explicarlas

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
          // vetada desde Cine venidero o descartada en Descubrir: ni tocarla
          if (excluidas.has(c.id)) { saltadas.set(c.id, `${c.title} (${excluidas.get(c.id)})`); continue; }
          if (!toAdd.has(c.id)) toAdd.set(c.id, { tmdb_id: c.id, title: c.title, date, director: d.name });
        }
      } catch (err) {
        // sin esto, «0 candidatas» podía significar «TMDB estaba caído»
        autoRadarrStatus.log.push(`⚠️ ${d.name}: ${String(err.message || err)}`);
      }
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
    // que se vea por qué no están: «0 candidatas» a secas parece una avería
    autoRadarrStatus.skipped = saltadas.size;
    if (saltadas.size) {
      autoRadarrStatus.log.push(`🚫 ${saltadas.size} fuera del automático: ${[...saltadas.values()].slice(0, 8).join(', ')}${saltadas.size > 8 ? '…' : ''}`);
    }
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
