import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const lb = await import('../src/letterboxd.js');
const { db } = await import('../src/db.js');
const { zipSync, Zip, ZipDeflate, strToU8 } = await import('fflate');

const n = (sql, ...a) => db.prepare(sql).get(...a).n;

// --- 1. zip que miente sobre su tamaño --------------------------------------

// Deflate a mano (Huffman fijo): una 'A' y luego copias de 258 bytes a distancia
// 1. Fabricar así medio giga cuesta milisegundos; con un compresor de verdad
// eran segundos por giga y el test se eternizaba.
function deflateDeAes(bytes) {
  const copias = Math.floor((bytes - 1) / 258);
  const out = new Uint8Array(Math.ceil((3 + 8 + copias * 13 + 7) / 8) + 2);
  let pos = 0;
  let bit = 0;
  const bits = (v, len) => { // LSB primero
    for (let i = 0; i < len; i++) { if ((v >> i) & 1) out[pos] |= 1 << bit; if (++bit === 8) { bit = 0; pos++; } }
  };
  const huff = (code, len) => { // los códigos Huffman van MSB primero
    for (let i = len - 1; i >= 0; i--) bits((code >> i) & 1, 1);
  };
  bits(1, 1); bits(1, 2); // BFINAL, BTYPE=01
  huff(0x30 + 0x41, 8); // literal 'A'
  for (let i = 0; i < copias; i++) { huff(0b11000101, 8); huff(0, 5); } // longitud 258, distancia 1
  huff(0, 7); // fin de bloque
  return out.subarray(0, pos + 1);
}

function zipCon(nombre, datos, tamDeclarado) {
  const nom = strToU8(nombre);
  const loc = new DataView(new ArrayBuffer(30));
  loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(8, 8, true);
  loc.setUint32(18, datos.length, true); loc.setUint32(22, tamDeclarado, true); loc.setUint16(26, nom.length, true);
  const cen = new DataView(new ArrayBuffer(46));
  cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(10, 8, true);
  cen.setUint32(20, datos.length, true); cen.setUint32(24, tamDeclarado, true); cen.setUint16(28, nom.length, true);
  const fin = new DataView(new ArrayBuffer(22));
  const tamCen = 46 + nom.length;
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, 1, true); fin.setUint16(10, 1, true);
  fin.setUint32(12, tamCen, true); fin.setUint32(16, 30 + nom.length + datos.length, true);
  return Buffer.concat([Buffer.from(loc.buffer), nom, datos, Buffer.from(cen.buffer), nom, Buffer.from(fin.buffer)]);
}

test('un zip que declara 10 bytes y se expande a 512 MB se rechaza enseguida', () => {
  const bomba = zipCon('diary.csv', deflateDeAes(512 * 1024 * 1024), 10);
  assert.ok(bomba.length < 4 * 1024 * 1024);
  const t = Date.now();
  assert.throws(() => lb.importLetterboxdZip(bomba), /se expande/);
  const ms = Date.now() - t;
  assert.ok(ms < 2000, `tardó ${ms} ms: está inflando el zip entero antes de rechazarlo`);
  assert.equal(n('SELECT COUNT(*) n FROM lb_entries'), 0, 'no se importa nada a medias');
});

