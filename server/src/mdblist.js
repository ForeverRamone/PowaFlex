import { db, getSetting, setSetting } from './db.js';

const BASE = process.env.MDBLIST_BASE || 'https://api.mdblist.com';
const WEEK = 7 * 24 * 3600 * 1000;

function apiKey() {
  const k = getSetting('mdblist_key') || '';
  if (!k) throw new Error('MDBList no configurado (falta API key)');
  return k;
}

async function mdbFetch(path, { method = 'GET', body = null, params = {} } = {}) {
  const qs = new URLSearchParams({ apikey: apiKey(), ...params });
  const res = await fetch(`${BASE}${path}?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : null,
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 429) throw new Error('MDBList: límite de peticiones alcanzado (429)');
  if (!res.ok) throw new Error(`MDBList ${res.status} en ${path}`);
  return res.json();
}

export async function mdbTest() {
  const u = await mdbFetch('/user');
  return {
    ok: true,
    user: u.user_name || u.username || null,
    patron: u.patron_status || u.patreon_status || (u.is_supporter ? 'supporter' : null),
    limit: u.api_requests ?? null,
    usedToday: u.api_requests_count ?? null,
  };
}

// --- daily budget by account tier ---------------------------------------------

function dailyBudget() {
  const tier = getSetting('mdblist_tier') || 'auto';
  if (tier === 'free') return 900;
  if (tier === 'supporter') return 20000;
  // auto: use the limit reported by /user (cached in settings by mdbTest callers)
  const cached = Number(getSetting('mdblist_detected_limit') || 0);
  return cached > 1000 ? Math.floor(cached * 0.8) : 900;
}

function usage() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const u = JSON.parse(getSetting('mdblist_usage') || '{}');
    if (u.date === today) return u;
  } catch {}
  return { date: today, count: 0 };
}

function addUsage(n) {
  const u = usage();
  u.count += n;
  setSetting('mdblist_usage', JSON.stringify(u));
}

export function remainingBudget() {
  return Math.max(0, dailyBudget() - usage().count);
}

// --- ratings ------------------------------------------------------------------

const upsertRating = db.prepare(`
INSERT INTO mdb_ratings (tmdb_id, imdb, imdb_votes, rt_critic, rt_audience, metacritic, letterboxd, trakt, score, json, fetched_at)
VALUES (@tmdb_id, @imdb, @imdb_votes, @rt_critic, @rt_audience, @metacritic, @letterboxd, @trakt, @score, @json, @fetched_at)
ON CONFLICT(tmdb_id) DO UPDATE SET imdb=excluded.imdb, imdb_votes=excluded.imdb_votes,
  rt_critic=excluded.rt_critic, rt_audience=excluded.rt_audience, metacritic=excluded.metacritic,
  letterboxd=excluded.letterboxd, trakt=excluded.trakt, score=excluded.score,
  json=excluded.json, fetched_at=excluded.fetched_at`);

function parseItem(item) {
  const tmdbId = item?.ids?.tmdb ?? item?.tmdbid ?? item?.id;
  if (!tmdbId) return null;
  const src = {};
  for (const r of item.ratings || []) {
    if (r?.source) src[r.source] = r;
  }
  const val = (name) => (src[name]?.value ?? null);
  return {
    tmdb_id: Number(tmdbId),
    imdb: val('imdb'),
    imdb_votes: src.imdb?.votes ?? null,
    rt_critic: val('tomatoes'),
    rt_audience: val('tomatoesaudience'),
    metacritic: val('metacritic'),
    letterboxd: val('letterboxd'),
    trakt: val('trakt'),
    score: item.score_average ?? item.score ?? null,
    json: JSON.stringify(item.ratings || []),
    fetched_at: Date.now(),
  };
}

/**
 * Fetch ratings for up to ~100 TMDB ids. Tries the batch endpoint first and
 * falls back to per-title GETs if the instance doesn't accept it.
 */
export async function fetchRatingsBatch(tmdbIds) {
  let items = null;
  try {
    const res = await mdbFetch('/tmdb/movie', { method: 'POST', body: { ids: tmdbIds } });
    items = Array.isArray(res) ? res : res.movies || res.results || null;
  } catch {
    items = null;
  }
  if (!items) {
    items = [];
    for (const id of tmdbIds) {
      try {
        items.push(await mdbFetch(`/tmdb/movie/${id}`));
      } catch {}
    }
  }
  addUsage(tmdbIds.length);
  const parsed = items.map(parseItem).filter(Boolean);
  const tx = db.transaction(() => {
    for (const p of parsed) upsertRating.run(p);
  });
  tx();
  return parsed;
}

export const mdbSyncStatus = {
  running: false,
  total: 0,
  done: 0,
  error: null,
  finishedAt: null,
};

/**
 * Sync ratings for the library: first movies without ratings, then the stalest
 * (older than a week), bounded by the tier's remaining daily budget.
 */
export async function syncRatings() {
  if (mdbSyncStatus.running) return mdbSyncStatus;
  Object.assign(mdbSyncStatus, { running: true, total: 0, done: 0, error: null, finishedAt: null });
  try {
    apiKey();
    const cutoff = Date.now() - WEEK;
    const pending = db
      .prepare(
        `SELECT DISTINCT m.tmdb_id FROM movies m
         LEFT JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
         WHERE m.tmdb_id IS NOT NULL AND (r.tmdb_id IS NULL OR r.fetched_at < ?)
         ORDER BY r.fetched_at IS NOT NULL, r.fetched_at`
      )
      .all(cutoff)
      .map((r) => r.tmdb_id);

    const budget = remainingBudget();
    const work = pending.slice(0, budget);
    mdbSyncStatus.total = work.length;

    for (let i = 0; i < work.length; i += 100) {
      await fetchRatingsBatch(work.slice(i, i + 100));
      mdbSyncStatus.done = Math.min(i + 100, work.length);
    }
  } catch (err) {
    mdbSyncStatus.error = String(err.message || err);
  } finally {
    mdbSyncStatus.running = false;
    mdbSyncStatus.finishedAt = Date.now();
  }
  return mdbSyncStatus;
}

export function ratingsCoverage() {
  const total = db.prepare('SELECT COUNT(DISTINCT tmdb_id) n FROM movies WHERE tmdb_id IS NOT NULL').get().n;
  const withRatings = db
    .prepare(
      `SELECT COUNT(DISTINCT m.tmdb_id) n FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id`
    )
    .get().n;
  return { total, withRatings, remainingBudget: remainingBudget(), usedToday: usage().count };
}

/**
 * Attach cached mdblist scores to arbitrary TMDB items (used by Descubrir);
 * fetches uncached ones if budget allows.
 */
export async function enrichWithScores(items, { fetchMissing = true, maxFetch = 300 } = {}) {
  const ids = [...new Set(items.map((i) => i.tmdb_id).filter(Boolean))];
  if (!ids.length) return items;
  const rows = new Map(
    db
      .prepare(`SELECT tmdb_id, imdb, rt_critic, letterboxd, score FROM mdb_ratings
                WHERE tmdb_id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids)
      .map((r) => [r.tmdb_id, r])
  );
  if (fetchMissing) {
    try {
      apiKey();
      const missing = ids.filter((id) => !rows.has(id)).slice(0, Math.min(maxFetch, remainingBudget()));
      for (let i = 0; i < missing.length; i += 100) {
        for (const p of await fetchRatingsBatch(missing.slice(i, i + 100))) {
          rows.set(p.tmdb_id, p);
        }
      }
    } catch {}
  }
  for (const item of items) {
    const r = rows.get(item.tmdb_id);
    if (r) {
      item.mdb = { imdb: r.imdb, rt_critic: r.rt_critic, letterboxd: r.letterboxd, score: r.score };
    }
  }
  return items;
}

