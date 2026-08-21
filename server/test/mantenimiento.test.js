import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-mant-'));

const { db, podarCaches, compactar, cacheRead } = await import('../src/db.js');

const DIA = 24 * 3600 * 1000;
const meter = (key, dias) =>
  db
    .prepare('INSERT OR REPLACE INTO tmdb_cache (key, json, fetched_at) VALUES (?, ?, ?)')
    .run(key, '{"id":1}', Date.now() - dias * DIA);
const hay = (key) => !!db.prepare('SELECT 1 FROM tmdb_cache WHERE key = ?').get(key);

// La poda borra SOLO lo que ninguna lectura podría aceptar ya, y con margen: el
// plazo más largo de toda la app es el año del emparejado por película
// (`film_match:`), y el siguiente son los 180 días de la edición de un festival
// pasado. De ahí los 400 y los 200 días, que dejan semanas de colchón por si
// algún día se alarga un TTL sin acordarse de esto.
test('la poda respeta el plazo más largo de cada familia', () => {
  meter('movie_cr:1:es-ES', 300); // caducó hace mucho (su TTL son 7 días)
  meter('movie_cr:2:es-ES', 1); // recién pedida
  meter('festival:v16:cannes:2019', 250); // pasó de los 180 de una edición vieja
  meter('festival:v16:cannes:2020', 100); // aún dentro
  meter('film_match:v5:vieja', 300); // el emparejado vive un AÑO: se queda
  meter('film_match:v5:antiquisima', 500); // pasó del año con margen: fuera

  const r = podarCaches();

  assert.equal(hay('movie_cr:1:es-ES'), false, 'una ficha de hace 300 días no la lee nadie');
  assert.equal(hay('movie_cr:2:es-ES'), true);
  assert.equal(hay('festival:v16:cannes:2019'), false);
  assert.equal(hay('festival:v16:cannes:2020'), true);
  assert.equal(hay('film_match:v5:vieja'), true, 'el emparejado por película dura un año');
  assert.equal(hay('film_match:v5:antiquisima'), false);
  assert.equal(r.cache, 3);
});

test('el colchón es de verdad: lo recién caducado se queda', () => {
  // 190 días es MÁS que los 180 de una edición vieja, pero menos que el corte
  // de la poda: se conserva a propósito, para que un cambio de TTL no borre
  // datos vivos sin que nadie se entere
  meter('festival:v16:venecia:2018', 190);
  podarCaches();
  assert.equal(hay('festival:v16:venecia:2018'), true);
});

test('no toca nada de lo que sigue siendo legible', () => {
  meter('person_credits:99:es-ES', 3);
  podarCaches();
  // y se lee de verdad, no solo existe la fila
  assert.deepEqual(cacheRead('person_credits:99:es-ES', 7 * DIA), { id: 1 });
});

test('poda los avisos viejos del Dashboard y el log de reglas', () => {
  const ins = db.prepare(
    `INSERT INTO app_events (type, ref, title, body, url, created_at) VALUES ('digital', ?, ?, '', '', ?)`
  );
  ins.run('viejo', 'De hace un año', Date.now() - 300 * DIA);
  ins.run('nuevo', 'De esta semana', Date.now() - 2 * DIA);
  db.prepare(
    'INSERT INTO radarr_rule_log (rule_id, at, tmdb_id, title, score, action, detail) VALUES (1, ?, 1, ?, null, ?, null)'
  ).run(Date.now() - 60 * DIA, 'vieja', 'added');
  db.prepare(
    'INSERT INTO radarr_rule_log (rule_id, at, tmdb_id, title, score, action, detail) VALUES (1, ?, 2, ?, null, ?, null)'
  ).run(Date.now() - 2 * DIA, 'reciente', 'added');

  const r = podarCaches();
  assert.equal(r.eventos, 1);
  assert.equal(r.reglas, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM app_events').get().n, 1);
  // el log de reglas se poda DENTRO de la pasada de Radarr, pero solo si hay
  // reglas activas: al apagarlas todas, lo último se quedaba ahí para siempre
  assert.equal(db.prepare('SELECT COUNT(*) n FROM radarr_rule_log').get().n, 1);
});

test('una base sin nada que podar no miente diciendo que podó', () => {
  const r = podarCaches();
  assert.equal(r.cache, 0);
  assert.equal(r.eventos, 0);
  assert.equal(r.reglas, 0);
  assert.deepEqual(r.detalle, {});
});

test('compactar devuelve cuánto ha liberado y deja la base usable', () => {
  for (let i = 0; i < 400; i++) meter(`basura:${i}`, 900);
  podarCaches();
  const r = compactar();
  assert.ok(r.liberado >= 0);
  // la base sigue viva después de compactar
  meter('despues:1', 0);
  assert.equal(hay('despues:1'), true);
});