test('el export completo de Letterboxd entra igual por la descompresión en trozos', () => {
  const enc = (s) => strToU8(s);
  const z = zipSync({
    'profile.csv': enc('Date Joined,Username\n2015-01-01,ramon\n'),
    'watched.csv': enc('Date,Name,Year,Letterboxd URI\n2024-01-01,Zatoichi,2003,https://boxd.it/z1\n2024-01-02,Ran,1985,https://boxd.it/z2\n'),
    'ratings.csv': enc('Date,Name,Year,Letterboxd URI,Rating\n2024-01-01,Zatoichi,2003,https://boxd.it/z1,4\n'),
    'diary.csv': enc('Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-01-01,Zatoichi,2003,https://boxd.it/d1,4,,,2024-01-01\n'),
    'watchlist.csv': enc('Date,Name,Year,Letterboxd URI\n2024-01-01,Kwaidan,1964,https://boxd.it/w1\n'),
    'lists/samurais.csv': enc(
      'Letterboxd list export v7\nDate,Name,Tags,URL,Description\n2024-01-01,Samuráis,,https://boxd.it/l1,\n\n' +
        'Position,Name,Year,URL,Description\n1,Harakiri,1962,https://boxd.it/h1,\n2,Ran,1985,https://boxd.it/z2,\n'
    ),
    'deleted/diary.csv': enc('Date,Name,Year\n2020-01-01,Borrada,2000\n'),
    'likes/films.csv': enc('Date,Name,Year,Letterboxd URI\n2024-01-01,Ran,1985,https://boxd.it/z2\n'),
    'leeme.txt': enc('nada'),
  }, { level: 6 });
  const r = lb.importLetterboxdZip(Buffer.from(z));
  const por = Object.fromEntries(r.results.map((x) => [x.file, x.imported]));
  assert.deepEqual(por, { 'watched.csv': 2, 'ratings.csv': 1, 'diary.csv': 1, 'watchlist.csv': 1 });
  assert.deepEqual(r.lists, [{ list: 'Samuráis', items: 2 }]);
  assert.equal(n("SELECT COUNT(*) n FROM lb_entries WHERE title = 'Borrada'"), 0);
});

test('un zip con descriptor de datos (tamaños al final, como los de Java) también entra', () => {
  const trozos = [];
  const zip = new Zip((err, d) => { if (err) throw err; trozos.push(d); });
  const f = new ZipDeflate('watched.csv', { level: 6 });
  zip.add(f);
  f.push(strToU8('Date,Name,Year,Letterboxd URI\n2024-01-01,Yojimbo,1961,https://boxd.it/y1\n'), true);
  zip.end();
  const r = lb.importLetterboxdZip(Buffer.concat(trozos.map((t) => Buffer.from(t))));
  assert.equal(r.results[0].imported, 1);
});

test('algo que no es un zip da un error, no un «no se recibió nada»', () => {
  assert.throws(() => lb.importLetterboxdZip(Buffer.from('esto no es un zip')), /zip/i);
});

// --- 2. usuario del RSS ------------------------------------------------------

function conFetch(fn) {
  const urls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => { urls.push(String(u)); return new Response('<rss></rss>', { status: 200 }); };
  return Promise.resolve(fn(urls)).finally(() => { globalThis.fetch = orig; });
}

test('un usuario de RSS enorme no bloquea el proceso', async () => {
  await conFetch(async () => {
    const t = Date.now();
    await lb.importLetterboxdRss('a'.repeat(100_000) + 'letterboxd.com').catch(() => {});
    await lb.importLetterboxdRss('letterboxd.com/'.repeat(20_000)).catch(() => {});
    const ms = Date.now() - t;
    assert.ok(ms < 500, `tardó ${ms} ms en limpiar el usuario`);
  });
});

test('las formas de escribir el usuario de Letterboxd siguen valiendo', async () => {
  const formas = [
    'ramon', ' ramon ', '@ramon', 'ramon/',
    'letterboxd.com/ramon', 'letterboxd.com/ramon/', 'www.letterboxd.com/ramon/',
    'https://letterboxd.com/ramon', 'https://letterboxd.com/ramon/', 'https://www.letterboxd.com/ramon/',
    'http://letterboxd.com/ramon/rss/', 'https://letterboxd.com/ramon/rss', 'https://Letterboxd.com/ramon/films/',
  ];
  await conFetch(async (urls) => {
    for (const f of formas) {
      const r = await lb.importLetterboxdRss(f);
      assert.equal(r.user, 'ramon', `«${f}»`);
    }
    assert.ok(urls.every((u) => u === 'https://letterboxd.com/ramon/rss/'), urls.join(' '));
  });
});

// --- 3. títulos que normalizan a nada ---------------------------------------

