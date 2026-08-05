import { parse } from 'csv-parse/sync';
import { mapPool } from './pool.js';
import { unzipSync, strFromU8 } from 'fflate';
import { db } from './db.js';

// --- title normalisation & matching -----------------------------------------
// Letterboxd exports use the film's original/English title; a Plex library is
// often in Spanish, so exact-title matching misses a lot. We normalise both
// sides (diacritics, punctuation, leading articles) and match within ±1 year.

const ARTICLES = /^(the|a|an|el|la|los|las|le|les|l|il|lo|un|una|der|die|das)\s+/i;

export function normTitle(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ') // any punctuation/separator -> space
    .replace(ARTICLES, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let matcherCache = { builtAt: 0, index: null };

// Map of normalised title -> [{ year, rating_key }] across title +
// original_title + english_title (the TMDB English title, backfilled), so
// Spanish, original-language and English-titled sources all match.
function buildMatcher() {
  const index = new Map();
  const add = (title, year, ratingKey) => {
    const n = normTitle(title);
    if (!n) return;
    if (!index.has(n)) index.set(n, []);
    index.get(n).push({ year, rating_key: ratingKey });
  };
  for (const m of db.prepare('SELECT rating_key, title, original_title, english_title, year FROM movies').all()) {
    add(m.title, m.year, m.rating_key);
    if (m.original_title && m.original_title !== m.title) add(m.original_title, m.year, m.rating_key);
    if (m.english_title && m.english_title !== m.title && m.english_title !== m.original_title)
      add(m.english_title, m.year, m.rating_key);
  }
  matcherCache = { builtAt: Date.now(), index };
  return index;
}

function getMatcher() {
  if (!matcherCache.index || Date.now() - matcherCache.builtAt > 5 * 60 * 1000) return buildMatcher();
  return matcherCache.index;
}

const byTmdb = db.prepare('SELECT rating_key FROM movies WHERE tmdb_id = ? LIMIT 1');

/** Resolve a library rating_key for a (title, year, tmdbId?). */
export function matchMovie({ title, year, tmdbId = null }, index = getMatcher()) {
  if (tmdbId) {
    const hit = byTmdb.get(tmdbId);
    if (hit) return hit.rating_key;
  }
  const cands = index.get(normTitle(title));
  if (!cands?.length) return null;
  if (!year) return cands[0].rating_key;
  let best = null;
  let bestDelta = Infinity;
  for (const c of cands) {
    const delta = c.year == null ? 2 : Math.abs(c.year - year);
    if (delta < bestDelta) { bestDelta = delta; best = c; }
  }
  return bestDelta <= 1 ? best.rating_key : null;
}

// --- diary / ratings / watched / watchlist import ---------------------------

const col = (row, ...names) => {
  for (const n of names) {
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === n) return row[k];
    }
  }
  return null;
};

/**
 * Import a Letterboxd export CSV (diary/ratings/watched/watchlist) or a
 * WebTools-NG "letterboxd format" CSV. List type detected from name/headers.
 */
