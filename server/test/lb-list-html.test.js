import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { parseListPage } = await import('../src/letterboxd.js');

/**
 * Marcado REAL de una página de lista de Letterboxd (agosto de 2026), recortado.
 * Letterboxd renombró `data-film-*` a `data-item-*` y añadir listas por URL dejó
 * de funcionar sin avisar: el importador seguía devolviendo 200 y cero películas.
 */
const HTML_NUEVO = `
<ul class="poster-list -p125 -grid">
  <li class="posteritem" data-object-id="filmListEntry:2626862444">
    <div class="react-component" data-component-class="LazyPoster" data-item-name="The Cabinet of Dr. Caligari (1920)"
      data-item-slug="the-cabinet-of-dr-caligari-1920" data-item-link="/film/the-cabinet-of-dr-caligari-1920/"
      data-item-full-display-name="The Cabinet of Dr. Caligari (1920)"></div>
  </li>
  <li class="posteritem">
    <div class="react-component" data-item-name="Nosferatu (1922)" data-item-slug="nosferatu"
      data-item-link="/film/nosferatu/" data-item-full-display-name="Nosferatu (1922)"></div>
  </li>
  <li class="posteritem">
    <div class="react-component" data-item-name="Pierrot le Fou (1965)" data-item-slug="pierrot-le-fou"
      data-item-link="/film/pierrot-le-fou/"></div>
  </li>
  <li class="posteritem">
    <div class="react-component" data-item-name="Tom &amp; Jerry: The Movie (1992)" data-item-slug="tom-and-jerry-the-movie"
      data-item-link="/film/tom-and-jerry-the-movie/"></div>
  </li>
</ul>`;

/** El marcado anterior, que hay que seguir entendiendo por si vuelve. */
const HTML_VIEJO = `
<ul class="poster-list">
  <li class="poster-container">
    <div class="film-poster" data-film-slug="the-godfather" data-film-name="The Godfather" data-film-release-year="1972">
      <img alt="The Godfather" />
    </div>
  </li>
</ul>`;

test('lee el marcado nuevo de Letterboxd (data-item-*)', () => {
  const items = [];
  const n = parseListPage(HTML_NUEVO, new Set(), items);
  assert.equal(n, 4);
  assert.deepEqual(
    items.map((i) => [i.title, i.year]),
    [
      ['The Cabinet of Dr. Caligari', 1920],
      ['Nosferatu', 1922],
      ['Pierrot le Fou', 1965],
      ['Tom & Jerry: The Movie', 1992],
    ]
  );
  assert.equal(items[0].uri, 'https://letterboxd.com/film/the-cabinet-of-dr-caligari-1920/');
  assert.equal(items[0].position, 1);
});

test('el año sale del nombre aunque el slug no lo lleve', () => {
  const items = [];
  parseListPage(HTML_NUEVO, new Set(), items);
  const nosferatu = items.find((i) => i.title === 'Nosferatu');
  assert.equal(nosferatu.year, 1922, 'el slug «nosferatu» no tiene año: hay que sacarlo de «(1922)»');
});

test('las entidades HTML se desescapan', () => {
  const items = [];
  parseListPage(HTML_NUEVO, new Set(), items);
  assert.ok(items.some((i) => i.title === 'Tom & Jerry: The Movie'), 'debería ser «&», no «&amp;»');
});

test('sigue entendiendo el marcado anterior (data-film-*)', () => {
  const items = [];
  const n = parseListPage(HTML_VIEJO, new Set(), items);
  assert.equal(n, 1);
  assert.deepEqual([items[0].title, items[0].year], ['The Godfather', 1972]);
});

test('no repite películas entre páginas', () => {
  const seen = new Set();
  const items = [];
  parseListPage(HTML_NUEVO, seen, items);
  const segunda = parseListPage(HTML_NUEVO, seen, items); // misma página otra vez
  assert.equal(segunda, 0, 'la segunda pasada no debe añadir nada');
  assert.equal(items.length, 4);
});

test('una página sin películas devuelve cero, no revienta', () => {
  assert.equal(parseListPage('<html><body>Nada por aquí</body></html>', new Set(), []), 0);
  assert.equal(parseListPage('', new Set(), []), 0);
});

// --- defensa contra zips inflados ------------------------------------------

const { zipSync } = await import('fflate');
const { importLetterboxdZip } = await import('../src/letterboxd.js');
const bytes = (n) => new TextEncoder().encode('a,b,c\n'.repeat(n));

test('un zip que se expande demasiado se rechaza SIN inflarlo en memoria', () => {
  // 40 entradas de 6 MB: comprimen a nada y suman 240 MB al abrirlas, por encima
  // del tope de 200 MB
  const entradas = {};
  for (let i = 0; i < 40; i++) entradas[`f${i}.csv`] = bytes(1_000_000);
  const bomba = Buffer.from(zipSync(entradas, { level: 9 }));

  const antes = process.memoryUsage().rss;
  assert.throws(() => importLetterboxdZip(bomba), /se expande/);
  const crecimiento = (process.memoryUsage().rss - antes) / 1024 / 1024;
  // el tope va dentro del filtro de fflate: si volviera a comprobarse después,
  // esto se dispararía a cientos de megas
  assert.ok(crecimiento < 200, `creció ${crecimiento.toFixed(0)} MB: se está inflando antes de rechazarlo`);
});

test('un zip con demasiados ficheros se rechaza', () => {
  const entradas = {};
  for (let i = 0; i < 600; i++) entradas[`f${i}.csv`] = bytes(10);
  assert.throws(() => importLetterboxdZip(Buffer.from(zipSync(entradas))), /más de \d+ ficheros/);
});

test('el export normal de Letterboxd sigue entrando', () => {
  const enc = new TextEncoder();
  const z = zipSync({
    'watched.csv': enc.encode('Date,Name,Year\n2024-01-01,Taxi Driver,1976\n'),
    'ignorame.txt': enc.encode('nada'),
  });
  const r = importLetterboxdZip(Buffer.from(z));
  assert.equal(r.results[0].imported, 1);
});
