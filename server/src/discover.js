import { db, cacheRead, cacheWrite, getSetting } from './db.js';
import { personCredits, findPersonInfo, resolvePerson, enrichRuntimes, setBuildProgress, clearBuildProgress } from './tmdb.js';
import { enrichWithScores } from './mdblist.js';
import { matchMovie } from './letterboxd.js';

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

async function applyScores(people, perPerson) {
  if (!getSetting('mdblist_key')) return;
  const all = people.flatMap((p) => p.missing);
  await enrichWithScores(all, { maxFetch: 300 });
  for (const p of people) {
    p.missing.sort((a, b) => rankKey(b) - rankKey(a));
    p.missing = p.missing.slice(0, perPerson);
  }
}

const HOUR = 3600 * 1000;

// Canonical "great directors" checklist for a completist collection.
export const GREAT_DIRECTORS = [
  // Japón
  'Akira Kurosawa', 'Yasujirō Ozu', 'Kenji Mizoguchi', 'Masaki Kobayashi', 'Shohei Imamura',
  'Nagisa Ōshima', 'Hayao Miyazaki', 'Isao Takahata', 'Hirokazu Kore-eda', 'Kiyoshi Kurosawa',
  // Europa clásica
  'Ingmar Bergman', 'Federico Fellini', 'Michelangelo Antonioni', 'Luchino Visconti',
  'Vittorio De Sica', 'Roberto Rossellini', 'Pier Paolo Pasolini', 'Sergio Leone',
  'Andrei Tarkovsky', 'Sergei Eisenstein', 'Carl Theodor Dreyer', 'F.W. Murnau', 'Fritz Lang',
  'Jean Renoir', 'Robert Bresson', 'Jean-Pierre Melville', 'Jean-Luc Godard',
  'François Truffaut', 'Éric Rohmer', 'Claude Chabrol', 'Alain Resnais', 'Agnès Varda',
  'Henri-Georges Clouzot', 'Jacques Tati', 'Chantal Akerman', 'Rainer Werner Fassbinder',
  'Werner Herzog', 'Wim Wenders', 'Michael Haneke', 'Krzysztof Kieślowski', 'Andrzej Wajda',
  'Roman Polanski', 'Miloš Forman', 'Béla Tarr', 'Theo Angelopoulos', 'Bernardo Bertolucci',
  // España e Iberoamérica
  'Luis Buñuel', 'Pedro Almodóvar', 'Víctor Erice', 'Luis García Berlanga', 'Carlos Saura',
  'Lucrecia Martel', 'Glauber Rocha', 'Alejandro González Iñárritu', 'Alfonso Cuarón',
  'Guillermo del Toro',
  // Hollywood y anglosfera
  'Alfred Hitchcock', 'Stanley Kubrick', 'Orson Welles', 'John Ford', 'Howard Hawks',
  'Billy Wilder', 'Charlie Chaplin', 'Buster Keaton', 'David Lean', 'Michael Powell',
  'Carol Reed', 'John Cassavetes', 'Robert Altman', 'Martin Scorsese', 'Francis Ford Coppola',
  'Steven Spielberg', 'Brian De Palma', 'Terrence Malick', 'David Lynch', 'David Cronenberg',
  'John Carpenter', 'Clint Eastwood', 'Woody Allen', 'Sidney Lumet', 'Mike Leigh', 'Ken Loach',
  'Nicolas Roeg', 'Terry Gilliam', 'Ridley Scott', 'David Fincher', 'Christopher Nolan',
  'Paul Thomas Anderson', 'Wes Anderson', 'Joel Coen', 'Quentin Tarantino', 'Denis Villeneuve',
  'Kathryn Bigelow', 'Spike Lee', 'Jim Jarmusch',
  // Asia y otros
  'Wong Kar-wai', 'Hou Hsiao-hsien', 'Edward Yang', 'Zhang Yimou', 'Jia Zhangke',
  'Bong Joon-ho', 'Park Chan-wook', 'Lee Chang-dong', 'Hong Sang-soo', 'Satyajit Ray',
  'Abbas Kiarostami', 'Asghar Farhadi', 'Nuri Bilge Ceylan', 'Aleksandr Sokurov',
  'Andrey Zvyagintsev', 'Claire Denis', 'Leos Carax',
];

const libraryTmdbIds = () =>
  new Set(db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id));

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * For the library's top people of a role, aggregate their missing (released,
 * not-owned) films, ranked by TMDB vote count.
 */