// --- insights (B) ---------------------------------------------------------------

export function insights() {
  const all = (sql) => db.prepare(sql).all();
  // "Your rating" is your Letterboxd rating (0–5) scaled to 0–10 — the Plex
  // personal rating was removed in v0.5.
  const MINE = `(SELECT MAX(rating) * 2 FROM lb_entries WHERE movie_id = m.rating_key AND rating IS NOT NULL)`;
  return {
    // you love them, critics don't
    hiddenGems: all(
      `SELECT m.rating_key, m.title, m.year, m.thumb, ${MINE} AS my_rating, r.rt_critic, r.imdb, r.letterboxd, r.score AS mdb_score
       FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE ${MINE} >= 8 AND r.rt_critic IS NOT NULL AND r.rt_critic <= 55
       ORDER BY my_rating DESC, r.rt_critic ASC LIMIT 24`
    ),
    // critical consensus you haven't watched
    consensusUnwatched: all(
      `SELECT m.rating_key, m.title, m.year, m.thumb, r.rt_critic, r.metacritic, r.imdb, r.letterboxd, r.score AS mdb_score, r.score
       FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE (m.view_count IS NULL OR m.view_count = 0) AND r.score IS NOT NULL
       ORDER BY r.score DESC LIMIT 24`
    ),
    // the world loves them, you don't
    overrated: all(
      `SELECT m.rating_key, m.title, m.year, m.thumb, ${MINE} AS my_rating, r.score, r.imdb, r.letterboxd, r.score AS mdb_score, r.rt_audience
       FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE ${MINE} IS NOT NULL AND ${MINE} <= 5 AND r.score >= 75
       ORDER BY r.score DESC LIMIT 24`
    ),
    // your taste vs the letterboxd community
    letterboxdDivergence: all(
      `SELECT m.rating_key, m.title, m.year, m.thumb, ${MINE} AS my_rating, r.letterboxd, r.imdb, r.score AS mdb_score,
              ABS(${MINE} - r.letterboxd * 2) AS diff
       FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE ${MINE} IS NOT NULL AND r.letterboxd IS NOT NULL AND ABS(${MINE} - r.letterboxd * 2) >= 3
       ORDER BY diff DESC LIMIT 24`
    ),
  };
}

