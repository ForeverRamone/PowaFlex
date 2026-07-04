import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, DATA_DIR, getAllSettings, setSetting, getSetting } from './db.js';
import { plexTest, plexConfig, runSync, syncStatus, movieSections } from './plex.js';
import {
  tmdbTest,
  filmographyProfile,
  getCalendarCached,
  searchCollection,
  collectionDetails,
  enrichPeopleLife,
  tmdbPoster,
  searchMovieId,
  tmdbMovieDetail,
  buildProgress,
  suggestedPeople,
  trackByTmdb,
  searchPeople,
  findPersonInfo,
} from './tmdb.js';
import {
  radarrTest,
  radarrContext,
  radarrAdd,
  radarrAddBulk,
  radarrSyncMovies,
  radarrOwnedIds,
  radarrRecent,
} from './radarr.js';
import { libraryGaps, favoritesGaps, absentGreats } from './discover.js';
import {
  mdbTest,
  syncRatings,
  mdbSyncStatus,
  ratingsCoverage,
  insights,
  searchLists,
  addList,
  savedLists,
  listDetail,
  deleteList,
} from './mdblist.js';
import {
  importLetterboxdCsv,
  importLetterboxdZip,
  importLetterboxdRss,
  importLetterboxdListUrl,
  challengeLists,
  challengeListDetail,
  setChallengeHidden,
  listMissingTmdbIds,
  deleteChallengeList,
  rematchLetterboxd,
  resolveUnmatchedLb,
  letterboxdSummary,
} from './letterboxd.js';
import { runAutoRadarr, autoRadarrStatus, autoRadarrConfig } from './automation.js';
import { availability, isUpgradeable } from './justwatch.js';
import { scanSagas, sagaScanStatus, sagaScanState, sagaList, sagaComplete, enrichSagaStats, sagaStatsStatus } from './saga.js';
import * as q from './queries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
const app = Fastify({ logger: { level: 'info' } });

app.get('/api/version', async () => ({
  version: pkg.version,
  label: pkg.versionLabel || `v${pkg.version}`,
  repo: 'https://github.com/ForeverRamone/PowaFlex',
}));

await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });

// --- settings ----------------------------------------------------------------

const SECRET_KEYS = new Set(['plex_token', 'tmdb_key', 'radarr_key']);

app.get('/api/settings', async () => {
  const all = getAllSettings();
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    out[k] = SECRET_KEYS.has(k) && v ? `••••${v.slice(-4)}` : v;
  }
  for (const k of SECRET_KEYS) out[`${k}_set`] = !!all[k];
  return out;
});

app.put('/api/settings', async (req) => {
  const body = req.body || {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v !== 'string' && v !== null) continue;
    if (SECRET_KEYS.has(k) && typeof v === 'string' && v.startsWith('••••')) continue; // masked, unchanged
    setSetting(k, v);
  }
  return { ok: true };
});

app.post('/api/settings/test/:service', async (req, reply) => {
  try {
    const { service } = req.params;
    if (service === 'plex') return await plexTest();
    if (service === 'tmdb') return await tmdbTest();
    if (service === 'radarr') return await radarrTest();
    if (service === 'mdblist') {
      const r = await mdbTest();
      if (r.limit) setSetting('mdblist_detected_limit', String(r.limit));
      return r;
    }
    reply.code(400);
    return { ok: false, error: 'Servicio desconocido' };
  } catch (err) {
    reply.code(200);
    return { ok: false, error: String(err.message || err) };
  }
});

app.get('/api/setup-state', async () => {
  const s = getAllSettings();
  const movies = db.prepare('SELECT COUNT(*) n FROM movies').get().n;
  return {
    plex: !!(s.plex_url && s.plex_token),
    tmdb: !!s.tmdb_key,
    radarr: !!(s.radarr_url && s.radarr_key),
    movies,
    newlyAdded: Number(s.last_sync_added || 0),
    lastSyncAt: Number(s.last_sync_at || 0) || null,
  };
});

// --- sync ----------------------------------------------------------------------

