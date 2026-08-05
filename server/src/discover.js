import { db, cacheRead, cacheWrite, getSetting } from './db.js';
import { today } from './dates.js';
import {
  personCredits, findPersonInfo, resolvePerson, enrichRuntimes, setBuildProgress, clearBuildProgress,
  buildRoleItems, roleStats, classifyGenres, latinizeTitles, featureRule, tmdbGet, latinizeNames,
  isCameoCredit, esParcialCaducado, personPopularPage,
} from './tmdb.js';
import { enrichWithScores } from './mdblist.js';
import { matchMovie, watchedIndex, isWatched } from './letterboxd.js';
import { TSPDT_DIRECTORS, TSPDT_21C_DIRECTORS } from './data/tspdt-directors.js';
import { IMDB_501_DIRECTORS } from './data/imdb-501-directors.js';
import { cachePrefix } from './cache-versions.js';

// Mark TMDB items as watched (Plex view or Letterboxd), for the status system (#3).
function applyWatched(items) {
  const widx = watchedIndex();
  for (const it of items) {
    it.watched = isWatched({ tmdb_id: it.tmdb_id, title: it.title, year: it.date ? Number(String(it.date).slice(0, 4)) : null }, widx);
  }
}

// A TMDB film counts as owned if its id is in the library OR a title+year match
// exists — Plex sometimes stores a different TMDB id for the same film, which
// otherwise makes owned films show up as "missing" (#15).
const ownsFilm = (c, inLib) => inLib.has(c.id) || !!matchMovie({ title: c.title, year: c.release_date ? Number(c.release_date.slice(0, 4)) : null, tmdbId: c.id });

export const genreFlags = (ids = []) => classifyGenres({ isShort: false }, ids);

// prefer the mdblist multi-platform score; fall back to TMDB vote volume
const rankKey = (i) => (i.mdb?.score != null ? i.mdb.score * 10000 : Math.min(9999, i.votes || 0));

async function applyScores(people) {
  if (!getSetting('mdblist_key')) return;
  const all = people.flatMap((p) => p.missing);
  await enrichWithScores(all, { maxFetch: 300 });
  for (const p of people) p.missing.sort((a, b) => rankKey(b) - rankKey(a));
}

// vive en tmdb.js (buildRoleItems lo necesita); se reexporta para no romper a
// quien ya lo importaba de aquí
export { isCameoCredit };

// user-configurable noise thresholds (Ajustes), with the historical defaults
const minVotesFor = (role) =>
  Number(getSetting(role === 'actor' ? 'gaps_min_votes_actor' : 'gaps_min_votes_director')) ||
  (role === 'actor' ? 100 : 20);

const dismissedIds = () =>
  new Set(db.prepare('SELECT tmdb_id FROM dismissed_movies').all().map((r) => r.tmdb_id));

// Votos de Letterboxd cacheados en mdb_ratings. En TMDB apenas vota nadie, así
// que el umbral de ruido por sí solo descartaba cine de verdad: una película
// pasa si llega al listón en TMDB **o** en Letterboxd.
const lbVotesMap = () =>
  new Map(
    db.prepare('SELECT tmdb_id, lb_votes FROM mdb_ratings WHERE lb_votes IS NOT NULL').all().map((r) => [r.tmdb_id, r.lb_votes])
  );

/**
 * Las dos películas por las que se reconoce a alguien, para no tener que abrir
 * su ficha y adivinar quién es.
 *
 * Solo largometrajes, con el mismo criterio que la barra de completismo (nada
 * de cortos, telefilmes, dirección coral ni cameos; documentales y conciertos
 * solo si son su especialidad): a nadie le identifica su corto de estudiante.
 * Manda la nota, pero entre las que tienen votos suficientes, que un 9,4 con
 * doce votos no identifica a nadie tampoco; si ninguna llega al mínimo, deciden
 * los votos.
 *
 * `isFeature` se puede pasar de fuera cuando quien llama ya lo ha calculado
 * sobre la filmografía completa: decidir «es documentalista» mirando solo estos
 * títulos daría una respuesta distinta.
 */
