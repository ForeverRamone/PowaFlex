import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// base propia: este fichero escribe en las tablas de emergentes
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-emerg-'));

const { db } = await import('../src/db.js');
const {
  PESO_FESTIVAL, PESO_PREMIO, PREMIOS_SIN_DIRECCION_FIABLE, RADAR, RADAR_PREMIOS, PESOS_POR_DEFECTO,
  puntosInstitucionales, senalInstitucional, senalCritica, senalTraccion,
  senalAceleracion, senalAfinidad, puntuar, mereceMirarse,
  descartarEmergente, recuperarEmergente, listaEmergentes,
} = await import('../src/emergentes.js');
const { REGISTRY } = await import('../src/festivals.js');

const ap = (festival, year, extra = {}) => ({ festival, year, title: `P${year}`, winner: false, ...extra });

// --- el radar ------------------------------------------------------------------

test('todo lo que mira el radar existe en el REGISTRY', () => {
  // un festival que desaparezca del REGISTRY en una versión futura dejaría al
  // detector recorriendo un hueco en silencio
  for (const key of RADAR) assert.ok(REGISTRY[key], `«${key}» no está en el REGISTRY`);
});

/**
 * La lista de nombres de la interfaz está escrita a mano, y ya sabemos cómo
 * acaba eso: en la 1.08, `RadarrRules.jsx` enumeraba los tipos de regla a mano
 * y el tipo nuevo se podía crear por la API sin que pintara NADA. Aquí el fallo
 * sería más callado todavía —la ficha diría «camaradeoro 2025» en vez de
 * «Cannes · Cámara de Oro»— así que se cruza.
 */
test('cada fuente del radar tiene nombre en la interfaz', () => {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const jsx = fs.readFileSync(path.join(raiz, 'web/src/pages/Emergentes.jsx'), 'utf8');
  const bloque = jsx.slice(jsx.indexOf('const NOMBRE_FESTIVAL'), jsx.indexOf('const ORDENES'));
  const nombrados = new Set([...bloque.matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]));
  for (const key of [...RADAR, ...RADAR_PREMIOS]) {
    assert.ok(nombrados.has(key), `«${key}» no tiene nombre en Emergentes.jsx: saldría el código crudo`);
  }
});

test('los palmareses del radar también existen, y traen palmarés que leer', () => {
  for (const key of RADAR_PREMIOS) {
    const f = REGISTRY[key];
    assert.ok(f, `«${key}» no está en el REGISTRY`);
    assert.ok(f.awardPage || f.staticAward, `«${key}» no tiene palmarés que leer`);
  }
});

test('el radar no mira cánones, ni los premios que coronan carreras hechas', () => {
  // Sight & Sound no descubre emergentes: es lo contrario. Y de los premios
  // solo entran los que ALCANZAN primeras películas (ver PESO_PREMIO): el
  // Óscar, los Globos y los círculos de crítica de EE UU se quedan fuera.
  for (const key of RADAR) {
    assert.notEqual(REGISTRY[key].group, 'canon', key);
    assert.notEqual(REGISTRY[key].group, 'premio', key);
  }
  for (const key of RADAR_PREMIOS) assert.notEqual(REGISTRY[key].group, 'canon', key);
  for (const key of ['oscar', 'globosdrama', 'globoscomedia', 'nbr', 'nyfcc', 'lafca', 'chicago', 'boston', 'criticschoice']) {
    assert.ok(!RADAR_PREMIOS.includes(key), `«${key}» corona carreras, no descubre emergentes`);
  }
});

test('un premio cuya tabla no dice quién dirige no entra en el radar', () => {
  // el Guldbagge titula su columna «Director(s)» y lista PRODUCTORES: metido en
  // el radar, fichaba a un productor como promesa de la dirección sueca
  for (const key of PREMIOS_SIN_DIRECCION_FIABLE) {
    assert.ok(!RADAR_PREMIOS.includes(key), `«${key}» no dice quién dirige: no puede ser fuente de nombres`);
  }
});

