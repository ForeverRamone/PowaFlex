import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esLargometraje, partirPorFecha, RELEASE_KINDS } from '../src/releases.js';

test('esLargometraje: solo cine largometraje', () => {
  assert.equal(esLargometraje({ runtime: 95 }), true);
  // un corto demostrado (<40 min) se cae; sin duración conocida se queda
  assert.equal(esLargometraje({ runtime: 22 }), false);
  assert.equal(esLargometraje({ runtime: null }), true);
  assert.equal(esLargometraje({}), true);
  // telefilmes y vídeos, fuera
  assert.equal(esLargometraje({ runtime: 100, isTvMovie: true }), false);
  assert.equal(esLargometraje({ runtime: 100, video: true }), false);
  // el límite es 40 exacto: 40 min ya cuenta como largo (regla de la casa)
  assert.equal(esLargometraje({ runtime: 40 }), true);
  assert.equal(esLargometraje({ runtime: 39 }), false);
});

test('partirPorFecha: recientes hacia atrás, próximas hacia delante', () => {
  const hoy = '2026-08-06';
  const { recent, upcoming } = partirPorFecha(
    [
      { title: 'ayer', date: '2026-08-05' },
      { title: 'lejos', date: '2026-09-20' },
      { title: 'hace un mes', date: '2026-07-06' },
      { title: 'mañana', date: '2026-08-07' },
      { title: 'hoy', date: '2026-08-06' },
      { title: 'sin fecha', date: null },
    ],
    hoy
  );
  // lo de hoy cuenta como estrenado, y lo reciente va de nuevo a viejo
  assert.deepEqual(recent.map((r) => r.title), ['hoy', 'ayer', 'hace un mes']);
  // lo venidero va de próximo a lejano; sin fecha, al final
  assert.deepEqual(upcoming.map((r) => r.title), ['mañana', 'lejos', 'sin fecha']);
});

test('las tres pestañas existen con su región y tipo', () => {
  assert.equal(RELEASE_KINDS['cine-es'].region, 'ES');
  assert.equal(RELEASE_KINDS['cine-us'].region, 'US');
  assert.equal(RELEASE_KINDS['plataformas-es'].types, '4');
  assert.equal(RELEASE_KINDS['plataformas-es'].providers, true);
});