test('una vista con título no latino no marca como vistas todas las de su año', () => {
  db.prepare(`INSERT INTO movies (rating_key, title, original_title, year, view_count, tmdb_id)
              VALUES (5301, 'Cuentos de Tokio', '東京物語', 1953, 1, 18148)`).run();
  db.prepare(`INSERT INTO movies (rating_key, title, year, view_count) VALUES (5302, 'Солярис', 1972, 1)`).run();
  db.prepare(`INSERT INTO lb_entries (list, title, year) VALUES ('watched', '七人の侍', 1954)`).run();
  const idx = lb.watchedIndex();
  for (const t of ['Восток', '서울', 'القاهرة', '!!!']) {
    assert.equal(!!lb.isWatched({ tmdb_id: 999, title: t, year: 1953 }, idx), false, t);
  }
  assert.equal(!!lb.isWatched({ title: 'Тихий Дон', year: 1972 }, idx), false);
  assert.equal(!!lb.isWatched({ title: '生きる', year: 1954 }, idx), false);
  // lo visto de verdad se sigue reconociendo, por id o por título latino
  assert.equal(!!lb.isWatched({ tmdb_id: 18148, title: '東京物語', year: 1953 }, idx), true);
  assert.equal(!!lb.isWatched({ title: 'Cuentos de Tokio', year: 1953 }, idx), true);
  assert.equal(!!lb.isWatched({ movie_id: 5302, title: 'Солярис', year: 1972 }, idx), true);
});

// --- 4. entidades y slugs raros en una lista pegada --------------------------

test('una entidad fuera de rango o un slug con % no tumban la lectura de la lista', () => {
  const html =
    '<div data-item-slug="x-2001" data-item-name="Foo &#99999999; &#xFFFFFFFF; &#0; (2001)"></div>' +
    '<div data-item-slug="amelie" data-item-name="Am&#233;lie &#x2014; (2001)"></div>' +
    '<div data-item-slug="100%-wolf"></div>' +
    '<div data-item-slug="caf%C3%A9-society"></div>';
  const items = [];
  assert.equal(lb.parseListPage(html, new Set(), items), 4);
  assert.deepEqual(items.map((i) => i.title), ['Foo', 'Amélie —', '100% wolf', 'café society']);
  assert.equal(items[0].year, 2001);
});

// --- 5a. reimportar notas ----------------------------------------------------

const RAT = (fecha, nota) =>
  `Date,Name,Year,Letterboxd URI,Rating\n${fecha},Brazil,1985,https://boxd.it/2a,${nota}\n`;
const notaBrazil = () =>
  lb.letterboxdSummary().ratingCompare.find((r) => r.rating_key === 5401)?.lb;

test('cambiar una nota y reimportar ratings.csv deja la nota nueva, el mismo día u otro', () => {
  db.prepare(`INSERT INTO movies (rating_key, title, year, tmdb_id) VALUES (5401, 'Brazil', 1985, 68)`).run();
  lb.rematchLetterboxd(); // como tras un sync de Plex: el emparejador se rehace
  lb.importLetterboxdCsv(RAT('2026-01-10', 4.5), { filename: 'ratings.csv' });
  assert.equal(notaBrazil(), 9);

  const mismo = lb.importLetterboxdCsv(RAT('2026-01-10', 2.5), { filename: 'ratings.csv' });
  assert.equal(mismo.imported, 1, 'la nota cambiada cuenta como importada');
  assert.equal(notaBrazil(), 5);

  lb.importLetterboxdCsv(RAT('2026-03-02', 3), { filename: 'ratings.csv' });
  assert.equal(notaBrazil(), 6);
  assert.equal(n("SELECT COUNT(*) n FROM lb_entries WHERE list = 'ratings' AND title = 'Brazil'"), 1);

  // el mismo fichero otra vez no cambia nada
  assert.equal(lb.importLetterboxdCsv(RAT('2026-03-02', 3), { filename: 'ratings.csv' }).imported, 0);
  // un export viejo no pisa la nota de uno más reciente
  lb.importLetterboxdCsv(RAT('2025-12-01', 5), { filename: 'ratings.csv' });
  assert.equal(notaBrazil(), 6);
  assert.equal(n("SELECT COUNT(*) n FROM lb_entries WHERE list = 'ratings' AND title = 'Brazil'"), 1);
});

