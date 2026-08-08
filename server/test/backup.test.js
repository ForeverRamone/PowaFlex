import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const { hacerCopia, listarCopias, copiasRetenidas, copiasActivadas, BACKUP_DIR } = await import('../src/backup.js');
const { setSetting } = await import('../src/db.js');

/**
 * La copia automática. Lo importante aquí es que NUNCA se copie el fichero vivo
 * (con WAL activo eso puede dar una base corrupta) y que la rotación no se
 * coma el disco del Beelink.
 */

test('la copia se hace con la API de backup y queda un fichero legible', async () => {
  const r = await hacerCopia({ fecha: new Date('2026-08-06T03:40:00Z') });
  assert.equal(r.file, 'powaflex-2026-08-06.db');
  assert.ok(r.bytes > 0);
  const destino = path.join(BACKUP_DIR, r.file);
  assert.ok(fs.existsSync(destino));
  // cabecera de un SQLite de verdad, no un fichero a medias
  const cabecera = fs.readFileSync(destino).subarray(0, 15).toString();
  assert.equal(cabecera, 'SQLite format 3');
});

test('dos copias el mismo día no se pisan', async () => {
  const a = await hacerCopia({ fecha: new Date('2026-08-07T03:40:00Z') });
  const b = await hacerCopia({ fecha: new Date('2026-08-07T19:05:30Z') });
  assert.equal(a.file, 'powaflex-2026-08-07.db');
  // la segunda del día lleva la hora en vez de machacar la de la noche
  assert.equal(b.file, 'powaflex-2026-08-07-190530.db');
  assert.notEqual(a.file, b.file);
});

test('la rotación se queda con las N más recientes', async () => {
  setSetting('backup_keep', '3');
  assert.equal(copiasRetenidas(), 3);
  for (let d = 10; d <= 20; d++) {
    await hacerCopia({ fecha: new Date(`2026-09-${d}T03:40:00Z`) });
  }
  const copias = listarCopias();
  assert.equal(copias.length, 3, 'debería haber podado hasta dejar tres');
  // y las que quedan son las últimas, no unas cualesquiera
  assert.ok(copias[0].file.includes('2026-09-20'));
});

test('el ajuste de retención no acepta disparates', () => {
  setSetting('backup_keep', '0');
  assert.equal(copiasRetenidas(), 7); // cero copias no es una opción
  setSetting('backup_keep', 'muchas');
  assert.equal(copiasRetenidas(), 7);
  setSetting('backup_keep', '999');
  assert.equal(copiasRetenidas(), 60); // tope, que el disco es finito
  setSetting('backup_keep', '7');
});

test('la copia automática está apagada mientras no la enciendas', () => {
  assert.equal(copiasActivadas(), false);
  setSetting('backup_auto', '1');
  assert.equal(copiasActivadas(), true);
  setSetting('backup_auto', '0');
  assert.equal(copiasActivadas(), false);
});

test('la poda ordena por la fecha del NOMBRE, no por la del fichero', async () => {
  // Un rsync sin -t, o restaurar una copia desde un NAS, cambia el mtime de
  // todas: con ese criterio la poda conservaba las siete MÁS VIEJAS y borraba
  // las de hoy. Lo reprodujo el revisor sin querer.
  setSetting('backup_keep', '2');
  for (const c of listarCopias()) fs.unlinkSync(path.join(BACKUP_DIR, c.file));

  // tres copias con fechas distintas en el nombre y el MISMO mtime reciente
  const ahora = new Date();
  for (const dia of ['2026-01-01', '2026-06-15', '2026-12-31']) {
    fs.writeFileSync(path.join(BACKUP_DIR, `powaflex-${dia}.db`), 'x');
    fs.utimesSync(path.join(BACKUP_DIR, `powaflex-${dia}.db`), ahora, ahora);
  }
  const orden = listarCopias().map((c) => c.file);
  assert.deepEqual(orden, ['powaflex-2026-12-31.db', 'powaflex-2026-06-15.db', 'powaflex-2026-01-01.db']);

  // y al hacer una nueva, la que se va es la más antigua POR NOMBRE
  await hacerCopia({ fecha: new Date('2027-01-05T03:40:00Z') });
  const quedan = listarCopias().map((c) => c.file);
  assert.equal(quedan.length, 2);
  assert.ok(quedan.includes('powaflex-2027-01-05.db'), 'la recién hecha se queda');
  assert.ok(!quedan.includes('powaflex-2026-01-01.db'), 'la más vieja se va');
  setSetting('backup_keep', '7');
});

test('dos copias del MISMO día se ordenan por la hora, no al revés', async () => {
  // Rellenar con ceros sin quitar los guiones ponía «2026-08-08-054407» (la de
  // la tarde) ANTES que «2026-08-080000000» (la de la mañana), porque el guion
  // ordena antes que el cero: la poda se llevaba la copia fresca.
  setSetting('backup_keep', '1');
  for (const c of listarCopias()) fs.unlinkSync(path.join(BACKUP_DIR, c.file));

  const manana = await hacerCopia({ fecha: new Date('2027-03-03T03:40:00Z') });
  const tarde = await hacerCopia({ fecha: new Date('2027-03-03T19:05:30Z') });
  assert.equal(manana.file, 'powaflex-2027-03-03.db');
  assert.equal(tarde.file, 'powaflex-2027-03-03-190530.db');

  const quedan = listarCopias().map((c) => c.file);
  assert.deepEqual(quedan, ['powaflex-2027-03-03-190530.db'], 'debe sobrevivir la de la tarde');
  setSetting('backup_keep', '7');
});
