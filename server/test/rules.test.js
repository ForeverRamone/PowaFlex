import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// base propia: este fichero crea y borra reglas
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-test-'));

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { db } = await import('../src/db.js');
const {
  evaluarRegla, MOTIVOS, diasEntre, scopesDeFestival, rulesCatalog, reglaValida,
  createRule, updateRule, deleteRule, listRules, normalizarCampos, valoresPorDefecto, ruleLabel,
  radarrListoParaAñadir,
} = await import('../src/rules.js');
const { REGISTRY } = await import('../src/festivals.js');
const { ROLE_KEYS } = await import('../src/roles.js');

const peli = (id, extra = {}) => ({ tmdb_id: id, title: `Peli ${id}`, ...extra });
const conNota = (id, score, extra = {}) => peli(id, { mdb: { score }, ...extra });
const ctx = (over = {}) => ({ inLib: new Set(), owned: new Set(), excluidas: new Map(), hoy: '2026-08-09', ...over });

// --- el evaluador PURO --------------------------------------------------------

test('umbral 0 = sin filtro: entra todo, con nota y sin ella', () => {
  const r = evaluarRegla([conNota(1, 12), peli(2)], { min_score: 0, cap: 0 }, ctx());
  assert.deepEqual(r.elegidas.map((x) => x.tmdb_id), [1, 2]);
  assert.equal(r.descartadas.length, 0);
});

test('con umbral, lo que no llega se queda fuera y lo que aún no tiene nota ESPERA', () => {
  // la decisión de producto: mandar a ciegas lo que no tiene Σ vaciaría de
  // sentido el umbral, y una película de festival tarda semanas en tener nota
  const r = evaluarRegla([conNota(1, 75), conNota(2, 65), peli(3)], { min_score: 70, cap: 0 }, ctx());
  assert.deepEqual(r.elegidas.map((x) => x.tmdb_id), [1]);
  assert.equal(r.descartadas.find((d) => d.tmdb_id === 2).motivo, 'bajo_umbral');
  assert.equal(r.descartadas.find((d) => d.tmdb_id === 3).motivo, 'esperando_nota');
  // el umbral es «mayor O IGUAL»: 70 con umbral 70 entra
  assert.equal(evaluarRegla([conNota(9, 70)], { min_score: 70 }, ctx()).elegidas.length, 1);
});

test('«mándala igual» deja pasar las que no tienen nota, pero NO las que suspenden', () => {
  const regla = { min_score: 70, allow_unrated: 1, cap: 0 };
  const r = evaluarRegla([peli(1), conNota(2, 40)], regla, ctx());
  assert.deepEqual(r.elegidas.map((x) => x.tmdb_id), [1]);
  assert.equal(r.descartadas[0].motivo, 'bajo_umbral');
});

test('lo que ya tienes (Plex o Radarr) no se vuelve a pedir', () => {
  const r = evaluarRegla([peli(1), peli(2), peli(3)], { min_score: 0 }, ctx({ inLib: new Set([1]), owned: new Set([2]) }));
  assert.deepEqual(r.elegidas.map((x) => x.tmdb_id), [3]);
  assert.equal(r.porMotivo.ya_la_tienes, 2);
});

test('el veto 🚫 y el descarte ✕ mandan sobre cualquier regla', () => {
  const excluidas = new Map([[1, 'vetada'], [2, 'descartada']]);
  const r = evaluarRegla([peli(1), peli(2), peli(3)], { min_score: 0 }, ctx({ excluidas }));
  assert.deepEqual(r.elegidas.map((x) => x.tmdb_id), [3]);
  assert.equal(r.descartadas.find((d) => d.tmdb_id === 1).motivo, 'vetada');
  assert.equal(r.descartadas.find((d) => d.tmdb_id === 2).motivo, 'descartada');
});

test('cortos, telefilmes y documentales fuera; los documentales solo si los pides', () => {
  const items = [
    peli(1, { isShort: true }),
    peli(2, { isTvMovie: true }),
    peli(3, { isDocumentary: true }),
    peli(4, { isMusic: true }),
    peli(5),
  ];
  const sin = evaluarRegla(items, { min_score: 0 }, ctx());
  assert.deepEqual(sin.elegidas.map((x) => x.tmdb_id), [5]);
  assert.equal(sin.porMotivo.documental, 2); // el concierto cuenta como documental

  const con = evaluarRegla(items, { min_score: 0, include_docs: 1 }, ctx());
  assert.deepEqual(con.elegidas.map((x) => x.tmdb_id).sort(), [3, 4, 5]);
  // un corto sigue siendo un corto aunque pidas documentales
  assert.equal(con.porMotivo.corto, 1);
});