test('la Cámara de Oro es la señal más fuerte de los palmareses', () => {
  // es literalmente el premio a la mejor ópera prima de todo Cannes
  for (const [key, peso] of Object.entries(PESO_PREMIO)) {
    if (key === 'camaradeoro') continue;
    assert.ok(PESO_PREMIO.camaradeoro > peso, `camaradeoro debería pesar más que ${key}`);
  }
  // pero un palmarés nacional pesa menos que una plaza en competición: cuando
  // un premio de tu país te nombra, el festival ya te vio
  assert.ok(PESO_PREMIO.goya < PESO_FESTIVAL.cannes);
});

test('las secciones de debut pesan como las competiciones grandes', () => {
  // la competición principal la pisa quien ya llegó; el primer largo de quien
  // va a llegar se estrena en la Semaine o en Orizzonti
  assert.ok(PESO_FESTIVAL.semaine > PESO_FESTIVAL.busan);
  assert.ok(PESO_FESTIVAL.orizzonti >= PESO_FESTIVAL.sundance);
});

// --- señal 1: consagración institucional ---------------------------------------

test('la SEGUNDA selección vale más que la primera', () => {
  // es la regla del plan: repetir es lo que separa a quien va a más del
  // fogonazo de un año
  const una = puntosInstitucionales([ap('cannes', 2025)]);
  const dos = puntosInstitucionales([ap('cannes', 2025), ap('cannes', 2023)]);
  assert.ok(dos - una > una, `una=${una} dos=${dos}: repetir tiene que valer MÁS que debutar`);
});

test('ganar dobla el valor de esa plaza', () => {
  const sin = puntosInstitucionales([ap('venecia', 2025)]);
  const con = puntosInstitucionales([ap('venecia', 2025, { winner: true })]);
  assert.equal(con, sin * 2);
});

test('sin apariciones no hay señal institucional', () => {
  assert.equal(senalInstitucional([]), null);
});

test('la señal institucional no se pasa de 1 por muchas plazas que sume', () => {
  const s = senalInstitucional([
    ap('cannes', 2025, { winner: true }), ap('venecia', 2024, { winner: true }), ap('berlinale', 2023),
  ]);
  assert.equal(s.valor, 1);
  assert.equal(s.detalle.apariciones.length, 3);
  // el desglose viaja ESTRUCTURADO, no como frase: lo redacta el cliente
  assert.equal(typeof s.detalle.apariciones[0].festival, 'string');
});

// --- señal 2: consenso crítico -------------------------------------------------

test('Metacritic manda sobre RT y sobre la Σ', () => {
  const s = senalCritica([{ title: 'A', ratings: { metacritic: 84, rt_critic: 60, score: 50 } }]);
  assert.equal(s.detalle.mejor.fuente, 'metacritic');
  assert.equal(s.detalle.media, 84);
});

test('sin ninguna nota crítica la señal SE AUSENTA, no vale cero', () => {
  // «sin dato ≠ cero»: un debut sin Metacritic no puede penalizar
  assert.equal(senalCritica([{ title: 'A', ratings: {} }]), null);
  assert.equal(senalCritica([]), null);
});

test('por debajo de 50 la crítica no acompaña, por encima de 85 ya no hay más que demostrar', () => {
  assert.equal(senalCritica([{ ratings: { metacritic: 30 } }]).valor, 0);
  assert.equal(senalCritica([{ ratings: { metacritic: 95 } }]).valor, 1);
});

// --- señal 3: tracción ---------------------------------------------------------

test('la tracción mira nota Y volumen: un 4,3 con doscientas marcas no dice nada', () => {
  const mucha = senalTraccion([{ ratings: { letterboxd: 4.1, lb_votes: 40000 }, imdbVotes: 8000 }]);
  const poca = senalTraccion([{ ratings: { letterboxd: 4.1, lb_votes: 200 }, imdbVotes: 8000 }]);
  assert.ok(mucha.valor > poca.valor);
});

