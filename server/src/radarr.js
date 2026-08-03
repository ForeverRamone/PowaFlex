import { db, getSetting, setSetting } from './db.js';
import { setBuildProgress, clearBuildProgress, enrichReleasePhases } from './tmdb.js';

function radarrConfig() {
  const url = (getSetting('radarr_url') || '').replace(/\/+$/, '');
  const key = getSetting('radarr_key') || '';
  if (!url || !key) throw new Error('Radarr no configurado (URL o API key vacíos)');
  return { url, key };
}

async function radarrFetch(path, { method = 'GET', body = null } = {}) {
  const { url, key } = radarrConfig();
  const res = await fetch(`${url}/api/v3${path}`, {
    method,
    headers: {
      'X-Api-Key': key,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : null,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = Array.isArray(j) ? j[0]?.errorMessage : j.message || '';
    } catch {}
    throw new Error(`Radarr ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function radarrTest() {
  const status = await radarrFetch('/system/status');
  return { ok: true, version: status.version, appName: status.appName };
}

export async function radarrContext() {
  const [profiles, roots, movies] = await Promise.all([
    radarrFetch('/qualityprofile'),
    radarrFetch('/rootfolder'),
    radarrFetch('/movie'),
  ]);
  storeRadarrMovies(movies);
  return {
    profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
    rootFolders: roots.map((r) => ({ path: r.path, freeSpace: r.freeSpace })),
    tmdbIds: movies.map((m) => m.tmdbId),
  };
}

// --- local snapshot of Radarr's library -------------------------------------
// Cached so pages can show "✓ en Radarr" instantly and bulk-add never fires a
// wasteful 400 "already added". Refreshed from Ajustes or nightly.

export function storeRadarrMovies(movies) {
  const tx = db.transaction(() => {
    // ANTES de pisar el snapshot: qué monitorizadas seguían sin archivo. El
    // paso 0→1 de has_file es una captura — el momento más gratificante del
    // completismo, que hasta ahora se tiraba con el DELETE.
    const sinArchivo = new Map(
      db.prepare('SELECT tmdb_id, title FROM radarr_movies WHERE has_file = 0').all().map((r) => [r.tmdb_id, r])
    );
    db.prepare('DELETE FROM radarr_movies').run();
    const ins = db.prepare(
      `INSERT OR REPLACE INTO radarr_movies (tmdb_id, title, year, added, has_file, monitored, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const cap = db.prepare(
      'INSERT INTO radarr_captures (tmdb_id, title, year, quality, captured_at) VALUES (?, ?, ?, ?, ?)'
    );
    const now = Date.now();
    for (const m of movies) {
      if (!m.tmdbId) continue;
      ins.run(m.tmdbId, m.title || '', m.year || null, m.added || null,
        m.hasFile ? 1 : 0, m.monitored ? 1 : 0, now);
      if (m.hasFile && sinArchivo.has(m.tmdbId)) {
        cap.run(m.tmdbId, m.title || '', m.year || null, m.movieFile?.quality?.quality?.name || null, now);
      }
    }
  });
  tx();
  setSetting('radarr_synced_at', String(Date.now()));
}

/** Capturas recientes (pedidas que POR FIN tienen archivo), con su rating_key
 *  de Plex si ya llegaron también a la biblioteca. */
export function radarrCaptures(days = 30, limit = 60) {
  return db
    .prepare(
      `SELECT c.tmdb_id, c.title, c.year, c.quality, c.captured_at, m.rating_key
       FROM radarr_captures c
       LEFT JOIN (SELECT tmdb_id, MIN(rating_key) rating_key FROM movies WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id) m
         ON m.tmdb_id = c.tmdb_id
       WHERE c.captured_at >= ?
       ORDER BY c.captured_at DESC LIMIT ?`
    )
    .all(Date.now() - days * 24 * 3600 * 1000, limit);
}

// --- pendientes: lo que Radarr aún debe --------------------------------------

async function fetchWantedPages(kind) {
  const out = [];
  for (let page = 1; page <= 15; page++) {
    const res = await radarrFetch(`/wanted/${kind}?page=${page}&pageSize=200&monitored=true`);
    const recs = res.records || [];
    for (const m of recs) {
      if (!m.tmdbId) continue;
      out.push({
        tmdb_id: m.tmdbId,
        title: m.title || '',
        year: m.year || null,
        added: m.added || null,
        // solo en cutoff: la calidad que tiene y no llega a tu perfil
        quality: m.movieFile?.quality?.quality?.name || null,
      });
    }
    if (recs.length < 200 || out.length >= (res.totalRecords || 0)) break;
  }
  return out;
}

/** Monitorizadas sin archivo: lo pedido que sigue sin aparecer. */
export async function radarrWanted() {
  const items = await fetchWantedPages('missing');
  // las más antiguas primero: son las atascadas que piden decisión
  return items.sort((a, b) => String(a.added || '9999').localeCompare(String(b.added || '9999')));
}

/** Con archivo por debajo del corte del perfil de calidad. */
export async function radarrCutoffUnmet() {
  const items = await fetchWantedPages('cutoff');
  return items.sort((a, b) => String(a.added || '9999').localeCompare(String(b.added || '9999')));
}

/**
 * Vigía de estrenos digitales: de las pedidas sin archivo, ¿cuáles acaban de
 * pasar a digital? Cada una se apunta como novedad UNA vez (UNIQUE type+ref) y
 * se reordena su búsqueda en Radarr — solo si el estreno digital es reciente
 * (60 días): relanzar de golpe todo lo que lleva años en digital y aun así no
 * aparece sería maltratar a los indexers para nada.
 */
export async function checkDigitalReleases({ maxFetch = 500 } = {}) {
  const hoy = new Date().toLocaleDateString('en-CA');
  const items = await radarrWanted();
  await enrichReleasePhases(items, { maxFetch });
  const ins = db.prepare(
    `INSERT OR IGNORE INTO app_events (type, ref, title, body, url, created_at)
     VALUES ('digital', ?, ?, ?, ?, ?)`
  );
  let nuevas = 0;
  for (const it of items) {
    const d = it.phases?.digital;
    if (!d || d > hoy) continue;
    if (Date.now() - Date.parse(d) > 60 * 24 * 3600 * 1000) continue;
    const r = ins.run(
      String(it.tmdb_id),
      `💿 «${it.title}» ya está en digital`,
      `Estreno digital el ${d}: Radarr vuelve a buscarla.`,
      '/calidad',
      Date.now()
    );
    if (r.changes) {
      nuevas++;
      try {
        await radarrSearchAgain(it.tmdb_id);
      } catch {}
    }
  }
  return { wanted: items.length, nuevas };
}

/** Reordena a Radarr buscar una película concreta ya monitorizada. */
export async function radarrSearchAgain(tmdbId) {
  const found = await radarrFetch(`/movie?tmdbId=${tmdbId}`);
  const movie = Array.isArray(found) ? found[0] : null;
  if (!movie?.id) throw new Error('Radarr no tiene esa película');
  await radarrFetch('/command', { method: 'POST', body: { name: 'MoviesSearch', movieIds: [movie.id] } });
  return { ok: true, title: movie.title };
}

export async function radarrSyncMovies() {
  const movies = await radarrFetch('/movie');
  storeRadarrMovies(movies);
  return { ok: true, count: movies.length, syncedAt: Number(getSetting('radarr_synced_at') || 0) };
}

/** TMDB ids Radarr already has, read from the local snapshot (no network). */
export function radarrOwnedIds() {
  return {
    tmdbIds: db.prepare('SELECT tmdb_id FROM radarr_movies').all().map((r) => r.tmdb_id),
    syncedAt: Number(getSetting('radarr_synced_at') || 0),
  };
}

/** Most recently added to Radarr, for the dashboard. */
export function radarrRecent(limit = 12) {
  return db
    .prepare(
      `SELECT tmdb_id, title, year, added, has_file, monitored FROM radarr_movies
       WHERE added IS NOT NULL ORDER BY added DESC LIMIT ?`
    )
    .all(limit);
}

// label -> Promise<id> memo; storing the promise serializes concurrent callers
// so the tag is only looked up/created once (tag ids are stable per instance)
const tagIdCache = new Map();

function ensureTag(label) {
  const key = label.toLowerCase();
  if (!tagIdCache.has(key)) {
    const p = (async () => {
      const tags = await radarrFetch('/tag');
      let tag = tags.find((t) => t.label.toLowerCase() === key);
      if (!tag) tag = await radarrFetch('/tag', { method: 'POST', body: { label } });
      return tag.id;
    })().catch((err) => {
      tagIdCache.delete(key);
      throw err;
    });
    tagIdCache.set(key, p);
  }
  return tagIdCache.get(key);
}

export async function radarrAdd(tmdbId, { qualityProfileId = null, rootFolderPath = null, search = true } = {}) {
  const profileId = qualityProfileId || Number(getSetting('radarr_quality_profile') || 0);
  const rootPath = rootFolderPath || getSetting('radarr_root_folder') || '';
  if (!profileId || !rootPath) {
    throw new Error('Configura el perfil de calidad y la carpeta raíz de Radarr en Ajustes');
  }
  // configurable tag; unset -> "PowaFlex", empty string -> no tag
  const rawTag = getSetting('radarr_tag');
  const tagLabel = (rawTag === null ? 'PowaFlex' : rawTag).trim();
  const tags = tagLabel ? [await ensureTag(tagLabel)] : [];

  // lookup gives Radarr its own metadata object to add
  const results = await radarrFetch(`/movie/lookup/tmdb?tmdbId=${tmdbId}`);
  const movie = Array.isArray(results) ? results[0] : results;
  if (!movie) throw new Error(`Radarr no encuentra tmdb:${tmdbId}`);
  const added = await radarrFetch('/movie', {
    method: 'POST',
    body: {
      ...movie,
      qualityProfileId: profileId,
      rootFolderPath: rootPath,
      monitored: true,
      minimumAvailability: 'announced',
      tags,
      addOptions: { searchForMovie: search, monitor: 'movieOnly' },
    },
  });
  return { ok: true, id: added.id, title: added.title, tmdbId: added.tmdbId };
}

export async function radarrAddBulk(tmdbIds) {
  const results = [];
  let i = 0;
  // large batches take minutes at concurrency 2: publish progress instead of
  // leaving the client on a mute spinner (same channel the TMDB builds use)
  setBuildProgress('radarr-bulk', 'Añadiendo a Radarr', 0, tmdbIds.length);
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= tmdbIds.length) return;
      const tmdbId = tmdbIds[idx];
      try {
        const r = await radarrAdd(tmdbId);
        results.push({ tmdbId, ok: true, title: r.title });
      } catch (err) {
        const msg = String(err.message || err);
        results.push({ tmdbId, ok: false, alreadyExists: /already/i.test(msg), error: msg });
      }
      setBuildProgress('radarr-bulk', 'Añadiendo a Radarr', results.length, tmdbIds.length);
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));
  clearBuildProgress('radarr-bulk');
  return {
    added: results.filter((r) => r.ok).length,
    alreadyInRadarr: results.filter((r) => r.alreadyExists).length,
    failed: results.filter((r) => !r.ok && !r.alreadyExists).length,
    results,
  };
}