test('la ventana del estreno son N días ANTES y N después', () => {
  const regla = { min_score: 0, window_days: 15, cap: 0 };
  const items = [
    peli(1, { date: '2026-08-09' }), // hoy
    peli(2, { date: '2026-07-26' }), // −14
    peli(3, { date: '2026-08-24' }), // +15, justo dentro
    peli(4, { date: '2026-08-25' }), // +16, fuera
    peli(5, { date: '2026-07-20' }), // −20, fuera
    peli(6), // sin fecha
  ];
  const r = evaluarRegla(items, regla, ctx());
  assert.deepEqual(r.elegidas.map((x) => x.tmdb_id).sort(), [1, 2, 3]);
  assert.equal(r.porMotivo.fuera_de_ventana, 3);
  // y sin ventana (festivales), la fecha no descarta a nadie
  assert.equal(evaluarRegla(items, { min_score: 0 }, ctx()).elegidas.length, 6);
});

test('diasEntre cruza el cambio de mes y de año sin marearse', () => {
  assert.equal(diasEntre('2026-08-09', '2026-08-09'), 0);
  assert.equal(diasEntre('2026-09-01', '2026-08-31'), 1);
  assert.equal(diasEntre('2025-12-31', '2026-01-01'), -1);
  assert.equal(diasEntre('nada', '2026-01-01'), null);
});

test('el tope corta por la mejor nota y lo demás queda APLAZADO, no descartado', () => {
  const items = [conNota(1, 50), conNota(2, 90), conNota(3, 70)];
  const r = evaluarRegla(items, { min_score: 0, cap: 2 }, ctx());
  assert.deepEqual(r.elegidas.map((x) => x.tmdb_id), [2, 3]);
  assert.equal(r.descartadas.find((d) => d.tmdb_id === 1).motivo, 'tope');
  // sin tope entran las tres, y siguen ordenadas por nota
  assert.deepEqual(evaluarRegla(items, { min_score: 0, cap: 0 }, ctx()).elegidas.map((x) => x.tmdb_id), [2, 3, 1]);
});

test('las que no tienen nota van al final de la cola, no delante', () => {
  const r = evaluarRegla([peli(1), conNota(2, 10)], { min_score: 0, cap: 0 }, ctx());
  assert.deepEqual(r.elegidas.map((x) => x.tmdb_id), [2, 1]);
});

test('una película en dos secciones se cuenta UNA vez, y sin ficha no entra', () => {
  const r = evaluarRegla([peli(7), peli(7), { title: 'Sin ficha', tmdb_id: null }], { min_score: 0 }, ctx());
  assert.deepEqual(r.elegidas.map((x) => x.tmdb_id), [7]);
  assert.equal(r.porMotivo.sin_ficha, 1);
});

test('todo motivo que emite el evaluador tiene texto en MOTIVOS', () => {
  // Sin esto, añadir un motivo nuevo dejaba el log escribiendo la clave cruda.
  const emitidos = new Set();
  const casos = [
    [[{ title: 'x' }], { min_score: 0 }, ctx()],
    [[peli(1)], { min_score: 0 }, ctx({ inLib: new Set([1]) })],
    [[peli(1)], { min_score: 0 }, ctx({ excluidas: new Map([[1, 'vetada']]) })],
    [[peli(1)], { min_score: 0 }, ctx({ excluidas: new Map([[1, 'descartada']]) })],
    [[peli(1, { isShort: true })], { min_score: 0 }, ctx()],
    [[peli(1, { isTvMovie: true })], { min_score: 0 }, ctx()],
    [[peli(1, { isDocumentary: true })], { min_score: 0 }, ctx()],
    [[peli(1, { isCameo: true })], { min_score: 0 }, ctx()],
    [[peli(1, { date: '2000-01-01' })], { min_score: 0, window_days: 5 }, ctx()],
    [[peli(1)], { min_score: 50 }, ctx()],
    [[conNota(1, 10)], { min_score: 50 }, ctx()],
    [[peli(1), peli(2)], { min_score: 0, cap: 1 }, ctx()],
  ];
  for (const [items, regla, c] of casos) {
    for (const d of evaluarRegla(items, regla, c).descartadas) emitidos.add(d.motivo);
  }
  assert.equal(emitidos.size, Object.keys(MOTIVOS).length, `motivos emitidos: ${[...emitidos].join(', ')}`);
  for (const m of emitidos) assert.ok(MOTIVOS[m], `el motivo «${m}» no tiene texto en MOTIVOS`);
});

