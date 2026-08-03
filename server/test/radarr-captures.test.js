import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// isolate the DB this test process touches
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { db } = await import('../src/db.js');
const { storeRadarrMovies, radarrCaptures } = await import('../src/radarr.js');

/**
 * El feed de capturas vive del diff del snapshot de Radarr: una monitorizada
 * que pasa de «sin archivo» a «con archivo» es una captura. El snapshot se
 * pisa con DELETE en cada sync, así que si el diff no se toma ANTES, el
 * historial no existe — que era exactamente el estado anterior.
 */
test('el sync de Radarr apunta como captura el paso de sin-archivo a con-archivo', () => {
  // snapshot anterior: A pendiente, B ya con archivo
  db.prepare(
    `INSERT INTO radarr_movies (tmdb_id, title, year, added, has_file, monitored, synced_at)
     VALUES (1, 'Pendiente', 2024, '2025-01-01', 0, 1, 0), (2, 'Ya estaba', 2020, '2024-01-01', 1, 1, 0)`
  ).run();

  storeRadarrMovies([
    // A por fin tiene archivo → captura, con su calidad
    { tmdbId: 1, title: 'Pendiente', year: 2024, hasFile: true, monitored: true, movieFile: { quality: { quality: { name: 'Bluray-1080p' } } } },
    // B sigue igual → no es captura
    { tmdbId: 2, title: 'Ya estaba', year: 2020, hasFile: true, monitored: true },
    // C entra nueva YA con archivo: nunca estuvo pendiente → tampoco
    { tmdbId: 3, title: 'Nueva con archivo', year: 2023, hasFile: true, monitored: true },
    // D entra nueva sin archivo: queda pendiente para el futuro
    { tmdbId: 4, title: 'Nueva pendiente', year: 2026, hasFile: false, monitored: true },
  ]);

  const caps = radarrCaptures(30);
  assert.equal(caps.length, 1);
  assert.equal(caps[0].tmdb_id, 1);
  assert.equal(caps[0].quality, 'Bluray-1080p');

  // y en el sync siguiente, D capturada también se apunta
  storeRadarrMovies([
    { tmdbId: 4, title: 'Nueva pendiente', year: 2026, hasFile: true, monitored: true },
  ]);
  const caps2 = radarrCaptures(30);
  assert.equal(caps2.length, 2);
  assert.equal(caps2.map((c) => c.tmdb_id).sort().join(','), '1,4');
});
