import Fastify from 'fastify';
import { today } from './dates.js';
import { mapPool } from './pool.js';
import { normName } from './names.js';
import fastifyStatic from '@fastify/static';
import compress from '@fastify/compress';
import multipart from '@fastify/multipart';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, DATA_DIR, getAllSettings, setSetting, getSetting, SECRET_SETTING_KEYS } from './db.js';
import { plexTest, plexConfig, runSync, syncStatus, movieSections } from './plex.js';
import {
  tmdbTest,
  filmographyProfile,
  filmographyProfileByTmdb,
  personDetails,
  getCalendarCached,
  enrichPeopleLife,
  enrichReleasePhases,
  tmdbPoster,
  searchMovieId,
  tmdbMovieDetail,
  currentProgress,
  setBuildProgress,
  clearBuildProgress,
  suggestedPeople,
  trackByTmdb,
  followFacets,
  searchMovieCandidates,
  searchPeople,
  findPersonInfo,
  resolveCatalogDirector,
  resolvePerson,
  normalizeLibraryTitles,
  normalizePeopleNames,
  latinizeNames,
  olvidarFilmografia,
} from './tmdb.js';
import {
  radarrTest,
  radarrContext,
  radarrAdd,
  radarrAddBulk,
  radarrSyncMovies,
  radarrOwnedIds,
  radarrRecent,
  radarrCaptures,
  radarrWanted,
  radarrCutoffUnmet,
  radarrSearchAgain,
} from './radarr.js';
import { libraryGaps, favoritesGaps, absentGreats, listCanons, saveCanon, deleteCanon, canonNames } from './discover.js';
import {
  detectarEmergentes, emergentesStatus, listaEmergentes,
  descartarEmergente, recuperarEmergente, CLAVES_PESO,
} from './emergentes.js';
import { releases } from './releases.js';
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
import {
  runAutoRadarr, runRadarrRules, rulesStatus, rulesOverview, rulesLog,
  createRule, updateRule, deleteRule, getRule,
  aprobarPendiente, rechazarPendiente, resolverTodasLasPendientes, cuantasPendientes, enviosDeFavoritos,
} from './rules.js';
import { asRole, isRankable, roleHint, RANKABLE_ROLES } from './roles.js';
import { avalesDe, conteoAvales, indiceAvales, avalesDeFilmografia } from './avales.js';
import {
  catalogoPaises, peliculasDePais, aniosDePais, esPaisConocido, PAISES,
  ponerOverride, quitarOverride, overridesDePais, arrancarPais, paisesStatus, sembrarPais,
} from './paises.js';
import { tieneRanking, hayPaqueteFA, paqueteHasta } from './filmaffinity.js';
import { ROLES } from './roles.js';
import { importImdbRatings, imdbInfo } from './imdb.js';
import { listarCopias, hacerCopia, BACKUP_DIR } from './backup.js';
import { festivalsIndex, festivalEdition, festivalWinners, festivalYear, festivalOverrideKey, festivalDirectorPacks } from './festivals.js';
import { DIRECTORS_2026 } from './data/directors-2026.js';
import { dataHealth } from './datahealth.js';
import { runFullRefresh, refreshStatus, refreshHistory, nightlyHealth } from './refresh.js';
import { availability, isUpgradeable } from './justwatch.js';
import { scanSagas, sagaScanStatus, sagaScanState, sagaList, sagaComplete, enrichSagaStats, sagaStatsStatus } from './saga.js';
import * as q from './queries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
const app = Fastify({ logger: { level: 'info' } });

// Compresión para TODO (API y estáticos): un palmarés grande son ~282 KB de
// JSON que en el wifi de casa se notan, y gzip los deja en una fracción. Va
// registrado antes que cualquier ruta porque el plugin solo envuelve las
// respuestas de lo declarado después de él.
await app.register(compress);

// --- optional authentication ----------------------------------------------------
// POWAFLEX_AUTH="user:password" turns on HTTP Basic for the whole panel (API,
// images and the SPA). Basic is the only scheme the browser replays by itself on
// every same-origin request, so web/ needs no login screen and no custom header.
// If the value has no ":", the user is "powaflex" and the value is the password.
// Undefined variable = exactly the previous behaviour (no auth at all).
// Only /api/version stays open, so the Docker HEALTHCHECK needs no credentials.
const AUTH_OPEN_PATHS = new Set(['/api/version']);
if (process.env.POWAFLEX_AUTH) {
  const raw = process.env.POWAFLEX_AUTH.includes(':')
    ? process.env.POWAFLEX_AUTH
    : `powaflex:${process.env.POWAFLEX_AUTH}`;
  // Se comparan RESÚMENES, no las credenciales. timingSafeEqual exige la misma
  // longitud, y comprobarla antes era un chivato: probando cabeceras de distinto
  // tamaño se deducía cuántos caracteres tiene la contraseña. Un sha256 mide
  // siempre 32 bytes, así que ya no hay nada que medir.
  const digest = (v) => crypto.createHash('sha256').update(v || '', 'utf-8').digest();
  const expected = digest(`Basic ${Buffer.from(raw, 'utf-8').toString('base64')}`);

  // Freno de fuerza bruta por IP: sin él, una contraseña corta cae sola en una
  // tarde. Ventana deslizante en memoria, que basta para lo que esto es.
  const FAILS_MAX = 10;
  const FAILS_WINDOW = 5 * 60 * 1000;
  const fails = new Map();
  const tooManyFails = (ip) => {
    const hits = (fails.get(ip) || []).filter((t) => Date.now() - t < FAILS_WINDOW);
    if (hits.length) fails.set(ip, hits);
    else fails.delete(ip); // sin esto el mapa crecía con cada IP que dejó de fallar
    return hits.length >= FAILS_MAX;
  };

  app.addHook('onRequest', async (req, reply) => {
    if (AUTH_OPEN_PATHS.has((req.raw.url || '').split('?')[0])) return;
    const ip = req.ip || 'desconocida';
    // Las credenciales se comprueban PRIMERO: si son buenas, se entra aunque
    // haya bloqueo. Detrás de un proxy inverso todo el mundo comparte IP, y al
    // revés dejaba fuera al dueño de la casa por los intentos de otro.
    if (crypto.timingSafeEqual(digest(req.headers.authorization), expected)) {
      fails.delete(ip);
      return;
    }
    if (tooManyFails(ip)) {
      reply.header('Retry-After', '300');
      return reply.code(429).send({ error: 'Demasiados intentos, prueba en unos minutos' });
    }
    fails.set(ip, [...(fails.get(ip) || []), Date.now()]);
    reply.header('WWW-Authenticate', 'Basic realm="PowaFlex", charset="UTF-8"');
    return reply.code(401).send({ error: 'No autorizado' });
  });
  console.log('[PowaFlex] Autenticación básica activada (POWAFLEX_AUTH)');
} else {
  console.warn(
    '[PowaFlex] SIN autenticación: cualquiera que alcance este puerto puede leer y CAMBIAR tus\n' +
    '           ajustes, y con ello hacer que PowaFlex mande tu token de Plex a otra dirección.\n' +
    '           Define POWAFLEX_AUTH="usuario:contraseña" si esto no está solo en tu red de casa.'
  );
}

app.get('/api/version', async () => ({
  version: pkg.version,
  label: pkg.versionLabel || `v${pkg.version}`,
  repo: 'https://github.com/ForeverRamone/PowaFlex',
}));

// El export completo de Letterboxd de una cinefilia larga no pasa de unos
// pocos MB; 40 MB × 4 sobra de calle y evita que una subida se coma la RAM del
// NAS (cada parte se materializa entera en memoria con toBuffer()).
await app.register(multipart, { limits: { fileSize: 40 * 1024 * 1024, files: 4 } });

/**
 * Cortafuegos contra peticiones lanzadas desde OTRA web.
 *
 * Un formulario ajeno puede mandar multipart/form-data sin que el navegador
 * pida permiso antes (es «simple request»: no hay preflight que lo pare), y de
 * paso reenvía las credenciales Basic que ya tenga guardadas para este origen.
 * Como el parser de multipart deja el cuerpo vacío en vez de fallar, cualquier
 * POST que no necesite cuerpo —sincronizar, actualizar todo, lanzar el
 * auto-Radarr— se podía disparar desde una pestaña cualquiera. Antes esto solo
 * cubría la importación de Letterboxd; ahora vale para todo lo que muta.
 *
 * La app se sirve del mismo origen que la API, así que su Origin siempre casa
 * con el Host y nada cambia de cara al usuario. Sin cabecera Origin (curl, la
 * app de escritorio) se deja pasar: ahí no hay navegador que engañar.
 */
app.addHook('onRequest', async (req, reply) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
  const origen = req.headers.origin;
  if (!origen) return;
  // Detrás de un proxy inverso (nginx, Traefik, el de Synology) el Host que
  // llega aquí es el del contenedor, no el que escribió el usuario en la barra
  // del navegador: sin mirar X-Forwarded-Host, ese montaje se quedaría sin
  // poder sincronizar ni guardar nada.
  // Solo el PRIMER elemento de X-Forwarded-Host: la cabecera la puede escribir
  // quien llama, y aceptar toda la lista dejaba que «evil.example, casa.local»
  // colara cualquier origen. El primero es el que puso el cliente original y el
  // que un proxy que añade en cadena conserva.
  const primero = (h) => String(h).split(',')[0].trim().toLowerCase();
  const anfitriones = new Set(
    [req.headers['x-forwarded-host'], req.headers.host].filter(Boolean).map(primero)
  );
  let ajeno = true;
  try {
    ajeno = !anfitriones.has(new URL(origen).host.toLowerCase());
  } catch {
    ajeno = true;
  }
  if (ajeno) {
    reply.code(403);
    return reply.send({ error: 'Petición desde otro sitio web' });
  }
});

// --- settings ----------------------------------------------------------------

// la lista vive en db.js, que es quien cifra: una sola fuente de verdad
const SECRET_KEYS = SECRET_SETTING_KEYS;

// Solo estas claves se pueden escribir desde fuera. El destino de todas las
// peticiones salientes (Plex, Radarr) sale de aquí, así que dejar la puerta
// abierta permitía apuntar la app a otro sitio y quedarse con las credenciales.
const WRITABLE_SETTINGS = new Set([
  'plex_url', 'plex_token', 'plex_sections',
  'tmdb_key', 'language',
  'radarr_url', 'radarr_key', 'radarr_quality_profile', 'radarr_root_folder', 'radarr_tag',
  'mdblist_key', 'mdblist_tier',
  'letterboxd_rss',
  'auto_radarr_enabled', 'auto_radarr_months', 'auto_radarr_lookback_days', 'auto_radarr_include_docs',
  'quarantine_enabled', 'quarantine_langs', 'quarantine_countries',
  // los pesos de las cinco señales del detector de emergentes
  ...CLAVES_PESO,
  'cal_top_directors', 'cal_top_actors',
  'gaps_min_votes_director', 'gaps_min_votes_actor',
  'ratings_sources', 'primary_rating', 'ui_theme', 'ui_language', 'jw_country',
  'backup_auto', 'backup_keep',
]);

