import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Que no falte ninguna ruta que la interfaz llame.
 *
 * Al limpiar endpoints muertos se borraron cuatro que sí se usaban, y la suite
 * siguió en verde porque nadie comprobaba esa correspondencia: quitar un
 * favorito devolvía 404 y la persona reaparecía sola en la lista. Esto cruza
 * las llamadas de web/src con las rutas declaradas en el servidor.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function ficherosDe(dir, ext) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...ficherosDe(p, ext));
    else if (ext.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

/** Rutas declaradas en el servidor, con sus parámetros vueltos comodines. */
function rutasDelServidor() {
  const src = fs.readFileSync(path.join(raiz, 'server/src/index.js'), 'utf-8');
  const rutas = [];
  for (const m of src.matchAll(/app\.(get|post|put|delete|patch)\('([^']+)'/g)) {
    rutas.push({ metodo: m[1].toUpperCase(), patron: m[2] });
  }
  return rutas;
}

const casa = ({ metodo, ruta }, rutas) => {
  // una interpolación al final puede ser un parámetro (/justwatch/${id}) o la
  // query pegada (/calendar${refresh ? '?refresh=1' : ''}): valen las dos
  const variantes = [ruta, ruta.replace(/\/?X$/, '')].filter(Boolean);
  return rutas.some((r) => {
    if (r.metodo !== metodo) return false;
    const re = new RegExp('^' + r.patron.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/') + '$');
    return variantes.some((v) => re.test(v));
  });
};

/** Llamadas api('/loquesea') del frontend, con las interpolaciones a comodín. */
function llamadasDelCliente() {
  const fuera = new Set();
  for (const f of ficherosDe(path.join(raiz, 'web/src'), ['.js', '.jsx'])) {
    const src = fs.readFileSync(f, 'utf-8');
    // tres formas: plantilla con ${...} (que puede llevar comillas dentro),
    // comilla simple y comilla doble
    const patrones = [
      /\bapi\(\s*`((?:[^`$]|\$\{[^}]*\})*)`/g,
      /\bapi\(\s*'([^']*)'/g,
      /\bapi\(\s*"([^"]*)"/g,
    ];
    for (const re of patrones) {
      for (const m of src.matchAll(re)) {
        let ruta = m[1];
        if (!ruta.startsWith('/')) continue;
        ruta = ruta.replace(/\$\{[^}]*\}/g, 'X').split('?')[0].replace(/\/$/, '');
        if (!ruta || ruta === '/') continue;
        // el método va en las opciones, justo detrás: sin él, borrar
        // DELETE /api/tracked/:id colaba porque existe GET /api/tracked
        const cola = src.slice(m.index, m.index + m[0].length + 120);
        const metodo = (cola.match(/method:\s*['"](\w+)['"]/) || [])[1] || 'GET';
        fuera.add(`${metodo.toUpperCase()} /api${ruta}|${path.relative(raiz, f)}`);
      }
    }
    // fetch('/api/...') suelto (la subida de ficheros no pasa por api())
    for (const m of src.matchAll(/fetch\(\s*['"`](\/api\/[^'"`?]+)/g)) {
      const cola = src.slice(m.index, m.index + 200);
      const metodo = (cola.match(/method:\s*['"](\w+)['"]/) || [])[1] || 'GET';
      fuera.add(`${metodo.toUpperCase()} ${m[1].replace(/\$\{[^}]*\}/g, 'X')}|${path.relative(raiz, f)}`);
    }
  }
  return [...fuera].map((s) => {
    const [llamada, fichero] = s.split('|');
    const [metodo, ruta] = llamada.split(' ');
    return { metodo, ruta, fichero };
  });
}

test('toda ruta que llama la interfaz existe en el servidor', () => {
  const rutas = rutasDelServidor();
  assert.ok(rutas.length > 40, `solo he encontrado ${rutas.length} rutas: ¿ha cambiado el formato?`);

  const huerfanas = llamadasDelCliente().filter((ll) => !casa(ll, rutas));
  assert.deepEqual(
    huerfanas,
    [],
    `la interfaz llama a rutas que el servidor no tiene:\n${huerfanas.map((h) => `  ${h.metodo} ${h.ruta}  (${h.fichero})`).join('\n')}`
  );
});

test('las rutas que la interfaz usa a diario siguen ahí', () => {
  // lista corta y explícita de las que, si desaparecen, rompen algo que se ve:
  // son justo las que se perdieron al limpiar código muerto
  const imprescindibles = [
    ['GET', '/api/tracked'],
    ['DELETE', '/api/tracked/:personId'],
    ['POST', '/api/tracked/:personId'],
    ['PATCH', '/api/tracked/:personId/role'],
    ['DELETE', '/api/tracked/batch'],
    ['POST', '/api/letterboxd/resolve'],
    ['DELETE', '/api/letterboxd'],
    ['POST', '/api/letterboxd/import'],
    ['POST', '/api/radarr/add'],
    ['PUT', '/api/settings'],
    ['POST', '/api/sync'],
    ['POST', '/api/refresh-all'],
  ];
  const rutas = rutasDelServidor();
  for (const [metodo, patron] of imprescindibles) {
    assert.ok(
      rutas.some((r) => r.metodo === metodo && r.patron === patron),
      `falta ${metodo} ${patron}`
    );
  }
});

/* ───────────────────────────────────────────────────────────────────────────
 * La API contra un cliente que no colabora.
 *
 * Todo lo de arriba lee el fichero; esto arranca el servidor DE VERDAD y le
 * manda lo que manda un marcador viejo, un doble clic o un fichero de ajustes
 * retocado. Lo que fija:
 *
 *  - Ningún fallo acaba en un 500 mudo. Un decimal en un «?limit=» o en un
 *    «?offset=» daba «SQLITE_MISMATCH: datatype mismatch», que no dice nada.
 *  - Un LIMIT negativo no es «sin límite»: «?limit=-1» devolvía la biblioteca
 *    entera porque así lo interpreta SQLite.
 *  - Un año que no es un año es un 400, no un 502 hablando de 1946.
 *  - La restauración de ajustes pasa por la MISMA puerta que Ajustes: por ahí
 *    entraba un plex_url con «#», que es lo que decide a dónde sale el token.
 *  - Un ajuste que no se guarda no puede contestar «ok» y callarse.
 *  - Y en ningún mensaje de error salen rutas de disco ni trazas.
 * ─────────────────────────────────────────────────────────────────────────── */

const PUERTO_HOSTIL = 3897;
const baseHostil = `http://127.0.0.1:${PUERTO_HOSTIL}`;
const dirHostil = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-hostil-'));
let procHostil;

const dormirH = (ms) => new Promise((r) => setTimeout(r, ms));

const pedir = async (metodo, ruta, cuerpo) => {
  const r = await fetch(`${baseHostil}${ruta}`, {
    method: metodo,
    headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

before(async () => {
  procHostil = spawn(process.execPath, [path.join(raiz, 'server/src/index.js')], {
    env: { ...process.env, PORT: String(PUERTO_HOSTIL), DATA_DIR: dirHostil },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${baseHostil}/api/version`)).ok) return;
    } catch {}
    await dormirH(250);
  }
  throw new Error('el servidor hostil no levantó');
});

after(async () => {
  if (procHostil && procHostil.exitCode === null) {
    const muerto = new Promise((r) => procHostil.once('exit', r));
    procHostil.kill('SIGKILL');
    await Promise.race([muerto, dormirH(5000)]);
  }
  fs.rmSync(dirHostil, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test('un número imposible en la URL no es un 500 mudo', async () => {
  // todas estas daban 500 con «SQLITE_MISMATCH: datatype mismatch»
  const rutas = [
    '/api/people?offset=1.5',
    '/api/people?offset=1e20',
    '/api/movies?limit=1.5',
    '/api/movies?offset=1e20',
    '/api/events?limit=1.5',
    '/api/radarr/captures?days=1.5&limit=1.5',
    '/api/quality/upgrades?limit=1.5',
    '/api/discover/gaps?people=1.5&perPerson=1.5&offset=1.5',
    '/api/discover/favorites?perPerson=1.5',
  ];
  for (const ruta of rutas) {
    const r = await pedir('GET', ruta);
    assert.ok(r.status < 500, `${ruta} → ${r.status} ${JSON.stringify(r.body)}`);
  }
});

test('un LIMIT negativo no devuelve la biblioteca entera', async () => {
  // en SQLite «LIMIT -1» significa «todas»: un marcador con ?limit=-1 sacaba
  // las 12.400 películas en un solo JSON
  const r = await pedir('GET', '/api/movies?limit=-1');
  assert.equal(r.status, 200);
  assert.ok(r.body.limit >= 1 && r.body.limit <= 200, `limit = ${r.body.limit}`);
});

test('un año que no es un año se contesta con un 400 que lo dice', async () => {
  for (const ruta of ['/api/festivals/anuario/pepe', '/api/festivals/anuario/1e20', '/api/festivals/cannes/pepe']) {
    const r = await pedir('GET', ruta);
    assert.equal(r.status, 400, `${ruta} → ${r.status}`);
    assert.match(r.body.error, /año/i);
  }
  // y un premio que no existe es un 404, no un 502 de la fuente
  assert.equal((await pedir('GET', '/api/festivals/pepe/2020')).status, 404);
});

test('un país con un ?anio= imposible se explica en vez de mentir', async () => {
  for (const v of ['pepe', '0', '-1', '1e20', 'NaN']) {
    const r = await pedir('GET', `/api/paises/ES?anio=${v}`);
    assert.equal(r.status, 400, `anio=${v} → ${r.status}`);
  }
  assert.equal((await pedir('GET', '/api/paises/pepe')).status, 404);
});

test('una lista que no es una lista da un 400 en castellano, no un TypeError', async () => {
  const casos = [
    ['POST', '/api/directors/photos', { names: 'pepe' }],
    ['POST', '/api/directors/follow', { names: 'pepe' }],
    ['POST', '/api/radarr/add-bulk', { tmdbIds: 'pepe' }],
    ['POST', '/api/justwatch/batch', { tmdbIds: 'pepe' }],
  ];
  for (const [metodo, ruta, cuerpo] of casos) {
    const r = await pedir(metodo, ruta, cuerpo);
    assert.equal(r.status, 400, `${ruta} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.doesNotMatch(r.body.error, /is not a function|intermediate value/);
  }
});

test('un id de TMDB decimal no llega a la base', async () => {
  // un tmdb_id de 1.5 se guardaba tal cual y luego el calendario pedía
  // «/person/1.5/movie_credits» para siempre
  assert.equal((await pedir('POST', '/api/people/from-tmdb', { tmdbId: 1.5, name: 'x' })).status, 400);
  assert.equal((await pedir('POST', '/api/discover/dismiss', { tmdbId: 1.5 })).status, 400);
  assert.equal((await pedir('POST', '/api/radarr/auto/veto', { tmdbId: 1.5 })).status, 400);
  assert.equal((await pedir('POST', '/api/festivals/match', { title: 'x', year: 2000, tmdbId: 1.5 })).status, 400);
  const bulk = await pedir('POST', '/api/tracked/tmdb-bulk', { people: [{ tmdbId: 1.5, name: 'x' }] });
  assert.equal(bulk.body.added, 0);
});

test('restaurar ajustes pasa por la misma puerta que Ajustes', async () => {
  // el plex_url decide a dónde sale el token de Plex: una URL con «#» o con
  // usuario y contraseña no puede entrar por el camino de la importación
  for (const url of ['javascript:alert(1)', 'http://a.local/x?y=1', 'http://u:p@a.local', 'http://a.local/#/x']) {
    const r = await pedir('POST', '/api/backup/settings', {
      app: 'powaflex', kind: 'ajustes', settings: { plex_url: url },
    });
    assert.equal(r.status, 400, `${url} → ${r.status} ${JSON.stringify(r.body)}`);
  }
  // y una legítima sí entra
  const buena = await pedir('POST', '/api/backup/settings', {
    app: 'powaflex', kind: 'ajustes', settings: { plex_url: 'http://192.168.1.50:32400' },
  });
  assert.equal(buena.status, 200);
  assert.equal(buena.body.aplicadas, 1);
});

test('un ajuste que no se guarda no contesta «ok» y se calla', async () => {
  // {"backup_keep": 14} devolvía {ok:true} y no guardaba nada: el `continue`
  // del valor no-cadena iba ANTES del que lo apunta en `ignoradas`
  const r = await pedir('PUT', '/api/settings', { backup_keep: 14, auto_radarr_enabled: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.ignoradas, ['backup_keep', 'auto_radarr_enabled']);
  const leidos = await pedir('GET', '/api/settings');
  assert.equal(leidos.body.backup_keep, undefined);
});

test('una petición desde otra web no muta nada', async () => {
  const r = await fetch(`${baseHostil}/api/discover/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ tmdbId: 550 }),
  });
  assert.equal(r.status, 403);
});

test('ningún error escupe rutas de disco ni trazas de pila', async () => {
  const sospechosas = [
    ['GET', '/api/people?offset=1e20'],
    ['GET', '/api/festivals/anuario/pepe'],
    ['GET', '/api/paises/ES?anio=pepe'],
    ['GET', '/api/movies/pepe'],
    ['POST', '/api/directors/photos', { names: 'pepe' }],
    ['POST', '/api/settings/test/pepe', {}],
  ];
  for (const [metodo, ruta, cuerpo] of sospechosas) {
    const r = await pedir(metodo, ruta, cuerpo);
    const texto = JSON.stringify(r.body || {});
    assert.doesNotMatch(texto, /[A-Za-z]:\\|\/home\/|\/Users\/|node_modules|at Object\.|\.js:\d+/, `${ruta} → ${texto}`);
  }
});

test('un cuerpo roto se explica con un 4xx, no con un 500', async () => {
  const r = await fetch(`${baseHostil}/api/discover/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"a":',
  });
  assert.equal(r.status, 400);
  const body = await r.json();
  // el cliente lee `error`: con el cuerpo de serie de Fastify leía «Bad Request»
  assert.ok(body.error && body.error.length > 12, JSON.stringify(body));
});
