import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * Regresiones de la auditoría de octubre de 2026: cada test reproduce un fallo
 * que se demostró con el código anterior (ver AUDIT_PROGRESS.md) y que ahora
 * tiene que seguir arreglado.
 */

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-auditoria-'));

const { db, setSetting, getSetting } = await import('../src/db.js');
const { importImdbRatings, imdbInfo } = await import('../src/imdb.js');
const { runSync } = await import('../src/plex.js');
const { runFullRefresh, refreshStatus } = await import('../src/refresh.js');
const { runRadarrRules, createRule, evaluarRegla } = await import('../src/rules.js');
const { syncRatings, fetchRatingsBatch } = await import('../src/mdblist.js');
const { detectarEmergentes } = await import('../src/emergentes.js');
const { hacerCopia, listarCopias } = await import('../src/backup.js');
const { hostDeConfianza, hostsDeclarados, nombreDeHost } = await import('../src/hosts.js');
const { partirNombres } = await import('../src/discover.js');

const fetchOriginal = globalThis.fetch;
const conFetch = async (falso, fn) => {
  globalThis.fetch = falso;
  try {
    return await fn();
  } finally {
    globalThis.fetch = fetchOriginal;
  }
};

test('un corte en la descarga de IMDb es un error normal, no un proceso caído', async () => {
  let tsv = 'tconst\taverageRating\tnumVotes\n';
  for (let i = 0; i < 50000; i++) tsv += `tt${String(i).padStart(7, '0')}\t7.1\t${i}\n`;
  const gz = zlib.gzipSync(Buffer.from(tsv));
  const cortado = async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(gz.subarray(0, gz.length >> 1)));
          setTimeout(() => c.error(new Error('ECONNRESET simulado')), 20);
        },
      }),
      { status: 200 }
    );
  await conFetch(cortado, async () => {
    await assert.rejects(importImdbRatings(), /ECONNRESET/);
  });
  assert.equal(imdbInfo().running, false);
});

// --- Plex ----------------------------------------------------------------------

function plexFalso(secciones) {
  return async (url) => {
    const u = new URL(url);
    if (u.pathname === '/library/sections') {
      return Response.json({
        MediaContainer: {
          Directory: Object.keys(secciones).map((k) => ({ key: k, type: 'movie', title: `Sección ${k}` })),
        },
      });
    }
    const m = u.pathname.match(/sections\/(\d+)\/all/);
    if (m) {
      const pelis = secciones[m[1]]();
      return Response.json({ MediaContainer: { totalSize: pelis.length, Metadata: pelis } });
    }
    return Response.json({ MediaContainer: { Metadata: [{}] } });
  };
}

test('sincronizar no borra el tmdb_id que resolvió el backfill… salvo que Plex cambie de película', async () => {
  db.prepare('DELETE FROM movies').run();
  setSetting('plex_url', 'http://plex');
  setSetting('plex_token', 't');
  let titulo = 'Sin guid tmdb';
  const falso = plexFalso({
    1: () => [
      { ratingKey: '1', title: 'Con guid', year: 2001, updatedAt: 1, Guid: [{ id: 'tmdb://111' }] },
      { ratingKey: '2', title: titulo, year: 2002, updatedAt: 1, Guid: [{ id: 'imdb://tt0000222' }] },
    ],
  });
  const id = () => db.prepare('SELECT tmdb_id FROM movies WHERE rating_key = 2').get().tmdb_id;
  await conFetch(falso, async () => {
    await runSync();
    db.prepare('UPDATE movies SET tmdb_id = 222 WHERE rating_key = 2').run(); // backfill
    await runSync();
    assert.equal(id(), 222, 'la misma película conserva su id');
    titulo = 'Otra película'; // en Plex se reemparejó a otra cosa
    await runSync();
    assert.equal(id(), null, 'mejor sin ficha que la ficha de otra');
  });
});

test('una biblioteca que vuelve vacía no se lleva sus películas por delante', async () => {
  db.prepare('DELETE FROM movies').run();
  let disco2 = true;
  const pelis = (desde, n) =>
    Array.from({ length: n }, (_, i) => ({ ratingKey: String(desde + i), title: `P${desde + i}`, year: 2000 }));
  const falso = plexFalso({ 1: () => pelis(1, 7), 2: () => (disco2 ? pelis(100, 5) : []) });
  await conFetch(falso, async () => {
    await runSync();
    assert.equal(db.prepare('SELECT COUNT(*) n FROM movies').get().n, 12);
    disco2 = false;
    const st = await runSync();
    assert.equal(db.prepare('SELECT COUNT(*) n FROM movies').get().n, 12);
    assert.match(st.warning, /Sección 2/);
    // la salida que promete el aviso: forzar SÍ limpia
    await runSync({ force: true });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM movies').get().n, 7);
  });
});

