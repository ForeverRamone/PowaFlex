import { db, getSetting, cacheRead, cacheWrite } from './db.js';

const DAY = 24 * 3600 * 1000;

function apiKey() {
  const k = getSetting('tmdb_key') || '';
  if (!k) throw new Error('TMDB no configurado (falta API key)');
  return k;
}

function lang() {
  return getSetting('language') || 'es-ES';
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
  const res = await fetch(`https://api.themoviedb.org/3${path}?${qs}`, {
    headers: isV4 ? { Authorization: `Bearer ${key}` } : {},
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
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
 * Filmography for a library person, split into owned / missing / upcoming.
 * role: 'director' | 'actor' | 'writer'
 */
export async function filmography(personId, role) {
  const person = await resolvePerson(personId);
  if (!person?.tmdb_id) return { person, matched: false, items: [] };

  const credits = await personCredits(person.tmdb_id);
  const details = await personDetails(person.tmdb_id);
  const now = today();
  const inLib = libraryTmdbIds();

  let raw;
  if (role === 'director') raw = (credits.crew || []).filter((c) => c.job === 'Director');
  else if (role === 'writer')
    raw = (credits.crew || []).filter((c) => c.department === 'Writing');
  else raw = credits.cast || [];

  const seen = new Set();
  const items = [];
  for (const c of raw) {
    if (c.video) continue; // skip music videos / direct-to-video oddities flagged by TMDB
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const date = c.release_date || null;
    const released = !!date && date <= now;
    items.push({
      tmdb_id: c.id,
      title: c.title,
      original_title: c.original_title,
      date,
      released,
      owned: inLib.has(c.id),
      poster_path: c.poster_path,
      vote: c.vote_average,
      popularity: c.popularity,
      character: c.character || null,
      job: c.job || null,
    });
  }
  items.sort((a, b) => (b.date || '9999') < (a.date || '9999') ? -1 : 1);

  const released = items.filter((i) => i.released);
  const owned = released.filter((i) => i.owned);
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
    stats: {
      released: released.length,
      owned: owned.length,
      pct: released.length ? Math.round((owned.length / released.length) * 100) : 0,
      upcoming: items.filter((i) => !i.released).length,
    },
    items,
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

  const list = [...people.values()];
  const CONCURRENCY = 5;
  let idx = 0;
  const errors = [];
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= list.length) return;
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
            people: [],
            inLibrary: inLib.has(c.id),
          };
          if (!ev.people.some((x) => x.id === p.id && x.credit === c.credit))
            ev.people.push({ id: p.id, name: p.name, credit: c.credit });
          events.set(c.id, ev);
        }
      } catch (err) {
        errors.push(`${p.name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const out = [...events.values()];
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
  const key = 'calendar:v1';
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
