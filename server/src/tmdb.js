import { db, getSetting, cacheRead, cacheWrite } from './db.js';
import { watchedIndex, isWatched } from './letterboxd.js';

const DAY = 24 * 3600 * 1000;

function apiKey() {
  const k = getSetting('tmdb_key') || '';
  if (!k) throw new Error('TMDB no configurado (falta API key)');
  return k;
}

function lang() {
  return getSetting('language') || 'es-ES';
}

// --- global concurrency gate ------------------------------------------------
// Every feature (calendar, sagas, gaps, life-sync…) throttles itself, but two
// running at once could still stack up and trip TMDB's 429. A single shared
// limiter caps total in-flight requests across the whole process.
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      pump();
    });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    pump();
  });
}

const tmdbLimit = createLimiter(Number(process.env.TMDB_CONCURRENCY) || 10);

// Shared progress for long TMDB-building pages (calendar, descubrir), polled by
// the frontend to show a real progress bar instead of a mute spinner (#5).
export const buildProgress = { active: false, job: '', label: '', done: 0, total: 0 };
export function setBuildProgress(job, label, done, total) {
  Object.assign(buildProgress, { active: true, job, label, done, total });
}
export function clearBuildProgress(job) {
  if (buildProgress.job === job) buildProgress.active = false;
}

export async function tmdbGet(path, params = {}, { cacheKey = null, cacheMs = DAY } = {}) {
  if (cacheKey) {
    const hit = cacheRead(cacheKey, cacheMs);
    if (hit) return hit;
  }
  const key = apiKey();
  const qs = new URLSearchParams({ language: lang(), ...params });
  // v4 read-access tokens are long JWTs; v3 keys are short hex strings
  const isV4 = key.length > 60;
  if (!isV4) qs.set('api_key', key);
  const res = await tmdbLimit(() =>
    fetch(`https://api.themoviedb.org/3${path}?${qs}`, {
      headers: isV4 ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(20000),
    })
  );
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after')) || 2;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return tmdbGet(path, params, { cacheKey, cacheMs });
  }
  if (!res.ok) throw new Error(`TMDB ${res.status} en ${path}`);
  const data = await res.json();
  if (cacheKey) cacheWrite(cacheKey, data);
  return data;
}

export async function tmdbTest() {
  const data = await tmdbGet('/configuration', {}, { cacheKey: null });
  return { ok: true, imageBase: data.images?.secure_base_url };
}

// --- person matching --------------------------------------------------------

export async function findPersonInfo(name, knownForHint = null) {
  const cacheKey = `person_search:${name.toLowerCase()}`;
  const cached = cacheRead(cacheKey, 30 * DAY);
  if (cached) return cached;

  const data = await tmdbGet('/search/person', { query: name }, { cacheKey: null });
  const results = data.results || [];
  if (!results.length) {
    const miss = { id: null };
    cacheWrite(cacheKey, miss);
    return miss;
  }
  let best = results[0];
  if (knownForHint && results.length > 1) {
    const hinted = results.find((r) => r.known_for_department === knownForHint);
    if (hinted && hinted.popularity > best.popularity * 0.3) best = hinted;
  }
  const info = { id: best.id, name: best.name, profile_path: best.profile_path };
  cacheWrite(cacheKey, info);
  return info;
}

export async function findPersonId(name, knownForHint = null) {
  return (await findPersonInfo(name, knownForHint)).id;
}

export async function personCredits(tmdbPersonId) {
  return tmdbGet(
    `/person/${tmdbPersonId}/movie_credits`,
    {},
    { cacheKey: `person_credits:${tmdbPersonId}:${lang()}`, cacheMs: DAY }
  );
}

export async function personDetails(tmdbPersonId) {
  return tmdbGet(
    `/person/${tmdbPersonId}`,
    {},
    { cacheKey: `person:${tmdbPersonId}:${lang()}`, cacheMs: 7 * DAY }
  );
}

