import { parse } from 'csv-parse/sync';
import { db } from './db.js';

/**
 * Import a Letterboxd export CSV (diary.csv, ratings.csv, watched.csv, watchlist.csv)
 * or a WebTools-NG "letterboxd format" CSV. List type is detected from headers
 * unless provided explicitly.
 */
export function importLetterboxdCsv(buffer, { list = null, filename = '' } = {}) {
  const text = buffer.toString('utf-8').replace(/^﻿/, '');
  const rows = parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
  if (!rows.length) return { imported: 0, matched: 0, list: list || 'unknown' };

  const headers = Object.keys(rows[0]).map((h) => h.toLowerCase());
  const fname = filename.toLowerCase();

  let detected = list;
  if (!detected) {
    if (fname.includes('watchlist')) detected = 'watchlist';
    else if (fname.includes('diary')) detected = 'diary';
    else if (fname.includes('ratings')) detected = 'ratings';
    else if (fname.includes('watched')) detected = 'watched';
    else if (headers.includes('watched date') && headers.includes('rating')) detected = 'diary';
    else if (headers.includes('rating') || headers.includes('rating10')) detected = 'ratings';
    else detected = 'watched';
  }

  const col = (row, ...names) => {
    for (const n of names) {
      for (const k of Object.keys(row)) {
        if (k.toLowerCase() === n) return row[k];
      }
    }
    return null;
  };

  const insert = db.prepare(
    `INSERT OR IGNORE INTO lb_entries (list, title, year, rating, watched_date, uri, movie_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const findMovie = db.prepare(
    `SELECT rating_key FROM movies
     WHERE (LOWER(title) = ? OR LOWER(original_title) = ?) AND year BETWEEN ? AND ?
     LIMIT 1`
  );
  const findByTmdb = db.prepare('SELECT rating_key FROM movies WHERE tmdb_id = ? LIMIT 1');

  let imported = 0;
  let matched = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const title = col(row, 'name', 'title');
      if (!title) continue;
      const year = Number(col(row, 'year')) || null;
      const tmdbId = Number(col(row, 'tmdb id')) || null;
      let rating = col(row, 'rating');
      const rating10 = col(row, 'rating10');
      let ratingNum = rating != null && rating !== '' ? Number(rating) : null;
      if (ratingNum == null && rating10 != null && rating10 !== '') ratingNum = Number(rating10) / 2;
      if (Number.isNaN(ratingNum)) ratingNum = null;
      const watchedDate = col(row, 'watched date', 'watcheddate', 'date') || null;
      const uri = col(row, 'letterboxd uri') || null;

      let movieId = null;
      if (tmdbId) movieId = findByTmdb.get(tmdbId)?.rating_key ?? null;
      if (!movieId && year) {
        const t = title.toLowerCase();
        const m = findMovie.get(t, t, year - 1, year + 1);
        if (m) movieId = m.rating_key;
      }
      const res = insert.run(detected, title, year, ratingNum, watchedDate, uri, movieId);
      if (res.changes) {
        imported++;
        if (movieId) matched++;
      }
    }
  });
  tx();
  return { imported, matched, list: detected, totalRows: rows.length };
}

/** Re-match all letterboxd entries against the library (after a sync). */
export function rematchLetterboxd() {
  const findMovie = db.prepare(
    `SELECT rating_key FROM movies
     WHERE (LOWER(title) = ? OR LOWER(original_title) = ?) AND year BETWEEN ? AND ?
     LIMIT 1`
  );
  const entries = db.prepare('SELECT id, title, year FROM lb_entries WHERE movie_id IS NULL AND year IS NOT NULL').all();
  const upd = db.prepare('UPDATE lb_entries SET movie_id = ? WHERE id = ?');
  let matched = 0;
  const tx = db.transaction(() => {
    for (const e of entries) {
      const t = e.title.toLowerCase();
      const m = findMovie.get(t, t, e.year - 1, e.year + 1);
      if (m) {
        upd.run(m.rating_key, e.id);
        matched++;
      }
    }
  });
  tx();
  return { rematched: matched };
}

export function letterboxdSummary() {
  const counts = {};
  for (const row of db
    .prepare('SELECT list, COUNT(*) n, SUM(CASE WHEN movie_id IS NOT NULL THEN 1 ELSE 0 END) m FROM lb_entries GROUP BY list')
    .all()) {
    counts[row.list] = { total: row.n, matched: row.m };
  }

  const watchlistMissing = db
    .prepare(
      `SELECT title, year, uri FROM lb_entries WHERE list = 'watchlist' AND movie_id IS NULL ORDER BY year DESC`
    )
    .all();
  const watchlistOwned = db
    .prepare(
      `SELECT e.title, e.year, m.rating_key, m.thumb FROM lb_entries e
       JOIN movies m ON m.rating_key = e.movie_id WHERE e.list = 'watchlist' ORDER BY e.year DESC`
    )
    .all();

  // rating comparison: letterboxd rating (x2 => /10) vs plex user rating (already /10)
  const ratingCompare = db
    .prepare(
      `SELECT m.rating_key, m.title, m.year, m.thumb, e.rating * 2 AS lb, m.user_rating AS plex,
              m.audience_rating AS audience
       FROM lb_entries e JOIN movies m ON m.rating_key = e.movie_id
       WHERE e.list IN ('ratings','diary') AND e.rating IS NOT NULL
       GROUP BY m.rating_key ORDER BY e.rating DESC`
    )
    .all();

  return { counts, watchlistMissing, watchlistOwned, ratingCompare };
}