test('la interfaz sabe traducir TODOS los motivos del servidor', () => {
  // La lección de los oficios: al añadir un valor a un eje hay que buscar los
  // demás sitios que lo enumeran. Aquí son dos: MOTIVOS y MOTIVO_TEXTO.
  const src = fs.readFileSync(path.join(raiz, 'web/src/pages/RadarrRules.jsx'), 'utf8');
  const bloque = src.slice(src.indexOf('const MOTIVO_TEXTO'), src.indexOf('/** El formulario de alta'));
  for (const m of Object.keys(MOTIVOS)) {
    assert.ok(new RegExp(`\\b${m}:`).test(bloque), `MOTIVO_TEXTO de la interfaz no tiene «${m}»`);
  }
});

// --- el catálogo sale del REGISTRY -------------------------------------------

test('cada festival ofrece SOLO lo que tiene, no una lista fija', () => {
  const clave = (k) => scopesDeFestival(REGISTRY[k]).map((s) => s.key).sort();
  // Cannes: selección oficial por año Y palmarés
  assert.deepEqual(clave('cannes'), ['edicion', 'palmares']);
  // Busan y Horizontes Latinos NO tienen artículo de premio utilizable
  assert.deepEqual(clave('busan'), ['edicion']);
  assert.deepEqual(clave('horizontes'), ['edicion']);
  // Sight & Sound es un canon fijo: no hay ediciones por año
  assert.deepEqual(clave('sightsound'), ['palmares']);
  // los premios: nominadas por año + ganadoras
  assert.deepEqual(clave('goya'), ['edicion', 'palmares']);
  assert.equal(scopesDeFestival(REGISTRY.goya)[0].label, 'Nominadas por año');
  assert.equal(scopesDeFestival(REGISTRY.cahiers)[0].label, 'Top 10 por año');
  // y ninguna entrada del REGISTRY se queda sin nada que ofrecer
  for (const [k, f] of Object.entries(REGISTRY)) {
    assert.ok(scopesDeFestival(f).length > 0, `${k} no ofrece ninguna vista`);
  }
});

test('el catálogo cubre los cuatro tipos de estreno y los seis oficios', () => {
  const c = rulesCatalog();
  assert.deepEqual(c.estrenos.map((e) => e.key).sort(), ['cine-es', 'cine-us', 'plataformas-es', 'plataformas-us']);
  assert.deepEqual(c.favoritos.map((r) => r.key), ROLE_KEYS);
  assert.equal(c.festival.length, Object.keys(REGISTRY).length);
});

test('una regla imposible se rechaza antes de guardarse', () => {
  assert.equal(reglaValida({ kind: 'festival', source: 'cannes', scope: 'palmares' }), null);
  assert.ok(reglaValida({ kind: 'festival', source: 'busan', scope: 'palmares' }));
  assert.ok(reglaValida({ kind: 'festival', source: 'inventado', scope: 'edicion' }));
  assert.ok(reglaValida({ kind: 'estrenos', source: 'cine-fr' }));
  assert.ok(reglaValida({ kind: 'favoritos', source: 'productor' }));
  assert.ok(reglaValida({ kind: 'loquesea', source: 'x' }));
  assert.equal(reglaValida({ kind: 'favoritos', source: 'composer' }), null);
});

// --- CRUD ---------------------------------------------------------------------

test('una instalación NUEVA no nace con una regla fantasma', () => {
  // La migración se quemaba en el primer arranque aunque no hubiera nada que
  // migrar: creaba una regla de la nada y, sobre todo, dejaba la bandera puesta
  // — así que restaurar después una copia de ajustes con el auto-Radarr
  // encendido ya no migraba NUNCA esa configuración.
  assert.equal(listRules().some((x) => x.kind === 'favoritos' && x.source === 'director'), false);
});