const SIGNATURE_MIN_VOTES = 300;
export function signatureFilms(items, { n = 2, isFeature = null } = {}) {
  const released = items.filter((i) => i && i.title && i.released !== false);
  const feats = released.filter(isFeature || featureRule(released).isFeature);
  const solid = feats.filter((i) => (i.votes || 0) >= SIGNATURE_MIN_VOTES);
  const pool = solid.length >= n ? solid : feats;
  return [...pool]
    .sort((a, b) => (b.vote || 0) - (a.vote || 0) || (b.votes || 0) - (a.votes || 0))
    .slice(0, n)
    .map((i) => ({ tmdb_id: i.tmdb_id, title: i.title, year: i.date ? Number(String(i.date).slice(0, 4)) : null }));
}

/**
 * Insignia para el flujo «top de tu biblioteca», que trabaja con los créditos
 * en crudo: ahí el género y el cameo ya se saben, pero la duración y la
 * dirección coral no vienen en la lista de créditos. Se consultan solo de las
 * mejor valoradas —no de la filmografía entera— y con eso ya se puede aplicar
 * el criterio completo de largometraje.
 */
const SIGNATURE_POOL = 6;
async function pickSignature(released, role) {
  const { isFeature } = featureRule(released);
  const pool = released
    .filter(isFeature)
    .sort((a, b) => (b.vote || 0) - (a.vote || 0) || (b.votes || 0) - (a.votes || 0))
    .slice(0, SIGNATURE_POOL);
  if (!pool.length) return [];
  await enrichRuntimes(pool, { withCredits: role === 'director' });
  return signatureFilms(pool, { isFeature });
}

// Shorts, documentaries, concert films, TV movies and cameos are not gaps a
// completist has to fill: they never take a slot in the per-person quota.
export const isNoise = (m) => !!(m.isShort || m.isDocumentary || m.isMusic || m.isTvMovie || m.isCameo);

/** Features first (up to `perPerson`), then the same number of noise items at
 *  most, so the client-side toggles still have something to reveal. */
export function splitNoise(missing, perPerson) {
  const features = missing.filter((m) => !isNoise(m));
  const noise = missing.filter(isNoise);
  return { features, noise, list: [...features.slice(0, perPerson), ...noise.slice(0, perPerson)] };
}

// Noise (shorts/docs/TV/cameos) used to eat the per-person quota BEFORE the
// client-side filters hid it, leaving "12 te faltan" over 3 visible cards.
// Resolve runtimes before the cut, fill the quota with features, and keep the
// noise alongside (capped) so the client toggles still have data to reveal.
async function finishMissing(people, perPerson) {
  await applyScores(people);
  const all = people.flatMap((p) => p.missing);
  await enrichRuntimes(all);
  applyWatched(all);
  for (const p of people) p.missing = splitNoise(p.missing, perPerson).list;
}

const HOUR = 3600 * 1000;

// "Grandes ausentes" canons from They Shoot Pictures, Don't They?: the all-time
// Top 250 Directors and the 21st Century Top 100. Directing teams (e.g. "Joel
// Coen & Ethan Coen") are reduced to their lead credited director so each
// resolves to a single TMDB person, then deduped.
const cleanCanon = (names) => [
  ...new Map(names.map((n) => n.split(/\s*&\s*/)[0].trim()).map((n) => [n.toLowerCase(), n])).values(),
];
export const CANONS = {
  alltime: { label: 'TSPDT · Top 250 de siempre', names: cleanCanon(TSPDT_DIRECTORS) },
  '21c': { label: 'TSPDT · Top 100 del siglo XXI', names: cleanCanon(TSPDT_21C_DIRECTORS) },
  // ojo: la clave no puede ser «501» a secas — JS ordena las claves numéricas
  // las primeras y el selector saldría con esta por delante de las de TSPDT
  imdb501: { label: '501 Directors · el libro', names: cleanCanon(IMDB_501_DIRECTORS) },
};

/**
 * «En boga ahora»: el ranking de gente popular de TMDB, que es lo que mueve su
 * página de People y el equivalente legítimo al STARmeter de IMDb (IMDb no
 * tiene API pública ni permite rasparlo). Cambia solo, día a día.
 */
