import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { db } = await import('../src/db.js');
const { autoRadarrExcluidas } = await import('../src/automation.js');

/**
 * El pase automático de Radarr no debe tocar dos cosas: lo vetado a mano desde
 * Cine venidero (🚫) y lo descartado con el ✕ de Descubrir. Lo segundo NO se
 * miraba: podías decir «no me interesa» y encontrártela descargada esa noche.
 */
test('el automático excluye lo vetado y lo descartado, con su motivo', () => {
  db.prepare('INSERT INTO auto_radarr_vetoed (tmdb_id, title, at) VALUES (?, ?, ?)').run(101, 'La vetada', 1);
  db.prepare('INSERT INTO dismissed_movies (tmdb_id, title, at) VALUES (?, ?, ?)').run(202, 'La descartada', 1);

  const ex = autoRadarrExcluidas();
  assert.equal(ex.get(101), 'vetada');
  assert.equal(ex.get(202), 'descartada');
  assert.equal(ex.has(999), false); // una cualquiera sigue siendo candidata
});

test('vetada Y descartada manda el motivo más específico', () => {
  db.prepare('INSERT INTO dismissed_movies (tmdb_id, title, at) VALUES (?, ?, ?)').run(303, 'Las dos cosas', 1);
  db.prepare('INSERT INTO auto_radarr_vetoed (tmdb_id, title, at) VALUES (?, ?, ?)').run(303, 'Las dos cosas', 1);
  assert.equal(autoRadarrExcluidas().get(303), 'vetada');
});

test('quitar el veto la devuelve al pase automático', () => {
  db.prepare('INSERT INTO auto_radarr_vetoed (tmdb_id, title, at) VALUES (?, ?, ?)').run(404, 'Arrepentida', 1);
  assert.equal(autoRadarrExcluidas().has(404), true);
  db.prepare('DELETE FROM auto_radarr_vetoed WHERE tmdb_id = ?').run(404);
  assert.equal(autoRadarrExcluidas().has(404), false);
});