export function importLetterboxdCsv(buffer, { list = null, filename = '' } = {}) {
  const text = (Buffer.isBuffer(buffer) ? buffer.toString('utf-8') : String(buffer)).replace(/^﻿/, '');
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

  const insert = db.prepare(
    `INSERT OR IGNORE INTO lb_entries (list, title, year, rating, watched_date, uri, movie_id, tmdb_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const index = getMatcher();

  let imported = 0;
  let matched = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const title = col(row, 'name', 'title');
      if (!title) continue;
      const year = Number(col(row, 'year')) || null;
      const tmdbId = Number(col(row, 'tmdb id', 'tmdbid')) || null;
      const rating = col(row, 'rating');
      const rating10 = col(row, 'rating10');
      let ratingNum = rating != null && rating !== '' ? Number(rating) : null;
      if (ratingNum == null && rating10 != null && rating10 !== '') ratingNum = Number(rating10) / 2;
      if (Number.isNaN(ratingNum)) ratingNum = null;
      const watchedDate = col(row, 'watched date', 'watcheddate', 'date') || null;
      const uri = col(row, 'letterboxd uri') || null;

      const movieId = matchMovie({ title, year, tmdbId }, index);
      const res = insert.run(detected, title, year, ratingNum, watchedDate, uri, movieId, tmdbId);
      if (res.changes) {
        imported++;
        if (movieId) matched++;
      }
    }
  });
  tx();
  return { imported, matched, list: detected, totalRows: rows.length };
}

// --- challenge lists (letterboxd list export CSVs / pasted list) -------------

export function parseListCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/);
  // list export = "Letterboxd list export v7", a Date,Name,Tags,URL,Description
  // metadata block, a blank line, then the "Position,Name,Year,URL,Description"
  // items header.
  const headerIdx = lines.findIndex((l) => /^position,name,year/i.test(l));
  const metaHeaderIdx = lines.findIndex((l) => /^date,name,/i.test(l));
  let meta = { name: null, url: null };
  if (metaHeaderIdx >= 0 && lines[metaHeaderIdx + 1]) {
    try {
      const metaRows = parse(`${lines[metaHeaderIdx]}\n${lines[metaHeaderIdx + 1]}`, {
        columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true,
      });
      if (metaRows[0]) meta = { name: col(metaRows[0], 'name'), url: col(metaRows[0], 'url') };
    } catch {}
  }
  const body = headerIdx >= 0 ? lines.slice(headerIdx).join('\n') : clean;
  const rows = parse(body, { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
  const items = rows
    .map((r) => ({
      position: Number(col(r, 'position')) || null,
      title: col(r, 'name', 'title'),
      year: Number(col(r, 'year')) || null,
      uri: col(r, 'url', 'letterboxd uri') || null,
    }))
    .filter((i) => i.title);
  return { meta, items };
}

export function saveChallengeList({ slug, name, url, source = 'export', official = 0, items }) {
  const index = getMatcher();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO lb_lists (slug, name, url, source, official, item_count, added_at, refreshed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET name=excluded.name, url=excluded.url, source=excluded.source,
         official=excluded.official, item_count=excluded.item_count, refreshed_at=excluded.refreshed_at`
    ).run(slug, name || slug, url || null, source, official ? 1 : 0, items.length, Date.now(), Date.now());
    const listId = db.prepare('SELECT id FROM lb_lists WHERE slug = ?').get(slug).id;
    db.prepare('DELETE FROM lb_list_items WHERE list_id = ?').run(listId);
    const ins = db.prepare(
      `INSERT OR IGNORE INTO lb_list_items (list_id, position, title, year, uri, tmdb_id, movie_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const it of items) {
      ins.run(listId, it.position ?? null, it.title, it.year ?? null, it.uri ?? null, it.tmdb_id ?? null,
        matchMovie({ title: it.title, year: it.year, tmdbId: it.tmdb_id }, index));
    }
    return listId;
  });
  return tx();
}

// well-known official lists → surfaced as "completista rings"
const OFFICIAL_HINTS = [
  'imdb-top-250', 'top-250', 'oscar-winning', 'best-picture', 'palme-dor', 'cannes',
  'official-top-250-documentary', 'roger-eberts-great-movies', 'sight-sound', 'afi',
  'letterboxds-top-250', 'letterboxd-100', '1001',
];
const isOfficialSlug = (slug) => OFFICIAL_HINTS.some((h) => slug.includes(h));

// --- zip import -------------------------------------------------------------

// Tope de lo que se descomprime de una tacada. Sin él, un zip preparado de 800 KB
// se expandía a 765 MB en memoria y tumbaba el contenedor: `unzipSync` saca TODAS
// las entradas antes de que nadie mire si son .csv. El export real de Letterboxd
// de una filmoteca grande no llega a 30 MB.
const MAX_UNZIPPED = 64 * 1024 * 1024;
const MAX_ENTRIES = 500;

export function importLetterboxdZip(buffer) {
  // El tope se aplica DENTRO del filtro, que fflate consulta antes de inflar
  // cada entrada: comprobarlo después no sirve de nada, porque para entonces la
  // memoria ya está gastada (40 CSV de 150 MB llevaban el proceso a 2 GB antes
  // de que nadie dijera nada). Devolviendo `false` no se descomprime, y el
  // motivo se guarda para avisar al terminar.
  let acumulado = 0;
  let entradas = 0;
  let motivo = null;
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (f) => {
      if (motivo) return false;
      if (!f.name.toLowerCase().endsWith('.csv')) return false;
      if (++entradas > MAX_ENTRIES) { motivo = `el zip trae más de ${MAX_ENTRIES} ficheros`; return false; }
      acumulado += f.originalSize || 0;
      if (acumulado > MAX_UNZIPPED) { motivo = 'el zip se expande muchísimo al abrirlo'; return false; }
      return true;
    },
  });
  if (motivo) {
    throw new Error(`No se puede abrir: ${motivo}. ¿Seguro que es el export de Letterboxd?`);
  }
  const results = [];
  const lists = [];
  const base = (p) => p.split('/').pop().toLowerCase();

  for (const [path, data] of Object.entries(files)) {
    if (!path.toLowerCase().endsWith('.csv') || !data.length) continue;
    if (/(^|\/)(orphaned|deleted)\//i.test(path)) continue; // skip removed/orphaned dumps
    const name = base(path);
    const isList = /(^|\/)lists\//i.test(path);
    try {
      if (isList) {
        const text = strFromU8(data);
        const slug = path.replace(/^.*lists\//i, 'lb:').replace(/\.csv$/i, '');
        const { meta, items } = parseListCsv(text);
        if (!items.length) continue;
        saveChallengeList({
          slug,
          name: meta.name || name.replace(/\.csv$/i, ''),
          url: meta.url || null,
          source: 'export',
          official: isOfficialSlug(slug) ? 1 : 0,
          items,
        });
        lists.push({ list: meta.name || name, items: items.length });
      } else if (['diary.csv', 'ratings.csv', 'watched.csv', 'watchlist.csv'].includes(name)) {
        results.push({ file: name, ...importLetterboxdCsv(Buffer.from(data), { filename: name }) });
      }
    } catch (err) {
      results.push({ file: name, error: String(err.message || err) });
    }
  }
  return { results, lists };
}

// --- letterboxd RSS feed ----------------------------------------------------

const tag = (block, name) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  if (!m) return null;
  return m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
};

/** Parse a Letterboxd RSS body into watch entries. Pure (no DB) so it's testable. */
export function parseRssItems(xml) {
  const blocks = String(xml).split(/<item>/i).slice(1).map((b) => b.split(/<\/item>/i)[0]);
  const out = [];
  for (const b of blocks) {
    const title = tag(b, 'letterboxd:filmTitle');
    if (!title) continue; // skip list/review items without a film
    // watched-without-rating items carry no tag; Number(null) would be 0
    const rawRating = tag(b, 'letterboxd:memberRating');
    const rating = rawRating != null && rawRating !== '' ? Number(rawRating) : NaN;
    out.push({
      title,
      year: Number(tag(b, 'letterboxd:filmYear')) || null,
      rating: Number.isFinite(rating) ? rating : null,
      watchedDate: tag(b, 'letterboxd:watchedDate') || null,
      tmdbId: Number(tag(b, 'tmdb:movieId')) || null,
      uri: tag(b, 'link') || null,
    });
  }
  return out;
}

const cleanRssUser = (username) =>
  String(username || '').trim().replace(/^@/, '').replace(/.*letterboxd\.com\//, '').replace(/\/.*/, '');

/** Fetch a user's Letterboxd RSS and store recent watched entries as diary. */
export async function importLetterboxdRss(username) {
  const user = cleanRssUser(username);
  if (!user) throw new Error('Indica tu usuario de Letterboxd');
  const res = await fetch(`https://letterboxd.com/${user}/rss/`, {
    headers: { 'User-Agent': 'PowaFlex' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Letterboxd RSS ${res.status} (¿usuario correcto?)`);
  const items = parseRssItems(await res.text());

  const insert = db.prepare(
    `INSERT OR IGNORE INTO lb_entries (list, title, year, rating, watched_date, uri, movie_id, tmdb_id)
     VALUES ('diary', ?, ?, ?, ?, ?, ?, ?)`
  );
  const index = getMatcher();
  let imported = 0;
  let matched = 0;
  const tx = db.transaction(() => {
    for (const it of items) {
      const movieId = matchMovie({ title: it.title, year: it.year, tmdbId: it.tmdbId }, index);
      const res2 = insert.run(it.title, it.year, it.rating, it.watchedDate, it.uri, movieId, it.tmdbId);
      if (res2.changes) { imported++; if (movieId) matched++; }
    }
  });
  tx();
  return { imported, matched, user, seen: items.length };
}

// --- pasted letterboxd list (public page scrape, best-effort) ---------------

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'" };
const desescapar = (t) =>
  String(t || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (todo, e) => {
    const k = e.toLowerCase();
    if (ENTIDADES[k]) return ENTIDADES[k];
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)));
    return todo;
  });

/**
 * Saca las películas de una página de lista de Letterboxd.
 *
 * Letterboxd cambia su marcado cada cierto tiempo y esto se rompe en silencio:
 * en agosto de 2026 renombró `data-film-slug`/`data-film-name` a
 * `data-item-slug`/`data-item-name`, y desde entonces cualquier lista daba «No
 * se pudieron leer películas de esa lista». Se aceptan los dos juegos de
 * atributos, y como último recurso el propio slug, que es lo más estable de
 * todo. Devuelve cuántas nuevas encontró.
 *
 * El nombre viene con el año pegado: «The Cabinet of Dr. Caligari (1920)».
 */
export function parseListPage(html, seen = new Set(), items = []) {
  const re = /data-(?:item|film)-slug="([^"]+)"/gi;
  let m;
  let nuevas = 0;
  while ((m = re.exec(html))) {
    const slug = m[1];
    if (!slug || seen.has(slug)) continue;
    // La ventana se acota a la ETIQUETA que contiene el slug, no a un número de
    // caracteres alrededor: los pósters van pegados unos a otros y una ventana
    // ancha se traía el nombre del vecino de al lado.
    const ini = html.lastIndexOf('<', m.index);
    const fin = html.indexOf('>', m.index);
    const etiqueta = html.slice(ini < 0 ? 0 : ini, fin < 0 ? m.index + 400 : fin);
    const crudo = desescapar(
      (etiqueta.match(/data-(?:item|film)-name="([^"]+)"/i) || [])[1] ||
        (etiqueta.match(/data-item-full-display-name="([^"]+)"/i) || [])[1] ||
        (etiqueta.match(/\balt="([^"]+)"/i) || [])[1] ||
        ''
    );
    const conAnyo = /^(.*?)\s*\((\d{4})\)\s*$/.exec(crudo);
    let title = (conAnyo ? conAnyo[1] : crudo).trim();
    let year = conAnyo ? Number(conAnyo[2]) : null;
    if (!year) {
      // los slugs de Letterboxd desempatan homónimas con el año al final
      const y = /-(\d{4})$/.exec(slug);
      if (y) year = Number(y[1]);
      const attr = (etiqueta.match(/data-film-release-year="(\d{4})"/i) || [])[1];
      if (attr) year = Number(attr);
    }
    if (!title) title = decodeURIComponent(slug).replace(/-\d{4}$/, '').replace(/-/g, ' ');
    seen.add(slug);
    items.push({
      position: items.length + 1,
      title,
      year: year || null,
      uri: `https://letterboxd.com/film/${slug}/`,
    });
    nuevas++;
  }
  return nuevas;
}