const TMDB_POPULAR = 'tmdb-popular';
async function tmdbPopularDirectors(limit = 100) {
  const out = [];
  const seen = new Set();
  for (const page of [1, 2, 3, 4, 5]) {
    const data = await personPopularPage(page);
    for (const p of data.results || []) {
      if (p.known_for_department !== 'Directing' || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ tmdb_id: p.id, name: p.name });
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  // el ranking trae nombres en su alfabeto original (아, 是枝…)
  await latinizeNames(out);
  return out.map((p) => p.name);
}

const customCanons = () =>
  db.prepare('SELECT key, label, names, source FROM custom_canons ORDER BY created_at DESC').all();

/** Todos los cánones disponibles, para que el cliente pinte el selector. */
export function listCanons() {
  return [
    ...Object.entries(CANONS).map(([key, c]) => ({ key, label: c.label, count: c.names.length, builtin: true })),
    { key: TMDB_POPULAR, label: 'En boga ahora · TMDB', count: null, builtin: true, dynamic: true },
    ...customCanons().map((c) => ({
      key: c.key,
      label: c.label,
      count: JSON.parse(c.names).length,
      builtin: false,
      source: c.source || null,
    })),
  ];
}

/** Nombres de un canon, sea de los de serie, el dinámico o uno tuyo. */
export async function canonNames(canon) {
  if (CANONS[canon]) return CANONS[canon].names;
  if (canon === TMDB_POPULAR) return tmdbPopularDirectors();
  const row = db.prepare('SELECT names FROM custom_canons WHERE key = ?').get(canon);
  if (row) {
    try {
      return JSON.parse(row.names);
    } catch {
      return [];
    }
  }
  return null; // no existe: quien llama decide
}

/** Guarda una lista pegada como canon propio. Devuelve su clave. */
export function saveCanon({ label, names, source = null }) {
  const parsed = [
    ...new Set(
      String(names || '')
        .split(/[\n;]+|,(?![^(]*\))/)
        .map((s) => s.replace(/^\s*\d+[.)-]\s*/, '').trim()) // «12. Chantal Akerman»
        .filter((s) => s.length > 1 && s.length < 80)
    ),
  ].slice(0, 1000);
  if (!parsed.length) throw new Error('No he encontrado ningún nombre en esa lista');
  const clean = String(label || '').trim() || 'Lista propia';
  // «Mi lista!» y «Mi lista?» daban la misma clave y la segunda se comía a la
  // primera sin avisar: si ya existe una con ese hueco y OTRO rótulo, se numera
  const base = `custom:${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'lista'}`;
  let key = base;
  for (let i = 2; i < 50; i++) {
    const ya = db.prepare('SELECT label FROM custom_canons WHERE key = ?').get(key);
    if (!ya || ya.label === clean) break; // libre, o es la misma lista: se actualiza
    key = `${base}-${i}`;
  }
  db.prepare(
    `INSERT INTO custom_canons (key, label, names, source, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET label = excluded.label, names = excluded.names, source = excluded.source`
  ).run(key, clean, JSON.stringify(parsed), source, Date.now());
  // el canon cambió: fuera su página cacheada
  db.prepare(`DELETE FROM tmdb_cache WHERE key LIKE ?`).run(`discover_absent:%:${key}:%`);
  return { key, label: clean, count: parsed.length };
}

export function deleteCanon(key) {
  db.prepare('DELETE FROM custom_canons WHERE key = ?').run(key);
  db.prepare(`DELETE FROM tmdb_cache WHERE key LIKE ?`).run(`discover_absent:%:${key}:%`);
  return { ok: true };
}

const libraryTmdbIds = () =>
  new Set(db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id));

/**
 * For the library's top people of a role, aggregate their missing (released,
 * not-owned) films, ranked by TMDB vote count.
 */
