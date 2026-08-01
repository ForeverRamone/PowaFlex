import { db, cacheRead, cacheWrite, getSetting } from './db.js';
import { personCredits, findPersonInfo, resolvePerson, enrichRuntimes, setBuildProgress, clearBuildProgress } from './tmdb.js';
import { enrichWithScores } from './mdblist.js';
import { matchMovie, watchedIndex, isWatched } from './letterboxd.js';
import { TSPDT_DIRECTORS, TSPDT_21C_DIRECTORS } from './data/tspdt-directors.js';

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

const genreFlags = (ids = []) => ({
  genre_ids: ids,
  isDocumentary: ids.includes(99),
  isTvMovie: ids.includes(10770),
  isShort: false,
});

// prefer the mdblist multi-platform score; fall back to TMDB vote volume
const rankKey = (i) => (i.mdb?.score != null ? i.mdb.score * 10000 : Math.min(9999, i.votes || 0));

async function applyScores(people) {
  if (!getSetting('mdblist_key')) return;
  const all = people.flatMap((p) => p.missing);
  await enrichWithScores(all, { maxFetch: 300 });
  for (const p of people) p.missing.sort((a, b) => rankKey(b) - rankKey(a));
}

// Actor credits: a billing order deep in the credits or a "Self"-style
// character is a cameo, not a role a completist needs to fill.
const CAMEO_RE = /^(self|himself|herself|uncredited|cameo|archive)/i;
const isCameoCredit = (c) => (c.order ?? 99) >= 15 || CAMEO_RE.test(c.character || '');

// user-configurable noise thresholds (Ajustes), with the historical defaults
const minVotesFor = (role) =>
  Number(getSetting(role === 'actor' ? 'gaps_min_votes_actor' : 'gaps_min_votes_director')) ||
  (role === 'actor' ? 100 : 20);

const dismissedIds = () =>
  new Set(db.prepare('SELECT tmdb_id FROM dismissed_movies').all().map((r) => r.tmdb_id));

const isNoise = (m) => !!(m.isShort || m.isDocumentary || m.isTvMovie || m.isCameo);

// Noise (shorts/docs/TV/cameos) used to eat the per-person quota BEFORE the
// client-side filters hid it, leaving "12 te faltan" over 3 visible cards.
// Resolve runtimes before the cut, fill the quota with features, and keep the
// noise alongside (capped) so the client toggles still have data to reveal.
async function finishMissing(people, perPerson) {
  await applyScores(people);
  const all = people.flatMap((p) => p.missing);
  await enrichRuntimes(all);
  applyWatched(all);
  for (const p of people) {
    const features = p.missing.filter((m) => !isNoise(m));
    const noise = p.missing.filter(isNoise);
    p.missing = [...features.slice(0, perPerson), ...noise.slice(0, perPerson)];
  }
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
};
// back-compat default export (all-time)
export const GREAT_DIRECTORS = CANONS.alltime.names;

const libraryTmdbIds = () =>
  new Set(db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id));

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * For the library's top people of a role, aggregate their missing (released,
 * not-owned) films, ranked by TMDB vote count.
 */