app.post('/api/sync', async (req) => {
  const force = !!req.body?.force;
  if (!syncStatus.running) {
    runSync({ force }).then(() => rematchLetterboxd()).catch(() => {});
  }
  return syncStatus;
});

app.get('/api/sync/status', async () => {
  const last = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1').get();
  return { ...syncStatus, last };
});

app.get('/api/plex/sections', async () => movieSections());

// --- dashboard / library ---------------------------------------------------------

app.get('/api/stats/overview', async () => q.overview());
app.get('/api/stats/charts', async () => q.charts());
app.get('/api/stats/watch', async () => q.watchStats());
app.get('/api/stats/recent', async () => {
  const base = q.dashboardRecent();
  // fetch TMDB posters for recent watches not in the Plex library (#2). Zip
  // exports carry no TMDB id, so resolve it from title+year first (cached).
  if (getSetting('tmdb_key')) {
    await Promise.all(
      base.recentlyWatched
        .filter((w) => !w.inLibrary && !w.poster_path)
        .map(async (w) => {
          try {
            const id = w.tmdb_id || (await searchMovieId(w.title, w.year));
            if (id) { w.tmdb_id = id; w.poster_path = await tmdbPoster(id); }
          } catch {}
        })
    );
  }
  let radarr = [];
  try {
    radarr = radarrRecent(12);
  } catch {}
  return { ...base, radarrRecent: radarr };
});

// enrich birthday/deathday for all tracked/favorite people ("vivos y muertos")
app.post('/api/people/life-sync', async (req) => {
  const ids = db.prepare('SELECT person_id FROM tracked_people').all().map((r) => r.person_id);
  const limit = Math.min(Number(req?.query?.limit) || 500, 3000);
  const top = db
    .prepare(
      `SELECT person_id FROM movie_people GROUP BY person_id ORDER BY COUNT(*) DESC LIMIT ?`
    )
    .all(limit)
    .map((r) => r.person_id);
  return await enrichPeopleLife([...new Set([...ids, ...top])]);
});

app.get('/api/movies', async (req) => {
  const query = { ...req.query };
  for (const k of ['genres', 'countries', 'resolution']) {
    if (typeof query[k] === 'string') query[k] = query[k].split(',').filter(Boolean);
  }
  return q.listMovies(query);
});

app.get('/api/movies/:id', async (req, reply) => {
  const m = q.movieDetail(Number(req.params.id));
  if (!m) {
    reply.code(404);
    return { error: 'No encontrada' };
  }
  return m;
});

app.get('/api/filters', async () => q.filterOptions());

app.get('/api/search', async (req) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) return { movies: [], people: [] };
  return q.globalSearch(term);
});

app.get('/api/people', async (req) => {
  return q.topPeople({
    role: req.query.role || 'director',
    limit: Math.min(Number(req.query.limit) || 30, 500),
    offset: Number(req.query.offset) || 0,
    search: req.query.search || '',
    gender: req.query.gender || '',
    life: req.query.life || '',
    continent: req.query.continent || '',
    country: req.query.country || '',
    hideDead: req.query.hideDead === '1',
  });
});

app.get('/api/people/filter-options', async () => q.peopleFilterOptions());