test('un Plex que ignora el desplazamiento no deja la paginación en bucle', async () => {
  db.prepare('DELETE FROM movies').run();
  let paginas = 0;
  const llena = Array.from({ length: 240 }, (_, i) => ({ ratingKey: String(i + 1), title: `P${i}`, year: 2000 }));
  const falso = plexFalso({
    1: () => {
      paginas++;
      return llena; // siempre la misma página entera
    },
  });
  // totalSize 240: con una página basta
  await conFetch(falso, () => runSync());
  assert.equal(paginas, 1);
});

// --- pasada completa -------------------------------------------------------------

test('si no se puede escribir el avance, la pasada completa no se queda «en marcha» para siempre', async () => {
  db.exec(`CREATE TRIGGER disco_lleno BEFORE UPDATE ON refresh_runs
           BEGIN SELECT RAISE(ABORT, 'database or disk is full'); END;`);
  try {
    await conFetch(async () => { throw new TypeError('fetch failed'); }, () => runFullRefresh({ trigger: 'test' }));
  } finally {
    db.exec('DROP TRIGGER disco_lleno');
  }
  assert.equal(refreshStatus.running, false);
  assert.equal(refreshStatus.step, null);
});

// --- reglas de Radarr ----------------------------------------------------------

test('el paso nocturno espera a una previsualización en marcha en vez de apuntarse la suya', async () => {
  for (const [k, v] of Object.entries({
    tmdb_key: 'x', radarr_url: 'http://radarr', radarr_key: 'k',
    radarr_quality_profile: '1', radarr_root_folder: '/m',
  })) setSetting(k, v);
  const regla = createRule({ kind: 'estrenos', source: 'cine-es', min_score: 0 });
  const lento = async () => {
    await new Promise((r) => setTimeout(r, 150));
    return Response.json({ results: [], total_pages: 1 });
  };
  await conFetch(lento, async () => {
    const preview = runRadarrRules({ dryRun: true });
    await new Promise((r) => setTimeout(r, 20));
    const nocturno = await runRadarrRules({ esperar: true });
    await preview;
    assert.equal(nocturno.dryRun, false, 'devolvió el estado de la previsualización');
  });
  const fila = db.prepare('SELECT last_run_at FROM radarr_rules WHERE id = ?').get(regla.id);
  assert.ok(fila.last_run_at, 'la pasada real no llegó a correr');
});

test('sin ficha de TMDB, la regla espera: la cuarentena no puede saltarse por un 429', () => {
  const criterios = { enabled: true, langs: ['hi'], countries: [] };
  const sinFicha = { tmdb_id: 7, title: 'Película india', year: 2026, fichaSinLeer: true };
  const r = evaluarRegla([sinFicha], { min_score: 0 }, { criterios, hoy: '2026-10-29' });
  assert.equal(r.elegidas.length, 0);
  assert.equal(r.descartadas[0].motivo, 'ficha_sin_leer');
  // con la ficha leída, decide la cuarentena como siempre
  const conFicha = { ...sinFicha, fichaSinLeer: false, original_language: 'hi' };
  assert.equal(evaluarRegla([conFicha], { min_score: 0 }, { criterios, hoy: '2026-10-29' }).cuarentena.length, 1);
});

// --- MDBList -----------------------------------------------------------------