export async function libraryGaps({ role = 'director', people = 20, perPerson = 8, offset = 0, refresh = false } = {}) {
  const cacheKey = `discover_gaps:v3:${role}:${people}:${perPerson}:${offset}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 12 * HOUR);
    if (hit) return hit;
  }

  const minVotes = minVotesFor(role);
  const dismissed = dismissedIds();
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

  setBuildProgress('discover', 'Cruzando filmografías', 0, tops.length);
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= tops.length) return;
      setBuildProgress('discover', 'Cruzando filmografías', i + 1, tops.length);
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
        for (const c of raw) {
          if (c.video || seen.has(c.id)) continue;
          seen.add(c.id);
          const isReleased = !!c.release_date && c.release_date <= now;
          if (!isReleased) continue;
          released++;
          if (ownsFilm(c, inLib)) {
            owned++;
            continue;
          }
          if (dismissed.has(c.id)) {
            dismissedN++;
            continue;
          }
          if ((c.vote_count || 0) < minVotes) continue;
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
  clearBuildProgress('discover');
  const result = {
    generatedAt: Date.now(), role, people: out,
    offset, pageSize: people, totalPeople,
    hasMore: offset + tops.length < Math.min(totalPeople, 500),
    errors: errors.slice(0, 5),
  };
  if (out.length || !errors.length) cacheWrite(cacheKey, result);
  return result;
}

/**
 * Gaps for the people YOU chose as favorites (#17) — clearer than an arbitrary
 * "top by count", and strictly in the role you follow them for.
 */
export async function favoritesGaps({ perPerson = 8, refresh = false, role: onlyRole = null } = {}) {
  const cacheKey = `discover_favorites:v3:${onlyRole || 'all'}:${perPerson}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 6 * HOUR);
    if (hit) return hit;
  }
  // the role you follow them FOR is explicit now: a favorite director never
  // brings in their acting credits, which is what mixed up the gaps before
  const tracked = db
    .prepare(
      `SELECT p.id, p.name, p.thumb, p.deathday, COALESCE(t.role, 'director') AS role,
              SUM(CASE WHEN mp.role = COALESCE(t.role, 'director') THEN 1 ELSE 0 END) inLibrary
       FROM tracked_people t JOIN people p ON p.id = t.person_id
       LEFT JOIN movie_people mp ON mp.person_id = p.id
       WHERE (? IS NULL OR COALESCE(t.role, 'director') = ?)
       GROUP BY p.id ORDER BY p.name`
    )
    .all(onlyRole, onlyRole);

  const inLib = libraryTmdbIds();
  const now = today();
  const dismissed = dismissedIds();
  const out = [];
  const errors = [];
  setBuildProgress('discover', 'Cruzando filmografías de tus favoritos', 0, tracked.length);
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= tracked.length) return;
      setBuildProgress('discover', 'Cruzando filmografías de tus favoritos', i + 1, tracked.length);
      const p = tracked[i];
      const role = p.role === 'actor' ? 'actor' : 'director';
      try {
        const resolved = await resolvePerson(p.id);
        if (!resolved?.tmdb_id) continue;
        const credits = await personCredits(resolved.tmdb_id);
        const raw =
          role === 'director'
            ? (credits.crew || []).filter((c) => c.job === 'Director')
            : credits.cast || [];
        const seen = new Set();
        let released = 0;
        let owned = 0;
        let dismissedN = 0;
        const missing = [];
        const minVotes = minVotesFor(role);
        for (const c of raw) {
          if (c.video || seen.has(c.id)) continue;
          seen.add(c.id);
          if (!c.release_date || c.release_date > now) continue;
          released++;
          if (ownsFilm(c, inLib)) { owned++; continue; }
          if (dismissed.has(c.id)) { dismissedN++; continue; }
          if ((c.vote_count || 0) < minVotes) continue;
          missing.push({
            tmdb_id: c.id, title: c.title, date: c.release_date, poster_path: c.poster_path,
            vote: c.vote_average, votes: c.vote_count, released: true, owned: false,
            character: role === 'actor' ? c.character || null : null,
            isCameo: role === 'actor' ? isCameoCredit(c) : false,
            ...genreFlags(c.genre_ids),
          });
        }
        missing.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        // everyone is returned, including complete filmographies (missing: []),
        // so Favoritos can show "✓ completo" instead of just dropping them
        out.push({
          id: p.id, name: p.name, thumb: p.thumb, deathday: p.deathday,
          role, released, owned, inLibrary: p.inLibrary || 0,
          pct: released ? Math.round((owned / released) * 100) : 0,
          missingTotal: missing.length,
          noiseTotal: missing.filter(isNoise).length,
          dismissed: dismissedN,
          missing: missing.slice(0, perPerson * 3),
        });
      } catch (err) {
        errors.push(`${p.name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));

  out.sort((a, b) => b.missingTotal - a.missingTotal);
  await finishMissing(out, perPerson);
  clearBuildProgress('discover');
  const result = { generatedAt: Date.now(), people: out, tracked: tracked.length, errors: errors.slice(0, 5) };
  if (out.length || !errors.length) cacheWrite(cacheKey, result);
  return result;
}

/**
 * Great directors with ZERO films in the library, with their essential
 * (most-voted) films as suggestions.
 */
export async function absentGreats({ perPerson = 6, refresh = false, canon = 'alltime' } = {}) {
  const names = (CANONS[canon] || CANONS.alltime).names;
  const cacheKey = `discover_absent:v2:${canon}:${perPerson}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 24 * HOUR);
    if (hit) return hit;
  }

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
  if (absent.length || !errors.length) cacheWrite(cacheKey, result);
  return result;
}