test('sin votos en IMDb la tracción vale menos: es el umbral de ruido', () => {
  const con = senalTraccion([{ ratings: { letterboxd: 4.0, lb_votes: 20000 }, imdbVotes: 5000 }]);
  const sin = senalTraccion([{ ratings: { letterboxd: 4.0, lb_votes: 20000 }, imdbVotes: 0 }]);
  assert.ok(con.valor > sin.valor);
});

test('sin nota de Letterboxd no hay señal de tracción', () => {
  assert.equal(senalTraccion([{ ratings: {}, imdbVotes: 90000 }]), null);
});

// --- señal 4: aceleración ------------------------------------------------------

test('con un solo largo no hay aceleración que medir', () => {
  assert.equal(senalAceleracion([{ ratings: { letterboxd: 4 } }]), null);
});

test('subir en las tres dimensiones da el máximo; bajar en las tres, el mínimo', () => {
  const arriba = senalAceleracion([
    { ratings: { letterboxd: 3.4, lb_votes: 2000 }, nivelFestival: 20 },
    { ratings: { letterboxd: 3.9, lb_votes: 30000 }, nivelFestival: 40 },
  ]);
  const abajo = senalAceleracion([
    { ratings: { letterboxd: 3.9, lb_votes: 30000 }, nivelFestival: 40 },
    { ratings: { letterboxd: 3.4, lb_votes: 2000 }, nivelFestival: 20 },
  ]);
  assert.equal(arriba.valor, 1);
  assert.equal(abajo.valor, 0);
  assert.deepEqual(arriba.detalle.sube, ['nota', 'volumen', 'festival']);
});

test('sin datos con los que comparar, la aceleración se ausenta', () => {
  assert.equal(senalAceleracion([{ ratings: {} }, { ratings: {} }]), null);
});

// --- señal 5: afinidad ---------------------------------------------------------

const GUSTOS = {
  media: 3.5,
  paises: new Map([['Thailand', { media: 4.1, n: 12 }]]),
  continentes: new Map([['Asia', { media: 3.8, n: 40 }]]),
};

test('la afinidad compara tu media con la de esa procedencia', () => {
  const s = senalAfinidad({ country: 'Thailand', continent: 'Asia' }, GUSTOS);
  assert.equal(s.detalle.ambito, 'pais'); // el país manda sobre el continente
  assert.ok(s.valor > 0.5);
});

test('sin muestra de esa procedencia, o sin notas tuyas, no hay afinidad', () => {
  assert.equal(senalAfinidad({ country: 'Iceland', continent: 'Europa' }, GUSTOS), null);
  assert.equal(senalAfinidad({ country: 'Thailand' }, null), null);
});

// --- la puntuación --------------------------------------------------------------

test('SIN DATO NO ES CERO: la señal ausente sale del reparto', () => {
  // es la regla que impide que el detector premie lo más documentado, que es
  // lo anglosajón
  const soloInstitucional = puntuar({
    institucional: { valor: 1, detalle: {} },
    critica: null,
    traccion: null,
  });
  assert.equal(soloInstitucional.score, 100);
  assert.deepEqual(soloInstitucional.ausentes.sort(), ['critica', 'traccion']);

  const conCriticaFloja = puntuar({
    institucional: { valor: 1, detalle: {} },
    critica: { valor: 0, detalle: {} },
  });
  assert.ok(conCriticaFloja.score < 100, 'una crítica floja SÍ baja; lo que no baja es no tenerla');
});

test('los pesos del desglose suman 100: es lo que explica la puntuación', () => {
  const r = puntuar(
    {
      institucional: { valor: 0.8, detalle: {} },
      critica: { valor: 0.5, detalle: {} },
      traccion: { valor: 0.4, detalle: {} },
      aceleracion: { valor: 1, detalle: {} },
      afinidad: { valor: 0.6, detalle: {} },
    },
    PESOS_POR_DEFECTO
  );
  const suma = r.desglose.reduce((n, d) => n + d.peso, 0);
  assert.ok(Math.abs(suma - 100) <= 2, `los pesos suman ${suma}`);
  assert.equal(r.desglose.length, 5);
});

