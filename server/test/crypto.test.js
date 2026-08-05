import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// isolate the DB this test process touches, with encryption at rest enabled
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));
process.env.DATA_DIR = dir;
process.env.POWAFLEX_SECRET = 'frase-larga-y-secreta-de-prueba';

const { db, getSetting, setSetting } = await import('../src/db.js');
const dbUrl = new URL('../src/db.js', import.meta.url).href;

const stored = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;

test('con POWAFLEX_SECRET las credenciales van cifradas y se leen igual', () => {
  setSetting('plex_token', 'xyz-token-plex');
  setSetting('tmdb_key', 'clave-tmdb');
  // transparent round-trip
  assert.equal(getSetting('plex_token'), 'xyz-token-plex');
  assert.equal(getSetting('tmdb_key'), 'clave-tmdb');
  // the plaintext is not on disk
  assert.match(stored('plex_token'), /^enc:v1:/);
  assert.ok(!stored('plex_token').includes('xyz-token-plex'));
  // every encryption uses a fresh IV
  setSetting('mdblist_key', 'igual');
  const a = stored('mdblist_key');
  setSetting('mdblist_key', 'igual2');
  setSetting('mdblist_key', 'igual');
  assert.notEqual(stored('mdblist_key'), a);
});

test('los ajustes que no son credenciales no se cifran', () => {
  setSetting('plex_url', 'http://192.168.1.10:32400');
  assert.equal(stored('plex_url'), 'http://192.168.1.10:32400');
});

// Sin el secreto (perdido, o cambiado) la credencial es ilegible. Lo que NO
// puede pasar es que el criptograma salga de aquí haciéndose pasar por ella:
// acababa en la query de Plex y en las cabeceras de TMDB/Radarr, y el usuario
// solo veía un 401 incomprensible en vez de «falta la credencial».
test('sin el secreto la credencial cifrada se lee como ausente, no como criptograma', () => {
  const env = { ...process.env, DATA_DIR: dir };
  delete env.POWAFLEX_SECRET;
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { getSetting } = await import(${JSON.stringify(dbUrl)});
       process.stdout.write(JSON.stringify({
         token: getSetting('plex_token'),
         url: getSetting('plex_url'),
       }));`,
    ],
    { env, encoding: 'utf-8', cwd: path.dirname(fileURLToPath(import.meta.url)) }
  );
  const leido = JSON.parse(out);
  assert.equal(leido.token, null);
  assert.ok(!String(out).includes('xyz-token-plex'));
  // y lo que no es una credencial se sigue leyendo con normalidad: el arranque
  // no se rompe por haber perdido el secreto
  assert.equal(leido.url, 'http://192.168.1.10:32400');
});

test('con el secreto equivocado tampoco se cuela el criptograma', () => {
  const env = { ...process.env, DATA_DIR: dir, POWAFLEX_SECRET: 'otro-secreto-distinto' };
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { getSetting } = await import(${JSON.stringify(dbUrl)});
       process.stdout.write(JSON.stringify(getSetting('plex_token')));`,
    ],
    { env, encoding: 'utf-8', cwd: path.dirname(fileURLToPath(import.meta.url)) }
  );
  assert.equal(JSON.parse(out), null);
});