export async function libraryGaps({ role = 'director', people = 20, perPerson = 8, refresh = false } = {}) {
  const cacheKey = `discover_gaps:${role}:${people}:${perPerson}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 12 * HOUR);
    if (hit) return hit;
  }

  const minVotes = role === 'actor' ? 100 : 20; // filter cameo/obscure noise
  const tops = db
    .prepare(
      `SELECT p.id, p.name, COUNT(*) n FROM movie_people mp
       JOIN people p ON p.id = mp.person_id
       WHERE mp.role = ? GROUP BY p.id ORDER BY n DESC LIMIT ?`
    )
    .all(role, people);

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
            ...genreFlags(c.genre_ids),
          });
        }
        missing.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        if (missing.length) {
          out.push({
            id: p.id,
            name: p.name,
            inLibrary: p.n,
            released,
            owned,
            pct: released ? Math.round((owned / released) * 100) : 0,
            missingTotal: missing.length,
            // keep a few extra so the mdblist re-rank can promote better films
            missing: missing.slice(0, perPerson * 2),
          });
        }
      } catch (err) {
        errors.push(`${p.name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));

  out.sort((a, b) => b.inLibrary - a.inLibrary);
  await applyScores(out, perPerson);
  // runtime pass so shorts can be hidden alongside docs/TV
  await enrichRuntimes(out.flatMap((p) => p.missing));
  clearBuildProgress('discover');
  const result = { generatedAt: Date.now(), role, people: out, errors: errors.slice(0, 5) };
  if (out.length || !errors.length) cacheWrite(cacheKey, result);
  return result;
}

/**
 * Gaps for the people YOU chose as favorites (#17) — clearer than an arbitrary
 * "top by count". Uses each person's dominant role.
 */
export async function favoritesGaps({ perPerson = 8, refresh = false } = {}) {
  const cacheKey = `discover_favorites:${perPerson}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 6 * HOUR);
    if (hit) return hit;
  }
  const tracked = db
    .prepare(
      `SELECT p.id, p.name,
              SUM(CASE WHEN mp.role='director' THEN 1 ELSE 0 END) directed,
              SUM(CASE WHEN mp.role='actor' THEN 1 ELSE 0 END) acted
       FROM tracked_people t JOIN people p ON p.id = t.person_id
       LEFT JOIN movie_people mp ON mp.person_id = p.id
       GROUP BY p.id ORDER BY p.name`
    )
    .all();

  const inLib = libraryTmdbIds();
  const now = today();
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
      const role = (p.directed || 0) >= (p.acted || 0) ? 'director' : 'actor';
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
        const missing = [];
        const minVotes = role === 'actor' ? 100 : 20;
        for (const c of raw) {
          if (c.video || seen.has(c.id)) continue;
          seen.add(c.id);
          if (!c.release_date || c.release_date > now) continue;
          released++;
          if (ownsFilm(c, inLib)) { owned++; continue; }
          if ((c.vote_count || 0) < minVotes) continue;
          missing.push({
            tmdb_id: c.id, title: c.title, date: c.release_date, poster_path: c.poster_path,
            vote: c.vote_average, votes: c.vote_count, released: true, owned: false,
            ...genreFlags(c.genre_ids),
          });
        }
        missing.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        if (missing.length)
          out.push({
            id: p.id, name: p.name, role, released, owned,
            pct: released ? Math.round((owned / released) * 100) : 0,
            missingTotal: missing.length, missing: missing.slice(0, perPerson * 2),
          });
      } catch (err) {
        errors.push(`${p.name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));

  out.sort((a, b) => b.missingTotal - a.missingTotal);
  await applyScores(out, perPerson);
  await enrichRuntimes(out.flatMap((pp) => pp.missing));
  clearBuildProgress('discover');
  const result = { generatedAt: Date.now(), people: out, tracked: tracked.length, errors: errors.slice(0, 5) };
  if (out.length || !errors.length) cacheWrite(cacheKey, result);
  return result;
}

/**
 * Great directors with ZERO films in the library, with their essential
 * (most-voted) films as suggestions.
 */
export async function absentGreats({ perPerson = 6, refresh = false } = {}) {
  const cacheKey = `discover_absent:${perPerson}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 24 * HOUR);
    if (hit) return hit;
  }

  const countStmt = db.prepare(
    `SELECT COUNT(*) n FROM movie_people mp JOIN people p ON p.id = mp.person_id
     WHERE mp.role = 'director' AND p.name = ? COLLATE NOCASE`
  );
  const inLib = libraryTmdbIds();
  const now = today();
  const absent = [];
  const present = [];
  const errors = [];

  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= GREAT_DIRECTORS.length) return;
      const name = GREAT_DIRECTORS[i];
      try {
        const count = countStmt.get(name).n;
        if (count > 0) {
          present.push({ name, inLibrary: count });
          continue;
        }
        const info = await findPersonInfo(name, 'Directing');
        if (!info.id) continue;
        const credits = await personCredits(info.id);
        const seen = new Set();
        const films = [];
        for (const c of credits.crew || []) {
          if (c.job !== 'Director' || c.video || seen.has(c.id)) continue;
          seen.add(c.id);
          if (!c.release_date || c.release_date > now) continue;
          films.push({
            tmdb_id: c.id,
            title: c.title,
            date: c.release_date,
            poster_path: c.poster_path,
            vote: c.vote_average,
            votes: c.vote_count,
            released: true,
            owned: ownsFilm(c, inLib),
            ...genreFlags(c.genre_ids),
          });
        }
        films.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        const top = films.filter((f) => !f.owned).slice(0, perPerson);
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
    checked: GREAT_DIRECTORS.length,
    absent,
    present,
    errors: errors.slice(0, 5),
  };
  if (absent.length || !errors.length) cacheWrite(cacheKey, result);
  return result;
}