test('sin ninguna señal, cero y sin desglose inventado', () => {
  const r = puntuar({ institucional: null, critica: null });
  assert.equal(r.score, 0);
  assert.deepEqual(r.desglose, []);
});

// --- la criba barata -------------------------------------------------------------

const criba = (cand, extra = {}) =>
  mereceMirarse(cand, {
    nowYear: 2026,
    seguidos: new Set(),
    fuera: new Set(),
    catalogo: new Map(),
    ...extra,
  });

test('a quien ya sigues no se le vuelve a mirar', () => {
  const c = { clave: 'jafarpanahi', name: 'Jafar Panahi', apariciones: [ap('cannes', 2025)] };
  assert.equal(criba(c, { seguidos: new Set(['jafarpanahi']) }), 'ya le sigues');
});

test('la ✕ se respeta también aquí', () => {
  const c = { clave: 'x', name: 'X', apariciones: [ap('cannes', 2025)] };
  assert.equal(criba(c, { fuera: new Set(['x']) }), 'descartado');
});

test('más películas distintas en la ventana que largos permitidos: carrera hecha', () => {
  const c = {
    clave: 'y', name: 'Y',
    apariciones: [
      ap('cannes', 2025), ap('cannes', 2024), ap('venecia', 2023),
      ap('berlinale', 2022), ap('tiff', 2021), ap('sundance', 2020),
    ],
  };
  assert.equal(criba(c), 'ya consagrado');
});

test('UNA película que arrasa no es una carrera hecha', () => {
  // desde que el radar lee también los palmareses, un solo debut puede sumar
  // cinco apariciones el mismo año (Cannes, Cámara de Oro, Goya, Seminci,
  // EFA). Contando apariciones en vez de películas, ese debut se descartaba
  // solo por haber gustado.
  const mismaPeli = { title: 'Su ópera prima' };
  const c = {
    clave: 'w', name: 'W',
    apariciones: [
      ap('cannes', 2025, mismaPeli), ap('camaradeoro', 2025, mismaPeli), ap('goya', 2025, mismaPeli),
      ap('seminci', 2025, mismaPeli), ap('efa', 2025, mismaPeli),
    ],
  };
  assert.equal(criba(c), null);
});

test('el catálogo de directores en activo hace de filtro de consolidados, gratis', () => {
  const c = { clave: 'z', name: 'Z', apariciones: [ap('cannes', 2025)] };
  const conObra = new Map([['z', { name: 'Z', features: 9, first: 2005 }]]);
  assert.equal(criba(c, { catalogo: conObra }), 'ya consagrado');
  const debutViejo = new Map([['z', { name: 'Z', features: 2, first: 2001 }]]);
  assert.equal(criba(c, { catalogo: debutViejo }), 'debutó hace demasiado');
});

test('quien ya ganó la Palma, el León o el Oso no es una promesa', () => {
  // el filtro por número de películas no lo ve: cinco largos y un León de Oro
  // siguen siendo cinco largos (le pasaba a Chloé Zhao al subir el límite)
  const c = { clave: 'p', name: 'P', apariciones: [ap('venecia', 2020, { winner: true })] };
  assert.equal(criba(c), 'ya consagrado');
  // pero ganar la Cámara de Oro, Un Certain Regard o la Semaine es lo
  // contrario: es la señal de que acaba de llegar
  for (const key of ['camaradeoro', 'uncertainregard', 'semaine']) {
    const q = { clave: 'q', name: 'Q', apariciones: [ap(key, 2025, { winner: true })] };
    assert.equal(criba(q), null, key);
  }
});

test('un debutante de este año pasa la criba', () => {
  const c = { clave: 'nueva', name: 'Nueva', apariciones: [ap('semaine', 2025)] };
  assert.equal(criba(c), null);
});

// --- la ✕ sobrevive a una reconstrucción -----------------------------------------