// Ajustes cuyo cambio deja obsoletas las páginas ya calculadas.
const CACHE_BUSTING_SETTINGS = new Set([
  'gaps_min_votes_director', 'gaps_min_votes_actor', 'cal_top_directors', 'cal_top_actors', 'language',
]);

function invalidarPaginasCalculadas() {
  db.prepare(
    `DELETE FROM tmdb_cache WHERE key LIKE 'discover_gaps:%' OR key LIKE 'discover_favorites:%'
       OR key LIKE 'discover_absent:%' OR key LIKE 'calendar:%'`
  ).run();
}

app.get('/api/settings', async () => {
  const all = getAllSettings();
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    // los últimos 4 caracteres son del VALOR, no del criptograma: con
    // POWAFLEX_SECRET el crudo es «enc:v1:…» y el rabito no decía nada
    out[k] = SECRET_KEYS.has(k) && v ? `••••${String(getSetting(k) ?? '').slice(-4)}` : v;
  }
  for (const k of SECRET_KEYS) out[`${k}_set`] = !!all[k];
  return out;
});

// Las URL de Plex y Radarr deciden a dónde salen las peticiones (con el token
// pegado), y su respuesta se devuelve al navegador. Una URL con query,
// fragmento o userinfo no es de un servidor de verdad: el «#» final, además,
// descarta todo lo que la app le pega detrás, así que la petición acabaría
// yendo a la ruta exacta que quisiera quien escribiera el ajuste. Ninguna URL
// legítima de Plex o Radarr lleva nada de eso.
const URL_SETTINGS = new Set(['plex_url', 'radarr_url']);
function urlDeServicioValida(v) {
  if (!v) return true; // vaciar el ajuste es legítimo
  try {
    const u = new URL(v);
    return ['http:', 'https:'].includes(u.protocol) && !u.search && !u.hash && !u.username && !u.password;
  } catch {
    return false;
  }
}

app.put('/api/settings', async (req, reply) => {
  const body = req.body || {};
  const ignoradas = [];
  let invalidar = false;
  for (const [k, v] of Object.entries(body)) {
    if (typeof v !== 'string' && v !== null) continue;
    if (!WRITABLE_SETTINGS.has(k)) { ignoradas.push(k); continue; }
    if (URL_SETTINGS.has(k) && !urlDeServicioValida(v)) {
      reply.code(400);
      return { error: `La dirección de ${k === 'plex_url' ? 'Plex' : 'Radarr'} debe ser una URL http(s) sin parámetros ni «#» (por ejemplo http://192.168.1.50:32400)` };
    }
    if (SECRET_KEYS.has(k) && typeof v === 'string' && v.startsWith('••••')) continue; // masked, unchanged
    if (CACHE_BUSTING_SETTINGS.has(k) && String(getSetting(k) ?? '') !== String(v ?? '')) invalidar = true;
    setSetting(k, v);
  }
  // los umbrales y el tamaño del radar deciden lo que sale en Descubrir y en el
  // calendario: sin esto, cambiarlos no se notaba hasta que caducara la caché
  if (invalidar) invalidarPaginasCalculadas();
  return { ok: true, ignoradas: ignoradas.length ? ignoradas : undefined, cachesInvalidadas: invalidar || undefined };
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
    // para el aviso de la barra lateral: última pasada con errores o caducada
    nightly: nightlyHealth(),
    // y el otro aviso de Ajustes: películas en cuarentena esperando tu ✓
    pendientes: cuantasPendientes(),
  };
});

// --- festivales ----------------------------------------------------------------

app.get('/api/festivals', async () => festivalsIndex());