test('con la clave de MDBList revocada se para al primer 401, se cuenta y se dice', async () => {
  db.prepare('DELETE FROM movies').run();
  db.prepare('DELETE FROM mdb_ratings').run();
  setSetting('mdblist_key', 'revocada');
  setSetting('mdblist_tier', 'supporter');
  setSetting('mdblist_usage', '');
  const ins = db.prepare('INSERT INTO movies (rating_key, title, tmdb_id) VALUES (?, ?, ?)');
  db.transaction(() => { for (let i = 1; i <= 300; i++) ins.run(i, `p${i}`, 1000 + i); })();
  let peticiones = 0;
  const st = await conFetch(async () => {
    peticiones++;
    return new Response('{"error":"Invalid API key"}', { status: 401 });
  }, () => syncRatings());
  assert.equal(peticiones, 1);
  assert.match(st.error, /401/);
  assert.equal(JSON.parse(getSetting('mdblist_usage')).count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM mdb_ratings').get().n, 0);
});

test('un lote cortado a medias no marca como «desconocidas» las que no llegó a pedir', async () => {
  db.prepare('DELETE FROM mdb_ratings').run();
  let n = 0;
  const falso = async (url, init) => {
    if (init?.method === 'POST') return new Response('', { status: 404 }); // sin endpoint por lotes
    n++;
    if (n === 1) return Response.json({ ids: { tmdb: 1 }, title: 'Una', score: 70, ratings: [] });
    if (n === 2) return new Response('', { status: 404 }); // esta no la conoce
    return new Response('', { status: 429 });
  };
  await conFetch(falso, () => assert.rejects(fetchRatingsBatch([1, 2, 3, 4]), /429/));
  const ids = db.prepare('SELECT tmdb_id FROM mdb_ratings ORDER BY tmdb_id').all().map((r) => r.tmdb_id);
  assert.ok(!ids.includes(3) && !ids.includes(4), `quedaron apuntadas sin pedir: ${ids}`);
  assert.ok(ids.includes(2), 'la que contestó 404 sí queda apuntada');
});

// --- emergentes --------------------------------------------------------------

test('una detección de emergentes sin red conserva la lista anterior', async () => {
  db.prepare(
    `INSERT INTO emerging_directors (name_key, name, score, breakdown, computed_at)
     VALUES ('ana', 'Ana', 88, '{"pelis":[]}', 1)`
  ).run();
  setSetting('emergentes_last_run', '');
  const st = await conFetch(async () => { throw new TypeError('fetch failed'); }, () => detectarEmergentes());
  assert.equal(db.prepare('SELECT COUNT(*) n FROM emerging_directors').get().n, 1);
  assert.ok(st.error);
  assert.ok(!getSetting('emergentes_last_run'), 'no se apunta como hecha');
});

// --- copias ------------------------------------------------------------------

test('dos copias a la vez dejan dos copias buenas', async () => {
  const fecha = new Date('2026-10-29T03:40:00Z');
  const r = await Promise.allSettled([hacerCopia({ fecha }), hacerCopia({ fecha })]);
  assert.deepEqual(r.map((x) => x.status), ['fulfilled', 'fulfilled']);
  assert.equal(listarCopias().length, 2);
});

// --- DNS rebinding -------------------------------------------------------------

test('sin contraseña solo se responde a nombres de la red local', () => {
  for (const h of ['192.168.1.50:3860', '127.0.0.1', '[::1]:3860', 'localhost:3860', 'beelink',
    'beelink:3860', 'nas.local', 'cine.lan', 'tower.home.arpa', 'pc.tail1234.ts.net', 'NAS.LOCAL.']) {
    assert.ok(hostDeConfianza(h, []), h);
  }
  for (const h of ['rebind.attacker.example:3860', 'evil.com', '192.168.1.5.evil.com', '', 'local.evil.com']) {
    assert.ok(!hostDeConfianza(h, []), h);
  }
  const declarados = hostsDeclarados(' cine.example.com , .midominio.es ');
  assert.deepEqual(declarados, ['cine.example.com', '.midominio.es']);
  assert.ok(hostDeConfianza('cine.example.com:443', declarados));
  assert.ok(hostDeConfianza('pelis.midominio.es', declarados));
  assert.ok(hostDeConfianza('midominio.es', declarados));
  assert.ok(!hostDeConfianza('otro.example.com', declarados));
  assert.ok(!hostDeConfianza('evilmidominio.es', declarados));
  assert.equal(nombreDeHost('Cine.Example.com:8443'), 'cine.example.com');
});

// --- cánones propios -----------------------------------------------------------

test('partir una lista de nombres es lineal y respeta los paréntesis', () => {
  assert.deepEqual(partirNombres('Kim (Corea, 1970), Akerman\nVarda;; Ozu'), [
    'Kim (Corea, 1970)', ' Akerman', 'Varda', ' Ozu',
  ]);
  const viejo = (t) => String(t).split(/[\n;]+|,(?![^(]*\))/);
  const alf = ['a', ' ', ',', ';', '\n', '(', ')'];
  for (let n = 0; n < 20000; n++) {
    let t = '';
    for (let i = Math.floor(Math.random() * 12); i > 0; i--) t += alf[Math.floor(Math.random() * alf.length)];
    assert.deepEqual(partirNombres(t), viejo(t), JSON.stringify(t));
  }
  const t0 = Date.now();
  partirNombres(','.repeat(300000));
  assert.ok(Date.now() - t0 < 1000);
});