test('la ✕ vive en su propia tabla: reconstruir no resucita a quien descartaste', () => {
  db.prepare(
    `INSERT OR REPLACE INTO emerging_directors (name_key, name, score, computed_at) VALUES (?, ?, ?, ?)`
  ).run('descartable', 'Descartable', 70, Date.now());
  descartarEmergente('descartable');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM emerging_directors WHERE name_key = ?').get('descartable').n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM emerging_dismissed WHERE name_key = ?').get('descartable').n, 1);
  // y la criba de la siguiente pasada lo vuelve a dejar fuera
  assert.equal(
    criba({ clave: 'descartable', name: 'Descartable', apariciones: [ap('cannes', 2025)] },
      { fuera: new Set(['descartable']) }),
    'descartado'
  );
  recuperarEmergente('descartable');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM emerging_dismissed WHERE name_key = ?').get('descartable').n, 0);
});

test('la lista sirve el desglose ya desempaquetado y sin JSON crudo', () => {
  db.prepare(
    `INSERT OR REPLACE INTO emerging_directors (name_key, name, score, breakdown, computed_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run('conficha', 'Con Ficha', 82, JSON.stringify({ desglose: [{ clave: 'institucional', puntos: 45 }], ausentes: ['critica'], pelis: [] }), Date.now());
  const r = listaEmergentes();
  const d = r.directors.find((x) => x.name_key === 'conficha');
  assert.equal(d.score, 82);
  assert.equal(d.desglose[0].clave, 'institucional');
  assert.deepEqual(d.ausentes, ['critica']);
  assert.equal(d.breakdown, undefined);
  assert.deepEqual(r.pesos, PESOS_POR_DEFECTO);
});

test('la ★ casa por id de TMDB, no por cómo se escriba el nombre', () => {
  // Wikipedia y TMDB transcriben distinto (japonés y coreano sobre todo): si la
  // estrella se casara solo por nombre, seguir a alguien no la encendería
  db.prepare(
    `INSERT OR REPLACE INTO emerging_directors (name_key, name, tmdb_id, score, computed_at) VALUES (?, ?, ?, ?, ?)`
  ).run('yoondanbi', 'Yoon Dan-bi', 771001, 60, Date.now());
  const p = db.prepare('INSERT INTO people (name, tmdb_id) VALUES (?, ?)').run('Dan-bi Yoon', 771001);
  db.prepare("INSERT OR REPLACE INTO tracked_people (person_id, role, added_at) VALUES (?, 'director', ?)")
    .run(p.lastInsertRowid, Date.now());
  const d = listaEmergentes().directors.find((x) => x.name_key === 'yoondanbi');
  assert.equal(d.tracked, true, 'el nombre está escrito al revés, pero el id es el mismo');
});

test('un peso vacío NO es peso cero (o todo el mundo puntuaría 0)', async () => {
  // el mismo Number('') === 0 que dejó las reglas sin tope: aquí dejaba las
  // cinco señales a peso cero en una instalación recién estrenada
  const { pesosEmergentes } = await import('../src/emergentes.js');
  const { setSetting } = await import('../src/db.js');
  setSetting('emerg_w_critica', '');
  assert.equal(pesosEmergentes().critica, PESOS_POR_DEFECTO.critica);
  setSetting('emerg_w_critica', '30');
  assert.equal(pesosEmergentes().critica, 30);
  // un valor imposible tampoco pasa
  setSetting('emerg_w_critica', '9999');
  assert.equal(pesosEmergentes().critica, PESOS_POR_DEFECTO.critica);
  setSetting('emerg_w_critica', '');
});

test('un breakdown corrupto no tumba la página entera', () => {
  db.prepare(
    `INSERT OR REPLACE INTO emerging_directors (name_key, name, score, breakdown, computed_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run('roto', 'Roto', 10, '{esto no es json', Date.now());
  const d = listaEmergentes().directors.find((x) => x.name_key === 'roto');
  assert.deepEqual(d.desglose, []);
});