export async function importLetterboxdListUrl(url) {
  const m = /letterboxd\.com\/([^/]+)\/list\/([^/?#]+)/i.exec(url || '');
  if (!m) throw new Error('URL no reconocida (esperaba letterboxd.com/usuario/list/slug/)');
  const [, user, listSlug] = m;
  const slug = `lb:${user}/${listSlug}`;
  const items = [];
  const seen = new Set();
  let nombre = decodeURIComponent(listSlug).replace(/-/g, ' ');
  for (let page = 1; page <= 20; page++) {
    // Una lista de 2.000 títulos son 20 páginas seguidas: pedirlas sin respirar
    // es la forma más rápida de que Letterboxd nos corte. Un cuarto de segundo
    // entre páginas no se nota al importar y es buena vecindad; el User-Agent
    // dice quién llama y a dónde escribir si molesta.
    if (page > 1) await new Promise((r) => setTimeout(r, 250));
    const res = await fetch(`https://letterboxd.com/${user}/list/${listSlug}/page/${page}/`, {
      headers: { 'User-Agent': 'PowaFlex/0.9 (self-hosted; https://github.com/ForeverRamone/PowaFlex)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) { if (page === 1) throw new Error(`Letterboxd ${res.status}`); break; }
    const html = await res.text();
    // el nombre de verdad de la lista está en og:title; el slug daba cosas como
    // «edgar wrights 1000 favorite movies»
    if (page === 1) nombre = desescapar((html.match(/property="og:title" content="([^"]+)"/i) || [])[1] || '') || nombre;
    const found = parseListPage(html, seen, items);
    if (!found) break;
  }
  if (!items.length) {
    throw new Error(
      'No se pudieron leer películas de esa lista. Comprueba que la lista es pública y que la ' +
      'dirección es la de la lista (letterboxd.com/usuario/list/nombre-de-la-lista/).'
    );
  }
  const listId = saveChallengeList({ slug, name: nombre, url, source: 'url', official: 0, items });
  return { listId, items: items.length };
}

// --- challenge list read APIs ----------------------------------------------

// Everything you've watched: Plex views + Letterboxd diary/watched/ratings.
// Used for the "watched" completista ring (distinct from "owned" in Plex).
export function watchedIndex() {
  const keys = new Set();      // normalised "title|year"
  const tmdbIds = new Set();
  const movieIds = new Set();  // library rating_keys that are watched
  for (const m of db.prepare('SELECT rating_key, title, original_title, english_title, year, tmdb_id FROM movies WHERE view_count > 0').all()) {
    movieIds.add(m.rating_key);
    if (m.tmdb_id) tmdbIds.add(m.tmdb_id);
    keys.add(`${normTitle(m.title)}|${m.year || ''}`);
    if (m.original_title) keys.add(`${normTitle(m.original_title)}|${m.year || ''}`);
    if (m.english_title) keys.add(`${normTitle(m.english_title)}|${m.year || ''}`);
  }
  for (const e of db.prepare(`SELECT title, year, tmdb_id, movie_id FROM lb_entries WHERE list IN ('diary','watched','ratings')`).all()) {
    if (e.movie_id) movieIds.add(e.movie_id);
    if (e.tmdb_id) tmdbIds.add(e.tmdb_id);
    keys.add(`${normTitle(e.title)}|${e.year || ''}`);
  }
  return { keys, tmdbIds, movieIds };
}
export const isWatched = (item, idx) =>
  (item.movie_id && idx.movieIds.has(item.movie_id)) ||
  (item.tmdb_id && idx.tmdbIds.has(item.tmdb_id)) ||
  idx.keys.has(`${normTitle(item.title)}|${item.year || ''}`);

export function challengeLists() {
  const idx = watchedIndex();
  const lists = db.prepare('SELECT * FROM lb_lists ORDER BY official DESC, name').all();
  return lists.map((l) => {
    const items = db.prepare('SELECT title, year, tmdb_id, movie_id FROM lb_list_items WHERE list_id = ?').all(l.id);
    let owned = 0;
    let watched = 0;
    for (const it of items) {
      if (it.movie_id) owned++;
      if (isWatched(it, idx)) watched++;
    }
    return {
      id: l.id, name: l.name, url: l.url, source: l.source, official: l.official,
      hidden: l.hidden, item_count: items.length, owned, watched,
    };
  });
}

export function challengeListDetail(listId) {
  const list = db.prepare('SELECT * FROM lb_lists WHERE id = ?').get(listId);
  if (!list) return null;
  const idx = watchedIndex();
  const items = db
    .prepare(
      `SELECT i.position, i.title, i.year, i.uri, i.tmdb_id, i.movie_id, m.view_count, m.thumb, m.tmdb_id AS lib_tmdb
       FROM lb_list_items i LEFT JOIN movies m ON m.rating_key = i.movie_id
       WHERE i.list_id = ? ORDER BY COALESCE(i.position, 999999), i.title`
    )
    .all(listId)
    .map((it) => ({ ...it, tmdb_id: it.lib_tmdb || it.tmdb_id || null, watched: isWatched(it, idx) }));
  return { list, items };
}

export function setChallengeHidden(listId, hidden) {
  db.prepare('UPDATE lb_lists SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, listId);
}

/** Missing (not-in-Plex) items of a list, resolved to TMDB ids for Radarr (#18). */
export async function listMissingTmdbIds(listId) {
  const { searchMovieId } = await import('./tmdb.js');
  const items = db
    .prepare('SELECT title, year, tmdb_id, movie_id FROM lb_list_items WHERE list_id = ? AND movie_id IS NULL')
    .all(listId);
  const ids = [];
  await mapPool(items, 6, async (it) => {
    const id = it.tmdb_id || (await searchMovieId(it.title, it.year));
    if (id) ids.push(id);
  });
  return [...new Set(ids)];
}

export function deleteChallengeList(listId) {
  db.prepare('DELETE FROM lb_list_items WHERE list_id = ?').run(listId);
  db.prepare('DELETE FROM lb_lists WHERE id = ?').run(listId);
}

// --- rematch after a Plex sync ----------------------------------------------

/**
 * Relink Letterboxd entries and challenge-list items to the library after a
 * Plex sync. Entries with no year are included (title-only matching still
 * works) and the TMDB id is used when we have it. A film deleted from Plex
 * clears movie_id instead of keeping a dangling one, which used to make the
 * "lo tengo" rings overcount.
 */
export function rematchLetterboxd() {
  const index = buildMatcher(); // fresh after a sync
  let matched = 0;
  let cleared = 0;
  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE lb_entries SET movie_id = ? WHERE id = ?');
    for (const e of db.prepare('SELECT id, title, year, tmdb_id, movie_id FROM lb_entries').all()) {
      const mid = matchMovie({ title: e.title, year: e.year, tmdbId: e.tmdb_id }, index) || null;
      if (mid === (e.movie_id ?? null)) continue;
      upd.run(mid, e.id);
      if (mid) matched++;
      else cleared++;
    }
    const updL = db.prepare('UPDATE lb_list_items SET movie_id = ? WHERE rowid = ?');
    for (const it of db.prepare('SELECT rowid, title, year, tmdb_id, movie_id FROM lb_list_items').all()) {
      const mid = matchMovie({ title: it.title, year: it.year, tmdbId: it.tmdb_id }, index) || null;
      if (mid === (it.movie_id ?? null)) continue;
      updL.run(mid, it.rowid);
      if (mid) matched++;
      else cleared++;
    }
  });
  tx();
  return { rematched: matched, cleared };
}

/**
 * Standard Letterboxd exports (diary/watched/ratings CSVs) carry no TMDB id and
 * use the film's original/English title, so a Spanish library misses matches
 * (e.g. "Breathless" ↔ "Al final de la escapada"). This resolves each still-
 * unmatched watched entry to a TMDB id (search by title+year, cached) and then
 * links it to a library film by that id. Returns counts. (#1)
 */
let englishBackfillRunning = false;

export async function resolveUnmatchedLb() {
  const { searchMovieId, backfillMovieTmdbIds, backfillEnglishTitles } = await import('./tmdb.js');

  // first make sure every library row has a TMDB id (IMDb guid → title search),
  // otherwise the id-link below can never land for those films
  const library = await backfillMovieTmdbIds();
  // unique (title, year) of watched entries with no TMDB id yet
  const groups = db
    .prepare(
      `SELECT title, year FROM lb_entries
       WHERE tmdb_id IS NULL AND title IS NOT NULL AND list IN ('diary','watched','ratings')
       GROUP BY title, year`
    )
    .all();

  const setTmdb = db.prepare(
    `UPDATE lb_entries SET tmdb_id = ? WHERE tmdb_id IS NULL AND title = ? AND (year IS ? OR year = ?)`
  );
  let resolved = 0;
  await mapPool(groups, 6, async (g) => {
    try {
      const id = await searchMovieId(g.title, g.year);
      if (id) { setTmdb.run(id, g.title, g.year, g.year); resolved++; }
    } catch {}
  });

  // also resolve challenge-list items (e.g. AFI/IMDb lists) the same way, so films
  // you own under a localised title (Sunset Boulevard ↔ El crepúsculo…) count (#G)
  const listGroups = db
    .prepare(
      `SELECT title, year FROM lb_list_items WHERE tmdb_id IS NULL AND title IS NOT NULL GROUP BY title, year`
    )
    .all();
  const setListTmdb = db.prepare(
    `UPDATE lb_list_items SET tmdb_id = ? WHERE tmdb_id IS NULL AND title = ? AND (year IS ? OR year = ?)`
  );
  let j = 0;
  async function listWorker() {
    for (;;) {
      const idx = j++;
      if (idx >= listGroups.length) return;
      const g = listGroups[idx];
      try {
        const id = await searchMovieId(g.title, g.year);
        if (id) { setListTmdb.run(id, g.title, g.year, g.year); resolved++; }
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: 6 }, listWorker));

  // now link any still-unmatched entry / list item to a library film via TMDB id
  const index = buildMatcher(); // fresh: the backfill above may have added ids
  let matched = 0;
  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE lb_entries SET movie_id = ? WHERE id = ?');
    for (const e of db
      .prepare(`SELECT id, title, year, tmdb_id FROM lb_entries WHERE movie_id IS NULL AND tmdb_id IS NOT NULL`)
      .all()) {
      const mid = matchMovie({ title: e.title, year: e.year, tmdbId: e.tmdb_id }, index);
      if (mid) { upd.run(mid, e.id); matched++; }
    }
    const updL = db.prepare('UPDATE lb_list_items SET movie_id = ? WHERE rowid = ?');
    for (const it of db
      .prepare(`SELECT rowid, title, year, tmdb_id FROM lb_list_items WHERE movie_id IS NULL AND tmdb_id IS NOT NULL`)
      .all()) {
      const mid = matchMovie({ title: it.title, year: it.year, tmdbId: it.tmdb_id }, index);
      if (mid) { updL.run(mid, it.rowid); matched++; }
    }
  });
  tx();

  // breakdown of what is still unmatched, so the UI can say WHY
  const unmatched = db
    .prepare(
      `SELECT SUM(CASE WHEN tmdb_id IS NULL THEN 1 ELSE 0 END) sinTmdb,
              SUM(CASE WHEN tmdb_id IS NOT NULL THEN 1 ELSE 0 END) noEnBiblioteca
       FROM lb_entries WHERE movie_id IS NULL AND list IN ('diary','watched','ratings')`
    )
    .get();

  // English titles unlock pure-title matching for third-language films; the
  // backfill is heavy (one TMDB call per film) so it advances in the background
  // and relinks everything when done
  const englishPending = db
    .prepare('SELECT COUNT(*) n FROM movies WHERE tmdb_id IS NOT NULL AND english_title IS NULL')
    .get().n;
  if (englishPending && !englishBackfillRunning) {
    englishBackfillRunning = true;
    backfillEnglishTitles({ budget: 15000 })
      .then(() => rematchLetterboxd())
      .catch(() => {})
      .finally(() => { englishBackfillRunning = false; });
  }

  return {
    groups: groups.length + listGroups.length,
    resolved,
    matched,
    library,
    unmatched: { sinTmdb: unmatched.sinTmdb || 0, noEnBiblioteca: unmatched.noEnBiblioteca || 0 },
    englishPending,
  };
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

  // Your Letterboxd rating vs the Letterboxd community and the combined score.
  // Scales: lb_entries.rating is Letterboxd's 0–5 (×2 → 0–10); mdb_ratings.letterboxd
  // ALREADY comes 0–10 from MDBList, so scaling it again is what produced "16.8/10".
  const ratingCompare = db
    .prepare(
      `SELECT m.rating_key, m.title, m.year, m.thumb, MAX(e.rating) * 2 AS lb,
              r.letterboxd AS community, r.score AS mdb_score
       FROM lb_entries e JOIN movies m ON m.rating_key = e.movie_id
       LEFT JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE e.list IN ('ratings','diary') AND e.rating IS NOT NULL
       GROUP BY m.rating_key ORDER BY MAX(e.rating) DESC`
    )
    .all();

  const rssUser = db.prepare(`SELECT value FROM settings WHERE key = 'letterboxd_rss'`).get()?.value || null;

  return { counts, watchlistMissing, watchlistOwned, ratingCompare, rssUser };
}