// Rough country -> continent map for the people filters (film-producing nations).
const CONTINENTS = {
  'United States': 'Norteamérica', USA: 'Norteamérica', Canada: 'Norteamérica', Mexico: 'Norteamérica',
  México: 'Norteamérica',
  Spain: 'Europa', España: 'Europa', France: 'Europa', Germany: 'Europa', Italy: 'Europa', 'United Kingdom': 'Europa',
  UK: 'Europa', England: 'Europa', Scotland: 'Europa', Ireland: 'Europa', Sweden: 'Europa', Denmark: 'Europa',
  Norway: 'Europa', Finland: 'Europa', Netherlands: 'Europa', Belgium: 'Europa', Portugal: 'Europa', Greece: 'Europa',
  Poland: 'Europa', Russia: 'Europa', 'Soviet Union': 'Europa', 'USSR': 'Europa', Austria: 'Europa', Switzerland: 'Europa',
  Hungary: 'Europa', 'Czech Republic': 'Europa', Czechoslovakia: 'Europa', Romania: 'Europa', Serbia: 'Europa',
  Ukraine: 'Europa', Iceland: 'Europa', Croatia: 'Europa', Turkey: 'Europa',
  Japan: 'Asia', China: 'Asia', 'South Korea': 'Asia', 'Korea': 'Asia', India: 'Asia', 'Hong Kong': 'Asia',
  Taiwan: 'Asia', Thailand: 'Asia', Iran: 'Asia', Israel: 'Asia', Vietnam: 'Asia', Philippines: 'Asia', Indonesia: 'Asia',
  Argentina: 'Sudamérica', Brazil: 'Sudamérica', Chile: 'Sudamérica', Colombia: 'Sudamérica', Peru: 'Sudamérica',
  Uruguay: 'Sudamérica', Venezuela: 'Sudamérica',
  Egypt: 'África', Nigeria: 'África', 'South Africa': 'África', Morocco: 'África', Senegal: 'África', Algeria: 'África',
  Australia: 'Oceanía', 'New Zealand': 'Oceanía',
};

function placeToGeo(place) {
  if (!place) return { country: null, continent: null };
  const country = String(place).split(',').map((s) => s.trim()).pop() || null;
  return { country, continent: country ? CONTINENTS[country] || null : null };
}

// Persist life status + demographics for a library person, so the people filters
// and "vivos y muertos" logic work without re-hitting TMDB.
export function persistLife(dbPersonId, details) {
  if (!dbPersonId || !details) return;
  const { country, continent } = placeToGeo(details.place_of_birth);
  db.prepare(
    `UPDATE people SET birthday = ?, deathday = ?, gender = ?, place_of_birth = ?, country = ?, continent = ?,
     details_fetched_at = ? WHERE id = ?`
  ).run(
    details.birthday || null, details.deathday || null, details.gender ?? null,
    details.place_of_birth || null, country, continent, Date.now(), dbPersonId
  );
}

/**
 * Fill birthday/deathday for a set of library people (by DB id). Used by the
 * "actualizar estado vital" button and the nightly job. Returns counts.
 */
export async function enrichPeopleLife(personIds, { concurrency = 5 } = {}) {
  const list = [...new Set(personIds)].filter(Boolean);
  let done = 0;
  let deceased = 0;
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= list.length) return;
      try {
        const person = await resolvePerson(list[i]);
        if (!person?.tmdb_id) continue;
        const det = await personDetails(person.tmdb_id);
        persistLife(person.id, det);
        if (det?.deathday) deceased++;
        done++;
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { requested: list.length, done, deceased };
}

/**
 * Resolve the TMDB person id for a library person (by DB id), persisting it.
 */
export async function resolvePerson(personId) {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!person) return null;
  if (person.tmdb_id) return person;
  const roles = db
    .prepare('SELECT DISTINCT role FROM movie_people WHERE person_id = ?')
    .all(personId)
    .map((r) => r.role);
  const hint = roles.includes('director') ? 'Directing' : roles.includes('actor') ? 'Acting' : null;
  const tmdbId = await findPersonId(person.name, hint);
  if (tmdbId) {
    db.prepare('UPDATE people SET tmdb_id = ? WHERE id = ?').run(tmdbId, personId);
    person.tmdb_id = tmdbId;
  }
  return person;
}

// --- filmography / completeness ---------------------------------------------

const libraryTmdbIds = () =>
  new Set(db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id));

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Enrich TMDB items (with .tmdb_id) with runtime and short/doc/TV flags, using
 * the per-movie cache. Runtime is not in credit lists, so a short (<40 min)
 * can only be detected here. Concurrency-limited and cached, so repeat loads
 * are cheap. Mutates items in place.
 */