export async function libraryGaps({ role = 'director', people = 20, perPerson = 8, offset = 0, refresh = false } = {}) {
  const cacheKey = `${cachePrefix('discover_gaps')}:${role}:${people}:${perPerson}:${offset}:${minVotesFor(role)}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 12 * HOUR);
    if (hit && !esParcialCaducado(hit)) return hit;
  }

  const minVotes = minVotesFor(role);
  const dismissed = dismissedIds();
  const lbVotes = lbVotesMap();
  // paginated so "ver más" can walk the ranking down to the first 500
  const tops = db
    .prepare(
      `SELECT p.id, p.name, p.thumb, p.deathday, COUNT(*) n FROM movie_people mp
       JOIN people p ON p.id = mp.person_id
       WHERE mp.role = ? GROUP BY p.id ORDER BY n DESC, p.name LIMIT ? OFFSET ?`
    )
    .all(role, people, offset);
  const totalPeople = db
    .prepare(`SELECT COUNT(DISTINCT person_id) n FROM movie_people WHERE role = ?`)
    .get(role).n;

  const inLib = libraryTmdbIds();
  const now = today();
  const out = [];
  const errors = [];

  setBuildProgress('discover:gaps', 'Cruzando filmografías', 0, tops.length);
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= tops.length) return;
      setBuildProgress('discover:gaps', 'Cruzando filmografías', i + 1, tops.length);
      const p = tops[i];
      try {
        const resolved = await resolvePerson(p.id);
        if (!resolved?.tmdb_id) continue;
        const credits = await personCredits(resolved.tmdb_id);
        const raw =
          role === 'director'
            ? (credits.crew || []).filter((c) => c.job === 'Director')
            : role === 'writer'
              ? (credits.crew || []).filter((c) => c.department === 'Writing')
              : credits.cast || [];
        const seen = new Set();
        let released = 0;
        let owned = 0;
        let dismissedN = 0;
        const missing = [];
        const releasedCredits = [];
        for (const c of raw) {
          if (c.video || seen.has(c.id)) continue;
          seen.add(c.id);
          const isReleased = !!c.release_date && c.release_date <= now;
          if (!isReleased) continue;
          released++;
          releasedCredits.push({
            tmdb_id: c.id, title: c.title, date: c.release_date,
            vote: c.vote_average, votes: c.vote_count,
            isCameo: role === 'actor' ? isCameoCredit(c) : false,
            ...genreFlags(c.genre_ids),
          });
          if (ownsFilm(c, inLib)) {
            owned++;
            continue;
          }
          if (dismissed.has(c.id)) {
            dismissedN++;
            continue;
          }
          if ((c.vote_count || 0) < minVotes && (lbVotes.get(c.id) || 0) < minVotes) continue;
          missing.push({
            tmdb_id: c.id,
            title: c.title,
            date: c.release_date,
            poster_path: c.poster_path,
            vote: c.vote_average,
            votes: c.vote_count,
            released: true,
            owned: false,
            character: role === 'actor' ? c.character || null : null,
            isCameo: role === 'actor' ? isCameoCredit(c) : false,
            ...genreFlags(c.genre_ids),
          });
        }
        missing.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        if (missing.length) {
          out.push({
            id: p.id,
            name: p.name,
            thumb: p.thumb,
            deathday: p.deathday,
            role,
            inLibrary: p.n,
            released,
            owned,
            pct: released ? Math.round((owned / released) * 100) : 0,
            missingTotal: missing.length,
            noiseTotal: missing.filter(isNoise).length,
            dismissed: dismissedN,
            // «¿quién era este?»: sus dos títulos más reconocibles
            signature: await pickSignature(releasedCredits, role),
            // keep a few extra so the score re-rank + noise partition can refill
            missing: missing.slice(0, perPerson * 3),
          });
        }
      } catch (err) {
        errors.push(`${p.name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));

  out.sort((a, b) => b.inLibrary - a.inLibrary);
  await finishMissing(out, perPerson);
  // el recuento de ruido va aquí y no dentro del worker: la duración (y con ella
  // «es un corto») no se sabe hasta que finishMissing enriquece, así que antes
  // decía «3 ocultas» y al desplegar salían ocho
  for (const p of out) p.noiseTotal = splitNoise(p.missing, perPerson).noise.length;
  // los títulos insignia vienen crudos de los créditos, no de enrichRuntimes
  await latinizeTitles(out.flatMap((p) => p.signature || []));
  clearBuildProgress('discover:gaps');
  const result = {
    generatedAt: Date.now(), role, people: out,
    offset, pageSize: people, totalPeople,
    hasMore: offset + tops.length < Math.min(totalPeople, 500),
    errors: errors.slice(0, 5),
  };
  if (out.length || !errors.length) cacheWrite(cacheKey, { ...result, partial: errors.length > 0 }); // ver buildCalendar
  return result;
}

