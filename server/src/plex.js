import { db, getSetting } from './db.js';

// --- low-level client -------------------------------------------------------

export function plexConfig() {
  const url = (getSetting('plex_url') || '').replace(/\/+$/, '');
  const token = getSetting('plex_token') || '';
  return { url, token };
}

export async function plexGet(path, params = {}, { timeoutMs = 30000 } = {}) {
  const { url, token } = plexConfig();
  if (!url || !token) throw new Error('Plex no configurado (URL o token vacíos)');
  const qs = new URLSearchParams(params);
  const full = `${url}${path}${path.includes('?') ? '&' : '?'}${qs}`;
  const res = await fetch(full, {
    headers: { 'X-Plex-Token': token, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Plex ${res.status} en ${path}`);
  return res.json();
}

export async function plexTest() {
  const data = await plexGet('/');
  const mc = data.MediaContainer || {};
  return { ok: true, name: mc.friendlyName, version: mc.version, platform: mc.platform };
}

export async function movieSections() {
  const data = await plexGet('/library/sections');
  return (data.MediaContainer?.Directory || [])
    .filter((d) => d.type === 'movie')
    .map((d) => ({ id: Number(d.key), title: d.title }));
}

// --- sync -------------------------------------------------------------------

export const syncStatus = {
  running: false,
  phase: 'idle', // idle | listing | details | cleanup | done | error
  section: null,
  total: 0,
  done: 0,
  detailTotal: 0,
  detailDone: 0,
  startedAt: null,
  finishedAt: null,
  error: null,
};

function guidToIds(guids = []) {
  let tmdb = null;
  let imdb = null;
  for (const g of guids) {
    const id = g.id || '';
    if (id.startsWith('tmdb://')) tmdb = Number(id.slice(7)) || null;
    if (id.startsWith('imdb://')) imdb = id.slice(7);
  }
  return { tmdb, imdb };
}

const upsertMovie = db.prepare(`
INSERT INTO movies (rating_key, section_id, title, sort_title, original_title, year, release_date,
  added_at, updated_at, last_viewed_at, view_count, user_rating, audience_rating, critic_rating,
  duration_ms, content_rating, studio, tagline, summary, tmdb_id, imdb_id, thumb, art,
  resolution, video_codec, audio_codec, audio_channels, container, size_bytes, bitrate, media_count, edition, file_path, full_synced)
VALUES (@rating_key, @section_id, @title, @sort_title, @original_title, @year, @release_date,
  @added_at, @updated_at, @last_viewed_at, @view_count, @user_rating, @audience_rating, @critic_rating,
  @duration_ms, @content_rating, @studio, @tagline, @summary, @tmdb_id, @imdb_id, @thumb, @art,
  @resolution, @video_codec, @audio_codec, @audio_channels, @container, @size_bytes, @bitrate, @media_count, @edition, @file_path,
  COALESCE((SELECT CASE WHEN full_synced = 1 AND updated_at = @updated_at THEN 1 ELSE 0 END
            FROM movies WHERE rating_key = @rating_key), 0))
ON CONFLICT(rating_key) DO UPDATE SET
  section_id = excluded.section_id, title = excluded.title, sort_title = excluded.sort_title,
  original_title = excluded.original_title, year = excluded.year, release_date = excluded.release_date,
  added_at = excluded.added_at, last_viewed_at = excluded.last_viewed_at,
  view_count = excluded.view_count, user_rating = excluded.user_rating,
  audience_rating = excluded.audience_rating, critic_rating = excluded.critic_rating,
  duration_ms = excluded.duration_ms, content_rating = excluded.content_rating,
  studio = excluded.studio, tagline = excluded.tagline, summary = excluded.summary,
  tmdb_id = excluded.tmdb_id, imdb_id = excluded.imdb_id, thumb = excluded.thumb, art = excluded.art,
  resolution = excluded.resolution, video_codec = excluded.video_codec,
  audio_codec = excluded.audio_codec, audio_channels = excluded.audio_channels,
  container = excluded.container, size_bytes = excluded.size_bytes, bitrate = excluded.bitrate,
  media_count = excluded.media_count, edition = excluded.edition, file_path = excluded.file_path,
  full_synced = CASE WHEN movies.updated_at = excluded.updated_at THEN movies.full_synced ELSE 0 END,
  updated_at = excluded.updated_at
`);

const personIdByName = db.prepare('SELECT id FROM people WHERE name = ?');
const insertPerson = db.prepare('INSERT INTO people (name, thumb) VALUES (?, ?)');
const updatePersonThumb = db.prepare('UPDATE people SET thumb = COALESCE(?, thumb) WHERE id = ?');
const insertMoviePerson = db.prepare(
  'INSERT OR REPLACE INTO movie_people (movie_id, person_id, role, character, ord) VALUES (?, ?, ?, ?, ?)'
);
const deleteMoviePeople = db.prepare('DELETE FROM movie_people WHERE movie_id = ?');

const tagIdStmt = db.prepare('SELECT id FROM tags WHERE type = ? AND name = ?');
const insertTag = db.prepare('INSERT INTO tags (type, name) VALUES (?, ?)');
const insertMovieTag = db.prepare('INSERT OR IGNORE INTO movie_tags (movie_id, tag_id) VALUES (?, ?)');
const deleteMovieTags = db.prepare('DELETE FROM movie_tags WHERE movie_id = ?');

function ensurePerson(name, thumb) {
  const row = personIdByName.get(name);
  if (row) {
    if (thumb) updatePersonThumb.run(thumb, row.id);
    return row.id;
  }
  return insertPerson.run(name, thumb || null).lastInsertRowid;
}

function ensureTag(type, name) {
  const row = tagIdStmt.get(type, name);
  if (row) return row.id;
  return insertTag.run(type, name).lastInsertRowid;
}

function mediaInfo(mediaArr = []) {
  const m = mediaArr[0] || {};
  const parts = (m.Part || []);
  const p = parts[0] || {};
  let size = 0;
  for (const media of mediaArr) for (const part of media.Part || []) size += part.size || 0;
  return {
    resolution: m.videoResolution || null,
    video_codec: m.videoCodec || null,
    audio_codec: m.audioCodec || null,
    audio_channels: m.audioChannels || null,
    container: m.container || null,
    bitrate: m.bitrate || null,
    size_bytes: size || null,
    media_count: mediaArr.length,
    file_path: p.file || null,
  };
}

function baseRecord(v, sectionId) {
  const ids = guidToIds(v.Guid);
  const media = mediaInfo(v.Media);
  return {
    rating_key: Number(v.ratingKey),
    section_id: sectionId,
    title: v.title || '',
    sort_title: v.titleSort || v.title || '',
    original_title: v.originalTitle || null,
    year: v.year || null,
    release_date: v.originallyAvailableAt || null,
    added_at: v.addedAt || null,
    updated_at: v.updatedAt || v.addedAt || null,
    last_viewed_at: v.lastViewedAt || null,
    view_count: v.viewCount || 0,
    user_rating: v.userRating ?? null,
    audience_rating: v.audienceRating ?? null,
    critic_rating: v.rating ?? null,
    duration_ms: v.duration || null,
    content_rating: v.contentRating || null,
    studio: v.studio || null,
    tagline: v.tagline || null,
    summary: v.summary || null,
    tmdb_id: ids.tmdb,
    imdb_id: ids.imdb,
    thumb: v.thumb || null,
    art: v.art || null,
    edition: v.editionTitle || null,
    ...media,
  };
}

function applyDetail(ratingKey, meta) {
  const tx = db.transaction(() => {
    deleteMoviePeople.run(ratingKey);
    deleteMovieTags.run(ratingKey);

    const addPeople = (arr, role) => {
      (arr || []).forEach((t, i) => {
        if (!t.tag) return;
        const pid = ensurePerson(t.tag, t.thumb);
        insertMoviePerson.run(ratingKey, pid, role, t.role || null, i);
      });
    };
    addPeople(meta.Director, 'director');
    addPeople(meta.Writer, 'writer');
    addPeople(meta.Role, 'actor');
    addPeople(meta.Producer, 'producer');

    const addTags = (arr, type) => {
      for (const t of arr || []) {
        if (!t.tag) continue;
        insertMovieTag.run(ratingKey, ensureTag(type, t.tag));
      }
    };
    addTags(meta.Genre, 'genre');
    addTags(meta.Country, 'country');
    addTags(meta.Collection, 'collection');
    addTags(meta.Label, 'label');

    // HDR / Dolby Vision / bit depth from video streams
    let hdr = null;
    let bitDepth = null;
    for (const media of meta.Media || []) {
      for (const part of media.Part || []) {
        for (const s of part.Stream || []) {
          if (s.streamType !== 1) continue;
          bitDepth = bitDepth || s.bitDepth || null;
          if (s.DOVIPresent) hdr = 'Dolby Vision';
          else if (!hdr && (s.colorTrc === 'smpte2084' || s.colorTrc === 'arib-std-b67')) hdr = 'HDR10';
        }
      }
    }
    db.prepare('UPDATE movies SET hdr = ?, bit_depth = ?, full_synced = 1 WHERE rating_key = ?').run(
      hdr,
      bitDepth,
      ratingKey
    );
  });
  tx();
}

async function fetchDetail(ratingKey) {
  const data = await plexGet(`/library/metadata/${ratingKey}`, { includeGuids: 1 });
  return data.MediaContainer?.Metadata?.[0] || null;
}

export async function runSync({ force = false } = {}) {
  if (syncStatus.running) return syncStatus;
  Object.assign(syncStatus, {
    running: true,
    phase: 'listing',
    total: 0,
    done: 0,
    detailTotal: 0,
    detailDone: 0,
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
  });
  const logId = db
    .prepare('INSERT INTO sync_log (started_at, status) VALUES (?, ?)')
    .run(Date.now(), 'running').lastInsertRowid;

  try {
    const sections = await movieSections();
    if (!sections.length) throw new Error('No hay bibliotecas de películas en este servidor Plex');

    const seen = new Set();
    const PAGE = 240;

    for (const section of sections) {
      syncStatus.section = section.title;
      let start = 0;
      for (;;) {
        const data = await plexGet(`/library/sections/${section.id}/all`, {
          type: 1,
          includeGuids: 1,
          'X-Plex-Container-Start': start,
          'X-Plex-Container-Size': PAGE,
        });
        const mc = data.MediaContainer || {};
        const items = mc.Metadata || [];
        syncStatus.total = (mc.totalSize ?? items.length) + syncStatus.done;

        const tx = db.transaction(() => {
          for (const v of items) {
            upsertMovie.run(baseRecord(v, section.id));
            seen.add(Number(v.ratingKey));
          }
        });
        tx();
        syncStatus.done += items.length;
        start += PAGE;
        if (items.length < PAGE) break;
      }
    }

    // remove movies no longer in Plex
    syncStatus.phase = 'cleanup';
    const existing = db.prepare('SELECT rating_key FROM movies').all();
    const removeTx = db.transaction((keys) => {
      const delM = db.prepare('DELETE FROM movies WHERE rating_key = ?');
      for (const k of keys) {
        delM.run(k);
        deleteMoviePeople.run(k);
        deleteMovieTags.run(k);
      }
    });
    removeTx(existing.map((r) => r.rating_key).filter((k) => !seen.has(k)));

    // per-item details for full cast/crew/streams
    syncStatus.phase = 'details';
    if (force) db.prepare('UPDATE movies SET full_synced = 0').run();
    const pending = db.prepare('SELECT rating_key FROM movies WHERE full_synced = 0').all();
    syncStatus.detailTotal = pending.length;

    const CONCURRENCY = 6;
    let idx = 0;
    let failures = 0;
    async function worker() {
      for (;;) {
        const i = idx++;
        if (i >= pending.length) return;
        const key = pending[i].rating_key;
        try {
          const meta = await fetchDetail(key);
          if (meta) applyDetail(key, meta);
        } catch {
          failures++;
        }
        syncStatus.detailDone++;
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    syncStatus.phase = 'done';
    db.prepare('UPDATE sync_log SET finished_at = ?, status = ?, detail = ? WHERE id = ?').run(
      Date.now(),
      'ok',
      JSON.stringify({ movies: seen.size, details: pending.length, failures }),
      logId
    );
  } catch (err) {
    syncStatus.phase = 'error';
    syncStatus.error = String(err.message || err);
    db.prepare('UPDATE sync_log SET finished_at = ?, status = ?, detail = ? WHERE id = ?').run(
      Date.now(),
      'error',
      syncStatus.error,
      logId
    );
  } finally {
    syncStatus.running = false;
    syncStatus.finishedAt = Date.now();
  }
  return syncStatus;
}