export async function enrichRuntimes(items, { concurrency = 6, withCredits = false } = {}) {
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      const it = items[idx];
      try {
        // With credits we can also count co-directors → "dirección coral" (#7).
        const det = withCredits
          ? await tmdbGet(
              `/movie/${it.tmdb_id}`,
              { append_to_response: 'credits' },
              { cacheKey: `movie_cr:${it.tmdb_id}:${lang()}`, cacheMs: 7 * DAY }
            )
          : await tmdbGet(
              `/movie/${it.tmdb_id}`,
              {},
              { cacheKey: `movie:${it.tmdb_id}:${lang()}`, cacheMs: 7 * DAY }
            );
        it.runtime = det.runtime || null;
        if (det.genres?.length) {
          const g = det.genres.map((x) => x.id);
          it.genre_ids = g;
          it.isDocumentary = g.includes(99);
          it.isTvMovie = g.includes(10770);
        }
        if (withCredits) {
          const dirs = new Set((det.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.id));
          it.directorCount = dirs.size || 1;
          it.isCoral = dirs.size >= 3;
        }
      } catch {
        it.runtime = it.runtime ?? null;
      }
      it.isShort = !!it.runtime && it.runtime < 40;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return items;
}

/** Resolve a TMDB movie id from title (+year), cached. Null if not found. */
export async function searchMovieId(title, year = null) {
  if (!title) return null;
  const key = `movie_search:${title.toLowerCase()}:${year || ''}`;
  const cached = cacheRead(key, 30 * DAY);
  if (cached !== null) return cached?.id ?? null;
  try {
    const data = await tmdbGet('/search/movie', year ? { query: title, year } : { query: title }, { cacheKey: null });
    const hit = (data.results || [])[0] || null;
    cacheWrite(key, hit ? { id: hit.id } : {});
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

/** Full TMDB movie detail with credits (cached). */
export async function tmdbMovieDetail(tmdbId) {
  return tmdbGet(
    `/movie/${tmdbId}`,
    { append_to_response: 'credits' },
    { cacheKey: `movie_cr:${tmdbId}:${lang()}`, cacheMs: 7 * DAY }
  );
}

/** Poster path for a TMDB movie id (cached). Null if unknown. */
export async function tmdbPoster(tmdbId) {
  if (!tmdbId) return null;
  try {
    const det = await tmdbGet(`/movie/${tmdbId}`, {}, { cacheKey: `movie:${tmdbId}:${lang()}`, cacheMs: 30 * DAY });
    return det.poster_path || null;
  } catch {
    return null;
  }
}

const roleRaw = (credits, role) => {
  if (role === 'director') return (credits.crew || []).filter((c) => c.job === 'Director');
  if (role === 'writer') return (credits.crew || []).filter((c) => c.department === 'Writing');
  return credits.cast || [];
};

function buildRoleItems(credits, role, inLib, widx) {
  const now = today();
  const seen = new Set();
  const items = [];
  for (const c of roleRaw(credits, role)) {
    if (c.video) continue; // skip music videos / direct-to-video oddities flagged by TMDB
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const date = c.release_date || null;
    const genres = c.genre_ids || [];
    items.push({
      tmdb_id: c.id,
      title: c.title,
      original_title: c.original_title,
      date,
      released: !!date && date <= now,
      owned: inLib.has(c.id),
      watched: isWatched({ tmdb_id: c.id, title: c.title, year: date ? Number(date.slice(0, 4)) : null }, widx),
      poster_path: c.poster_path,
      vote: c.vote_average,
      popularity: c.popularity,
      character: c.character || null,
      job: c.job || null,
      genre_ids: genres,
      isDocumentary: genres.includes(99),
      isTvMovie: genres.includes(10770),
      isShort: false, // set after runtime enrichment
      isCoral: false, // set for directors after credits enrichment
    });
  }
  items.sort((a, b) => ((b.date || '9999') < (a.date || '9999') ? -1 : 1));
  return items;
}

// Completeness bar. For directors it counts features only (#6): no shorts, no
// TV movies, no "coral" 3+ director films (#7), and no documentaries unless the
// person is a documentarian (>5 directed docs). Other roles count every release.
function roleStats(items, role) {
  const released = items.filter((i) => i.released);
  const base = { upcoming: items.filter((i) => !i.released).length };
  if (role !== 'director') {
    const owned = released.filter((i) => i.owned);
    return { ...base, released: released.length, owned: owned.length,
      pct: released.length ? Math.round((owned.length / released.length) * 100) : 0 };
  }
  const documentarian = released.filter((i) => i.isDocumentary).length > 5;
  const isFeature = (i) => !i.isShort && !i.isTvMovie && !i.isCoral && (!i.isDocumentary || documentarian);
  const feats = released.filter(isFeature);
  const owned = feats.filter((i) => i.owned);
  return { ...base, released: feats.length, owned: owned.length,
    pct: feats.length ? Math.round((owned.length / feats.length) * 100) : 0,
    documentarian, excludedFromCompletion: released.length - feats.length };
}

/**
 * Full person profile: builds every role they have (director/actor/writer) with
 * its own completeness bar, so a person who both directs and acts shows two bars
 * and you can switch between them (#8). `wantRole` decides which one opens first.
 */
export async function filmographyProfile(personId, wantRole = null) {
  const person = await resolvePerson(personId);
  if (!person?.tmdb_id) return { person, matched: false, roles: {} };

  const credits = await personCredits(person.tmdb_id);
  const details = await personDetails(person.tmdb_id);
  persistLife(person.id, details);
  const inLib = libraryTmdbIds();
  const widx = watchedIndex();

  // which roles this person actually has credits in
  const present = [];
  if ((credits.crew || []).some((c) => c.job === 'Director')) present.push('director');
  if ((credits.cast || []).length) present.push('actor');
  if ((credits.crew || []).some((c) => c.department === 'Writing')) present.push('writer');
  // build director & actor whenever present; writer only when it's what was asked
  const build = present.filter((r) => r !== 'writer' || wantRole === 'writer');
  if (!build.length && present.length) build.push(present[0]);

  const roles = {};
  for (const role of build) {
    const items = buildRoleItems(credits, role, inLib, widx);
    await enrichRuntimes(items, { withCredits: role === 'director' });
    roles[role] = { stats: roleStats(items, role), items };
  }

  // open on the requested role if we built it, else the one with most releases
  const primary =
    (wantRole && roles[wantRole] && wantRole) ||
    Object.keys(roles).sort((a, b) => (roles[b].stats.released || 0) - (roles[a].stats.released || 0))[0] ||
    null;

  return {
    person: {
      id: person.id,
      name: person.name,
      tmdb_id: person.tmdb_id,
      profile_path: details?.profile_path || null,
      biography: details?.biography || null,
      birthday: details?.birthday || null,
      deathday: details?.deathday || null,
    },
    matched: true,
    primary,
    roles,
  };
}

// --- upcoming calendar -------------------------------------------------------

/**
 * Build calendar of upcoming/recent releases for the library's top + tracked people.
 */
export async function buildCalendar({ topDirectors = 25, topActors = 15, pastDays = 60 } = {}) {
  const tops = db
    .prepare(
      `SELECT p.id, p.name, mp.role, COUNT(*) AS n FROM movie_people mp
       JOIN people p ON p.id = mp.person_id
       WHERE mp.role = ? GROUP BY p.id ORDER BY n DESC LIMIT ?`
    );
  const directors = tops.all('director', topDirectors);
  const actors = tops.all('actor', topActors);
  const tracked = db
    .prepare(
      `SELECT p.id, p.name, 'tracked' AS role, 0 AS n FROM tracked_people t JOIN people p ON p.id = t.person_id`
    )
    .all();

  const people = new Map();
  for (const p of [...directors, ...actors, ...tracked]) {
    const prev = people.get(p.id);
    if (prev) prev.roles.add(p.role);
    else people.set(p.id, { ...p, roles: new Set([p.role]) });
  }

  const now = today();
  const cutoff = new Date(Date.now() - pastDays * DAY).toISOString().slice(0, 10);
  const inLib = libraryTmdbIds();
  const events = new Map(); // tmdb_id -> event

  // TMDB person id -> our library person id, so the real director can be linked
  const peopleByTmdb = new Map(
    db.prepare('SELECT id, tmdb_id FROM people WHERE tmdb_id IS NOT NULL').all().map((r) => [r.tmdb_id, r.id])
  );

  const list = [...people.values()];
  setBuildProgress('calendar', 'Analizando filmografías', 0, list.length);
  const CONCURRENCY = 5;
  let idx = 0;
  const errors = [];
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= list.length) return;
      setBuildProgress('calendar', 'Analizando filmografías', i + 1, list.length);
      const p = list[i];
      try {
        const resolved = await resolvePerson(p.id);
        if (!resolved?.tmdb_id) continue;
        const credits = await personCredits(resolved.tmdb_id);
        const wantDirector = p.roles.has('director') || p.roles.has('tracked');
        const wantActor = p.roles.has('actor') || p.roles.has('tracked');
        const candidates = [];
        if (wantDirector)
          candidates.push(
            ...(credits.crew || [])
              .filter((c) => c.job === 'Director')
              .map((c) => ({ ...c, credit: 'Dirige' }))
          );
        if (wantActor)
          candidates.push(...(credits.cast || []).map((c) => ({ ...c, credit: 'Actúa' })));

        for (const c of candidates) {
          if (c.video) continue;
          const date = c.release_date || null;
          // keep undated (announced) and anything from cutoff forward
          if (date && date < cutoff) continue;
          const ev = events.get(c.id) || {
            tmdb_id: c.id,
            title: c.title,
            original_title: c.original_title,
            date,
            poster_path: c.poster_path,
            overview: c.overview || '',
            genre_ids: c.genre_ids || [],
            followedDirectors: [], // { id, name, tmdb_id } — favorites who direct it
            followedActors: [],    // { id, name, order } — favorites in the cast
            people: [],            // filled in the enrich pass (Dirige first, then Actúa)
            inLibrary: inLib.has(c.id),
          };
          if (c.credit === 'Dirige') {
            if (!ev.followedDirectors.some((x) => x.id === p.id))
              ev.followedDirectors.push({ id: p.id, name: p.name, tmdb_id: resolved.tmdb_id });
          } else if (!ev.followedActors.some((x) => x.id === p.id)) {
            ev.followedActors.push({ id: p.id, name: p.name, order: c.order ?? 999 });
          }
          events.set(c.id, ev);
        }
      } catch (err) {
        errors.push(`${p.name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const out = [...events.values()];

  // enrich with runtime + full credits: the film's real director is always shown
  // (even if not a favorite), followed by the single top-billed favorite actor.
  setBuildProgress('calendar', 'Detallando estrenos', 0, out.length);
  let ei = 0;
  async function enrichWorker() {
    for (;;) {
      const i = ei++;
      if (i >= out.length) return;
      setBuildProgress('calendar', 'Detallando estrenos', i + 1, out.length);
      const ev = out[i];
      let directors = [];
      try {
        const det = await tmdbGet(
          `/movie/${ev.tmdb_id}`,
          { append_to_response: 'credits' },
          { cacheKey: `movie_cr:${ev.tmdb_id}:${lang()}`, cacheMs: 7 * DAY }
        );
        ev.runtime = det.runtime || null;
        if (det.genres?.length) ev.genre_ids = det.genres.map((g) => g.id);
        directors = (det.credits?.crew || []).filter((c) => c.job === 'Director');
      } catch {
        ev.runtime = null;
      }
      // Letterboxd/Academy: short = under 40 min (unknown runtime counts as feature)
      ev.isShort = !!ev.runtime && ev.runtime < 40;
      ev.isDocumentary = (ev.genre_ids || []).includes(99);
      ev.isTvMovie = (ev.genre_ids || []).includes(10770);

      // "Dirige X" (real director, always) then "Actúa Y" (top-billed favorite)
      const dirSource = directors.length
        ? directors.map((d) => ({ tmdbId: d.id, name: d.name }))
        : ev.followedDirectors.map((d) => ({ tmdbId: d.tmdb_id, name: d.name }));
      const seenDir = new Set();
      const dirEntries = [];
      for (const d of dirSource) {
        if (seenDir.has(d.name)) continue;
        seenDir.add(d.name);
        dirEntries.push({ id: peopleByTmdb.get(d.tmdbId) ?? null, name: d.name, credit: 'Dirige' });
      }
      const topActor = ev.followedActors
        .filter((a) => !seenDir.has(a.name))
        .sort((a, b) => a.order - b.order)[0];

      ev.people = dirEntries;
      if (topActor) ev.people.push({ id: topActor.id, name: topActor.name, credit: 'Actúa' });
      delete ev.followedDirectors;
      delete ev.followedActors;
    }
  }
  await Promise.all(Array.from({ length: 5 }, enrichWorker));
  clearBuildProgress('calendar');

  out.sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'));
  return {
    generatedAt: Date.now(),
    today: now,
    peopleCount: list.length,
    events: out,
    errors: errors.slice(0, 10),
  };
}

export async function getCalendarCached({ refresh = false } = {}) {
  const key = 'calendar:v3';
  if (!refresh) {
    const hit = cacheRead(key, 12 * 3600 * 1000);
    if (hit) return hit;
  }
  const topDirectors = Number(getSetting('cal_top_directors') || 25);
  const topActors = Number(getSetting('cal_top_actors') || 15);
  const cal = await buildCalendar({ topDirectors, topActors });
  if (cal.events.length || !cal.errors.length) cacheWrite(key, cal);
  return cal;
}

// --- suggested people (favorites) -------------------------------------------

// Curated "packs" of directors to follow, each surfaced with an "add all"
// button in Favoritos → Descubrir (#9).
const DIRECTOR_PACKS = [
  {
    key: 'spanish', emoji: '🇪🇸', accent: 'red',
    title: 'Directores españoles',
    description: 'Nombres imprescindibles y actuales del cine español.',
    names: [
      'Pedro Almodóvar', 'Alejandro Amenábar', 'J. A. Bayona', 'Isabel Coixet', 'Icíar Bollaín',
      'Rodrigo Sorogoyen', 'Álex de la Iglesia', 'Fernando León de Aranoa', 'Carla Simón', 'Jonás Trueba',
      'Paco Plaza', 'Albert Serra', 'Carlos Vermut', 'Alauda Ruiz de Azúa', 'Pilar Palomero',
      'Víctor Erice', 'David Trueba', 'Cesc Gay', 'Fernando Trueba', 'Oliver Laxe',
    ],
  },
  {
    key: 'awarded', emoji: '🏆', accent: 'gold',
    title: 'Premiados en grandes festivales',
    description: 'Palmas, Leones y Osos recientes de Cannes, Venecia y Berlín, más ganadores del Óscar.',
    names: [
      'Bong Joon-ho', 'Hirokazu Kore-eda', 'Ruben Östlund', 'Justine Triet', 'Jonathan Glazer',
      'Sean Baker', 'Christopher Nolan', 'Jacques Audiard', 'Yorgos Lanthimos', 'Lucrecia Martel',
      'Cristian Mungiu', 'Michel Franco', 'Alice Rohrwacher', 'Aki Kaurismäki', 'Asghar Farhadi',
      'Radu Jude', 'Pawel Pawlikowski', 'Kleber Mendonça Filho',
    ],
  },
  {
    key: 'emerging', emoji: '🌱', accent: 'emerald',
    title: 'Directores emergentes',
    description: 'Voces nuevas que están definiendo el cine de la última década.',
    names: [
      'Charlotte Wells', 'Celine Song', 'Julia Ducournau', 'Rose Glass', 'Robert Eggers',
      'Ari Aster', 'Chloé Zhao', 'Emerald Fennell', 'Kogonada', 'Alice Diop',
      'Coralie Fargeat', 'Jane Schoenbrun', 'RaMell Ross', 'Cooper Raiff', 'Zach Cregger',
    ],
  },
  {
    key: 'boxoffice', emoji: '💥', accent: 'sky',
    title: 'Directores taquilleros',
    description: 'Los que llenan salas y mueven la taquilla mundial.',
    names: [
      'James Cameron', 'Christopher Nolan', 'Denis Villeneuve', 'Greta Gerwig', 'Jordan Peele',
      'Ryan Coogler', 'Matt Reeves', 'Taika Waititi', 'James Wan', 'Peter Jackson',
      'Steven Spielberg', 'Ridley Scott', 'Sam Mendes', 'Guy Ritchie', 'Wes Anderson',
      'Damien Chazelle',
    ],
  },
];

/** Curated director packs + directors "en boga" from TMDB, each with a tracked flag. */
export async function suggestedPeople() {
  const trackedTmdb = new Set(
    db.prepare(`SELECT p.tmdb_id FROM tracked_people t JOIN people p ON p.id = t.person_id WHERE p.tmdb_id IS NOT NULL`)
      .all().map((r) => r.tmdb_id)
  );
  const mapP = (p) => ({
    tmdb_id: p.id,
    name: p.name,
    profile_path: p.profile_path || null,
    tracked: trackedTmdb.has(p.id),
    knownFor: (p.known_for || []).map((k) => k.title || k.name).filter(Boolean).slice(0, 2),
  });

  // popular people, filtered to directors ("en boga" según TMDB/IMDb)
  const popularRaw = [];
  for (const page of [1, 2, 3, 4]) {
    const data = await tmdbGet('/person/popular', { page }, { cacheKey: `person_popular:${page}:${lang()}`, cacheMs: DAY });
    for (const p of data.results || []) if (p.known_for_department === 'Directing') popularRaw.push(p);
  }
  const seen = new Set();
  const trending = [];
  for (const p of popularRaw.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    trending.push(mapP(p));
    if (trending.length >= 20) break;
  }

  // resolve each curated pack (findPersonInfo is cached 30 days)
  const packs = [];
  for (const pack of DIRECTOR_PACKS) {
    const people = [];
    for (const name of pack.names) {
      try {
        const info = await findPersonInfo(name, 'Directing');
        if (info?.id) people.push({ tmdb_id: info.id, name: info.name || name, profile_path: info.profile_path || null, tracked: trackedTmdb.has(info.id) });
      } catch {}
    }
    if (people.length) packs.push({ key: pack.key, title: pack.title, emoji: pack.emoji, description: pack.description, accent: pack.accent, people });
  }
  packs.push({
    key: 'trending', title: 'Directores en boga', emoji: '🔥', accent: 'orange',
    description: 'Los más populares ahora mismo según el ranking de TMDB/IMDb.', people: trending,
  });

  // keep `spanish`/`popular` keys for backward compatibility with older clients
  return { packs, spanish: packs.find((p) => p.key === 'spanish')?.people || [], popular: trending };
}

/** Search TMDB people (to add anyone to favorites by typing). */
export async function searchPeople(query) {
  const data = await tmdbGet('/search/person', { query }, { cacheKey: null });
  const trackedTmdb = new Set(
    db.prepare(`SELECT p.tmdb_id FROM tracked_people t JOIN people p ON p.id = t.person_id WHERE p.tmdb_id IS NOT NULL`)
      .all().map((r) => r.tmdb_id)
  );
  return (data.results || []).slice(0, 12).map((p) => ({
    tmdb_id: p.id,
    name: p.name,
    profile_path: p.profile_path || null,
    dept: p.known_for_department || null,
    knownFor: (p.known_for || []).map((k) => k.title || k.name).filter(Boolean).slice(0, 2),
    tracked: trackedTmdb.has(p.id),
  }));
}

/** Add someone to favorites by TMDB person id, creating a people row if needed. */
export function trackByTmdb({ tmdbId, name, profilePath = null }) {
  if (!tmdbId || !name) throw new Error('Faltan datos de la persona');
  let row = db.prepare('SELECT id FROM people WHERE tmdb_id = ?').get(tmdbId);
  if (!row) {
    const byName = db.prepare('SELECT id, tmdb_id FROM people WHERE name = ?').get(name);
    if (byName) {
      if (!byName.tmdb_id) db.prepare('UPDATE people SET tmdb_id = ? WHERE id = ?').run(tmdbId, byName.id);
      row = byName;
    } else {
      const thumb = profilePath ? `https://image.tmdb.org/t/p/w185${profilePath}` : null;
      const id = db.prepare('INSERT INTO people (name, thumb, tmdb_id) VALUES (?, ?, ?)').run(name, thumb, tmdbId).lastInsertRowid;
      row = { id };
    }
  }
  db.prepare('INSERT OR IGNORE INTO tracked_people (person_id, added_at) VALUES (?, ?)').run(row.id, Date.now());
  return { ok: true, personId: row.id };
}

// --- collections ------------------------------------------------------------

export async function searchCollection(name) {
  const data = await tmdbGet(
    '/search/collection',
    { query: name },
    { cacheKey: `coll_search:${name.toLowerCase()}:${lang()}`, cacheMs: 30 * DAY }
  );
  return data.results?.[0] || null;
}

export async function collectionDetails(id) {
  return tmdbGet(`/collection/${id}`, {}, { cacheKey: `coll:${id}:${lang()}`, cacheMs: 7 * DAY });
}
