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

test('sin el secreto el valor cifrado no se puede leer', () => {
  const env = { ...process.env, DATA_DIR: dir };
  delete env.POWAFLEX_SECRET;
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { getSetting } = await import(${JSON.stringify(dbUrl)});
       process.stdout.write(String(getSetting('plex_token') ?? ''));`,
    ],
    { env, encoding: 'utf-8', cwd: path.dirname(fileURLToPath(import.meta.url)) }
  );
  // the blob comes back as-is: opaque, but boot still works
  assert.match(out, /^enc:v1:/);
  assert.ok(!out.includes('xyz-token-plex'));
});