// favorite suggestions: popular + Spanish directors (#1)
app.get('/api/people/suggestions', async (req, reply) => {
  try {
    return await suggestedPeople();
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.get('/api/people/search-tmdb', async (req, reply) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return [];
    return await searchPeople(query);
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// add to favorites by TMDB person (may not be in the library yet) (#1/#3)
app.post('/api/tracked/tmdb', async (req, reply) => {
  try {
    const r = trackByTmdb(req.body || {});
    // manual add re-allows automatic re-adds later (clears the ✕ block) (C)
    if (r.personId) db.prepare('DELETE FROM unfollowed_people WHERE person_id = ?').run(r.personId);
    db.prepare(`DELETE FROM tmdb_cache WHERE key LIKE 'calendar:%'`).run();
    return r;
  } catch (err) {
    reply.code(400);
    return { error: String(err.message || err) };
  }
});

// add a pasted list of names (directors/actors) to favorites at once. This is an
// explicit manual action, so it clears any ✕ block for each resolved person (C).
app.post('/api/tracked/by-names', async (req, reply) => {
  try {
    const raw = String(req.body?.names || '');
    const role = ['director', 'actor'].includes(req.body?.role) ? req.body.role : null;
    const hint = role === 'director' ? 'Directing' : role === 'actor' ? 'Acting' : null;
    const names = [...new Set(
      raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    )].slice(0, 300);
    if (!names.length) {
      reply.code(400);
      return { error: 'Pega al menos un nombre' };
    }
    let added = 0;
    const notFound = [];
    for (const name of names) {
      try {
        const info = await findPersonInfo(name, hint);
        if (!info?.id) { notFound.push(name); continue; }
        const before = db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n;
        const r = trackByTmdb({ tmdbId: info.id, name: info.name || name, profilePath: info.profile_path });
        if (r.personId) db.prepare('DELETE FROM unfollowed_people WHERE person_id = ?').run(r.personId);
        const after = db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n;
        if (after > before) added++;
      } catch { notFound.push(name); }
    }
    if (added) db.prepare(`DELETE FROM tmdb_cache WHERE key LIKE 'calendar:%'`).run();
    return { ok: true, added, total: names.length, notFound };
  } catch (err) {
    reply.code(400);
    return { error: String(err.message || err) };
  }
});

// add a whole pack of directors to favorites in one click (#9). Skips anyone the
// user explicitly removed with the ✕ — those only come back via a manual add (C).
app.post('/api/tracked/tmdb-bulk', async (req, reply) => {
  try {
    const people = Array.isArray(req.body?.people) ? req.body.people : [];
    if (!people.length) {
      reply.code(400);
      return { error: 'Faltan personas' };
    }
    const blocked = new Set(db.prepare('SELECT person_id FROM unfollowed_people').all().map((r) => r.person_id));
    let added = 0;
    let skipped = 0;
    for (const p of people.slice(0, 200)) {
      const tmdbId = p.tmdbId ?? p.tmdb_id;
      // if this person is already known and blocked, don't re-add automatically
      const existing = db.prepare('SELECT id FROM people WHERE tmdb_id = ?').get(tmdbId);
      if (existing && blocked.has(existing.id)) { skipped++; continue; }
      try {
        const before = db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n;
        trackByTmdb({ tmdbId, name: p.name, profilePath: p.profilePath ?? p.profile_path });
        const after = db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n;
        if (after > before) added++;
      } catch {}
    }
    if (added) db.prepare(`DELETE FROM tmdb_cache WHERE key LIKE 'calendar:%'`).run();
    return { ok: true, added, skipped, total: people.length };
  } catch (err) {
    reply.code(400);
    return { error: String(err.message || err) };
  }
});

// --- tmdb-powered ------------------------------------------------------------------

app.get('/api/people/:id/filmography', async (req, reply) => {
  try {
    const wantRole = ['director', 'actor', 'writer'].includes(req.query.role) ? req.query.role : null;
    return await filmographyProfile(Number(req.params.id), wantRole);
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// unified movie "ficha" for any TMDB id — owned or not (#7)
app.get('/api/media/:tmdbId', async (req, reply) => {
  try {
    const tmdbId = Number(req.params.tmdbId);
    const det = await tmdbMovieDetail(tmdbId);
    const owned = db.prepare('SELECT * FROM movies WHERE tmdb_id = ? LIMIT 1').get(tmdbId) || null;
    const ratings = q.filterRatings(
      db.prepare('SELECT imdb, imdb_votes, rt_critic, rt_audience, metacritic, letterboxd, trakt, score FROM mdb_ratings WHERE tmdb_id = ?').get(tmdbId) || null
    );
    const inRadarr = !!db.prepare('SELECT 1 FROM radarr_movies WHERE tmdb_id = ?').get(tmdbId);
    // map TMDB person ids to our library people, so cast/crew link to their pages
    const peopleByTmdb = new Map(
      db.prepare('SELECT id, tmdb_id FROM people WHERE tmdb_id IS NOT NULL').all().map((r) => [r.tmdb_id, r.id])
    );
    const mapPerson = (c) => ({ id: peopleByTmdb.get(c.id) ?? null, tmdb_id: c.id, name: c.name, character: c.character || null });
    const directors = (det.credits?.crew || []).filter((c) => c.job === 'Director').map(mapPerson);
    const cast = (det.credits?.cast || []).slice(0, 14).map(mapPerson);
    return {
      tmdb_id: tmdbId,
      title: det.title,
      original_title: det.original_title,
      year: det.release_date ? Number(det.release_date.slice(0, 4)) : null,
      overview: det.overview,
      poster_path: det.poster_path,
      runtime: det.runtime,
      genres: (det.genres || []).map((g) => g.name),
      imdb_id: owned?.imdb_id || det.imdb_id || null,
      directors,
      cast,
      ratings,
      inRadarr,
      owned: owned
        ? {
            rating_key: owned.rating_key, resolution: owned.resolution, hdr: owned.hdr,
            video_codec: owned.video_codec, user_rating: owned.user_rating,
            view_count: owned.view_count, file_path: owned.file_path,
          }
        : null,
    };
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// progress for long TMDB-building pages, polled by the frontend (#5)
app.get('/api/build-progress', async () => buildProgress);

// JustWatch: best available digital quality in the market, to confirm an upgrade
// is actually possible before queuing it (#2/#3). Unofficial API, best-effort.
app.get('/api/justwatch/:tmdbId', async (req, reply) => {
  try {
    const tmdbId = Number(req.params.tmdbId);
    const m = db.prepare('SELECT title, original_title, year, resolution FROM movies WHERE tmdb_id = ? LIMIT 1').get(tmdbId);
    let title = m?.original_title || m?.title;
    let year = m?.year || null;
    if (!title) {
      const det = await tmdbMovieDetail(tmdbId);
      title = det.original_title || det.title;
      year = det.release_date ? Number(det.release_date.slice(0, 4)) : null;
    }
    const av = await availability(title, year);
    return { ...av, ownedResolution: m?.resolution || null, upgradeable: isUpgradeable(m?.resolution, av.maxQuality) };
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.get('/api/calendar', async (req, reply) => {
  try {
    return await getCalendarCached({ refresh: req.query.refresh === '1' });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// favorites feed the upcoming-releases calendar; invalidate its cache on change
const invalidateCalendar = () =>
  db.prepare(`DELETE FROM tmdb_cache WHERE key LIKE 'calendar:%'`).run();

app.post('/api/tracked/bulk', async (req, reply) => {
  const { role, top } = req.body || {};
  if (!['director', 'actor', 'writer'].includes(role) || !Number(top)) {
    reply.code(400);
    return { error: 'Parámetros: role (director|actor|writer) y top (número)' };
  }
  const candidates = db
    .prepare(
      `SELECT p.id FROM movie_people mp JOIN people p ON p.id = mp.person_id
       WHERE mp.role = ? AND p.id NOT IN (SELECT person_id FROM unfollowed_people)
       GROUP BY p.id ORDER BY COUNT(*) DESC, p.name LIMIT ?`
    )
    .all(role, Math.min(Number(top), 1000));
  const ins = db.prepare('INSERT OR IGNORE INTO tracked_people (person_id, added_at) VALUES (?, ?)');
  let added = 0;
  const tx = db.transaction(() => {
    for (const c of candidates) added += ins.run(c.id, Date.now()).changes;
  });
  tx();
  if (added) invalidateCalendar();
  return { ok: true, added, total: candidates.length };
});

app.post('/api/tracked/:personId', async (req) => {
  const id = Number(req.params.personId);
  // a manual, explicit add clears any ✕ block (C)
  db.prepare('DELETE FROM unfollowed_people WHERE person_id = ?').run(id);
  const r = db
    .prepare('INSERT OR IGNORE INTO tracked_people (person_id, added_at) VALUES (?, ?)')
    .run(id, Date.now());
  if (r.changes) invalidateCalendar();
  return { ok: true };
});
app.delete('/api/tracked/all', async () => {
  db.prepare('DELETE FROM tracked_people').run();
  invalidateCalendar();
  return { ok: true };
});
app.delete('/api/tracked/:personId', async (req) => {
  const id = Number(req.params.personId);
  const r = db.prepare('DELETE FROM tracked_people WHERE person_id = ?').run(id);
  // remember the explicit ✕ so bulk/automatic adds skip this person (C)
  db.prepare('INSERT OR IGNORE INTO unfollowed_people (person_id, at) VALUES (?, ?)').run(id, Date.now());
  if (r.changes) invalidateCalendar();
  return { ok: true };
});
app.get('/api/tracked', async () =>
  db
    .prepare(
      `SELECT p.id, p.name, p.thumb, p.deathday, p.tmdb_id,
              SUM(CASE WHEN mp.role = 'director' THEN 1 ELSE 0 END) directed,
              SUM(CASE WHEN mp.role = 'actor' THEN 1 ELSE 0 END) acted,
              COUNT(DISTINCT mp.movie_id) movies
       FROM tracked_people t
       JOIN people p ON p.id = t.person_id
       LEFT JOIN movie_people mp ON mp.person_id = p.id
       GROUP BY p.id ORDER BY movies DESC, p.name`
    )
    .all()
);

// remove every deceased person from favorites in one go ("vivos y muertos")
app.delete('/api/tracked/deceased', async () => {
  // block them from automatic re-adds too (C)
  db.prepare(
    `INSERT OR IGNORE INTO unfollowed_people (person_id, at)
     SELECT t.person_id, ? FROM tracked_people t JOIN people p ON p.id = t.person_id
     WHERE p.deathday IS NOT NULL`
  ).run(Date.now());
  const r = db
    .prepare(
      `DELETE FROM tracked_people WHERE person_id IN (
         SELECT id FROM people WHERE deathday IS NOT NULL)`
    )
    .run();
  if (r.changes) db.prepare(`DELETE FROM tmdb_cache WHERE key LIKE 'calendar:%'`).run();
  return { ok: true, removed: r.changes };
});

app.get('/api/discover/gaps', async (req, reply) => {
  try {
    return await libraryGaps({
      role: ['director', 'actor', 'writer'].includes(req.query.role) ? req.query.role : 'director',
      people: Math.min(Number(req.query.people) || 20, 60),
      perPerson: Math.min(Number(req.query.perPerson) || 8, 20),
      refresh: req.query.refresh === '1',
    });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.get('/api/discover/favorites', async (req, reply) => {
  try {
    return await favoritesGaps({ perPerson: Math.min(Number(req.query.perPerson) || 8, 20), refresh: req.query.refresh === '1' });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.get('/api/discover/absent', async (req, reply) => {
  try {
    return await absentGreats({
      perPerson: Math.min(Number(req.query.perPerson) || 6, 12),
      refresh: req.query.refresh === '1',
      canon: ['alltime', '21c'].includes(req.query.canon) ? req.query.canon : 'alltime',
    });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// --- sagas / franchises (from real TMDB collection membership) --------------

app.get('/api/sagas', async () => ({ state: sagaScanState(), statsStatus: sagaStatsStatus, sagas: sagaList() }));
app.get('/api/sagas/status', async () => ({ ...sagaScanState(), statsStatus: sagaStatsStatus }));
// compute per-franchise "missing" counts from TMDB (#H)
app.post('/api/sagas/stats', async (req) => {
  const force = !!req.body?.force;
  if (!sagaStatsStatus.running) enrichSagaStats({ force }).catch(() => {});
  return sagaStatsStatus;
});
app.post('/api/sagas/scan', async (req) => {
  const force = !!req.body?.force;
  // scan everything by default; the nightly job is the one that batches
  const budget = req.body?.budget === undefined ? Infinity : Number(req.body.budget) || Infinity;
  if (!sagaScanStatus.running) scanSagas({ force, budget }).catch(() => {});
  return sagaScanState();
});
app.get('/api/sagas/:id', async (req, reply) => {
  try {
    return await sagaComplete(Number(req.params.id));
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.get('/api/collections', async () => {
  return db
    .prepare(
      `SELECT t.id, t.name, COUNT(*) n FROM tags t JOIN movie_tags mt ON mt.tag_id = t.id
       WHERE t.type = 'collection' GROUP BY t.id ORDER BY n DESC`
    )
    .all();
});

app.get('/api/collections/complete', async (req, reply) => {
  try {
    const name = String(req.query.name || '');
    const clean = name.replace(/\b(colecci[oó]n|collection)\b/gi, '').trim() || name;
    const found = await searchCollection(clean);
    if (!found) return { matched: false, name };
    const det = await collectionDetails(found.id);
    const inLib = new Set(
      db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id)
    );
    const today = new Date().toISOString().slice(0, 10);
    const parts = (det.parts || []).map((p) => ({
      tmdb_id: p.id,
      title: p.title,
      date: p.release_date || null,
      released: !!p.release_date && p.release_date <= today,
      owned: inLib.has(p.id),
      poster_path: p.poster_path,
    }));
    return {
      matched: true,
      name: det.name,
      tmdb_id: det.id,
      poster_path: det.poster_path,
      parts,
      stats: {
        released: parts.filter((p) => p.released).length,
        owned: parts.filter((p) => p.owned && p.released).length,
      },
    };
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// --- radarr --------------------------------------------------------------------------

app.get('/api/radarr/context', async (req, reply) => {
  try {
    return await radarrContext();
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// local snapshot of what Radarr already has (fast, no network) + refresh
app.get('/api/radarr/ids', async () => radarrOwnedIds());
app.post('/api/radarr/sync', async (req, reply) => {
  try {
    return await radarrSyncMovies();
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// daily auto-add of upcoming films from favorite LIVING directors (#3)
app.get('/api/radarr/auto', async () => ({ ...autoRadarrConfig(), status: autoRadarrStatus }));
app.post('/api/radarr/auto/run', async (req) => {
  const months = Number(req.body?.months) || autoRadarrConfig().months;
  const dryRun = !!req.body?.dryRun;
  return await runAutoRadarr({ months, dryRun });
});

app.post('/api/radarr/add', async (req, reply) => {
  try {
    const { tmdbId, qualityProfileId, rootFolderPath } = req.body || {};
    if (!tmdbId) {
      reply.code(400);
      return { error: 'Falta tmdbId' };
    }
    return await radarrAdd(Number(tmdbId), { qualityProfileId, rootFolderPath });
  } catch (err) {
    reply.code(502);
    return { ok: false, error: String(err.message || err) };
  }
});

app.post('/api/radarr/add-bulk', async (req, reply) => {
  try {
    const ids = (req.body?.tmdbIds || []).map(Number).filter(Boolean);
    if (!ids.length) {
      reply.code(400);
      return { error: 'Falta tmdbIds' };
    }
    if (ids.length > 300) {
      reply.code(400);
      return { error: 'Máximo 300 películas por tanda' };
    }
    return await radarrAddBulk(ids);
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// --- mdblist -----------------------------------------------------------------------------

app.post('/api/mdblist/sync', async () => {
  if (!mdbSyncStatus.running) syncRatings().catch(() => {});
  return mdbSyncStatus;
});

app.get('/api/mdblist/status', async () => ({ ...mdbSyncStatus, ...ratingsCoverage() }));

app.get('/api/mdblist/insights', async () => insights());

app.get('/api/mdblist/lists', async () => savedLists());

app.get('/api/mdblist/lists/search', async (req, reply) => {
  try {
    const q = String(req.query.query || '').trim();
    if (!q) return [];
    return await searchLists(q);
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.post('/api/mdblist/lists', async (req, reply) => {
  try {
    return await addList(req.body || {});
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.get('/api/mdblist/lists/:id', async (req, reply) => {
  const d = listDetail(Number(req.params.id));
  if (!d) {
    reply.code(404);
    return { error: 'Lista no encontrada' };
  }
  return d;
});

app.post('/api/mdblist/lists/:id/refresh', async (req, reply) => {
  try {
    const list = db.prepare('SELECT * FROM mdb_lists WHERE id = ?').get(Number(req.params.id));
    if (!list) {
      reply.code(404);
      return { error: 'Lista no encontrada' };
    }
    return await addList({ mdbId: list.mdb_id, name: list.name, slug: list.slug, userName: list.user_name });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.delete('/api/mdblist/lists/:id', async (req) => {
  deleteList(Number(req.params.id));
  return { ok: true };
});

// --- quality / letterboxd ---------------------------------------------------------------

app.get('/api/quality/overview', async () => q.qualityOverview());
app.get('/api/quality/upgrades', async (req) =>
  q.upgradeCandidates({ limit: Math.min(Number(req.query.limit) || 100, 500) })
);
app.get('/api/quality/duplicates', async () => q.duplicates());

app.post('/api/letterboxd/import', async (req, reply) => {
  const results = [];
  let lists = [];
  for await (const part of req.files()) {
    const buf = await part.toBuffer();
    const name = (part.filename || '').toLowerCase();
    try {
      if (name.endsWith('.zip')) {
        const z = importLetterboxdZip(buf);
        results.push(...z.results);
        lists.push(...z.lists);
      } else {
        results.push({ file: part.filename, ...importLetterboxdCsv(buf, { filename: part.filename }) });
      }
    } catch (err) {
      results.push({ file: part.filename, error: String(err.message || err) });
    }
  }
  if (!results.length && !lists.length) {
    reply.code(400);
    return { error: 'No se recibió ningún archivo' };
  }
  return { results, lists };
});

// RSS feed of a user, to keep pulling recent watches
app.post('/api/letterboxd/rss', async (req, reply) => {
  try {
    const user = req.body?.user ?? getSetting('letterboxd_rss');
    if (req.body?.save != null || req.body?.user != null) setSetting('letterboxd_rss', String(user || ''));
    if (!user) {
      reply.code(400);
      return { error: 'Indica tu usuario de Letterboxd' };
    }
    return await importLetterboxdRss(user);
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// challenge lists (completista rings)
app.get('/api/letterboxd/lists', async () => challengeLists());
app.get('/api/letterboxd/lists/:id', async (req, reply) => {
  const d = challengeListDetail(Number(req.params.id));
  if (!d) {
    reply.code(404);
    return { error: 'Lista no encontrada' };
  }
  return d;
});
app.post('/api/letterboxd/lists', async (req, reply) => {
  try {
    return await importLetterboxdListUrl(req.body?.url || '');
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});
app.post('/api/letterboxd/lists/:id/hide', async (req) => {
  setChallengeHidden(Number(req.params.id), !!req.body?.hidden);
  return { ok: true };
});
// resolve the list's missing films to TMDB and queue them in Radarr (#18)
app.post('/api/letterboxd/lists/:id/radarr', async (req, reply) => {
  try {
    const ids = await listMissingTmdbIds(Number(req.params.id));
    if (!ids.length) return { added: 0, alreadyInRadarr: 0, failed: 0, results: [] };
    return await radarrAddBulk(ids.slice(0, 300));
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});
app.delete('/api/letterboxd/lists/:id', async (req) => {
  deleteChallengeList(Number(req.params.id));
  return { ok: true };
});

app.get('/api/letterboxd/summary', async () => letterboxdSummary());
app.post('/api/letterboxd/rematch', async () => rematchLetterboxd());
// resolve still-unmatched watched entries via TMDB search, then link to library (#1)
app.post('/api/letterboxd/resolve', async (req, reply) => {
  try {
    return await resolveUnmatchedLb();
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});
app.delete('/api/letterboxd', async () => {
  db.prepare('DELETE FROM lb_entries').run();
  return { ok: true };
});

// --- plex image proxy (with tiny disk cache) ----------------------------------------------

app.get('/img/:key/:kind', async (req, reply) => {
  const { key, kind } = req.params;
  if (!/^\d+$/.test(key) || !['poster', 'art'].includes(kind)) {
    reply.code(400);
    return { error: 'bad request' };
  }
  const cacheFile = path.join(DATA_DIR, 'img', `${key}-${kind}.jpg`);
  if (fs.existsSync(cacheFile)) {
    reply.header('Cache-Control', 'public, max-age=604800');
    reply.type('image/jpeg');
    return fs.createReadStream(cacheFile);
  }
  const movie = db.prepare('SELECT thumb, art FROM movies WHERE rating_key = ?').get(Number(key));
  const rel = kind === 'poster' ? movie?.thumb : movie?.art;
  if (!rel) {
    reply.code(404);
    return { error: 'sin imagen' };
  }
  const { url, token } = plexConfig();
  const width = kind === 'poster' ? 300 : 1280;
  const height = kind === 'poster' ? 450 : 720;
  const target = `${url}/photo/:/transcode?width=${width}&height=${height}&minSize=1&upscale=1&url=${encodeURIComponent(rel)}&X-Plex-Token=${token}`;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFile(cacheFile, buf, () => {});
    reply.header('Cache-Control', 'public, max-age=604800');
    reply.type('image/jpeg');
    return buf;
  } catch {
    reply.code(502);
    return { error: 'error de imagen' };
  }
});

// person thumb proxy (plex tag thumbs are absolute plex paths)
app.get('/img/person/:id', async (req, reply) => {
  const person = db.prepare('SELECT thumb FROM people WHERE id = ?').get(Number(req.params.id));
  if (!person?.thumb) {
    reply.code(404);
    return { error: 'sin imagen' };
  }
  const cacheFile = path.join(DATA_DIR, 'img', `p${req.params.id}.jpg`);
  if (fs.existsSync(cacheFile)) {
    reply.header('Cache-Control', 'public, max-age=604800');
    reply.type('image/jpeg');
    return fs.createReadStream(cacheFile);
  }
  try {
    let target = person.thumb;
    if (!/^https?:/.test(target)) {
      const { url, token } = plexConfig();
      target = `${url}/photo/:/transcode?width=200&height=200&minSize=1&url=${encodeURIComponent(person.thumb)}&X-Plex-Token=${token}`;
    }
    const res = await fetch(target, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFile(cacheFile, buf, () => {});
    reply.header('Cache-Control', 'public, max-age=604800');
    reply.type('image/jpeg');
    return buf;
  } catch {
    reply.code(502);
    return { error: 'error de imagen' };
  }
});

// --- static frontend -----------------------------------------------------------------------

const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api') || req.raw.url?.startsWith('/img')) {
      reply.code(404).send({ error: 'no encontrado' });
    } else {
      reply.sendFile('index.html');
    }
  });
}

// nightly auto-sync + calendar refresh + automations (~03:00)
setInterval(() => {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const todayStr = now.toISOString().slice(0, 10);
  // guard so a restart inside the 03:00 window doesn't re-trigger the whole run
  if (
    h === 3 && m < 5 &&
    getSetting('nightly_last_run') !== todayStr &&
    !syncStatus.running && getSetting('plex_url') && getSetting('plex_token')
  ) {
    setSetting('nightly_last_run', todayStr);
    runSync()
      .then(() => rematchLetterboxd())
      .then(() => (getSetting('tmdb_key') ? resolveUnmatchedLb() : null))
      .then(() => getCalendarCached({ refresh: true }))
      .then(() => (getSetting('mdblist_key') ? syncRatings() : null))
      // pull recent watches from the Letterboxd RSS feed, if configured
      .then(() => (getSetting('letterboxd_rss') ? importLetterboxdRss(getSetting('letterboxd_rss')) : null))
      .catch(() => {})
      // refresh Radarr snapshot, then run the daily auto-add for living favorites
      .then(() => (getSetting('radarr_url') && getSetting('radarr_key') ? radarrSyncMovies() : null))
      .then(() =>
        getSetting('auto_radarr_enabled') === '1'
          ? runAutoRadarr({ months: Number(getSetting('auto_radarr_months') || 6) })
          : null
      )
      // keep the saga scan advancing a batch each night
      .then(() => (getSetting('tmdb_key') ? scanSagas({ budget: 800 }) : null))
      .catch(() => {});
  }
}, 5 * 60 * 1000);

const port = Number(process.env.PORT || 3860);
await app.listen({ port, host: '0.0.0.0' });
console.log(`PowaFlex escuchando en http://0.0.0.0:${port}`);
