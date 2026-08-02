import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRY, parseSelectionTable, stripTags } from '../src/festivals.js';

/**
 * Festivales: la convención de títulos de artículo y el parser de wikitables.
 *
 * Los artículos numerados (Venecia, Berlinale, Busan) se generan restando el
 * año de origen; si alguien toca esa aritmética, la página pediría a Wikipedia
 * un artículo que no existe y TODAS las ediciones fallarían igual de raro.
 */

test('los títulos de artículo siguen la convención de la Wikipedia inglesa', () => {
  assert.equal(REGISTRY.cannes.article(2025), '2025 Cannes Film Festival');
  assert.equal(REGISTRY.venecia.article(2025), '82nd Venice International Film Festival');
  assert.equal(REGISTRY.venecia.article(2024), '81st Venice International Film Festival');
  assert.equal(REGISTRY.venecia.article(2023), '80th Venice International Film Festival');
  assert.equal(REGISTRY.berlinale.article(2025), '75th Berlin International Film Festival');
  assert.equal(REGISTRY.busan.article(2025), '30th Busan International Film Festival');
  assert.equal(REGISTRY.sundance.article(2025), '2025 Sundance Film Festival');
  assert.equal(REGISTRY.tiff.article(2025), '2025 Toronto International Film Festival');
});

test('cada festival casa el nombre real de su sección oficial', () => {
  assert.ok(REGISTRY.cannes.section.test('In Competition'));
  assert.ok(REGISTRY.venecia.section.test('In Competition (Venezia 82)'));
  assert.ok(REGISTRY.berlinale.section.test('Main Competition'));
  assert.ok(REGISTRY.sundance.section.test('World Cinema Dramatic Competition'));
  assert.ok(REGISTRY.tiff.section.test('Platform'));
  assert.ok(REGISTRY.busan.section.test('Competition'));
});

// una tabla como las reales: cursivas, enlaces, notas [1], celdas con <br>
const TABLA = `
<table class="wikitable sortable">
<tr><th>English title</th><th>Original title</th><th>Director(s)</th><th>Production country</th></tr>
<tr><td><i><a href="/wiki/x">It Was Just an Accident</a></i></td><td><i>Yek tasadof-e sadeh</i></td><td><a href="/wiki/y">Jafar Panahi</a><sup>[1]</sup></td><td>Iran</td></tr>
<tr><td><i>Sentimental Value</i></td><td><i>Affeksjonsverdi</i></td><td>Joachim Trier</td><td>Norway<br>Denmark</td></tr>
<tr><td><i>Alpha</i> <a href="#qp">(QP)</a></td><td>Julia Ducournau</td><td>France</td></tr>
<tr><td colspan="4">Fila de relleno sin película</td></tr>
</table>`;

test('parseSelectionTable saca título, original, director y país', () => {
  const rows = parseSelectionTable(TABLA);
  assert.equal(rows.length, 4); // la fila de relleno cae en la celda de título
  assert.deepEqual(rows[0], {
    title: 'It Was Just an Accident',
    original_title: 'Yek tasadof-e sadeh',
    director: 'Jafar Panahi',
    country: 'Iran',
  });
  assert.equal(rows[1].country, 'Norway, Denmark'); // <br> se vuelve coma
});

// Cannes 2025: si el título original coincide con el inglés, la fila viene SIN
// esa celda y sin recolocar las columnas el país acababa como director/a
test('una fila sin celda de título original se recoloca, y el marcador (QP) se limpia', () => {
  const alpha = parseSelectionTable(TABLA)[2];
  assert.deepEqual(alpha, {
    title: 'Alpha',
    original_title: 'Alpha',
    director: 'Julia Ducournau',
    country: 'France',
  });
});

test('sin columna de director no es una tabla de selección', () => {
  const sinDirector = '<table class="wikitable"><tr><th>Award</th><th>Winner</th></tr><tr><td>Palme</td><td>X</td></tr></table>';
  assert.deepEqual(parseSelectionTable(sinDirector), []);
});

test('stripTags limpia notas, estilos y entidades', () => {
  assert.equal(stripTags('<i><a href="#">Título</a></i><sup>[2]</sup>'), 'Título');
  assert.equal(stripTags('A&amp;B &quot;C&quot;'), 'A&B "C"');
});
