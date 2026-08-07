import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { cumpleCriterio, codigosDe, subCriteria, SUB_LANG_OPTIONS } = await import('../src/subs.js');
const { setSetting } = await import('../src/db.js');

/**
 * La auditoría de subtítulos. El criterio lo pone el usuario en Ajustes y puede
 * ser cualquier combinación de VO / español / inglés; «VO» significa «en el
 * idioma en que se rodó» y se resuelve contra el idioma original de TMDB.
 */

test('el puente ISO-639: TMDB dice «ja» y Plex dice «jpn»', () => {
  // sin esta traducción el criterio VO no casaría casi nunca
  assert.ok(codigosDe('ja').includes('jpn'));
  assert.ok(codigosDe('es').includes('spa'));
  assert.ok(codigosDe('en').includes('eng'));
  // Plex a veces manda la variante «T» del código: fre en vez de fra
  assert.ok(codigosDe('fr').includes('fra'));
  assert.ok(codigosDe('fr').includes('fre'));
  assert.ok(codigosDe('de').includes('ger'));
  assert.deepEqual(codigosDe(null), []);
});

test('basta con UNA de las pistas marcadas', () => {
  const peli = { subs: ['eng'], originalLanguage: 'ja' };
  assert.equal(cumpleCriterio(peli, ['spa']), false);
  assert.equal(cumpleCriterio(peli, ['eng']), true);
  assert.equal(cumpleCriterio(peli, ['spa', 'eng']), true); // combinación
});

test('el criterio VO mira el idioma original, no una lista fija', () => {
  const japonesa = { subs: ['jpn'], originalLanguage: 'ja' };
  assert.equal(cumpleCriterio(japonesa, ['vo']), true);
  // la misma pista japonesa NO cubre una película francesa
  const francesa = { subs: ['jpn'], originalLanguage: 'fr' };
  assert.equal(cumpleCriterio(francesa, ['vo']), false);
  // y una española con subtítulos en español cumple por VO y por «spa»
  const espanola = { subs: ['spa'], originalLanguage: 'es' };
  assert.equal(cumpleCriterio(espanola, ['vo']), true);
  assert.equal(cumpleCriterio(espanola, ['spa']), true);
});

test('sin pistas nunca cumple, y sin criterio no se acusa a nadie', () => {
  assert.equal(cumpleCriterio({ subs: [], originalLanguage: 'ja' }, ['spa', 'eng', 'vo']), false);
  // criterio vacío = auditoría apagada: no puede haber incumplimiento
  assert.equal(cumpleCriterio({ subs: [], originalLanguage: 'ja' }, []), true);
});

test('una película sin idioma original conocido no cumple «VO», pero sí los idiomas fijos', () => {
  // no se puede afirmar que una pista esté en el idioma original si no se sabe
  // cuál es: mejor no acusar por VO, pero el resto del criterio sigue valiendo
  const sinIdioma = { subs: ['spa'], originalLanguage: null };
  assert.equal(cumpleCriterio(sinIdioma, ['vo']), false);
  assert.equal(cumpleCriterio(sinIdioma, ['vo', 'spa']), true);
});

test('subCriteria lee el ajuste y descarta lo que no existe', () => {
  setSetting('subs_ok_langs', 'spa,eng');
  assert.deepEqual(subCriteria(), ['spa', 'eng']);
  setSetting('subs_ok_langs', 'vo, spa , klingon');
  assert.deepEqual(subCriteria(), ['vo', 'spa']); // el inventado se cae
  setSetting('subs_ok_langs', '');
  assert.deepEqual(subCriteria(), []); // vacío = apagada
});

test('las opciones que se ofrecen son exactamente las tres pactadas', () => {
  assert.deepEqual(SUB_LANG_OPTIONS.map((o) => o.key), ['vo', 'spa', 'eng']);
});

test('sin analizar NO es lo mismo que sin subtítulos', async () => {
  // Al actualizar a la 1.04, TODA la biblioteca está sin analizar: el sync
  // tiraba las pistas. Contarlas como «sin subtítulos» habría dado doce mil
  // falsos positivos el primer día. Salió al verificar en la demo.
  const { db } = await import('../src/db.js');
  const { subtitleAudit } = await import('../src/subs.js');
  const { setSetting } = await import('../src/db.js');
  setSetting('subs_ok_langs', 'spa');

  db.prepare('DELETE FROM movies').run();
  db.prepare('DELETE FROM movie_streams').run();
  const nueva = db.prepare(
    "INSERT INTO movies (rating_key, title, year, full_synced, original_language) VALUES (?, ?, ?, 1, 'ja')"
  );
  nueva.run(1, 'Analizada con subtítulos', 2020);
  nueva.run(2, 'Analizada SIN subtítulos', 2021);
  nueva.run(3, 'Nunca analizada', 2022);
  const st = db.prepare('INSERT INTO movie_streams (movie_id, kind, lang, codec, forced) VALUES (?,?,?,?,?)');
  st.run(1, 'audio', 'jpn', 'ac3', 0);
  st.run(1, 'sub', 'spa', 'subrip', 0);
  st.run(2, 'audio', 'jpn', 'ac3', 0); // tiene audio pero ninguna pista de subtítulo
  // la 3 no tiene NINGUNA fila: es la que aún no se ha mirado

  const r = subtitleAudit();
  assert.equal(r.total, 2, 'solo se juzgan las analizadas');
  assert.equal(r.conProblema, 1);
  assert.equal(r.faltan[0].title, 'Analizada SIN subtítulos');
  assert.equal(r.sinAnalizar, 1, 'la nunca analizada se cuenta aparte');
});