// --- lists (C) --------------------------------------------------------------------

export async function searchLists(query) {
  const res = await mdbFetch('/lists/search', { params: { query } });
  addUsage(1);
  const arr = Array.isArray(res) ? res : res.lists || res.results || [];
  return arr.map((l) => ({
    mdb_id: l.id,
    name: l.name,
    slug: l.slug,
    user_name: l.user_name || l.user || null,
    item_count: l.items ?? l.item_count ?? null,
    likes: l.likes ?? null,
  }));
}

async function fetchListInfoByPath(userName, slug) {
  const res = await mdbFetch(`/lists/${userName}/${slug}`);
  addUsage(1);
  const l = Array.isArray(res) ? res[0] : res;
  if (!l?.id) throw new Error('Lista no encontrada en MDBList');
  return l;
}

async function fetchListItems(mdbId) {
  const items = [];
  let offset = 0;
  const LIMIT = 1000;
  for (;;) {
    const res = await mdbFetch(`/lists/${mdbId}/items`, { params: { limit: LIMIT, offset } });
    addUsage(1);
    const movies = Array.isArray(res) ? res : res.movies || [];
    for (const it of movies) {
      const tmdbId = it?.ids?.tmdb ?? it?.tmdb_id ?? it?.id;
      if (!tmdbId) continue;
      items.push({
        tmdb_id: Number(tmdbId),
        rank: it.rank ?? null,
        title: it.title || '',
        year: it.release_year ?? it.year ?? null,
        imdb_id: it.imdb_id || null,
      });
    }
    if (movies.length < LIMIT) break;
    offset += LIMIT;
    if (offset > 20000) break; // safety
  }
  return items;
}

export async function addList({ url = null, mdbId = null, name = null, slug = null, userName = null }) {
  let info;
  if (url) {
    const m = /mdblist\.com\/lists\/([^/]+)\/([^/?#]+)/.exec(url);
    if (!m) throw new Error('URL de lista no reconocida (esperaba mdblist.com/lists/usuario/lista)');
    info = await fetchListInfoByPath(m[1], m[2]);
  } else if (mdbId) {
    info = { id: mdbId, name, slug, user_name: userName, items: null };
  } else {
    throw new Error('Falta url o mdbId');
  }

  const items = await fetchListItems(info.id);
  const listUrl =
    url || (info.user_name && info.slug ? `https://mdblist.com/lists/${info.user_name}/${info.slug}` : null);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO mdb_lists (mdb_id, name, slug, user_name, url, item_count, added_at, refreshed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mdb_id) DO UPDATE SET name=excluded.name, item_count=excluded.item_count, refreshed_at=excluded.refreshed_at`
    ).run(info.id, info.name || name || 'Lista', info.slug || slug, info.user_name || userName, listUrl, items.length, Date.now(), Date.now());
    const listId = db.prepare('SELECT id FROM mdb_lists WHERE mdb_id = ?').get(info.id).id;
    db.prepare('DELETE FROM mdb_list_items WHERE list_id = ?').run(listId);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO mdb_list_items (list_id, tmdb_id, rank, title, year, imdb_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const it of items) ins.run(listId, it.tmdb_id, it.rank, it.title, it.year, it.imdb_id);
    return listId;
  });
  return { listId: tx(), items: items.length };
}

export function savedLists() {
  return db
    .prepare(
      `SELECT l.*, COUNT(i.tmdb_id) AS items,
              SUM(CASE WHEN m.tmdb_id IS NOT NULL THEN 1 ELSE 0 END) AS owned
       FROM mdb_lists l
       LEFT JOIN mdb_list_items i ON i.list_id = l.id
       LEFT JOIN (SELECT DISTINCT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL) m ON m.tmdb_id = i.tmdb_id
       GROUP BY l.id ORDER BY l.added_at DESC`
    )
    .all();
}

export function listDetail(listId) {
  const list = db.prepare('SELECT * FROM mdb_lists WHERE id = ?').get(listId);
  if (!list) return null;
  const items = db
    .prepare(
      `SELECT i.*, m.rating_key, (m.tmdb_id IS NOT NULL) AS owned, mv.view_count,
              r.imdb, r.score
       FROM mdb_list_items i
       LEFT JOIN (SELECT DISTINCT tmdb_id, MIN(rating_key) rating_key FROM movies WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id) m ON m.tmdb_id = i.tmdb_id
       LEFT JOIN movies mv ON mv.rating_key = m.rating_key
       LEFT JOIN mdb_ratings r ON r.tmdb_id = i.tmdb_id
       WHERE i.list_id = ?
       ORDER BY COALESCE(i.rank, 999999), i.title`
    )
    .all(listId);
  return { list, items };
}

export function deleteList(listId) {
  db.prepare('DELETE FROM mdb_list_items WHERE list_id = ?').run(listId);
  db.prepare('DELETE FROM mdb_lists WHERE id = ?').run(listId);
}