test('la nota de ratings manda sobre la de un visionado antiguo del diario', () => {
  db.prepare(`INSERT INTO movies (rating_key, title, year) VALUES (5402, 'Cube', 1997)`).run();
  lb.rematchLetterboxd();
  lb.importLetterboxdCsv(
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2010-01-01,Cube,1997,https://boxd.it/c1,5,,,2010-01-01\n',
    { filename: 'diary.csv' }
  );
  lb.importLetterboxdCsv('Date,Name,Year,Letterboxd URI,Rating\n2026-01-01,Cube,1997,https://boxd.it/c0,2\n', { filename: 'ratings.csv' });
  assert.equal(lb.letterboxdSummary().ratingCompare.find((r) => r.rating_key === 5402).lb, 4);
});

test('las filas repetidas de ratings de una base vieja se funden al reimportar esa película', () => {
  db.prepare(`INSERT INTO movies (rating_key, title, year) VALUES (5403, 'Alien', 1979)`).run();
  lb.rematchLetterboxd();
  const ins = db.prepare(`INSERT INTO lb_entries (list, title, year, rating, watched_date, uri, movie_id) VALUES (?, 'Alien', 1979, ?, ?, ?, 5403)`);
  ins.run('ratings', 4.5, '2020-01-01', 'https://boxd.it/al');
  ins.run('ratings', 3.5, '2022-01-01', 'https://boxd.it/al');
  ins.run('diary', 4.5, '2020-01-01', 'https://boxd.it/ald');
  ins.run('watched', null, '2020-01-01', 'https://boxd.it/al');
  // sin reimportar, ya se ve la más reciente
  assert.equal(lb.letterboxdSummary().ratingCompare.find((r) => r.rating_key === 5403).lb, 7);
  lb.importLetterboxdCsv('Date,Name,Year,Letterboxd URI,Rating\n2024-05-05,Alien,1979,https://boxd.it/al,4\n', { filename: 'ratings.csv' });
  assert.equal(n("SELECT COUNT(*) n FROM lb_entries WHERE list = 'ratings' AND title = 'Alien'"), 1);
  assert.equal(n("SELECT COUNT(*) n FROM lb_entries WHERE list <> 'ratings' AND title = 'Alien'"), 2, 'las otras listas no se tocan');
  const fila = db.prepare("SELECT rating, watched_date, movie_id FROM lb_entries WHERE list = 'ratings' AND title = 'Alien'").get();
  assert.deepEqual({ ...fila }, { rating: 4, watched_date: '2024-05-05', movie_id: 5403 });
});

// --- 5b. el mismo visionado por RSS y por el CSV del diario ------------------

const rss = (...items) =>
  `<rss><channel>${items
    .map(([titulo, anyo, fecha, link, tmdb]) => `<item><link>${link}</link>
<letterboxd:watchedDate>${fecha}</letterboxd:watchedDate><letterboxd:filmTitle>${titulo}</letterboxd:filmTitle>
<letterboxd:filmYear>${anyo}</letterboxd:filmYear><letterboxd:memberRating>4.0</letterboxd:memberRating>
${tmdb ? `<tmdb:movieId>${tmdb}</tmdb:movieId>` : ''}</item>`)
    .join('')}</channel></rss>`;
async function importarRss(xml) {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(xml, { status: 200 });
  try { return await lb.importLetterboxdRss('ramon'); } finally { globalThis.fetch = orig; }
}
const diario = (...filas) =>
  lb.importLetterboxdCsv(
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n' +
      filas.map(([t, y, f, u]) => `${f},${t},${y},${u},4,,,${f}`).join('\n') + '\n',
    { filename: 'diary.csv' }
  );
