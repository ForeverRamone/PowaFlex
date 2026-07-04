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
  filmography,
  getCalendarCached,
  searchCollection,
  collectionDetails,
} from './tmdb.js';
import { radarrTest, radarrContext, radarrAdd } from './radarr.js';
import { libraryGaps, absentGreats } from './discover.js';
import { importLetterboxdCsv, rematchLetterboxd, letterboxdSummary } from './letterboxd.js';
import * as q from './queries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
const app = Fastify({ logger: { level: 'info' } });

app.get('/api/version', async () => ({
  version: pkg.version,
  label: pkg.versionLabel || `v${pkg.version}`,
  repo: 'https://github.com/ForeverRamone/PowerPlex',
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

app.get('/api/people', async (req) => {
  return q.topPeople({
    role: req.query.role || 'director',
    limit: Math.min(Number(req.query.limit) || 30, 200),
    offset: Number(req.query.offset) || 0,
    search: req.query.search || '',
  });
});

// --- tmdb-powered ------------------------------------------------------------------

app.get('/api/people/:id/filmography', async (req, reply) => {
  try {
    const role = req.query.role || 'director';
    return await filmography(Number(req.params.id), role);
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
  db.prepare(`DELETE FROM tmdb_cache WHERE key = 'calendar:v1'`).run();

app.post('/api/tracked/bulk', async (req, reply) => {
  const { role, top } = req.body || {};
  if (!['director', 'actor', 'writer'].includes(role) || !Number(top)) {
    reply.code(400);
    return { error: 'Parámetros: role (director|actor|writer) y top (número)' };
  }
  const candidates = db
    .prepare(
      `SELECT p.id FROM movie_people mp JOIN people p ON p.id = mp.person_id
       WHERE mp.role = ? GROUP BY p.id ORDER BY COUNT(*) DESC, p.name LIMIT ?`
    )
    .all(role, Math.min(Number(top), 200));
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
  const r = db
    .prepare('INSERT OR IGNORE INTO tracked_people (person_id, added_at) VALUES (?, ?)')
    .run(Number(req.params.personId), Date.now());
  if (r.changes) invalidateCalendar();
  return { ok: true };
});
app.delete('/api/tracked/all', async () => {
  db.prepare('DELETE FROM tracked_people').run();
  invalidateCalendar();
  return { ok: true };
});
app.delete('/api/tracked/:personId', async (req) => {
  const r = db.prepare('DELETE FROM tracked_people WHERE person_id = ?').run(Number(req.params.personId));
  if (r.changes) invalidateCalendar();
  return { ok: true };
});
app.get('/api/tracked', async () =>
  db
    .prepare(
      `SELECT p.id, p.name, p.thumb,
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

app.get('/api/discover/gaps', async (req, reply) => {
  try {
    return await libraryGaps({
      role: ['director', 'actor', 'writer'].includes(req.query.role) ? req.query.role : 'director',
      people: Math.min(Number(req.query.people) || 20, 40),
      perPerson: Math.min(Number(req.query.perPerson) || 8, 20),
    });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.get('/api/discover/absent', async (req, reply) => {
  try {
    return await absentGreats({ perPerson: Math.min(Number(req.query.perPerson) || 6, 12) });
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

// --- quality / letterboxd ---------------------------------------------------------------

app.get('/api/quality/overview', async () => q.qualityOverview());
app.get('/api/quality/upgrades', async (req) =>
  q.upgradeCandidates({ limit: Math.min(Number(req.query.limit) || 100, 500) })
);
app.get('/api/quality/duplicates', async () => q.duplicates());

app.post('/api/letterboxd/import', async (req, reply) => {
  const results = [];
  for await (const part of req.files()) {
    const buf = await part.toBuffer();
    try {
      results.push({ file: part.filename, ...importLetterboxdCsv(buf, { filename: part.filename }) });
    } catch (err) {
      results.push({ file: part.filename, error: String(err.message || err) });
    }
  }
  if (!results.length) {
    reply.code(400);
    return { error: 'No se recibió ningún archivo' };
  }
  return { results };
});

app.get('/api/letterboxd/summary', async () => letterboxdSummary());
app.post('/api/letterboxd/rematch', async () => rematchLetterboxd());
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

// nightly auto-sync + calendar refresh (03:30)
setInterval(() => {
  const h = new Date().getHours();
  const m = new Date().getMinutes();
  if (h === 3 && m < 5 && !syncStatus.running && getSetting('plex_url') && getSetting('plex_token')) {
    runSync().then(() => rematchLetterboxd()).then(() => getCalendarCached({ refresh: true })).catch(() => {});
  }
}, 5 * 60 * 1000);

const port = Number(process.env.PORT || 3860);
await app.listen({ port, host: '0.0.0.0' });
console.log(`PowerPlex escuchando en http://0.0.0.0:${port}`);
