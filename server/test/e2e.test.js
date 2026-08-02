import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * La prueba que faltaba: arrancar el servidor DE VERDAD y pedirle páginas.
 *
 * Los demás tests llaman a funciones sueltas, y por ahí se colaron dos fallos
 * que un solo vistazo a una página habría cazado: los «próximos estrenos» que
 * siempre daban 0 (el calendario borraba el campo que los contaba) y media hoja
 * de estilos que se descartaba en silencio. Esto arranca el proceso con una
 * base de datos de usar y tirar, comprueba que levanta, que las páginas
 * responden y que lo que devuelven tiene sentido.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-e2e-'));
const PUERTO = 3899;
const base = `http://127.0.0.1:${PUERTO}`;

let servidor;
let salida = '';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarVivo(intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${base}/api/version`);
      if (r.ok) return true;
    } catch {}
    await dormir(250);
  }
  throw new Error(`El servidor no levantó. Salida:\n${salida}`);
}

const get = async (ruta) => {
  const r = await fetch(`${base}${ruta}`);
  return { status: r.status, body: await r.json().catch(() => null) };
};

before(async () => {
  servidor = spawn(process.execPath, ['server/src/index.js'], {
    cwd: raiz,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(PUERTO), POWAFLEX_AUTH: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stdout.on('data', (d) => { salida += d; });
  servidor.stderr.on('data', (d) => { salida += d; });
  await esperarVivo();
});

after(() => {
  servidor?.kill('SIGKILL');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('arranca de cero, sin base de datos previa, y responde', async () => {
  const { status, body } = await get('/api/version');
  assert.equal(status, 200);
  assert.match(body.version, /^\d+\.\d+\.\d+/);
  assert.ok(body.label, 'la etiqueta de versión es lo que se ve abajo a la derecha');
});

test('las páginas principales responden 200 con la forma esperada', async () => {
  // sin Plex configurado siguen teniendo que responder: es el estado en el que
  // se encuentra alguien que acaba de instalar
  const rutas = [
    ['/api/setup-state', (b) => typeof b.movies === 'number'],
    ['/api/stats/overview', (b) => typeof b.movies === 'number'],
    ['/api/stats/charts', (b) => Array.isArray(b.byDecade)],
    ['/api/stats/watch', (b) => Array.isArray(b.watchedByDecade)],
    ['/api/movies?limit=5', (b) => Array.isArray(b.movies) && typeof b.total === 'number'],
    ['/api/filters', (b) => Array.isArray(b.genres)],
    ['/api/people?role=director&limit=5', (b) => Array.isArray(b)],
    ['/api/tracked/health', (b) => Array.isArray(b.people)],
    ['/api/quality/overview', (b) => Array.isArray(b.byResolution)],
    ['/api/quality/duplicates', (b) => Array.isArray(b.multiVersion)],
    ['/api/letterboxd/summary', (b) => !!b.counts],
    ['/api/sagas', (b) => Array.isArray(b.sagas) || Array.isArray(b)],
    ['/api/discover/canons', (b) => Array.isArray(b) && b.length >= 4],
    ['/api/discover/dismissed', (b) => Array.isArray(b)],
    ['/api/build-progress', (b) => typeof b.active === 'boolean'],
    ['/api/search?q=nada', (b) => Array.isArray(b.movies)],
  ];
  for (const [ruta, comprueba] of rutas) {
    const { status, body } = await get(ruta);
    assert.equal(status, 200, `${ruta} devolvió ${status}`);
    assert.ok(comprueba(body), `${ruta} devolvió algo con otra forma: ${JSON.stringify(body).slice(0, 160)}`);
  }
});

test('el canon de los 501 directores está completo', async () => {
  const { body } = await get('/api/discover/canons');
  const c = body.find((x) => x.key === 'imdb501');
  assert.ok(c, 'falta el canon del libro');
  assert.equal(c.count, 508);
});

test('los ajustes solo aceptan las claves conocidas', async () => {
  const r = await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'es-ES', clave_inventada_por_un_atacante: 'x' }),
  });
  assert.equal(r.status, 200);
  const { body } = await get('/api/settings');
  assert.equal(body.language, 'es-ES', 'la clave legítima sí se guarda');
  assert.equal(body.clave_inventada_por_un_atacante, undefined, 'la inventada no');
});

test('los próximos estrenos se cuentan de verdad (el campo que se borraba)', async () => {
  // se siembra un calendario cacheado con la forma REAL que deja buildCalendar:
  // `people` sobrevive, `followedDirectors`/`followedActors` no
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(path.join(dataDir, 'powaflex.db'));
  db.prepare('INSERT INTO people (id, name) VALUES (4242, ?)').run('Directora De Prueba');
  db.prepare('INSERT INTO tracked_people (person_id, role, added_at) VALUES (4242, ?, ?)').run('director', Date.now());
  const manana = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
  const clave = db
    .prepare("SELECT key FROM tmdb_cache WHERE key LIKE 'calendar:%' LIMIT 1")
    .get()?.key || 'calendar:v7:0:0';
  db.prepare('INSERT OR REPLACE INTO tmdb_cache (key, json, fetched_at) VALUES (?, ?, ?)').run(
    clave,
    JSON.stringify({
      generatedAt: Date.now(),
      today: new Date().toLocaleDateString('en-CA'),
      events: [{ tmdb_id: 1, title: 'Estreno futuro', date: manana, people: [{ id: 4242, name: 'Directora De Prueba', credit: 'Dirige' }] }],
      errors: [],
    }),
    Date.now()
  );
  db.close();

  const { body } = await get('/api/tracked/health');
  const suya = body.people.find((p) => p.id === 4242);
  assert.ok(suya, 'la favorita sembrada no aparece');
  assert.equal(suya.upcoming, 1, 'debería contar el estreno de mañana, no 0');
});

test('la interfaz compilada se sirve y sus estilos van encapados', async () => {
  const dist = path.join(raiz, 'web/dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.log('    (web/dist sin construir: se salta)');
    return;
  }
  const r = await fetch(base);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<div id="root">/, 'la SPA no se está sirviendo');

  // Regresión del fallo de cascada: las clases de componente TIENEN que estar
  // dentro de @layer components. Fuera, ganan a las utilidades de Tailwind y
  // cualquier color puesto encima se descarta (la caja de errores invisible).
  const css = fs.readdirSync(path.join(dist, 'assets')).find((f) => f.endsWith('.css'));
  const hoja = fs.readFileSync(path.join(dist, 'assets', css), 'utf-8');
  const iCard = hoja.indexOf('.card{');
  assert.ok(iCard > 0, 'no encuentro .card en el CSS compilado');
  const capa = hoja.lastIndexOf('@layer components', iCard);
  assert.ok(capa > 0 && capa < iCard, '.card tiene que vivir dentro de @layer components');
});

test('con contraseña puesta, nada pasa sin ella (salvo /api/version)', async () => {
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-e2e-auth-'));
  const puerto2 = PUERTO + 1;
  const base2 = `http://127.0.0.1:${puerto2}`;
  const proc = spawn(process.execPath, ['server/src/index.js'], {
    cwd: raiz,
    env: { ...process.env, DATA_DIR: dir2, PORT: String(puerto2), POWAFLEX_AUTH: 'ramon:secreta' },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${base2}/api/version`)).ok) break; } catch {}
      await dormir(250);
    }
    assert.equal((await fetch(`${base2}/api/version`)).status, 200, '/api/version queda abierto para el HEALTHCHECK');
    assert.equal((await fetch(`${base2}/api/settings`)).status, 401, 'sin credenciales, 401');
    assert.equal((await fetch(`${base2}/`)).status, 401, 'la propia página también');

    const cabecera = { Authorization: `Basic ${Buffer.from('ramon:secreta').toString('base64')}` };
    assert.equal((await fetch(`${base2}/api/settings`, { headers: cabecera })).status, 200, 'con credenciales, pasa');

    const mal = { Authorization: `Basic ${Buffer.from('ramon:otra').toString('base64')}` };
    assert.equal((await fetch(`${base2}/api/settings`, { headers: mal })).status, 401, 'una contraseña que no es, no pasa');
  } finally {
    proc.kill('SIGKILL');
    fs.rmSync(dir2, { recursive: true, force: true });
  }
});
