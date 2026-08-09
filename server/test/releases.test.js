import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esLargometraje, partirPorFecha, RELEASE_KINDS, providersDeRegion } from '../src/releases.js';

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

test('las cuatro pestañas existen con su región y tipo', () => {
  assert.equal(RELEASE_KINDS['cine-es'].region, 'ES');
  assert.equal(RELEASE_KINDS['cine-us'].region, 'US');
  assert.equal(RELEASE_KINDS['plataformas-es'].types, '4');
  assert.equal(RELEASE_KINDS['plataformas-es'].providers, true);
  // plataformas y VOD de EE UU: mismo tipo digital, otra región — el «dónde
  // verla» sale de results.US de la MISMA caché de providers, sin llamadas extra
  assert.equal(RELEASE_KINDS['plataformas-us'].region, 'US');
  assert.equal(RELEASE_KINDS['plataformas-us'].types, '4');
  assert.equal(RELEASE_KINDS['plataformas-us'].providers, true);
  // las de cine NO piden providers: son cartelera, no dónde verla en casa
  assert.ok(!RELEASE_KINDS['cine-es'].providers && !RELEASE_KINDS['cine-us'].providers);
});

test('providersDeRegion separa lo incluido del VOD, con nombres', () => {
  const { providers, vod } = providersDeRegion({
    flatrate: [{ provider_name: 'Filmin' }, { provider_name: 'MUBI' }],
    ads: [{ provider_name: 'Plex' }],
    rent: [{ provider_name: 'Apple TV' }, { provider_name: 'Amazon Video' }],
    buy: [{ provider_name: 'Apple TV' }], // el mismo en alquiler y compra: una vez
  });
  assert.deepEqual(providers, ['Filmin', 'MUBI', 'Plex']);
  assert.deepEqual(vod, ['Apple TV', 'Amazon Video']);
});

test('providersDeRegion: solo alquiler ya trae dónde, y una región vacía no rompe', () => {
  // este era el agujero: sin nombres, la ficha decía «alquiler/compra» a secas
  // y el filtro por plataforma no podía verla
  assert.deepEqual(providersDeRegion({ rent: [{ provider_name: 'Movistar Plus+' }] }), {
    providers: [],
    vod: ['Movistar Plus+'],
  });
  assert.deepEqual(providersDeRegion({}), { providers: [], vod: [] });
  assert.deepEqual(providersDeRegion(undefined), { providers: [], vod: [] });
});

/**
 * Galas de lucha libre y eventos: TMDB los ficha como PELÍCULAS y en Estrenos
 * eran la mitad del ruido (un G1 Climax son doce «películas», una por jornada).
 * No hay género que los delate —vienen sin géneros o como acción—; lo que sí
 * los delata es la productora, que ya viene en la ficha que se pide igualmente.
 */
test('esEvento reconoce las galas por su productora, no por el género', async () => {
  const { esEvento } = await import('../src/tmdb.js');
  assert.equal(esEvento({ production_companies: [{ name: 'WWE' }] }), true);
  assert.equal(esEvento({ production_companies: [{ name: 'New Japan Pro-Wrestling' }] }), true);
  assert.equal(esEvento({ production_companies: [{ name: 'All Elite Wrestling' }] }), true);
  assert.equal(esEvento({ production_companies: [{ name: 'Lucha Libre AAA Worldwide' }] }), true);
  // y NO se lleva por delante al cine de verdad
  assert.equal(esEvento({ production_companies: [{ name: 'A24' }, { name: 'Plan B Entertainment' }] }), false);
  assert.equal(esEvento({ production_companies: [{ name: 'Wild Bunch' }] }), false);
  assert.equal(esEvento({}), false);
});