// buscador para corregir a mano un emparejado (candidatos con cartel)
app.get('/api/festivals/match-candidates', async (req, reply) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return { candidates: [] };
    const year = Number(req.query.year) || null;
    return { candidates: (await searchMovieCandidates(q, year)).slice(0, 8) };
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// fijar (o borrar, con tmdbId null) una corrección manual de emparejado
app.post('/api/festivals/match', async (req, reply) => {
  const { title, year, director = null, tmdbId = null } = req.body || {};
  if (!title || !Number(year)) {
    reply.code(400);
    return { error: 'Faltan el título o el año de la fila a corregir' };
  }
  const key = festivalOverrideKey(title, Number(year), director);
  if (tmdbId) {
    db.prepare(
      `INSERT INTO match_overrides (key, tmdb_id, set_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET tmdb_id = excluded.tmdb_id, set_at = excluded.set_at`
    ).run(key, Number(tmdbId), Date.now());
  } else {
    db.prepare('DELETE FROM match_overrides WHERE key = ?').run(key);
  }
  // las páginas ya calculadas no saben del cambio: fuera, que se rehagan (es
  // barato: el resto de emparejados sale de la caché film_match)
  db.prepare(`DELETE FROM tmdb_cache WHERE key LIKE 'festival:%'`).run();
  return { ok: true };
});

// lo mejor de un año: la ganadora de cada premio, de una vez. Va ANTES que
// «/:key/:year» porque «anuario» encajaría como si fuera la clave de un premio.
app.get('/api/festivals/anuario/:year', async (req, reply) => {
  try {
    return await festivalYear(Number(req.params.year), { refresh: req.query.refresh === '1' });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// palmarés histórico del premio que clasifica (antes que :year para no chocar)
app.get('/api/festivals/:key/palmares', async (req, reply) => {
  try {
    return await festivalWinners(req.params.key, { refresh: req.query.refresh === '1' });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.get('/api/festivals/:key/:year', async (req, reply) => {
  try {
    return await festivalEdition(req.params.key, Number(req.params.year), {
      refresh: req.query.refresh === '1',
    });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// --- copia de seguridad --------------------------------------------------------

// La base de datos entera, como fichero. Se copia primero con la API de backup
// de SQLite (una lectura coherente aunque haya escrituras en marcha y WAL a
// medias) y se sirve esa copia, nunca el fichero vivo.
app.get('/api/backup/database', async (req, reply) => {
  const tmp = path.join(os.tmpdir(), `powaflex-backup-${process.pid}-${Date.now()}.db`);
  await db.backup(tmp);
  const fecha = new Date().toISOString().slice(0, 10);
  reply.header('Content-Disposition', `attachment; filename="powaflex-${fecha}.db"`);
  reply.type('application/octet-stream');
  const stream = fs.createReadStream(tmp);
  stream.on('close', () => fs.unlink(tmp, () => {}));
  return reply.send(stream);
});

// Los ajustes con sus valores REALES (a diferencia de /api/settings, que tapa
// los secretos): es una copia para reinstalar, no una pantalla. Solo las claves
// que se pueden escribir, nada de contadores ni estado interno.
app.get('/api/backup/settings', async (req, reply) => {
  const settings = {};
  // getSetting (no getAllSettings) porque este descifra: con POWAFLEX_SECRET
  // activo, el crudo son blobs «enc:v1:…» cifrados con ESTE secreto, y
  // restaurarlos en otra instalación dejaba credenciales inservibles sin decir
  // nada.
  for (const k of WRITABLE_SETTINGS) {
    const v = getSetting(k);
    if (v != null) settings[k] = v;
  }
  const fecha = new Date().toISOString().slice(0, 10);
  reply.header('Content-Disposition', `attachment; filename="powaflex-ajustes-${fecha}.json"`);
  reply.type('application/json');
  return { app: 'powaflex', kind: 'ajustes', exportedAt: new Date().toISOString(), settings };
});

app.post('/api/backup/settings', async (req, reply) => {
  const body = req.body || {};
  if (body.app !== 'powaflex' || body.kind !== 'ajustes' || typeof body.settings !== 'object' || !body.settings) {
    reply.code(400);
    return { error: 'Esto no parece un fichero de ajustes exportado por PowaFlex' };
  }
  let aplicadas = 0;
  const ignoradas = [];
  for (const [k, v] of Object.entries(body.settings)) {
    // la misma puerta que /api/settings: nada de claves fuera de la lista
    if (!WRITABLE_SETTINGS.has(k) || (typeof v !== 'string' && v !== null)) {
      ignoradas.push(k);
      continue;
    }
    setSetting(k, v);
    aplicadas++;
  }
  // varios de estos ajustes deciden lo que sale en Descubrir y el calendario
  invalidarPaginasCalculadas();
  return { ok: true, aplicadas, ignoradas: ignoradas.length ? ignoradas : undefined };
});

// --- sync ----------------------------------------------------------------------

app.post('/api/sync', async (req, reply) => {
  const force = !!req.body?.force;
  // «Actualizar todo» comprueba el sync UNA vez, al entrar: si se lanza una
  // sincronización a mitad de sus diecisiete pasos, los dos reescriben
  // `movies.title` a la vez y el calendario y los huecos se calculan sobre una
  // biblioteca a medio normalizar (y se cachean 6-12 h).
  if (refreshStatus?.running) {
    reply.code(409);
    return { error: 'Hay una actualización completa en marcha: espera a que termine' };
  }
  if (!syncStatus.running) {
    // Plex reescribe `title` con lo que diga su agente, así que los títulos en
    // otros alfabetos se vuelven a normalizar en cuanto termina de sincronizar
    runSync({ force })
      .then(() => rematchLetterboxd())
      .then(() => (getSetting('tmdb_key') ? normalizeLibraryTitles() : null))
      .then(() => (getSetting('tmdb_key') ? normalizePeopleNames() : null))
      // no se traga el fallo: runSync lo deja en syncStatus.error, pero los pasos
      // siguientes desaparecían sin dejar rastro ni en el log
      .catch((err) => app.log.error({ err }, 'post-sincronización'));
  }
  return syncStatus;
});

app.get('/api/sync/status', async () => {
  const last = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1').get();
  return { ...syncStatus, last };
});

app.get('/api/plex/sections', async (req, reply) => {
  // sin Plex configurado esto lanza, y sin el try salía un 500 crudo de Fastify
  // con su traza en el log en vez de un error que el cliente pueda enseñar
  try {
    return await movieSections();
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

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
  // los avales van también en la ficha de lo que YA tienes: saber que esa
  // película que llevas años sin ver está en cinco palmareses es media razón
  // para ponerla esta noche
  return { ...m, avales: m.tmdb_id ? avalesDe(m.tmdb_id) : null };
});

/**
 * Cuántos avales tiene cada película de una parrilla. Va por POST porque una
 * pantalla de huecos manda tranquilamente 300 ids, y eso no cabe en una URL.
 */
app.post('/api/avales', async (req, reply) => {
  const ids = Array.isArray(req.body?.tmdbIds) ? req.body.tmdbIds.map(Number).filter(Boolean) : [];
  if (!ids.length) {
    reply.code(400);
    return { error: 'Faltan los ids' };
  }
  return { conteo: conteoAvales(ids.slice(0, 2000)), hasta: indiceAvales().hasta };
});

/**
 * Corrector manual de emparejado.
 *
 * Por muy afinadas que estén las reglas, siempre queda el caso que no van a
 * acertar: dos personas con el mismo nombre, alguien con la obra repartida en
 * dos fichas de TMDB, o una película que Plex identificó con el guid de otra.
 * Aquí tú tienes la última palabra, y lo que digas se marca con `tmdb_locked`
 * para que ningún automatismo lo revise: ni la re-verificación semanal de
 * personas ni la sincronización nocturna de Plex.
 */
function invalidarDeLaPersona(tmdbId) {
  // su filmografía cacheada era la de la ficha ANTERIOR
  if (tmdbId) {
    db.prepare('DELETE FROM tmdb_cache WHERE key LIKE ? OR key LIKE ?')
      .run(`person_credits:${tmdbId}:%`, `person:${tmdbId}:%`);
  }
  // y las páginas que se construyen a partir de ella
  db.prepare(
    `DELETE FROM tmdb_cache WHERE key LIKE 'calendar:%' OR key LIKE 'discover_favorites:%'
       OR key LIKE 'discover_gaps:%' OR key LIKE 'discover_absent:%'`
  ).run();
}

app.post('/api/people/:id/match', async (req, reply) => {
  const personId = Number(req.params.id);
  const persona = db.prepare('SELECT id, name, tmdb_id FROM people WHERE id = ?').get(personId);
  if (!persona) {
    reply.code(404);
    return { error: 'Esa persona no está en tu biblioteca' };
  }
  const tmdbId = req.body?.tmdbId == null ? null : Number(req.body.tmdbId);
  if (tmdbId !== null && !Number.isSafeInteger(tmdbId)) {
    reply.code(400);
    return { error: 'El id de TMDB no es válido' };
  }

  invalidarDeLaPersona(persona.tmdb_id);
  if (tmdbId) {
    db.prepare('UPDATE people SET tmdb_id = ?, tmdb_verified = 1, tmdb_locked = 1, tmdb_checked_at = ? WHERE id = ?')
      .run(tmdbId, Date.now(), personId);
    invalidarDeLaPersona(tmdbId);
  } else {
    // quitar la corrección: se olvida lo fijado y vuelve el automatismo, que
    // reintentará en la próxima construcción (tmdb_checked_at a null)
    db.prepare('UPDATE people SET tmdb_locked = 0, tmdb_verified = 0, tmdb_checked_at = NULL WHERE id = ?')
      .run(personId);
  }
  return { ok: true, name: persona.name, tmdbId };
});

app.get('/api/movies/match-candidates', async (req, reply) => {
  try {
    const term = String(req.query.q || '').trim();
    if (!term) return { candidates: [] };
    const year = Number(req.query.year) || null;
    return { candidates: (await searchMovieCandidates(term, year)).slice(0, 8) };
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.post('/api/movies/:id/match', async (req, reply) => {
  const ratingKey = Number(req.params.id);
  const peli = db.prepare('SELECT rating_key, title FROM movies WHERE rating_key = ?').get(ratingKey);
  if (!peli) {
    reply.code(404);
    return { error: 'Esa película no está en tu biblioteca' };
  }
  const tmdbId = req.body?.tmdbId == null ? null : Number(req.body.tmdbId);
  if (tmdbId !== null && !Number.isSafeInteger(tmdbId)) {
    reply.code(400);
    return { error: 'El id de TMDB no es válido' };
  }

  if (tmdbId) {
    db.prepare('UPDATE movies SET tmdb_id = ?, tmdb_locked = 1 WHERE rating_key = ?').run(tmdbId, ratingKey);
  } else {
    // sin bloqueo, la próxima sincronización vuelve a poner el guid de Plex
    db.prepare('UPDATE movies SET tmdb_locked = 0 WHERE rating_key = ?').run(ratingKey);
  }
  // el completismo, los huecos y las notas se calculan a partir del id
  db.prepare(
    `DELETE FROM tmdb_cache WHERE key LIKE 'discover_gaps:%' OR key LIKE 'discover_favorites:%'
       OR key LIKE 'discover_absent:%'`
  ).run();
  return { ok: true, title: peli.title, tmdbId };
});

app.get('/api/filters', async () => q.filterOptions());

app.get('/api/search', async (req) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) return { movies: [], people: [] };
  return q.globalSearch(term);
});

app.get('/api/people', async (req) => {
  return q.topPeople({
    role: asRole(req.query.role, 'director'),
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

// cuadros de «habituales de festival»: los directores/as con más películas en
// la competición de Cannes, Venecia y Berlín en la última década, listos para
// seguirse desde Favoritos → Añadir. La primera construcción baja ~30 tablas
// de Wikipedia y se cachea 7 días; después es instantáneo.
app.get('/api/people/festival-packs', async (req, reply) => {
  try {
    return await festivalDirectorPacks({ refresh: req.query.refresh === '1' });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

/**
 * El catálogo de directores en activo (Wikidata, agosto de 2026).
 *
 * Se sirve entero y en crudo —son 680 filas, nada para un JSON— y filtrar y
 * ordenar lo hace el navegador: así los controles responden al instante en vez
 * de pedir una página por cada clic. Lo único que se calcula aquí es a quién
 * sigues ya, comparando por nombre normalizado (que es como se resuelven
 * contra TMDB cuando los añades).
 */
// el catálogo indexado por nombre: la resolución verificada necesita el año de
// nacimiento (o la edad) de cada uno para comprobar que TMDB le ha dado la
// persona correcta y no a su homónimo famoso
const CATALOGO_POR_NOMBRE = new Map(DIRECTORS_2026.map((d) => [d.name, d]));
const fichaDeCatalogo = (nombre) => CATALOGO_POR_NOMBRE.get(nombre) || { name: nombre };

app.get('/api/directors/catalog', async () => {
  const norm = normName; // pliega ł/ø/ı: Wikidata y TMDB los escriben distinto
  const seguidos = new Set(
    db
      .prepare(
        `SELECT p.name FROM tracked_people t JOIN people p ON p.id = t.person_id WHERE t.role = 'director'`
      )
      .all()
      .map((r) => norm(r.name))
  );
  // los que quitaste con la ✕ no deberían reaparecer como sugerencia
  const vetados = new Set(
    db
      .prepare(`SELECT p.name FROM unfollowed_people u JOIN people p ON p.id = u.person_id`)
      .all()
      .map((r) => norm(r.name))
  );
  return {
    generatedAt: '2026-08-05',
    source: 'Wikidata (query.wikidata.org)',
    directors: DIRECTORS_2026.map((d) => ({
      ...d,
      tracked: seguidos.has(norm(d.name)),
      unfollowed: vetados.has(norm(d.name)),
    })),
  };
});

/**
 * Las fotos de TMDB del catálogo, a demanda y solo de lo que estás mirando.
 *
 * El catálogo viene de Wikidata y no trae ids de TMDB: resolver los 680 al
 * abrir la página serían 680 búsquedas para pintar una lista. Aquí se resuelve
 * únicamente el puñado que hay en pantalla, y como findPersonInfo cachea 30
 * días, cada nombre se busca UNA vez y las siguientes visitas son instantáneas.
 * Quien no aparezca en TMDB se devuelve igualmente, con la foto a null, para
 * que el cliente no vuelva a preguntar por él.
 */
app.post('/api/directors/photos', async (req, reply) => {
  const nombres = [...new Set((req.body?.names || []).filter((n) => typeof n === 'string' && n.trim()))].slice(0, 150);
  if (!nombres.length) return { photos: {} };
  // sin clave de TMDB no hay fotos, pero la página funciona igual
  if (!getSetting('tmdb_key')) return { photos: {}, unavailable: true };
  const photos = {};
  await mapPool(nombres, 6, async (nombre) => {
    try {
      const info = await resolveCatalogDirector(fichaDeCatalogo(nombre));
      photos[nombre] = { tmdbId: info?.id || null, profilePath: info?.profile_path || null };
    } catch {
      photos[nombre] = { tmdbId: null, profilePath: null };
    }
  });
  return { photos };
});

/**
 * Seguir directores del catálogo, con el emparejado VERIFICADO.
 *
 * No vale /tracked/by-names aquí: ese resuelve por popularidad y metería al
 * homónimo famoso —el actor Steve McQueen en vez del director— en favoritos,
 * en el calendario y en los huecos. Con la ficha del catálogo delante hay año
 * de nacimiento contra el que comprobar, así que se usa.
 */
app.post('/api/directors/follow', async (req, reply) => {
  const nombres = [...new Set((req.body?.names || []).filter((n) => typeof n === 'string' && n.trim()))].slice(0, 150);
  if (!nombres.length) {
    reply.code(400);
    return { error: 'No hay a quién seguir' };
  }
  let added = 0;
  const notFound = [];
  for (const nombre of nombres) {
    try {
      const info = await resolveCatalogDirector(fichaDeCatalogo(nombre));
      if (!info?.id) { notFound.push(nombre); continue; }
      const antes = db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n;
      const r = trackByTmdb({ tmdbId: info.id, name: info.name || nombre, profilePath: info.profile_path, role: 'director' });
      // añadirlo a mano levanta el veto de la ✕, como en el resto de altas
      if (r.personId) db.prepare('DELETE FROM unfollowed_people WHERE person_id = ?').run(r.personId);
      if (db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n > antes) added++;
    } catch {
      notFound.push(nombre);
    }
  }
  if (added) invalidateFavoritesCaches();
  return { ok: true, added, total: nombres.length, notFound };
});

// --- el cine por países ---------------------------------------------------------
//
// Construir un país es un trabajo largo (ver `paisesStatus` en paises.js): se
// arranca y se sondea. Lo demás son consultas a la tabla ya construida y van
// dentro de la petición, que es instantáneo.

// `fa` dice si ese país tiene ranking en FilmAffinity: no lo tienen todos
// (Islandia, India, China, Dinamarca e Irán no), y la pestaña necesita saberlo
// para explicar el vacío en vez de enseñarlo a secas.
app.get('/api/paises', async () => ({
  paises: catalogoPaises().map((p) => ({ ...p, fa: tieneRanking(p.iso) && hayPaqueteFA(p.iso) })),
  status: paisesStatus,
}));

app.get('/api/paises/status', async () => paisesStatus);

app.get('/api/paises/:iso', async (req, reply) => {
  const iso = String(req.params.iso || '').toUpperCase();
  if (!esPaisConocido(iso)) {
    reply.code(404);
    return { error: 'Ese país no está en el catálogo' };
  }
  // el año llega como texto de la URL: un «?anio=pepe» no puede acabar en una
  // consulta con NaN, que en SQLite no casa con nada y devuelve cero filas sin
  // decir por qué
  const crudo = req.query.anio;
  const anio = crudo === undefined || crudo === '' ? null : Number(crudo);
  // El rango se comprueba, no solo el tipo: un «?anio=0» o un «?anio=1e20» no
  // son un año, y devolver la lista histórica como si nada deja al titular de
  // la página diciendo un año que no se ha filtrado por ningún lado.
  if (anio !== null && (!Number.isInteger(anio) || anio < 1870 || anio > 2200)) {
    reply.code(400);
    return { error: 'El año tiene que ser un número' };
  }
  const fuente = req.query.fuente === 'fa' ? 'fa' : 'lb';
  /**
   * EL 500 QUE RAMÓN VIO EN PRODUCCIÓN Y AQUÍ NO SE REPRODUCE.
   *
   * La 1.26 puso un guardián, pero solo alrededor del sembrado: todo lo de
   * abajo —el catálogo, la lista, la regleta de años, las correcciones, el
   * paquete de FilmAffinity— seguía fuera, y un fallo ahí daba exactamente el
   * mismo 500 mudo. Ahora cada paso dice su nombre, así que el próximo se
   * diagnostica leyendo la pantalla en vez de pidiendo `docker logs`.
   *
   * No es el arreglo del fallo: es que el fallo deje de ser anónimo. Sigue sin
   * reproducirse con la base vacía, con la base llena y con ocho combinaciones
   * de URL, todas 200.
   */
  let paso = 'sembrar el país empaquetado';
  try {
    // Si viene empaquetado y esta base no lo tiene, se siembra AQUÍ: así la
    // primera visita ya lo encuentra hecho, sin construir ni gastar cupo.
    if (fuente === 'lb') await sembrarPais(iso);
    paso = 'leer el catálogo de países';
    const ficha = catalogoPaises().find((p) => p.iso === iso);
    paso = 'leer la lista de películas';
    const peliculas = peliculasDePais(iso, { anio, fuente });
    // la regleta de años es de la lista nuestra: el ranking de FilmAffinity es
    // uno solo y no se reparte por años
    paso = 'leer los años con película';
    const anios = fuente === 'lb' ? aniosDePais(iso) : [];
    paso = 'leer tus correcciones';
    const overrides = overridesDePais(iso);
    paso = 'mirar el ranking de FilmAffinity';
    const fa = tieneRanking(iso);
    const faHasta = paqueteHasta(iso);
    return {
      iso,
      nombre: PAISES[iso].es,
      fuente,
      // el ranking de FilmAffinity no se reparte por años: devolver el año que
      // pidieron dejaba el titular diciendo «lo mejor de 1973» sobre la lista
      // entera
      anio: fuente === 'lb' ? anio : null,
      peliculas,
      anios,
      overrides,
      build: (fuente === 'fa' ? ficha?.buildFa : ficha?.build) || null,
      fa,
      faHasta,
    };
  } catch (err) {
    // Un 500 pelado en la pantalla es indistinguible de una avería del servidor
    // entero. Aquí se dice el país, el paso y el motivo.
    app.log.error({ err, iso, anio, fuente, paso }, 'falló la página de un país');
    reply.code(502);
    return {
      error: `No se pudo cargar ${PAISES[iso].es} al ${paso}: ${String(err.message || err).slice(0, 200)}`,
    };
  }
});

app.post('/api/paises/:iso/build', async (req, reply) => {
  const iso = String(req.params.iso || '').toUpperCase();
  if (!esPaisConocido(iso)) {
    reply.code(404);
    return { error: 'Ese país no está en el catálogo' };
  }
  if (paisesStatus.running) {
    reply.code(409);
    return { error: `Ya se está construyendo ${PAISES[paisesStatus.iso]?.es || paisesStatus.iso}` };
  }
  // La barra de progreso es UNA para toda la aplicación, y construir un país
  // son minutos: arrancando encima del pase nocturno los dos se pisan la barra
  // y se disputan el mismo cupo de MDBList.
  if (refreshStatus?.running) {
    reply.code(409);
    return { error: 'Hay una actualización general en marcha: espera a que termine' };
  }
  const fuente = req.query.fuente === 'fa' ? 'fa' : 'lb';
  if (!getSetting('tmdb_key')) {
    reply.code(400);
    return { error: 'Sin clave de TMDB no hay de dónde sacar las películas' };
  }
  // MDBList solo hace falta para la lista nuestra: el ranking de FilmAffinity
  // ya viene ordenado por ellos y solo hay que emparejarlo con TMDB
  if (fuente === 'lb' && !getSetting('mdblist_key')) {
    reply.code(400);
    return { error: 'Sin clave de MDBList no hay notas de Letterboxd que ordenar' };
  }
  if (fuente === 'fa' && !tieneRanking(iso)) {
    reply.code(400);
    return { error: `FilmAffinity no tiene ranking de ${PAISES[iso].es}` };
  }
  // tener ranking y tenerlo empaquetado no es lo mismo: sin el paquete la ruta
  // decía «empezado» y el fallo aparecía después, escondido en el estado
  if (fuente === 'fa' && !hayPaqueteFA(iso)) {
    reply.code(400);
    return { error: `El ranking de ${PAISES[iso].es} no está empaquetado en esta versión` };
  }
  return arrancarPais(iso, fuente);
});

/**
 * El ✎ de la página: meter o quitar una película de un país a mano.
 *
 * No es un adorno. TMDB tiene a «Viridiana» por mexicana y da «La batalla de
 * Chile» por española, así que la corrección es parte del funcionamiento
 * normal, no una excepción.
 */
app.post('/api/paises/:iso/override', async (req, reply) => {
  try {
    const { tmdbId, modo, title } = req.body || {};
    return ponerOverride(req.params.iso, tmdbId, modo, title || null);
  } catch (err) {
    reply.code(400);
    return { error: String(err.message || err) };
  }
});

app.delete('/api/paises/:iso/override/:tmdbId', async (req, reply) => {
  try {
    return quitarOverride(req.params.iso, req.params.tmdbId);
  } catch (err) {
    reply.code(400);
    return { error: String(err.message || err) };
  }
});

// --- directores emergentes -----------------------------------------------------
//
// La detección es un trabajo largo (lee ediciones de una década y resuelve
// decenas de personas contra TMDB): se ARRANCA y se sondea, nunca se sirve
// dentro de la petición. Un trabajo así dentro del HTTP acaba en un 504 del
// proxy inverso mientras el servidor sigue trabajando por detrás.

app.get('/api/emergentes', async () => listaEmergentes());

app.post('/api/emergentes/run', async (req, reply) => {
  if (emergentesStatus.running) {
    reply.code(409);
    return { error: 'Ya hay una detección en marcha' };
  }
  if (!getSetting('tmdb_key')) {
    reply.code(400);
    return { error: 'Sin clave de TMDB no se pueden identificar los directores' };
  }
  detectarEmergentes().catch(() => {});
  return { started: true, status: emergentesStatus };
});

app.get('/api/emergentes/status', async () => emergentesStatus);

// la ✕: fuera de la parrilla y que la próxima reconstrucción no lo resucite
app.delete('/api/emergentes/:nameKey', async (req) => descartarEmergente(req.params.nameKey));
app.post('/api/emergentes/:nameKey/restore', async (req) => recuperarEmergente(req.params.nameKey));

/**
 * Seguir a un emergente. Va por su id de TMDB —que el detector ya verificó
 * contra la fecha de nacimiento— y NO por el nombre: volver a resolverlo por
 * nombre sería tirar la verificación y arriesgarse al homónimo.
 */
app.post('/api/emergentes/:nameKey/follow', async (req, reply) => {
  const fila = db.prepare('SELECT * FROM emerging_directors WHERE name_key = ?').get(String(req.params.nameKey));
  if (!fila?.tmdb_id) {
    reply.code(404);
    return { error: 'No está en la lista de emergentes' };
  }
  const r = trackByTmdb({ tmdbId: fila.tmdb_id, name: fila.name, profilePath: fila.profile_path, role: 'director' });
  if (r.personId) db.prepare('DELETE FROM unfollowed_people WHERE person_id = ?').run(r.personId);
  invalidateFavoritesCaches();
  return { ok: true, personId: r.personId || null };
});

app.get('/api/people/search-tmdb', async (req, reply) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return [];
    const role = asRole(req.query.role);
    return await searchPeople(query, role);
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
    invalidateFavoritesCaches();
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
    const role = asRole(req.body?.role);
    const hint = roleHint(role);
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
        const r = trackByTmdb({ tmdbId: info.id, name: info.name || name, profilePath: info.profile_path, role: role || 'director' });
        if (r.personId) db.prepare('DELETE FROM unfollowed_people WHERE person_id = ?').run(r.personId);
        const after = db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n;
        if (after > before) added++;
      } catch { notFound.push(name); }
    }
    if (added) invalidateFavoritesCaches();
    return { ok: true, added, total: names.length, notFound };
  } catch (err) {
    reply.code(400);
    return { error: String(err.message || err) };
  }
});

// add a whole pack of directors to favorites in one click (#9). Skips anyone the
// user explicitly removed with the ✕ — those only come back via a manual add (C).
// Añadir a favoritos un canon entero (TSPDT, los 501, «en boga» o una lista
// tuya). Resolver 500 nombres contra TMDB lleva su rato aunque la búsqueda esté
// cacheada, así que corre en segundo plano y la interfaz sigue el progreso por
// /api/build-progress, como el resto de tareas largas.
export const canonAddStatus = { running: false, canon: null, added: 0, skipped: 0, notFound: [], total: 0, error: null, finishedAt: null };

app.post('/api/tracked/from-canon', async (req, reply) => {
  if (canonAddStatus.running) return { started: false, ...canonAddStatus };
  const canon = String(req.body?.canon || '');
  const role = asRole(req.body?.role, 'director');
  let nombres;
  try {
    nombres = await canonNames(canon);
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
  if (!nombres?.length) {
    reply.code(400);
    return { error: 'Esa lista no existe o está vacía' };
  }

  Object.assign(canonAddStatus, {
    running: true, canon, added: 0, skipped: 0, notFound: [], total: nombres.length, error: null, finishedAt: null,
  });

  (async () => {
    const hint = roleHint(role);
    const bloqueados = new Set(db.prepare('SELECT person_id FROM unfollowed_people').all().map((r) => r.person_id));
    try {
      for (let i = 0; i < nombres.length; i++) {
        setBuildProgress('canon', `Añadiendo «${canon}» a favoritos`, i + 1, nombres.length);
        const name = nombres[i];
        try {
          const info = await findPersonInfo(name, hint);
          if (!info?.id) { canonAddStatus.notFound.push(name); continue; }
          // quien quitaste a mano con la ✕ no vuelve por un añadido masivo
          const ya = db.prepare('SELECT id FROM people WHERE tmdb_id = ? OR name = ?').get(info.id, name);
          if (ya && bloqueados.has(ya.id)) { canonAddStatus.skipped++; continue; }
          const antes = db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n;
          trackByTmdb({ tmdbId: info.id, name: info.name || name, profilePath: info.profile_path, role });
          const despues = db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n;
          if (despues > antes) canonAddStatus.added++;
          else canonAddStatus.skipped++;
        } catch {
          canonAddStatus.notFound.push(name);
        }
      }
      if (canonAddStatus.added) invalidateFavoritesCaches();
    } catch (err) {
      canonAddStatus.error = String(err.message || err);
    } finally {
      canonAddStatus.running = false;
      canonAddStatus.finishedAt = Date.now();
      clearBuildProgress('canon');
    }
  })();

  return { started: true, total: nombres.length };
});

app.get('/api/tracked/from-canon', async () => canonAddStatus);

app.post('/api/tracked/tmdb-bulk', async (req, reply) => {
  try {
    const people = Array.isArray(req.body?.people) ? req.body.people : [];
    if (!people.length) {
      reply.code(400);
      return { error: 'Faltan personas' };
    }
    const packRole = asRole(req.body?.role, 'director');
    const blocked = new Set(db.prepare('SELECT person_id FROM unfollowed_people').all().map((r) => r.person_id));
    let added = 0;
    let skipped = 0;
    for (const p of people.slice(0, 200)) {
      const tmdbId = p.tmdbId ?? p.tmdb_id;
      // if this person is already known and blocked, don't re-add automatically.
      // Plex-synced people are born without tmdb_id, so check by name too —
      // otherwise trackByTmdb finds them by name and re-follows past the block
      const existing = db.prepare('SELECT id FROM people WHERE tmdb_id = ? OR name = ?').get(tmdbId, p.name || '');
      if (existing && blocked.has(existing.id)) { skipped++; continue; }
      try {
        const before = db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n;
        trackByTmdb({ tmdbId, name: p.name, profilePath: p.profilePath ?? p.profile_path, role: packRole });
        const after = db.prepare('SELECT COUNT(*) n FROM tracked_people').get().n;
        if (after > before) added++;
      } catch {}
    }
    if (added) invalidateFavoritesCaches();
    return { ok: true, added, skipped, total: people.length };
  } catch (err) {
    reply.code(400);
    return { error: String(err.message || err) };
  }
});

// --- tmdb-powered ------------------------------------------------------------------

/**
 * La ficha de una persona. El `:id` admite TRES formas, y esa es la gracia:
 *
 *  - `123`            — alguien de tu biblioteca o de tus favoritos.
 *  - `tmdb:456`       — cualquiera de TMDB, la tengas o no.
 *  - `nombre:Fulano`  — solo un nombre, que es todo lo que dan las tablas de
 *                       Wikipedia y los cánones.
 *
 * Con las dos últimas, el nombre de un director deja de ser texto muerto en
 * cualquier pantalla: se resuelve AL PULSAR, no al pintar la lista, así que
 * enlazar doscientos nombres no cuesta ni una petición hasta que se usa uno.
 */
/**
 * Los avales se enganchan AQUÍ y no dentro de `perfilDesde` a propósito:
 * `avales.js` lee del REGISTRY de festivales, que a su vez tira de `tmdb.js`.
 * Importarlo desde tmdb.js cerraría un ciclo entre los tres módulos, y esto es
 * un adorno de la respuesta, no parte de construir la filmografía.
 */
function conAvales(perfil) {
  if (!perfil?.roles) return perfil;
  for (const faceta of Object.values(perfil.roles)) {
    const items = faceta.items || [];
    const conteo = conteoAvales(items.map((i) => i.tmdb_id).filter(Boolean));
    for (const i of items) if (conteo[i.tmdb_id]) i.avales = conteo[i.tmdb_id];
    faceta.avales = avalesDeFilmografia(items);
  }
  return perfil;
}

app.get('/api/people/:id/filmography', async (req, reply) => {
  try {
    const wantRole = asRole(req.query.role);
    const ref = String(req.params.id || '');
    if (/^tmdb:/i.test(ref)) return conAvales(await filmographyProfileByTmdb(ref.slice(5), wantRole));
    if (/^nombre:/i.test(ref)) {
      const nombre = decodeURIComponent(ref.slice(7)).trim();
      if (!nombre) {
        reply.code(400);
        return { error: 'Falta el nombre' };
      }
      // el emparejado VERIFICADO, no la búsqueda por popularidad: si no, al
      // pulsar «Steve McQueen» saldría la ficha del actor de Bullitt
      const info = await resolveCatalogDirector(fichaDeCatalogo(nombre));
      if (!info?.id) return { person: { id: null, name: nombre, tmdb_id: null }, matched: false, roles: {} };
      return conAvales(await filmographyProfileByTmdb(info.id, wantRole));
    }
    return conAvales(await filmographyProfile(Number(ref), wantRole));
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

/**
 * Seguir a alguien que aún no está en tu biblioteca, desde su propia ficha.
 * Va por id de TMDB porque es lo único que tiene quien llegó ahí por su nombre.
 */
app.post('/api/people/by-tmdb/:tmdbId/follow', async (req, reply) => {
  const tmdbId = Number(req.params.tmdbId);
  const role = asRole(req.body?.role, 'director');
  if (!tmdbId) {
    reply.code(400);
    return { error: 'Falta el id de TMDB' };
  }
  try {
    const det = await personDetails(tmdbId);
    const r = trackByTmdb({ tmdbId, name: det?.name || '', profilePath: det?.profile_path || null, role });
    // añadirlo a mano levanta el veto de la ✕, como en el resto de altas
    if (r.personId) db.prepare('DELETE FROM unfollowed_people WHERE person_id = ?').run(r.personId);
    invalidateFavoritesCaches();
    return { ok: true, personId: r.personId || null };
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

/**
 * «Actualizar desde TMDB» de una ficha de persona: tira su filmografía
 * cacheada (siete días) para que la siguiente lectura la pida entera.
 *
 * Existe porque el caso concreto no tenía salida: TMDB añade una película nueva
 * a alguien y la ficha seguía enseñando la de la semana pasada sin que hubiera
 * ningún botón que decir «mira otra vez». El barrido nocturno ya releé a tus
 * favoritos, pero esperar a la noche tampoco es una respuesta.
 */
app.post('/api/people/by-tmdb/:tmdbId/refresh', async (req, reply) => {
  const tmdbId = Number(req.params.tmdbId);
  if (!tmdbId) {
    reply.code(400);
    return { error: 'Falta el id de TMDB' };
  }
  olvidarFilmografia(tmdbId);
  // los huecos y el calendario se arman con estas mismas filmografías
  invalidateFavoritesCaches();
  return { ok: true };
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
    // map TMDB person ids to our library people, so cast/crew link to their
    // pages — asking only for the ~15 ids on this ficha, not the whole table
    const crew = (det.credits?.crew || []).filter((c) => c.job === 'Director');
    const castCredits = (det.credits?.cast || []).slice(0, 14);
    const wanted = [...new Set([...crew, ...castCredits].map((c) => c.id).filter(Boolean))];
    const peopleByTmdb = new Map(
      wanted.length
        ? db
            .prepare(`SELECT id, tmdb_id FROM people WHERE tmdb_id IN (${wanted.map(() => '?').join(',')})`)
            .all(...wanted)
            .map((r) => [r.tmdb_id, r.id])
        : []
    );
    const mapPerson = (c) => ({ id: peopleByTmdb.get(c.id) ?? null, tmdb_id: c.id, name: c.name, character: c.character || null });
    const directors = crew.map(mapPerson);
    const cast = castCredits.map(mapPerson);
    // los créditos de TMDB traen el nombre en su alfabeto original
    await latinizeNames([...directors, ...cast]);
    return {
      tmdb_id: tmdbId,
      // en qué palmareses y en qué cánones está: se lee del índice en memoria,
      // sin una sola petición (ver avales.js)
      avales: avalesDe(tmdbId),
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
app.get('/api/build-progress', async () => currentProgress());

// "Actualizar todo": one button for the whole routine (same code as the nightly)
// histórico de pasadas (30 días): duración y estado por paso
app.get('/api/refresh-history', async () => refreshHistory());

app.get('/api/refresh-all', async () => ({
  ...refreshStatus,
  lastRun: Number(getSetting('full_refresh_last_run') || 0) || null,
}));
app.post('/api/refresh-all', async (req, reply) => {
  if (refreshStatus.running) {
    reply.code(409);
    return { error: 'Ya hay una actualización en marcha', ...refreshStatus };
  }
  // fire and forget: the client polls GET /api/refresh-all for progress
  runFullRefresh({ trigger: 'manual', includeAutoRadarr: req.body?.includeAutoRadarr !== false }).catch((err) =>
    app.log.error({ err }, 'refresh-all')
  );
  return { ok: true, started: true };
});

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

/**
 * Same check for a whole batch, so "Calidad" can tell which upgrade candidates
 * actually have a better version on the market and filter by it. JustWatch is
 * unofficial: keep the concurrency low and let per-title failures through as
 * `error` instead of failing the batch. Answers are cached 3 days upstream, so
 * re-running is cheap.
 */
app.post('/api/justwatch/batch', async (req, reply) => {
  try {
    const ids = [...new Set((req.body?.tmdbIds || []).map(Number).filter(Boolean))].slice(0, 400);
    if (!ids.length) {
      reply.code(400);
      return { error: 'Falta tmdbIds' };
    }
    const owned = new Map(
      db
        .prepare(`SELECT tmdb_id, title, original_title, year, resolution FROM movies WHERE tmdb_id IN (${ids.map(() => '?').join(',')})`)
        .all(...ids)
        .map((m) => [m.tmdb_id, m])
    );
    const results = {};
    let done = 0;
    setBuildProgress('justwatch', 'Consultando JustWatch', 0, ids.length);
    await mapPool(ids, 3, async (tmdbId) => {
      const m = owned.get(tmdbId);
      try {
        const title = m?.original_title || m?.title;
        if (!title) throw new Error('sin título en la biblioteca');
        const av = await availability(title, m.year || null);
        results[tmdbId] = { ...av, ownedResolution: m.resolution || null, upgradeable: isUpgradeable(m.resolution, av.maxQuality) };
      } catch (err) {
        results[tmdbId] = { maxQuality: null, providers: [], error: String(err.message || err) };
      }
      setBuildProgress('justwatch', 'Consultando JustWatch', ++done, ids.length);
    });
    clearBuildProgress('justwatch');
    const upgradeable = Object.values(results).filter((r) => r.upgradeable).length;
    return { checked: ids.length, upgradeable, results };
  } catch (err) {
    clearBuildProgress('justwatch');
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

// favorites feed the upcoming-releases calendar AND the favorites-gaps cache;
// invalidate both on change so new/removed favorites show up right away
const invalidateFavoritesCaches = () =>
  db.prepare(`DELETE FROM tmdb_cache WHERE key LIKE 'calendar:%' OR key LIKE 'discover_favorites:%'`).run();

app.post('/api/tracked/bulk', async (req, reply) => {
  const { role, top, personIds, preview } = req.body || {};
  // el ÚLTIMO colapso a dos oficios que sobrevivió al refactor: daba de alta a
  // los guionistas del alta masiva como directores, en silencio
  const followRole = asRole(role, 'director');

  // confirmed selection coming back from the preview dialog
  if (Array.isArray(personIds) && personIds.length) {
    let added = 0;
    const tx = db.transaction(() => {
      for (const id of personIds.slice(0, 1000)) added += followFacets(Number(id), followRole).added ? 1 : 0;
    });
    tx();
    if (added) invalidateFavoritesCaches();
    return { ok: true, added, total: personIds.length };
  }

  // el alta por «top de tu biblioteca» sale de los créditos que guarda Plex:
  // fotografía, música y montaje no están ahí y no admiten ranking
  if (!isRankable(role) || !Number(top)) {
    reply.code(400);
    return { error: `Parámetros: role (${RANKABLE_ROLES.join('|')}) y top (número), o personIds` };
  }
  // «Guionistas» lista solo a quien NO dirige, igual que la parrilla de
  // Personas (topPeople). Sin esta línea el alta masiva daba de alta a
  // Tarantino, Nolan o los Coen —que la página no te había enseñado— porque
  // las dos consultas partían de poblaciones distintas.
  const soloGuionistas =
    role === 'writer' ? `AND p.id NOT IN (SELECT person_id FROM movie_people WHERE role = 'director')` : '';
  const candidates = db
    .prepare(
      `SELECT p.id, p.name, p.deathday, COUNT(*) n FROM movie_people mp JOIN people p ON p.id = mp.person_id
       WHERE mp.role = ? AND p.id NOT IN (SELECT person_id FROM unfollowed_people)
         -- ya seguido EN ESTA faceta: seguirle en la otra no le excluye del top
         AND p.id NOT IN (SELECT person_id FROM tracked_people WHERE role = ?)
         ${soloGuionistas}
       GROUP BY p.id ORDER BY n DESC, p.name LIMIT ?`
    )
    .all(role, followRole, Math.min(Number(top), 1000));
  // with preview the client shows the candidates first: no more blind top-N adds
  if (preview) return { candidates };
  let added = 0;
  const tx = db.transaction(() => {
    for (const c of candidates) added += followFacets(c.id, followRole).added ? 1 : 0;
  });
  tx();
  if (added) invalidateFavoritesCaches();
  return { ok: true, added, total: candidates.length };
});

// prune several favorites at once, blocking auto re-adds like the single ✕ (poda)
app.delete('/api/tracked/batch', async (req, reply) => {
  const ids = Array.isArray(req.body?.personIds) ? req.body.personIds.map(Number).filter(Boolean) : [];
  // con role, la poda solo toca esa faceta (la página de Favoritos trabaja
  // siempre dentro de una); sin él, se lleva a la persona entera
  const role = asRole(req.body?.role);
  if (!ids.length) {
    reply.code(400);
    return { error: 'Faltan personIds' };
  }
  // mismo motivo que arriba: un oficio inválido borraría TODAS las facetas
  if (req.body?.role && !role) {
    reply.code(400);
    return { error: 'Ese oficio no existe' };
  }
  const delFacet = db.prepare('DELETE FROM tracked_people WHERE person_id = ? AND role = ?');
  const delAll = db.prepare('DELETE FROM tracked_people WHERE person_id = ?');
  const left = db.prepare('SELECT COUNT(*) n FROM tracked_people WHERE person_id = ?');
  const block = db.prepare('INSERT OR IGNORE INTO unfollowed_people (person_id, at) VALUES (?, ?)');
  let removed = 0;
  const tx = db.transaction(() => {
    for (const id of ids) {
      removed += (role ? delFacet.run(id, role) : delAll.run(id)).changes;
      // el veto a re-añadidos automáticos solo cuando no queda ninguna faceta
      if (!left.get(id).n) block.run(id, Date.now());
    }
  });
  tx();
  if (removed) invalidateFavoritesCaches();
  return { ok: true, removed };
});

// who still contributes to the hunt: gaps from the favorites cache, upcoming
// projects from the calendar cache — no fresh TMDB calls, just cross-reference
app.get('/api/tracked/health', async () => {
  const favs = db
    .prepare(
      `SELECT p.id, p.name, p.thumb, p.deathday, p.tmdb_id, t.role,
              SUM(CASE WHEN mp.role = 'director' THEN 1 ELSE 0 END) directed,
              SUM(CASE WHEN mp.role = 'actor' THEN 1 ELSE 0 END) acted,
              SUM(CASE WHEN mp.role = t.role THEN 1 ELSE 0 END) movies
       FROM tracked_people t
       JOIN people p ON p.id = t.person_id
       LEFT JOIN movie_people mp ON mp.person_id = p.id
       GROUP BY p.id, t.role ORDER BY movies DESC, p.name`
    )
    .all();
  // one cache per facet now, so merge them all; a favorite missing from every
  // cache is "not calculated yet", which is NOT the same as "complete"
  const gapsRows = db
    .prepare(`SELECT json FROM tmdb_cache WHERE key LIKE 'discover_favorites:%' ORDER BY fetched_at DESC`)
    .all();
  const calRow = db
    .prepare(`SELECT json FROM tmdb_cache WHERE key LIKE 'calendar:%' ORDER BY fetched_at DESC LIMIT 1`)
    .get();
  // clave (id, faceta): con las facetas dobles, la fila de director y la de
  // actor de una misma persona buscan cada una SU cálculo de huecos
  const gapsBy = new Map();
  for (const row of gapsRows) {
    try {
      for (const p of (JSON.parse(row.json || '{}').people || [])) {
        const k = `${p.id}:${p.role || 'director'}`;
        if (!gapsBy.has(k)) gapsBy.set(k, p);
      }
    } catch {}
  }
  const upcomingBy = new Map();
  try {
    const now = today(); // local, como el resto de la app
    for (const ev of (JSON.parse(calRow?.json || '{}').events || [])) {
      if (ev.date && ev.date < now) continue; // future or still-undated (announced)
      // OJO: `followedDirectors`/`followedActors` NO existen aquí — buildCalendar
      // los borra antes de guardar el calendario. Lo que sobrevive es `people`,
      // con el id de biblioteca de cada uno. Contar los otros daba siempre 0.
      for (const per of ev.people || []) {
        if (per.id) upcomingBy.set(per.id, (upcomingBy.get(per.id) || 0) + 1);
      }
    }
  } catch {}
  return {
    cached: { gaps: gapsBy.size > 0, calendar: !!calRow },
    people: favs.map((f) => {
      const g = gapsBy.get(`${f.id}:${f.role || 'director'}`);
      // `movies` straight from movie_people counts EVERY credit (shorts, docs,
      // TV, segments), which is why Favoritos said 52 where the person page said
      // 50/50. When the gaps cache knows this facet, take its feature-only count
      // so both screens tell the same story; keep the raw one for the tooltip.
      const sameFacet = g && (g.role || 'director') === (f.role || 'director');
      // si TMDB no le conoce filmografía (mal emparejado, homónimo), el conteo
      // de largometrajes sería 0 y quedaría como «0 dirigidas · ✓ completa»
      // teniendo sus películas en Plex: en ese caso manda el conteo de Plex
      const trust = sameFacet && g.released > 0;
      return {
        ...f,
        movies: trust ? g.owned : f.movies,
        moviesAll: f.movies,
        released: sameFacet ? g.released ?? null : null,
        tmdbBlank: !!(sameFacet && !g.released && f.movies > 0),
        // sus dos películas más reconocibles, igual que en Descubrir
        signature: sameFacet ? g.signature || null : null,
        // null = still unknown; only a person present in a cache has a real number
        // null = no se sabe. Un 0 aquí significa «lo tienes todo», y eso no se
        // puede afirmar cuando la filmografía que devolvió TMDB está vacía.
        gaps: trust ? g.missingTotal : null,
        pct: trust ? g.pct : null,
        gapRole: g?.role ?? null,
        upcoming: calRow ? (upcomingBy.get(f.id) || 0) : null,
      };
    }),
  };
});

// permanent per-film "no me interesa" for the gaps flow: excluded from missing
// counts at the next cache rebuild; clients hide it instantly on their side
app.get('/api/discover/dismissed', async () =>
  db.prepare('SELECT tmdb_id, title, at FROM dismissed_movies ORDER BY at DESC').all()
);
app.post('/api/discover/dismiss', async (req, reply) => {
  const tmdbId = Number(req.body?.tmdbId);
  if (!tmdbId) {
    reply.code(400);
    return { error: 'Falta tmdbId' };
  }
  db.prepare('INSERT OR REPLACE INTO dismissed_movies (tmdb_id, title, at) VALUES (?, ?, ?)').run(
    tmdbId,
    req.body?.title || null,
    Date.now()
  );
  return { ok: true };
});
app.delete('/api/discover/dismiss/:tmdbId', async (req) => {
  db.prepare('DELETE FROM dismissed_movies WHERE tmdb_id = ?').run(Number(req.params.tmdbId));
  return { ok: true };
});

// Veto al pase automático de Radarr (🚫 en las fichas de Cine venidero). No
// oculta ni borra nada: la película se sigue viendo y se puede mandar a Radarr
// a mano; solo queda fuera del pase nocturno.
app.get('/api/radarr/auto/veto', async () =>
  db.prepare('SELECT tmdb_id, title, at FROM auto_radarr_vetoed ORDER BY at DESC').all()
);
app.post('/api/radarr/auto/veto', async (req, reply) => {
  const tmdbId = Number(req.body?.tmdbId);
  if (!tmdbId) {
    reply.code(400);
    return { error: 'Falta tmdbId' };
  }
  db.prepare('INSERT OR REPLACE INTO auto_radarr_vetoed (tmdb_id, title, at) VALUES (?, ?, ?)').run(
    tmdbId,
    req.body?.title || null,
    Date.now()
  );
  return { ok: true };
});
app.delete('/api/radarr/auto/veto/:tmdbId', async (req) => {
  db.prepare('DELETE FROM auto_radarr_vetoed WHERE tmdb_id = ?').run(Number(req.params.tmdbId));
  return { ok: true };
});

// ── Notas de IMDb ─────────────────────────────────────────────────────────
app.get('/api/imdb/status', async () => imdbInfo());
app.post('/api/imdb/sync', async (req, reply) => {
  // En segundo plano, como el sync de MDBList o el escaneo de sagas: mantener
  // la petición abierta durante la descarga y 1,7 millones de inserciones daba
  // un 504 del proxy inverso sobre una importación que iba a terminar bien.
  if (imdbInfo().running) {
    reply.code(409);
    return { error: 'Ya hay una importación en marcha' };
  }
  importImdbRatings().catch(() => {}); // el estado se consulta en /api/imdb/status
  return { started: true };
});

// ── Copias de seguridad automáticas ───────────────────────────────────────
app.get('/api/backup/list', async () => ({ dir: BACKUP_DIR, copias: listarCopias() }));
app.post('/api/backup/run', async (req, reply) => {
  try {
    return await hacerCopia();
  } catch (err) {
    reply.code(500);
    return { error: String(err.message || err) };
  }
});

// ── Oficios que este servidor sabe seguir ─────────────────────────────────
// La interfaz los pide en vez de llevar su propia copia de la lista: así no
// puede volver a desincronizarse con el servidor.
app.get('/api/roles', async () =>
  ROLES.map((r) => ({ key: r.key, label: r.label, singular: r.singular, rankable: r.fromPlex, principal: r.principal }))
);

app.post('/api/tracked/:personId', async (req) => {
  const id = Number(req.params.personId);
  const role = asRole(req.body?.role);
  // a manual, explicit add clears any ✕ block (C)
  db.prepare('DELETE FROM unfollowed_people WHERE person_id = ?').run(id);
  // without an explicit role, follow them for whatever they do most in your library
  const guessed =
    role ||
    (db
      .prepare(
        // COALESCE porque sin créditos ambas sumas son NULL, «NULL >= NULL» es
        // NULL y el CASE caía al ELSE: dar a la ★ sobre alguien que solo existe
        // en TMDB lo metía en Actores en vez de en Directores
        `SELECT CASE WHEN COALESCE(SUM(CASE WHEN role = 'director' THEN 1 ELSE 0 END), 0)
                          >= COALESCE(SUM(CASE WHEN role = 'actor' THEN 1 ELSE 0 END), 0)
                     THEN 'director' ELSE 'actor' END AS r
         FROM movie_people WHERE person_id = ?`
      )
      .get(id)?.r || 'director');
  // añadir una faceta nunca toca la otra: se puede seguir a alguien como
  // director/a Y como actor/actriz a la vez
  const f = followFacets(id, guessed);
  invalidateFavoritesCaches();
  return { ok: true, role: f.role, directorAlso: f.directorAlso, actorAlso: f.actorAlso };
});
app.get('/api/tracked', async (req) => {
  const role = asRole(req.query.role);
  // una fila por (persona, faceta): quien tiene las dos sale dos veces, cada
  // una con el conteo de SU faceta
  return db
    .prepare(
      `SELECT p.id, p.name, p.thumb, p.deathday, p.tmdb_id, t.role,
              SUM(CASE WHEN mp.role = 'director' THEN 1 ELSE 0 END) directed,
              SUM(CASE WHEN mp.role = 'actor' THEN 1 ELSE 0 END) acted,
              -- titles in the role you follow them for: no mixing the two counts
              SUM(CASE WHEN mp.role = t.role THEN 1 ELSE 0 END) movies
       FROM tracked_people t
       JOIN people p ON p.id = t.person_id
       LEFT JOIN movie_people mp ON mp.person_id = p.id
       WHERE (? IS NULL OR t.role = ?)
       GROUP BY p.id, t.role ORDER BY movies DESC, p.name`
    )
    .all(role, role);
});

app.delete('/api/tracked/:personId', async (req, reply) => {
  const id = Number(req.params.personId);
  // con ?role= se quita SOLO esa faceta; sin él, la persona entera.
  // OJO: un oficio que no existe NO puede caer en «la persona entera» —eso
  // borraría las dos facetas y además la metería en unfollowed_people, el veto
  // permanente contra altas masivas—. Un cliente desfasado desfavoritearía en
  // silencio, así que se rechaza.
  if (req.query.role && !asRole(req.query.role)) {
    reply.code(400);
    return { error: 'Ese oficio no existe' };
  }
  const role = asRole(req.query.role);
  const r = role
    ? db.prepare('DELETE FROM tracked_people WHERE person_id = ? AND role = ?').run(id, role)
    : db.prepare('DELETE FROM tracked_people WHERE person_id = ?').run(id);
  // remember the explicit ✕ so bulk/automatic adds skip this person (C) — pero
  // solo si ya no queda NINGUNA faceta: quitarle de actores no debe vetar que
  // un añadido masivo de directores lo traiga como director
  const quedan = db.prepare('SELECT COUNT(*) n FROM tracked_people WHERE person_id = ?').get(id).n;
  if (!quedan) db.prepare('INSERT OR IGNORE INTO unfollowed_people (person_id, at) VALUES (?, ?)').run(id, Date.now());
  if (r.changes) invalidateFavoritesCaches();
  return { ok: true };
});

// Ficha local de alguien que solo existe en TMDB (los «grandes ausentes»), para
// poder abrir su página sin obligar a seguirlo primero. Si ya existe, la
// devuelve; si no, la crea.
app.post('/api/people/from-tmdb', async (req, reply) => {
  const tmdbId = Number(req.body?.tmdbId);
  const name = String(req.body?.name || '').trim();
  if (!tmdbId || !name) {
    reply.code(400);
    return { error: 'Faltan datos de la persona' };
  }
  const ya = db.prepare('SELECT id FROM people WHERE tmdb_id = ?').get(tmdbId);
  if (ya) return { personId: ya.id };
  const thumb = req.body?.profilePath ? `https://image.tmdb.org/t/p/w185${req.body.profilePath}` : null;
  const id = db
    .prepare('INSERT INTO people (name, plex_name, thumb, tmdb_id, tmdb_verified) VALUES (?, NULL, ?, ?, 1)')
    .run(name, thumb, tmdbId).lastInsertRowid;
  return { personId: id };
});

// switch which facet of a person you follow (director <-> actor). Con las
// facetas dobles esto significa «quédate SOLO con esta»: para añadir la otra
// sin perder la actual está el POST normal con role.
app.patch('/api/tracked/:personId/role', async (req, reply) => {
  const role = asRole(req.body?.role);
  if (!role) {
    reply.code(400);
    return { error: 'Ese oficio no existe' };
  }
  const id = Number(req.params.personId);
  db.transaction(() => {
    db.prepare('DELETE FROM tracked_people WHERE person_id = ? AND role <> ?').run(id, role);
    db.prepare('INSERT OR IGNORE INTO tracked_people (person_id, added_at, role) VALUES (?, ?, ?)').run(id, Date.now(), role);
  })();
  invalidateFavoritesCaches();
  return { ok: true, role };
});

// estrenos por región: cines ES/US y plataformas ES, con Σ de MDBList
app.get('/api/releases', async (req, reply) => {
  try {
    return await releases({
      kind: req.query.kind,
      window: req.query.window,
      refresh: req.query.refresh === '1',
      // «Actualizar notas»: reintenta AHORA las Σ que MDBList aún no tenía,
      // sin reconstruir la lista entera desde TMDB (que es lo caro)
      refrescarNotas: req.query.notas === '1',
    });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// remove every deceased person from favorites in one go ("vivos y muertos")
app.get('/api/discover/gaps', async (req, reply) => {
  if (req.query.role && !isRankable(req.query.role)) {
    reply.code(400);
    return { error: `Ese oficio no tiene ranking de biblioteca (${RANKABLE_ROLES.join(', ')})` };
  }
  try {
    return await libraryGaps({
      // los huecos de biblioteca se apoyan en el ranking de Plex, así que solo
      // valen los oficios que Plex guarda; pedir otro es un error, no un
      // «director» silencioso
      role: req.query.role ? req.query.role : 'director',
      people: Math.min(Number(req.query.people) || 20, 60),
      perPerson: Math.min(Number(req.query.perPerson) || 8, 20),
      // the ranking can be walked down to the first 500 people
      offset: Math.min(Math.max(Number(req.query.offset) || 0, 0), 500),
      refresh: req.query.refresh === '1',
      // mismos filtros demográficos que la página Personas
      gender: req.query.gender || '',
      life: req.query.life || '',
      continent: req.query.continent || '',
      country: req.query.country || '',
    });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.get('/api/discover/favorites', async (req, reply) => {
  try {
    return await favoritesGaps({
      perPerson: Math.min(Number(req.query.perPerson) || 8, 20),
      role: asRole(req.query.role),
      refresh: req.query.refresh === '1',
    });
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// cánones de «Grandes ausentes»: los de serie, el dinámico de TMDB y los tuyos
app.get('/api/discover/canons', async () => listCanons());

app.post('/api/discover/canons', async (req, reply) => {
  try {
    return saveCanon({ label: req.body?.label, names: req.body?.names, source: req.body?.source || null });
  } catch (err) {
    reply.code(400);
    return { error: String(err.message || err) };
  }
});

app.delete('/api/discover/canons/:key', async (req) => deleteCanon(req.params.key));

app.get('/api/discover/absent', async (req, reply) => {
  try {
    return await absentGreats({
      perPerson: Math.min(Number(req.query.perPerson) || 6, 12),
      refresh: req.query.refresh === '1',
      canon: String(req.query.canon || 'alltime').slice(0, 60),
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

// historial de capturas (del snapshot local: sin red)
app.get('/api/radarr/captures', async (req) =>
  radarrCaptures(Math.min(Number(req.query.days) || 30, 365), Math.min(Number(req.query.limit) || 60, 200)));

// auditorías locales de calidad del dato (huérfanos, homónimos, zombis…)
app.get('/api/datahealth', async () => dataHealth());

/**
 * Comprobar contra TMDB los emparejados de persona que aún no están demostrados.
 *
 * La inmensa mayoría no es que hayan fallado: es que nadie los ha mirado nunca.
 * Añadir a alguien a favoritos, o volcar un canon entero, le pone el id de TMDB
 * pero no comprueba que sea la persona correcta; la comprobación solo ocurre
 * cuando algo necesita su filmografía. Este botón la fuerza para todos.
 *
 * Va en segundo plano y con progreso porque son una búsqueda y hasta cinco
 * filmografías por persona; el limitador global de TMDB marca el ritmo. Se
 * empieza por quien más películas tuyas tiene, que es donde más se nota.
 */
export const verifyPeopleStatus = {
  running: false, total: 0, done: 0, verified: 0, failed: 0, error: null, finishedAt: null,
};

app.post('/api/datahealth/verify-people', async (req, reply) => {
  if (verifyPeopleStatus.running) return { started: false, ...verifyPeopleStatus };
  if (!getSetting('tmdb_key')) {
    reply.code(400);
    return { error: 'Falta la API key de TMDB en Ajustes' };
  }
  const pendientes = db
    .prepare(
      `SELECT p.id FROM people p JOIN movie_people mp ON mp.person_id = p.id
       WHERE p.tmdb_id IS NOT NULL AND COALESCE(p.tmdb_verified, 0) = 0 AND COALESCE(p.tmdb_locked, 0) = 0
       GROUP BY p.id ORDER BY COUNT(mp.movie_id) DESC
       LIMIT ?`
    )
    .all(Math.min(Number(req.body?.limit) || 1500, 5000))
    .map((r) => r.id);

  Object.assign(verifyPeopleStatus, {
    running: true, total: pendientes.length, done: 0, verified: 0, failed: 0, error: null, finishedAt: null,
  });

  (async () => {
    try {
      for (const id of pendientes) {
        setBuildProgress('verify-people', 'Comprobando emparejados con TMDB', verifyPeopleStatus.done + 1, pendientes.length);
        try {
          const p = await resolvePerson(id, { force: true });
          if (p?.tmdb_verified) verifyPeopleStatus.verified++;
          else verifyPeopleStatus.failed++;
        } catch {
          verifyPeopleStatus.failed++;
        }
        verifyPeopleStatus.done++;
      }
      // la ficha y los huecos de quien acaba de cambiar de identidad ya no valen
      if (verifyPeopleStatus.verified) invalidarPaginasCalculadas();
    } catch (err) {
      verifyPeopleStatus.error = String(err.message || err);
    } finally {
      verifyPeopleStatus.running = false;
      verifyPeopleStatus.finishedAt = Date.now();
      clearBuildProgress('verify-people');
    }
  })();

  return { started: true, ...verifyPeopleStatus };
});

app.get('/api/datahealth/verify-people', async () => verifyPeopleStatus);

// novedades detectadas por el pase nocturno (ediciones de festivales, digitales…)
app.get('/api/events', async (req) =>
  db
    .prepare('SELECT * FROM app_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?')
    .all(Date.now() - Math.min(Number(req.query.days) || 14, 90) * 24 * 3600 * 1000, Math.min(Number(req.query.limit) || 30, 100)));

// lo que Radarr aún debe: pedidas sin archivo y con archivo bajo el corte
app.get('/api/radarr/wanted', async (req, reply) => {
  try {
    const items = await radarrWanted();
    // fase de estreno (salas/digital) para leer POR QUÉ no aparece cada una;
    // lo no cacheado se limita aquí y lo remata el pase nocturno
    if (getSetting('tmdb_key')) await enrichReleasePhases(items, { maxFetch: 40 });
    return { items };
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});
app.get('/api/radarr/cutoff', async (req, reply) => {
  try {
    return { items: await radarrCutoffUnmet() };
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});
app.post('/api/radarr/search-again', async (req, reply) => {
  try {
    return await radarrSearchAgain(Number(req.body?.tmdbId));
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});
app.post('/api/radarr/sync', async (req, reply) => {
  try {
    return await radarrSyncMovies();
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// --- reglas automáticas a Radarr ---------------------------------------------
// Festivales, premios, estrenos y favoritos, cada uno con su umbral Σ y su
// tope. El pase de siempre (los estrenos de tus favoritos) es ahora una regla
// más: /api/radarr/auto se conserva como atajo a las de ese tipo.

app.get('/api/radarr/rules', async () => ({ ...rulesOverview(), log: rulesLog({ limit: 200 }) }));

app.post('/api/radarr/rules', async (req, reply) => {
  try {
    return createRule(req.body || {});
  } catch (err) {
    reply.code(400);
    return { error: String(err.message || err) };
  }
});

app.put('/api/radarr/rules/:id', async (req, reply) => {
  if (!getRule(req.params.id)) {
    reply.code(404); // 404 y no 400: la regla no existe, no es que el cuerpo esté mal
    return { error: 'Regla desconocida' };
  }
  try {
    return updateRule(req.params.id, req.body || {});
  } catch (err) {
    reply.code(400);
    return { error: String(err.message || err) };
  }
});

app.delete('/api/radarr/rules/:id', async (req, reply) => {
  if (!getRule(req.params.id)) {
    reply.code(404);
    return { error: 'Regla desconocida' };
  }
  // borrarla a media pasada dejaba la pasada mandando películas de una regla
  // que ya no existe, y su historial huérfano
  if (rulesStatus.running) {
    reply.code(409);
    return { error: 'Hay una pasada de reglas en marcha: espera a que termine' };
  }
  return deleteRule(req.params.id);
});

/**
 * La pasada NO se sirve dentro de la petición: un palmarés entero son minutos
 * y cualquier proxy inverso corta con un 504 mientras Radarr sigue recibiendo
 * altas. Se arranca y se devuelve el estado; la interfaz sondea /rules.
 */
app.post('/api/radarr/rules/run', async (req, reply) => {
  if (rulesStatus.running) {
    reply.code(409);
    return { error: 'Ya hay una pasada de reglas en marcha' };
  }
  const ruleId = req.body?.ruleId != null ? Number(req.body.ruleId) : null;
  if (ruleId != null && !getRule(ruleId)) {
    reply.code(404);
    return { error: 'Regla desconocida' };
  }
  runRadarrRules({ dryRun: !!req.body?.dryRun, ruleId }).catch(() => {});
  return { started: true, status: rulesStatus };
});

// --- cuarentena pre-Radarr ----------------------------------------------------
// Aprobar manda a Radarr AHORA; rechazar veta, porque sin el veto volvería a
// caer en cuarentena la noche siguiente y la bandeja sería una noria.

app.post('/api/radarr/pending/:tmdbId/approve', async (req, reply) => {
  try {
    return await aprobarPendiente(req.params.tmdbId);
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

app.delete('/api/radarr/pending/:tmdbId', async (req) => rechazarPendiente(req.params.tmdbId));

// vaciar la bandeja de una vez: `accion` = aprobar | rechazar
app.post('/api/radarr/pending/all', async (req, reply) => {
  const accion = req.body?.accion === 'aprobar' ? 'aprobar' : 'rechazar';
  try {
    return await resolverTodasLasPendientes(accion);
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});

// Lo que el pase de favoritos ha mandado solo a Radarr, con la persona por la
// que entró cada película. Lo pinta el Dashboard.
app.get('/api/radarr/rules/sent', async (req) =>
  enviosDeFavoritos({ days: Number(req.query?.days) || 30, limit: Number(req.query?.limit) || 30 })
);

app.get('/api/radarr/rules/log', async (req) =>
  rulesLog({ ruleId: req.query?.ruleId ?? null, limit: Number(req.query?.limit) || 200 })
);

// atajo histórico: solo las reglas de «mis favoritos»
app.get('/api/radarr/auto', async () => ({ status: rulesStatus, rules: rulesOverview().rules.filter((r) => r.kind === 'favoritos') }));
app.post('/api/radarr/auto/run', async (req, reply) => {
  if (rulesStatus.running) {
    reply.code(409);
    return { error: 'Ya hay una pasada de reglas en marcha' };
  }
  runAutoRadarr({ dryRun: !!req.body?.dryRun }).catch(() => {});
  return { started: true, status: rulesStatus };
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
  // resolve cross-language matches right away instead of waiting for the nightly
  if (getSetting('tmdb_key')) resolveUnmatchedLb().catch(() => {});
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
    const out = await importLetterboxdListUrl(req.body?.url || '');
    // resolve cross-language matches right away instead of waiting for the nightly
    if (getSetting('tmdb_key')) resolveUnmatchedLb().catch(() => {});
    return out;
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
// Resolve ONE list item to its TMDB id on demand, so a film you're missing can
// be opened or sent to Radarr by itself instead of only in bulk (#7). The id is
// written back to the row, so the lookup happens once per film.
app.post('/api/letterboxd/lists/:id/resolve-item', async (req, reply) => {
  const listId = Number(req.params.id);
  const title = String(req.body?.title || '').trim();
  const year = req.body?.year != null && req.body.year !== '' ? Number(req.body.year) : null;
  if (!listId || !title) {
    reply.code(400);
    return { error: 'Faltan listId o title' };
  }
  const where = 'list_id = ? AND title = ? AND COALESCE(year, -1) = COALESCE(?, -1)';
  const row = db.prepare(`SELECT tmdb_id FROM lb_list_items WHERE ${where}`).get(listId, title, year);
  if (row?.tmdb_id) return { tmdbId: row.tmdb_id };
  try {
    const tmdbId = await searchMovieId(title, year);
    if (!tmdbId) {
      reply.code(404);
      return { error: `No encuentro «${title}» en TMDB` };
    }
    db.prepare(`UPDATE lb_list_items SET tmdb_id = ? WHERE ${where}`).run(tmdbId, listId, title, year);
    return { tmdbId };
  } catch (err) {
    reply.code(502);
    return { error: String(err.message || err) };
  }
});
app.delete('/api/letterboxd/lists/:id', async (req) => {
  deleteChallengeList(Number(req.params.id));
  return { ok: true };
});

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

app.get('/api/letterboxd/summary', async () => letterboxdSummary());
// --- plex image proxy (with tiny disk cache) ----------------------------------------------

/**
 * La respuesta de Plex se guarda en disco y se sirve como image/jpeg: si el
 * destino resultara no ser Plex, estaríamos cacheando y devolviendo lo que
 * fuera. Un vistazo al content-type corta eso sin coste.
 */
function esImagen(res) {
  return (res.headers.get('content-type') || '').toLowerCase().startsWith('image/');
}

app.get('/img/:key/:kind', async (req, reply) => {
  const { key, kind } = req.params;
  if (!/^\d+$/.test(key) || !['poster', 'art'].includes(kind)) {
    reply.code(400);
    return { error: 'bad request' };
  }
  // el id normalizado, no el crudo: «123», «0123» y «00123» son la misma
  // película para la consulta (Number) y tenían tres ficheros de caché
  // distintos, cada uno con su transcode a Plex
  const id = Number(key);
  if (!Number.isSafeInteger(id) || id <= 0) {
    reply.code(400);
    return { error: 'bad request' };
  }
  const cacheFile = path.join(DATA_DIR, 'img', `${id}-${kind}.jpg`);
  if (fs.existsSync(cacheFile)) {
    reply.header('Cache-Control', 'public, max-age=604800');
    reply.type('image/jpeg');
    return fs.createReadStream(cacheFile);
  }
  const movie = db.prepare('SELECT thumb, art FROM movies WHERE rating_key = ?').get(id);
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
    if (!res.ok || !esImagen(res)) throw new Error(String(res.status));
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
  const personId = Number(req.params.id);
  if (!Number.isSafeInteger(personId) || personId <= 0) {
    reply.code(400);
    return { error: 'bad request' };
  }
  const person = db.prepare('SELECT thumb FROM people WHERE id = ?').get(personId);
  if (!person?.thumb) {
    reply.code(404);
    return { error: 'sin imagen' };
  }
  const cacheFile = path.join(DATA_DIR, 'img', `p${personId}.jpg`);
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
    if (!res.ok || !esImagen(res)) throw new Error(String(res.status));
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
  // el MISMO «hoy» que el resto de la app (local, no UTC): antes convivían dos
  // ideas de qué día es dentro del mismo proceso
  const todayStr = today();
  // guard so a restart inside the 03:00 window doesn't re-trigger the whole run
  // Ventana de recuperación hasta las 06:00. Antes era solo 03:00-03:05: si a
  // esa hora había una sincronización en marcha, el pase se saltaba el día
  // entero sin reintentarlo — y la 1.04 es justo la versión que empuja a hacer
  // una re-sincronización completa, que en 12.000 películas dura media hora.
  // El guardia contra reentradas es `nightly_last_run`, no la ventana estrecha.
  if (
    h >= 3 && h < 6 &&
    getSetting('nightly_last_run') !== todayStr &&
    !syncStatus.running && getSetting('plex_url') && getSetting('plex_token')
  ) {
    setSetting('nightly_last_run', todayStr);
    // exactly the same routine as the "Actualizar todo" button; each step logs
    // its own failure instead of the whole chain dying silently
    runFullRefresh({ trigger: 'nightly' })
      .then((r) => {
        // el histórico de verdad lo escribe runFullRefresh en refresh_runs, que
        // es lo que leen Ajustes y el aviso de la barra lateral: aquí basta con
        // dejar los fallos en el log del servidor
        const failed = (r.steps || []).filter((s) => s.state === 'error');
        for (const s of failed) app.log.error({ step: s.key, detail: s.detail }, 'nightly');
      })
      .catch((err) => app.log.error({ err }, 'nightly'));
  }
}, 5 * 60 * 1000);

const port = Number(process.env.PORT || 3860);
await app.listen({ port, host: '0.0.0.0' });
console.log(`PowaFlex escuchando en http://0.0.0.0:${port}`);
