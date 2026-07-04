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

// Persist birthday/deathday for a library person, so "vivos y muertos" logic
// (calendar, auto-Radarr, favoritos) can work without re-hitting TMDB.
export function persistLife(dbPersonId, details) {
  if (!dbPersonId || !details) return;
  db.prepare(
    'UPDATE people SET birthday = ?, deathday = ?, details_fetched_at = ? WHERE id = ?'
  ).run(details.birthday || null, details.deathday || null, Date.now(), dbPersonId);
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
export async function enrichRuntimes(items, { concurrency = 6 } = {}) {
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      const it = items[idx];
      try {
        const det = await tmdbGet(
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
      } catch {
        it.runtime = it.runtime ?? null;
      }
      it.isShort = !!it.runtime && it.runtime < 40;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return items;
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
  persistLife(person.id, details);
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
    const genres = c.genre_ids || [];
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
      genre_ids: genres,
      isDocumentary: genres.includes(99),
      isTvMovie: genres.includes(10770),
      isShort: false, // set after runtime enrichment
    });
  }
  await enrichRuntimes(items);
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

  // TMDB person id -> our library person id, so the real director can be linked
  const peopleByTmdb = new Map(
    db.prepare('SELECT id, tmdb_id FROM people WHERE tmdb_id IS NOT NULL').all().map((r) => [r.tmdb_id, r.id])
  );

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
  let ei = 0;
  async function enrichWorker() {
    for (;;) {
      const i = ei++;
      if (i >= out.length) return;
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