test('el auto-Radarr viejo SÍ se migra cuando hay ajustes que migrar, y también al restaurar una copia', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-mig-'));
  const arranca = (extra = '') =>
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      process.env.DATA_DIR = ${JSON.stringify(dir)};
      const m = await import(${JSON.stringify(path.join(raiz, 'server/src/db.js'))});
      ${extra}
      console.log(JSON.stringify(m.db.prepare('SELECT kind, source, enabled, months, cap, min_score FROM radarr_rules').all()));
    `], { encoding: 'utf8' }).trim().split('\n').pop();

  // 1.er arranque sin nada: ninguna regla, y la bandera SIN quemar
  assert.deepEqual(JSON.parse(arranca()), []);

  // llega la restauración de la copia de ajustes con el pase encendido…
  arranca("m.setSetting('auto_radarr_enabled', '1'); m.setSetting('auto_radarr_months', '9');");
  // …y al siguiente arranque la migración por fin ocurre
  const reglas = JSON.parse(arranca());
  assert.equal(reglas.length, 1);
  assert.deepEqual(reglas[0], { kind: 'favoritos', source: 'director', enabled: 1, months: 9, cap: 0, min_score: 0 });
});

test('crear, afinar y borrar una regla', () => {
  const nueva = createRule({ kind: 'festival', source: 'cannes', scope: 'palmares' });
  assert.equal(nueva.min_score, 0);
  assert.equal(nueva.cap, 20);
  assert.equal(nueva.editions, 1);
  assert.equal(ruleLabel(nueva), 'Cannes · Palmarés histórico');

  const afinada = updateRule(nueva.id, { min_score: 72, cap: 5, enabled: false });
  assert.equal(afinada.min_score, 72);
  assert.equal(afinada.cap, 5);
  assert.equal(afinada.enabled, 0);

  // no se puede duplicar la misma combinación
  assert.throws(() => createRule({ kind: 'festival', source: 'cannes', scope: 'palmares' }), /ya existe/);
  // pero la otra vista del mismo festival sí es otra regla
  const ed = createRule({ kind: 'festival', source: 'cannes', scope: 'edicion' });
  assert.equal(ruleLabel(ed), 'Cannes · Sección oficial por año');

  deleteRule(nueva.id);
  deleteRule(ed.id);
  assert.equal(listRules().some((x) => x.id === nueva.id), false);
});

test('los valores fuera de rango se recortan en vez de guardarse tal cual', () => {
  const v = normalizarCampos(
    { min_score: 500, cap: -3, window_days: 9999, months: 0, editions: 99, lookback_days: -1 },
    valoresPorDefecto('estrenos')
  );
  assert.equal(v.min_score, 100);
  assert.equal(v.cap, 0);
  assert.equal(v.window_days, 90); // releases() solo tiene 90 días hacia atrás
  assert.equal(v.months, 1);
  assert.equal(v.editions, 10);
  assert.equal(v.lookback_days, 0);
  // y la basura no borra lo que había
  assert.equal(normalizarCampos({ min_score: 'hola' }, { min_score: 60 }).min_score, 0);
});

test('vaciar un campo NO es escribir cero (y en el tope, cero es SIN TOPE)', () => {
  // Borrar el contenido de «Tope por pasada» para reteclearlo mandaba `''`,
  // que Number() convierte en 0: la regla se quedaba ILIMITADA medio segundo,
  // o para siempre si te ibas de la página.
  const previo = { cap: 20, window_days: 15, months: 6, min_score: 70, editions: 2, lookback_days: 30 };
  const v = normalizarCampos({ cap: '', window_days: '', months: '  ', min_score: '', editions: '', lookback_days: '' }, previo);
  assert.deepEqual(v, previo, 'un campo vaciado no puede cambiar lo guardado');
  // pero un cero TECLEADO sí vale donde tiene sentido
  assert.equal(normalizarCampos({ cap: '0' }, previo).cap, 0);
  assert.equal(normalizarCampos({ lookback_days: '0' }, previo).lookback_days, 0);
});

test('Radarr a medias se detecta ANTES de gastar la pasada entera', async () => {
  // Con URL y clave pero SIN perfil de calidad, radarrAdd reventaba en TODAS
  // las películas, una por una: la pasada corría entera cada noche, gastaba
  // cupo de TMDB y el resumen decía «0 añadidas de 20 candidatas», que se lee
  // como «no había nada nuevo».
  const { setSetting } = await import('../src/db.js');
  assert.match(radarrListoParaAñadir(), /no está configurado/);

  setSetting('radarr_url', 'http://localhost:7878');
  setSetting('radarr_key', 'x');
  assert.match(radarrListoParaAñadir(), /perfil de calidad/);

  setSetting('radarr_quality_profile', '4');
  assert.match(radarrListoParaAñadir(), /carpeta raíz/);

  setSetting('radarr_root_folder', '/pelis');
  assert.equal(radarrListoParaAñadir(), null);

  // se deja como estaba: los tests de este fichero comparten base
  for (const k of ['radarr_url', 'radarr_key', 'radarr_quality_profile', 'radarr_root_folder']) setSetting(k, null);
});

test('una regla de estrenos nace con la quincena que pediste', () => {
  const r = createRule({ kind: 'estrenos', source: 'cine-es' });
  assert.equal(r.window_days, 15);
  assert.equal(ruleLabel(r), 'Estrenos · Cines · España');
  deleteRule(r.id);
});

test('borrar una regla se lleva su historial por delante', () => {
  const r = createRule({ kind: 'favoritos', source: 'composer' });
  db.prepare('INSERT INTO radarr_rule_log (rule_id, at, action, detail) VALUES (?, ?, ?, ?)')
    .run(r.id, Date.now(), 'added', 'prueba');
  deleteRule(r.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM radarr_rule_log WHERE rule_id = ?').get(r.id).n, 0);
});