/**
 * Gaps for the people YOU chose as favorites (#17) — clearer than an arbitrary
 * "top by count", and strictly in the role you follow them for.
 */
export async function favoritesGaps({ perPerson = 8, refresh = false, role: onlyRole = null } = {}) {
  const cacheKey = `${cachePrefix('discover_favorites')}:${onlyRole || 'all'}:${perPerson}:${minVotesFor(onlyRole || 'director')}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 6 * HOUR);
    if (hit && !esParcialCaducado(hit)) return hit;
  }
  // the role you follow them FOR is explicit now: a favorite director never
  // brings in their acting credits, which is what mixed up the gaps before
  // una fila por (persona, faceta): quien está en directores Y actores genera
  // sus huecos por separado en cada faceta
  const tracked = db
    .prepare(
      `SELECT p.id, p.name, p.thumb, p.deathday, t.role,
              SUM(CASE WHEN mp.role = t.role THEN 1 ELSE 0 END) inLibrary
       FROM tracked_people t JOIN people p ON p.id = t.person_id
       LEFT JOIN movie_people mp ON mp.person_id = p.id
       WHERE (? IS NULL OR t.role = ?)
       GROUP BY p.id, t.role ORDER BY p.name`
    )
    .all(onlyRole, onlyRole);

  const inLib = libraryTmdbIds();
  const widx = watchedIndex();
  const dismissed = dismissedIds();
  const lbVotes = lbVotesMap();
  const out = [];
  const errors = [];
  setBuildProgress('discover:favoritos', 'Cruzando filmografías de tus favoritos', 0, tracked.length);
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= tracked.length) return;
      setBuildProgress('discover:favoritos', 'Cruzando filmografías de tus favoritos', i + 1, tracked.length);
      const p = tracked[i];
      const role = p.role === 'actor' ? 'actor' : 'director';
      try {
        const resolved = await resolvePerson(p.id);
        if (!resolved?.tmdb_id) continue;
        const credits = await personCredits(resolved.tmdb_id);
        // Build and score the filmography with the SAME helpers the person page
        // uses, so "te faltan N" here can never contradict the bar over there
        // (directors count features only: no shorts, TV, coral or — unless they
        // are documentarians — documentaries).
        const items = buildRoleItems(credits, role, inLib, widx);
        await enrichRuntimes(items, { withCredits: role === 'director' });
        // ownsFilm also catches library films stored under a different TMDB id
        for (const it of items) {
          if (!it.owned && ownsFilm({ id: it.tmdb_id, title: it.title, release_date: it.date }, inLib)) it.owned = true;
        }
        const stats = roleStats(items, role);

        const minVotes = minVotesFor(role);
        let dismissedN = 0;
        const missing = [];
        for (const it of items) {
          if (!it.released || it.owned) continue;
          if (dismissed.has(it.tmdb_id)) { dismissedN++; continue; }
          if ((it.votes || 0) < minVotes && (lbVotes.get(it.tmdb_id) || 0) < minVotes) continue;
          missing.push({ ...it, owned: false });
        }
        missing.sort((a, b) => (b.votes || 0) - (a.votes || 0));

        // everyone is returned, including complete filmographies (missing: []),
        // so Favoritos can show "✓ completo" instead of just dropping them
        out.push({
          id: p.id, name: p.name, thumb: p.thumb, deathday: p.deathday,
          role, inLibrary: p.inLibrary || 0,
          released: stats.released, owned: stats.owned, pct: stats.pct,
          upcoming: stats.upcoming,
          documentarian: stats.documentarian ?? false,
          excludedFromCompletion: stats.excludedFromCompletion ?? 0,
          // the headline count is the completeness gap, exactly like the ficha
          missingTotal: Math.max(0, stats.released - stats.owned),
          noiseTotal: missing.filter(isNoise).length,
          dismissed: dismissedN,
          signature: signatureFilms(items),
          missing: missing.slice(0, perPerson * 3),
        });
      } catch (err) {
        errors.push(`${p.name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
  // igual que en libraryGaps: el ruido no se sabe hasta conocer las duraciones
  for (const p of out) p.noiseTotal = splitNoise(p.missing, perPerson).noise.length;

  out.sort((a, b) => b.missingTotal - a.missingTotal);
  await finishMissing(out, perPerson);
  clearBuildProgress('discover:favoritos');
  const result = { generatedAt: Date.now(), people: out, tracked: tracked.length, errors: errors.slice(0, 5) };
  if (out.length || !errors.length) cacheWrite(cacheKey, { ...result, partial: errors.length > 0 }); // ver buildCalendar
  return result;
}

/**
 * Great directors with ZERO films in the library, with their essential
 * (most-voted) films as suggestions.
 */
export async function absentGreats({ perPerson = 6, refresh = false, canon = 'alltime' } = {}) {
  const cacheKey = `${cachePrefix('discover_absent')}:${canon}:${perPerson}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 24 * HOUR);
    if (hit && !esParcialCaducado(hit)) return hit;
  }
  // después de la caché: el canon «en boga» sale de TMDB y pedirlo para luego
  // descartarlo era regalar cinco peticiones en cada visita
  const names = await canonNames(canon);
  if (!names) throw new Error(`No existe la lista «${canon}»`);

  const dismissed = dismissedIds();
  const inLib = libraryTmdbIds();
  const now = today();
  const absent = [];
  const present = [];
  const errors = [];

  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= names.length) return;
      const name = names[i];
      try {
        const info = await findPersonInfo(name, 'Directing');
        if (!info.id) continue;
        const credits = await personCredits(info.id);
        const seen = new Set();
        const films = [];
        let owned = 0;
        for (const c of credits.crew || []) {
          if (c.job !== 'Director' || c.video || seen.has(c.id)) continue;
          seen.add(c.id);
          if (!c.release_date || c.release_date > now) continue;
          // ownership by the film's TMDB id or a title+year match — not by the
          // director's name, which fails across languages/spellings (Bong, Murnau)
          const isOwned = ownsFilm(c, inLib);
          if (isOwned) owned++;
          films.push({
            tmdb_id: c.id,
            title: c.title,
            date: c.release_date,
            poster_path: c.poster_path,
            vote: c.vote_average,
            votes: c.vote_count,
            released: true,
            owned: isOwned,
            ...genreFlags(c.genre_ids),
          });
        }
        // "present" = you already have at least one of their films
        if (owned > 0) {
          present.push({ name, inLibrary: owned });
          continue;
        }
        films.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        // runtime pass (≤ perPerson films, cached) so a much-voted short can't
        // sneak in as an "essential"; docs/TV are already flagged by genre
        const cands = films.filter((f) => !f.owned && !dismissed.has(f.tmdb_id)).slice(0, perPerson * 2);
        await enrichRuntimes(cands);
        const top = [
          ...cands.filter((f) => !isNoise(f)),
          ...cands.filter(isNoise),
        ].slice(0, perPerson);
        applyWatched(top);
        if (top.length) {
          absent.push({
            name,
            tmdb_id: info.id,
            profile_path: info.profile_path || null,
            filmCount: films.length,
            // si ya tiene ficha en tu base (por ejemplo, porque lo seguiste
            // alguna vez), el nombre puede enlazar directamente a ella
            personId: db.prepare('SELECT id FROM people WHERE tmdb_id = ?').get(info.id)?.id ?? null,
            top,
          });
        }
      } catch (err) {
        errors.push(`${name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));

  absent.sort((a, b) => a.name.localeCompare(b.name));
  present.sort((a, b) => b.inLibrary - a.inLibrary);
  const result = {
    generatedAt: Date.now(),
    checked: names.length,
    canon,
    absent,
    present,
    errors: errors.slice(0, 5),
  };
  if (absent.length || !errors.length) cacheWrite(cacheKey, { ...result, partial: errors.length > 0 }); // ver buildCalendar
  return result;
}