const vistas = (titulo) => n("SELECT COUNT(*) n FROM lb_entries WHERE list = 'diary' AND title = ?", titulo);

test('un visionado que llega por RSS y luego por el CSV del diario cuenta una vez', async () => {
  await importarRss(rss(['Paprika', 2006, '2026-02-01', 'https://letterboxd.com/ramon/film/paprika/', 4977]));
  diario(['Paprika', 2006, '2026-02-01', 'https://boxd.it/9xYz']);
  assert.equal(vistas('Paprika'), 1);
  // y al revés: primero el CSV, luego el RSS
  diario(['Akira', 1988, '2026-02-02', 'https://boxd.it/ak1']);
  await importarRss(rss(['Akira', 1988, '2026-02-02', 'https://letterboxd.com/ramon/film/akira/', 149]));
  assert.equal(vistas('Akira'), 1);
  // las dos fuentes otra vez no cambian nada
  await importarRss(rss(['Paprika', 2006, '2026-02-01', 'https://letterboxd.com/ramon/film/paprika/', 4977]));
  diario(['Akira', 1988, '2026-02-02', 'https://boxd.it/ak1']);
  assert.equal(vistas('Paprika') + vistas('Akira'), 2);
});

test('los revisionados de verdad siguen contando', async () => {
  // dos días distintos
  diario(['Perfect Blue', 1997, '2026-01-01', 'https://boxd.it/pb1'], ['Perfect Blue', 1997, '2026-01-05', 'https://boxd.it/pb2']);
  assert.equal(vistas('Perfect Blue'), 2);
  // dos veces el mismo día en el CSV: son dos entradas del diario
  diario(['Memories', 1995, '2026-01-01', 'https://boxd.it/me1'], ['Memories', 1995, '2026-01-01', 'https://boxd.it/me2']);
  assert.equal(vistas('Memories'), 2);
  // el RSS de esos dos mismos no añade nada
  await importarRss(rss(
    ['Memories', 1995, '2026-01-01', 'https://letterboxd.com/ramon/film/memories/', 42994],
    ['Memories', 1995, '2026-01-01', 'https://letterboxd.com/ramon/film/memories/1/', 42994]
  ));
  assert.equal(vistas('Memories'), 2);
  // el RSS trae dos el mismo día y el CSV (más viejo) solo uno: quedan dos
  diario(['Tekkonkinkreet', 2006, '2026-01-03', 'https://boxd.it/tk1']);
  const dos = rss(
    ['Tekkonkinkreet', 2006, '2026-01-03', 'https://letterboxd.com/ramon/film/tekkonkinkreet/', 13398],
    ['Tekkonkinkreet', 2006, '2026-01-03', 'https://letterboxd.com/ramon/film/tekkonkinkreet/1/', 13398]
  );
  await importarRss(dos);
  assert.equal(vistas('Tekkonkinkreet'), 2);
  await importarRss(dos);
  diario(['Tekkonkinkreet', 2006, '2026-01-03', 'https://boxd.it/tk1']);
  assert.equal(vistas('Tekkonkinkreet'), 2);
});

test('dos películas distintas con el mismo título y año no se funden en una nota', () => {
  const csv = 'Date,Name,Year,Letterboxd URI,Rating\n2026-01-01,Hamlet,1990,https://boxd.it/hA,4\n2026-01-01,Hamlet,1990,https://boxd.it/hB,2\n';
  assert.equal(lb.importLetterboxdCsv(csv, { filename: 'ratings.csv' }).imported, 2);
  assert.equal(n("SELECT COUNT(*) n FROM lb_entries WHERE list = 'ratings' AND title = 'Hamlet'"), 2);
  // y reimportarlo no cambia nada
  assert.equal(lb.importLetterboxdCsv(csv, { filename: 'ratings.csv' }).imported, 0);
  assert.equal(n("SELECT COUNT(*) n FROM lb_entries WHERE list = 'ratings' AND title = 'Hamlet'"), 2);
});
