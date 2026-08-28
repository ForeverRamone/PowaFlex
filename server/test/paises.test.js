import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// base propia: este fichero escribe correcciones y lee el índice
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-paises-'));

const {
  atribuir, isoDeLugar, isosDeTexto, ordenar, notaValida, codigoTmdb, PAISES, TIERS, tierDe, esPaisConocido,
  notaAsentada, mediaDelPais, ordenarPais, VOTOS_PARA_ASENTAR,
  ponerOverride, quitarOverride, overridesDePais, peliculasDePais, aniosDePais, catalogoPaises,
  apuntarFallo, guardarBuild, esConcierto, esMonologo, estaEstrenada,
} = await import('../src/paises.js');
const { RANKINGS, parsearFichas, partirTitulo, tieneRanking } = await import('../src/filmaffinity.js');
const { FA_RANKINGS } = await import('../src/data/filmaffinity-2026.js');
const { db } = await import('../src/db.js');

// --- de dónde es una película -------------------------------------------------
//
// Los ocho casos que se midieron contra TMDB ANTES de escribir la regla, y que
// son los que la justifican. Si alguno cambia de bando, la página empieza a
// mentir sobre qué es cine de cada país.

const CASOS = [
  // nombre                       origen        producción        director   ¿ES?
  ['El espíritu de la colmena',   ['ES'],       ['ES'],           'ES',      'director'],
  ['Viridiana (TMDB la cree mexicana)', ['MX'], ['ES', 'MX'],     'ES',      'director'],
  ['El verdugo (Italia delante)', ['IT', 'ES'], ['ES', 'IT'],     'ES',      'director'],
  ['Azur & Asmar (la dirige un francés)', ['BE', 'FR', 'ES'], ['BE', 'FR', 'IT', 'ES'], 'FR', null],
  ['El secreto de sus ojos (argentina)', ['ES', 'AR'], ['AR', 'ES'], 'AR',   null],
  ['Medianeras (argentina)',      ['AR', 'ES'], ['AR', 'DE', 'ES'], 'AR',    null],
  ['El laberinto del fauno (del Toro es mexicano)', ['MX', 'ES'], ['MX', 'ES', 'US'], 'MX', null],
];

for (const [nombre, origen, produccion, directorIso, esperado] of CASOS) {
  test(`atribución a España: ${nombre}`, () => {
    assert.equal(atribuir({ iso: 'ES', origen, produccion, directorIso }), esperado);
  });
}

test('«La batalla de Chile» se cae de España aunque TMDB la dé por española', () => {
  // TMDB dice origen ES y en su ficha España no aparece entre las productoras:
  // es el filtro de producción, y actúa ANTES de mirar quién dirige
  assert.equal(
    atribuir({ iso: 'ES', origen: ['ES'], produccion: ['CL', 'FR', 'CU', 'VE'], directorIso: 'CL' }),
    null
  );
});

test('sin países de producción no se puede exigir nada: manda el origen', () => {
  assert.equal(atribuir({ iso: 'ES', origen: ['ES'], produccion: [], directorIso: null }), 'origen');
  assert.equal(atribuir({ iso: 'ES', origen: ['FR'], produccion: [], directorIso: null }), null);
});

test('sin saber de dónde es quien dirige, decide el país de origen', () => {
  assert.equal(atribuir({ iso: 'ES', origen: ['ES'], produccion: ['ES'], directorIso: null }), 'origen');
});

test('tu mano gana siempre, en los dos sentidos', () => {
  // un «drop» tira una película que la regla admitiría…
  assert.equal(
    atribuir({ iso: 'ES', origen: ['ES'], produccion: ['ES'], directorIso: 'ES', override: 'drop' }),
    null
  );
  // …y un «add» mete una que la regla rechazaría de plano
  assert.equal(
    atribuir({ iso: 'ES', origen: ['FR'], produccion: ['FR'], directorIso: 'FR', override: 'add' }),
    'manual'
  );
});

test('EL EMIGRADO NO PIERDE SU CINE: «M» es alemana aunque Lang naciera en Viena', () => {
  // La primera regla echaba a quien hubiera nacido al otro lado de una frontera
  // que se movió, y Alemania se quedaba sin «M», sin «Metrópolis» y sin «El
  // gabinete del doctor Caligari»; España, sin «Tesis», sin «Los otros» y sin
  // «El extraño viaje». La nacionalidad de quien dirige solo DESCARTA si ese
  // país es además uno de los de la propia película.
  assert.equal(atribuir({ iso: 'DE', origen: ['DE'], produccion: ['DE'], directorIso: 'AT' }), 'origen');
  assert.equal(atribuir({ iso: 'ES', origen: ['ES'], produccion: ['ES'], directorIso: 'CL' }), 'origen');
  assert.equal(atribuir({ iso: 'ES', origen: ['ES'], produccion: ['ES'], directorIso: 'PE' }), 'origen');
});

test('…pero si el país de quien dirige TAMBIÉN es de la película, la película es suya', () => {
  // que es lo que separa «M» de «Azur & Asmar»: Ocelot es francés y Francia
  // está entre los países de la película, así que no es española
  assert.equal(
    atribuir({ iso: 'ES', origen: ['BE', 'FR', 'ES'], produccion: ['BE', 'FR', 'IT', 'ES'], directorIso: 'FR' }),
    null
  );
  assert.equal(atribuir({ iso: 'ES', origen: ['ES', 'AR'], produccion: ['AR', 'ES'], directorIso: 'AR' }), null);
});

// --- el lugar de nacimiento al código ISO -------------------------------------

test('el lugar de nacimiento se lee en castellano, en inglés y con estados que ya no existen', () => {
  assert.equal(isoDeLugar('Calanda, Teruel, España'), 'ES');
  assert.equal(isoDeLugar('Villefranche-sur-Saône, France'), 'FR');
  assert.equal(isoDeLugar('Guadalajara, Jalisco, Mexico'), 'MX');
  assert.equal(isoDeLugar('Moscow, USSR'), 'SU');
  assert.equal(isoDeLugar('Berlin, West Germany'), 'DE');
  assert.equal(isoDeLugar('London, England'), 'GB');
  assert.equal(isoDeLugar('Brooklyn, New York, USA'), 'US');
});

test('las anotaciones de TMDB no tiran el país: son justo los que interesan', () => {
  // TMDB anota los estados desaparecidos con su equivalente de hoy, y sin
  // quitar esa coletilla no casaba NINGUNO — o sea, ni la URSS ni las dos
  // Alemanias ni Checoslovaquia, que son los que el catálogo conserva aposta
  assert.equal(isoDeLugar('Moscow, USSR (Russia)'), 'SU');
  assert.equal(isoDeLugar('Berlin, West Germany [now Germany]'), 'DE');
  assert.equal(isoDeLugar('Prague, Czechoslovakia [now Czech Republic]'), 'CS');
});

test('el país se lee aunque venga tras un guion o en otro idioma', () => {
  assert.equal(isoDeLugar('Madrid - Spain'), 'ES');
  assert.equal(isoDeLugar('Copenhagen, Danmark'), 'DK');
  assert.equal(isoDeLugar('Istanbul, Türkiye'), 'TR');
  assert.equal(isoDeLugar('New York, U.S.'), 'US');
});

test('GEORGIA ES AMBIGUA Y SE DICE QUE NO SE SABE', () => {
  // «Savannah, Georgia» es Estados Unidos y «Tbilisi, Georgia» es Georgia, y la
  // cadena no trae con qué decidir: contestar cualquiera de las dos convierte a
  // un director estadounidense en georgiano. Manda «mejor sin ficha que la
  // ficha de otra», y la atribución se cae al país de origen.
  assert.equal(isoDeLugar('Savannah, Georgia'), null);
  assert.equal(isoDeLugar('Tbilisi, Georgia'), null);
  // con el país detrás sí se sabe, y entonces se contesta
  assert.equal(isoDeLugar('Atlanta, Georgia, USA'), 'US');
  assert.equal(isoDeLugar('Tbilisi, Georgia, USSR'), 'SU');
});

test('los países de una coproducción se leen con coma Y con espacio', () => {
  // el palmarés empaquetado usa los dos separadores, y a veces los dos en la
  // misma fila: partiendo solo por coma, «Los lunes al sol» no llegaba a
  // candidata española — o sea que el rescate de coproducciones no funcionaba
  // precisamente en las coproducciones
  assert.deepEqual(isosDeTexto('Spain France Italy'), ['ES', 'FR', 'IT']);
  assert.deepEqual(isosDeTexto('France, Senegal, Benin'), ['FR', 'SN']);
  assert.deepEqual(isosDeTexto('Argentina France, Netherlands Spain'), ['AR', 'FR', 'NL', 'ES']);
  assert.deepEqual(isosDeTexto('Mexico Spain'), ['MX', 'ES']);
});

test('los nombres de varias palabras no se parten por dentro', () => {
  assert.deepEqual(isosDeTexto('United States'), ['US']);
  assert.deepEqual(isosDeTexto('United Kingdom'), ['GB']);
  assert.deepEqual(isosDeTexto('South Korea Hong Kong'), ['KR', 'HK']);
  assert.deepEqual(isosDeTexto('Bosnia & Herzegovina'), ['BA']);
});

test('un texto sin países conocidos no inventa ninguno', () => {
  assert.deepEqual(isosDeTexto(''), []);
  assert.deepEqual(isosDeTexto(null), []);
  assert.deepEqual(isosDeTexto('Belarus'), []);
});

test('un lugar que no dice país no inventa uno', () => {
  assert.equal(isoDeLugar(''), null);
  assert.equal(isoDeLugar(null), null);
  assert.equal(isoDeLugar('Un sitio que no existe'), null);
});

test('los acentos y las letras raras no rompen el emparejado del país', () => {
  assert.equal(isoDeLugar('Reikiavik, Islandia'), 'IS');
  assert.equal(isoDeLugar('Ciudad de México, México'), 'MX');
});

// --- el orden y el desempate --------------------------------------------------

test('ordena la nota de Letterboxd, no la Σ ni los votos', () => {
  const a = { lb: 8.4, avales: 0, ganados: 0, lb_votes: 10 };
  const b = { lb: 7.2, avales: 9, ganados: 9, lb_votes: 999999 };
  assert.deepEqual([b, a].sort(ordenar), [a, b]);
});

test('EMPATADAS A NOTA, DESEMPATA EL CANON: es la mitad de un top-100', () => {
  // la nota llega con un decimal y en el top-100 de España hay 49 películas
  // con 7,6: si desempataran los votos, la frontera la decidiría la
  // popularidad, que es el sesgo del que se venía huyendo
  const canonica = { lb: 7.6, avales: 4, ganados: 2, lb_votes: 3000 };
  const popular = { lb: 7.6, avales: 0, ganados: 0, lb_votes: 900000 };
  assert.deepEqual([popular, canonica].sort(ordenar), [canonica, popular]);
});

test('con los mismos avales gana quien ganó más, y luego sí los votos', () => {
  const gana = { lb: 7.6, avales: 3, ganados: 3, lb_votes: 100 };
  const nomina = { lb: 7.6, avales: 3, ganados: 0, lb_votes: 100 };
  assert.deepEqual([nomina, gana].sort(ordenar), [gana, nomina]);

  const vista = { lb: 7.6, avales: 1, ganados: 1, lb_votes: 5000 };
  const ignota = { lb: 7.6, avales: 1, ganados: 1, lb_votes: 5 };
  assert.deepEqual([ignota, vista].sort(ordenar), [vista, ignota]);
});

test('una película sin nota no se cuela por delante de las que la tienen', () => {
  const con = { lb: 6.0, avales: 0, ganados: 0, lb_votes: 0 };
  const sin = { lb: null, avales: 9, ganados: 9, lb_votes: 0 };
  assert.deepEqual([sin, con].sort(ordenar), [con, sin]);
});

test('UNA NOTA IMPOSIBLE NO ES UNA NOTA', () => {
  // Letterboxd puntúa sobre 10 y MDBList devolvió un 14,6 para una soviética:
  // sin validar, «ordenar» la ponía de número uno por delante de «Stalker»
  assert.equal(notaValida(14.6), null);
  assert.equal(notaValida(-1), null);
  assert.equal(notaValida(null), null);
  assert.equal(notaValida('8.4'), null, 'una cadena tampoco es una nota');
  assert.equal(notaValida(8.4), 8.4);
  assert.equal(notaValida(0), 0);
  assert.equal(notaValida(10), 10);
});

test('CHECOSLOVAQUIA Y ALEMANIA DEL ESTE se le piden a TMDB con SU código', () => {
  // Medido contra /discover: para TMDB «CS» es Serbia y Montenegro (90
  // películas serbias de los 2000) y «DD» no existe (cero). Los suyos son XC y
  // XG. Preguntando por el ISO, «Checoslovaquia» habría servido cine serbio
  // bajo el rótulo equivocado, que es peor que servir una lista vacía.
  assert.equal(codigoTmdb('CS'), 'XC');
  assert.equal(codigoTmdb('DD'), 'XG');
  // los demás se preguntan por su ISO, sin excepción
  assert.equal(codigoTmdb('ES'), 'ES');
  assert.equal(codigoTmdb('SU'), 'SU');
  assert.equal(codigoTmdb('YU'), 'YU');
});

// --- lo que NO es una película que buscar ------------------------------------

const conGeneros = (title, ids) => ({ title, original_title: title, genres: ids.map((id) => ({ id })) });

test('UN CONCIERTO FILMADO NO ES CINE, aunque el público lo puntúe alto', () => {
  // «Pink Floyd: Live at Pompeii» y un directo de BTS abrían el top de Reino
  // Unido con 8,8, entre «Lawrence de Arabia» y «Las zapatillas rojas»; «Dua
  // Lipa: Live from Mexico» era la número uno de México por delante de «El
  // laberinto del fauno».
  assert.equal(esConcierto(conGeneros('Dua Lipa: Live from Mexico', [10402])), true, 'solo género musical');
  assert.equal(esConcierto(conGeneros('Pink Floyd: Live at Pompeii', [10402, 99])), true, 'musical y documental');
  // y el que no delatan los géneros, porque viene como comedia: lo dice el título
  assert.equal(esConcierto(conGeneros('Flight of the Conchords: Live in London', [35, 10402])), true);
});

test('…pero un MUSICAL sí lo es, y no se puede echar con la misma vara', () => {
  // un musical de verdad nunca va solo de género musical
  assert.equal(esConcierto(conGeneros('Cabaret', [18, 10402])), false);
  assert.equal(esConcierto(conGeneros('La La Land', [35, 18, 10749, 10402])), false);
  assert.equal(esConcierto(conGeneros('A Hard Day’s Night', [35, 10402])), false);
});

test('el título solo cuenta si además hay género musical', () => {
  // «Carne trémula» se llama «Live Flesh» en inglés: sin la condición del
  // género, se caería de la lista española por su nombre
  assert.equal(esConcierto(conGeneros('Live Flesh', [18, 80])), false);
  assert.equal(esConcierto(conGeneros('The Live-In Maid', [18])), false);
});

// --- el monólogo grabado ------------------------------------------------------
//
// Las fichas son las de TMDB, con su reparto tal y como viene: los personajes
// están comprobados uno a uno contra `movie_cr:<id>:es-ES` de la caché.
const conReparto = (title, ids, personajes) => ({
  title,
  original_title: title,
  genres: ids.map((id) => ({ id })),
  credits: { cast: personajes.map((character, i) => ({ name: `Fulano ${i}`, character })) },
});

test('UN MONÓLOGO GRABADO NO ES CINE, y no lo delata el género musical', () => {
  // Los cuatro que peor salían de los veintinueve medidos sobre los paquetes.
  assert.equal(esMonologo(conReparto('Hannah Gadsby: Nanette', [35], ['Self'])), true, 'quinta de Australia');
  assert.equal(esMonologo(conReparto('Hannah Gadsby: Douglas', [35], ['Self'])), true, 'primera de 2020');
  assert.equal(esMonologo(conReparto('La Pelota de Letras', [35], ['Himself'])), true, 'la única de 2005 en Colombia');
  // dos figurantes sin acreditar detrás no lo convierten en una película
  assert.equal(
    esMonologo(conReparto('Eddie Izzard: Glorious', [35], ['Herself', 'Groupie (uncredited)', 'Groupie (uncredited)'])),
    true,
    'primera de 1997 en Reino Unido'
  );
  // y con género documental también: «Whindersson Nunes: Isso não é um culto»
  assert.equal(esMonologo(conReparto('Isso não é um culto', [35, 99], ['Himself'])), true);
});

test('…pero un DOCUMENTAL CORAL no, aunque todos hagan de sí mismos', () => {
  // «Riverboom», segunda de Suiza: tres periodistas en Afganistán, los tres
  // acreditados «Self». Es la razón de que se exija UNO y no «al menos uno».
  assert.equal(esMonologo(conReparto('Riverboom', [99, 35], ['Self', 'Self', 'Self'])), false);
  assert.equal(esMonologo(conReparto('Heimaleikurinn', [99, 35], ['Self', 'Self', 'Self', 'Self'])), false);
});

test('…y una comedia con un cameo tampoco: por eso el reparto va con tope', () => {
  // Sin el tope, la condición del «uno de sí mismo» la cumplían «Happy
  // Gilmore» (Bob Barker) y «Borat»: son películas, y con reparto de sesenta.
  const muchos = ['Protagonista', 'Secundario', 'Otro', 'Self'];
  assert.equal(esMonologo(conReparto('Happy Gilmore', [35], muchos)), false);
  assert.equal(esMonologo(conReparto('Borat Subsequent Moviefilm', [35], muchos)), false);
  // y una comedia normal, sin nadie haciendo de sí mismo, ni se acerca
  assert.equal(esMonologo(conReparto('Alan Partridge: Alpha Papa', [35], ['Alan Partridge', 'Pat Farrell'])), false);
});

test('el género manda: con otro género delante hay una película', () => {
  // «Nanette» con un drama al lado ya no es la firma de un especial, y echarla
  // por el reparto sería tirar cine
  assert.equal(esMonologo(conReparto('Una comedia dramática', [35, 18], ['Self'])), false);
  assert.equal(esMonologo(conReparto('Un documental', [99], ['Self'])), false, 'sin comedia no se mira');
  assert.equal(esMonologo(conReparto('Sin reparto', [35], [])), false, 'sin reparto no se puede decidir');
});

test('lo que no se ha estrenado no entra en un canon histórico', () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const dentroDeUnAño = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  assert.equal(estaEstrenada({ release_date: dentroDeUnAño }), false, 'su nota alta son las ganas de verla');
  assert.equal(estaEstrenada({ release_date: hoy }), true);
  assert.equal(estaEstrenada({ release_date: '1957-01-01' }), true);
  // sin fecha SÍ entra: hay clásicos con la ficha incompleta y eso no es motivo
  assert.equal(estaEstrenada({}), true);
  assert.equal(estaEstrenada({ release_date: '' }), true);
});

// --- el catálogo --------------------------------------------------------------

test('cada país del catálogo tiene nombre en los dos idiomas y una categoría', () => {
  for (const [iso, p] of Object.entries(PAISES)) {
    assert.match(iso, /^[A-Z]{2}$/, `${iso} no es un ISO 3166-1 alfa-2`);
    assert.ok(p.es && p.en, `${iso} sin nombre en los dos idiomas`);
    assert.ok(TIERS[p.tier], `${iso} con categoría desconocida: ${p.tier}`);
  }
});

test('los tamaños son los pedidos: 200 los grandes, 100 los importantes, 50 el resto', () => {
  assert.equal(TIERS.grande.global, 200);
  assert.equal(TIERS.importante.global, 100);
  assert.equal(TIERS.menor.global, 50);
  assert.equal(TIERS.grande.anio, 20);
  assert.equal(TIERS.menor.anio, 10);
  // la red va por encima del objetivo porque solo la mitad de las candidatas
  // tiene nota de Letterboxd
  for (const t of Object.values(TIERS)) assert.ok(t.red > t.anio, 'la red tiene que ir por encima del objetivo');
});

test('Estados Unidos y Reino Unido son los dos grandes', () => {
  assert.equal(tierDe('US').global, 200);
  assert.equal(tierDe('GB').global, 200);
  assert.equal(tierDe('ES').global, 100);
});

test('un país que no está en el catálogo se rechaza, no se inventa', () => {
  assert.equal(esPaisConocido('XX'), false);
  assert.equal(esPaisConocido(''), false);
  assert.equal(esPaisConocido(null), false);
  assert.equal(esPaisConocido('es'), true, 'el código en minúsculas es el mismo país');
  assert.throws(() => peliculasDePais('XX'), /desconocido/);
  assert.throws(() => aniosDePais('XX'), /desconocido/);
});

// --- FilmAffinity ------------------------------------------------------------

test('todo ranking de FilmAffinity apunta a un país del catálogo', () => {
  for (const iso of Object.keys(RANKINGS)) {
    assert.ok(esPaisConocido(iso), `${iso} tiene ranking pero no está en el catálogo`);
  }
});

test('el paquete de FilmAffinity solo trae países que tengan ranking', () => {
  for (const iso of Object.keys(FA_RANKINGS)) {
    assert.ok(tieneRanking(iso), `${iso} está empaquetado pero no figura con ranking`);
  }
});

test('los códigos de ranking NO son el ISO en minúsculas, y por eso van escritos', () => {
  // se dieron por buenos mirando el código HTTP y estaban mal: un ranking que
  // no existe responde 200 con una página sin una sola ficha
  assert.equal(RANKINGS.GB, 'ranking_movies_uk');
  assert.equal(RANKINGS.IT, 'ranking_movies_italy');
});

test('el paquete trae puesto, título y año, y los ids que trae son enteros', () => {
  for (const [iso, paquete] of Object.entries(FA_RANKINGS)) {
    assert.ok(paquete.rows.length > 0, `${iso} empaquetado sin filas`);
    for (const r of paquete.rows) {
      assert.ok(Number.isInteger(r.p) && r.p > 0, `${iso}: puesto inválido`);
      assert.ok(typeof r.t === 'string' && r.t.length, `${iso}: fila sin título`);
      // el id puede faltar —mejor sin ficha que la ficha de otra— pero si está,
      // es un entero
      if (r.i != null) assert.ok(Number.isInteger(r.i) && r.i > 0, `${iso}: id de TMDB inválido`);
    }
    // los puestos van seguidos desde el 1: son el orden que se enseña
    assert.deepEqual(
      paquete.rows.map((r) => r.p),
      paquete.rows.map((_, i) => i + 1),
      `${iso}: los puestos no van seguidos`
    );
  }
});

test('el título original se separa del traducido cuando viene entre paréntesis', () => {
  // sin esto se perdían «La lengua de las mariposas» y las de su clase
  assert.deepEqual(partirTitulo('Butterfly Tongues (La lengua de las mariposas)'), {
    titulo: 'Butterfly Tongues',
    original: 'La lengua de las mariposas',
  });
  assert.deepEqual(partirTitulo('Harakiri'), { titulo: 'Harakiri', original: null });
});

test('un año o una marca de televisión entre paréntesis NO son un título original', () => {
  assert.deepEqual(partirTitulo('Una peli (1998)'), { titulo: 'Una peli (1998)', original: null });
  assert.deepEqual(partirTitulo('Una peli (TV)'), { titulo: 'Una peli (TV)', original: null });
});

test('el lector de fichas saca id, título, año y dirección de su HTML', () => {
  const html = `
    <div class="row movie-card" data-movie-id="209631">
      <div class="fs-6 mc-title"> <a href="/en/film209631.html">Harakiri</a> </div>
      <div><span class="mc-year ms-1">1962</span></div>
      <div class="mt-2 mc-director"><div class="credits"><span class="nb">
        <a href="/en/name.php?name-id=267661574" title="Masaki Kobayashi">Masaki Kobayashi</a></span></div></div>
    </div>`;
  assert.deepEqual(parsearFichas(html), [
    { fa_id: 209631, title: 'Harakiri', original_title: null, year: 1962, director: 'Masaki Kobayashi' },
  ]);
});

test('una página sin fichas devuelve lista vacía, no revienta', () => {
  // es lo que contesta FilmAffinity a un ranking que no existe, y también
  // cuando corta el grifo: tiene que poder distinguirse de un fallo
  assert.deepEqual(parsearFichas('<html><body>Nada</body></html>'), []);
  assert.deepEqual(parsearFichas(''), []);
  assert.deepEqual(parsearFichas(null), []);
});

test('las entidades HTML se decodifican en títulos y en nombres', () => {
  const html = `<div data-movie-id="1">
      <div class="fs-6 mc-title"> <a href="#">Beauty &amp; the Beast</a> </div>
      <div><span class="mc-year ms-1">1946</span></div>
      <div class="mt-2 mc-director"><a href="#" title="Jean Cocteau">x</a></div>
    </div>`;
  assert.equal(parsearFichas(html)[0].title, 'Beauty & the Beast');
});

// --- las correcciones a mano --------------------------------------------------

test('una corrección se guarda, se lee y se retira', () => {
  ponerOverride('ES', 4497, 'add', 'Viridiana');
  assert.deepEqual(
    overridesDePais('ES').map((o) => [o.tmdb_id, o.modo, o.title]),
    [[4497, 'add', 'Viridiana']]
  );
  quitarOverride('ES', 4497);
  assert.deepEqual(overridesDePais('ES'), []);
});

test('corregir dos veces la misma película no la duplica: la última manda', () => {
  ponerOverride('IT', 999, 'add', 'Una');
  ponerOverride('IT', 999, 'drop', 'Una');
  const filas = overridesDePais('IT');
  assert.equal(filas.length, 1);
  assert.equal(filas[0].modo, 'drop');
  quitarOverride('IT', 999);
});

test('el «drop» saca la película de las DOS fuentes en el acto', () => {
  // la corrección dice «esta película no es de este país», y eso no depende de
  // quién la haya listado
  const meter = db.prepare(
    `INSERT INTO country_films (iso, fuente, tmdb_id, title, year, lb, rank_global)
     VALUES (?, ?, 4497, 'Viridiana', 1961, 8, 1)`
  );
  meter.run('ES', 'lb');
  meter.run('ES', 'fa');
  assert.equal(peliculasDePais('ES').length, 1);
  assert.equal(peliculasDePais('ES', { fuente: 'fa' }).length, 1);

  ponerOverride('ES', 4497, 'drop', 'Viridiana');
  assert.equal(peliculasDePais('ES').length, 0);
  assert.equal(peliculasDePais('ES', { fuente: 'fa' }).length, 0);
  quitarOverride('ES', 4497);
});

test('una corrección solo acepta los dos modos que existen, y un id de verdad', () => {
  assert.throws(() => ponerOverride('ES', 1, 'borrar'), /add o drop/);
  assert.throws(() => ponerOverride('ES', 'pepe', 'drop'), /id de TMDB/);
  assert.throws(() => ponerOverride('ES', 0, 'drop'), /id de TMDB/);
  assert.throws(() => ponerOverride('XX', 1, 'drop'), /desconocido/);
});

test('un fallo NO borra las cifras de la última construcción buena', () => {
  // el guardado del país es una transacción al final, así que un fallo deja
  // intactas las películas: poner el resumen a cero hacía que la página
  // sirviera mil filas encima de un letrero que decía «0 candidatas»
  guardarBuild({
    iso: 'PT', fuente: 'lb', at: 1000, candidatos: 4000, con_nota: 1600,
    guardadas: 1200, del_palmares: 20, sin_cupo: 0, segundos: 180, error: null,
  });
  apuntarFallo('PT', 'TMDB cortó la conexión');
  const ficha = catalogoPaises().find((p) => p.iso === 'PT').build;
  assert.equal(ficha.error, 'TMDB cortó la conexión');
  assert.equal(ficha.guardadas, 1200, 'las cifras de la buena siguen ahí');
  assert.equal(ficha.candidatos, 4000);
  assert.equal(ficha.at, 1000, 'y la fecha sigue siendo la de la buena');
});

// --- las consultas ------------------------------------------------------------

test('las dos fuentes no se pisan: cada una sirve la suya', () => {
  const meter = db.prepare(
    `INSERT INTO country_films (iso, fuente, tmdb_id, title, year, lb, rank_global, rank_anio)
     VALUES (?, ?, ?, ?, 1970, 8, ?, ?)`
  );
  meter.run('FR', 'lb', 111, 'La de Letterboxd', 1, 1);
  meter.run('FR', 'fa', 222, 'La de FilmAffinity', 1, null);

  assert.deepEqual(peliculasDePais('FR').map((p) => p.title), ['La de Letterboxd']);
  assert.deepEqual(peliculasDePais('FR', { fuente: 'fa' }).map((p) => p.title), ['La de FilmAffinity']);
});

test('el año CERO no cuela como «sin año»', () => {
  // 0 es falsy: se colaba por la rama del top histórico mientras la respuesta
  // seguía diciendo que estaba filtrando por ese año
  assert.deepEqual(peliculasDePais('FR', { anio: 0 }), []);
  assert.equal(peliculasDePais('FR', { anio: 1970 }).length, 1);
});

test('la regleta de años es SOLO de la lista nuestra', () => {
  // el ranking de FilmAffinity es uno solo y no se reparte por años: si contara
  // aquí, la regleta enseñaría años que luego salen vacíos
  assert.deepEqual(aniosDePais('FR'), [{ year: 1970, n: 1 }]);
});

test('el catálogo dice el estado de cada país por separado en cada fuente', () => {
  const ficha = catalogoPaises().find((p) => p.iso === 'FR');
  assert.ok(ficha, 'Francia tiene que estar en el catálogo');
  assert.ok('build' in ficha && 'buildFa' in ficha, 'cada fuente lleva su estado');
});

test('el catálogo va ordenado por nombre castellano, que es como se lee', () => {
  const nombres = catalogoPaises().map((p) => p.es);
  assert.deepEqual(nombres, [...nombres].sort((a, b) => a.localeCompare(b, 'es')));
});

// --- LA NOTA ASENTADA ---------------------------------------------------------
//
// Un 7,8 con 300 votos adelantaba a un 7,6 con 27.000, y eso no es una nota
// mejor: es una nota con menos gente detrás. La corrección clásica —la del Top
// 250 de IMDb— acerca la nota a la media mientras faltan votos. Aquí tenía dos
// trampas, y las dos están fijadas abajo.

test('la nota asentada acerca a la media lo que tiene pocos votos, y deja en paz lo demás', () => {
  const media = 6.6;
  // 100 votos es la mitad del camino, por definición de la constante
  assert.equal(notaAsentada(8.6, VOTOS_PARA_ASENTAR, media), 7.6);
  // sin un solo voto no hay nota propia: la del país
  assert.equal(notaAsentada(9.0, 0, media), 6.6);
  // con votos de sobra, la nota es la suya
  assert.equal(notaAsentada(8.4, 305282, media), 8.4);
  // y sin nota no hay nada que asentar
  assert.equal(notaAsentada(null, 5000, media), null);
});

test('EL CASO DE RAMÓN: el 7,8 de 300 votos deja de adelantar al 7,6 de 27.000', () => {
  // La corrección es RELATIVA A LA MEDIA DEL PAÍS, así que el país tiene que
  // existir: con dos películas sueltas la media es 7,7 y no hay nada que
  // corregir. Aquí el relleno pone la media donde la tiene España, en 6,7.
  const relleno = Array.from({ length: 30 }, () => ({ lb: 6.6, lb_votes: 5000, avales: 0, ganados: 0, title: 'relleno' }));
  const flojo = { lb: 7.8, lb_votes: 300, avales: 0, ganados: 0, title: 'flojo' };
  const solido = { lb: 7.6, lb_votes: 27000, avales: 0, ganados: 0, title: 'sólido' };
  const orden = ordenarPais([flojo, solido, ...relleno]);
  assert.equal(mediaDelPais(orden), 6.7);
  assert.deepEqual(orden.slice(0, 2).map((x) => x.title), ['sólido', 'flojo']);
  assert.equal(flojo.orden, 7.5, 'el 7,8 con 300 votos se asienta en 7,5');
  assert.equal(solido.orden, 7.6, 'el 7,6 con 27.000 no se mueve');
});

test('SE REDONDEA AL DÉCIMO para no cargarse el desempate por canon', () => {
  // Sin redondear, la nota corregida es continua y NUNCA empata: el desempate
  // por avales no llegaba a consultarse y media lista quedaba ordenada por
  // votos, que es el sesgo del que se venía huyendo. Medido sobre el paquete
  // de Reino Unido, «La Odisea» adelantaba así a «Lawrence de Arabia».
  const lawrence = { lb: 8.8, lb_votes: 402647, avales: 7, ganados: 3 };
  const odisea = { lb: 8.8, lb_votes: 3847008, avales: 0, ganados: 0 };
  const orden = ordenarPais([odisea, lawrence]);
  assert.equal(orden[0].avales, 7, 'con la misma nota manda el canon, no los votos');
  assert.equal(orden[0].orden, orden[1].orden, 'y para eso las dos notas tienen que empatar');
});

test('LAS CINEMATOGRAFÍAS PEQUEÑAS NO SE APLANAN: la constante no sale del país', () => {
  // Armenia tiene 32 películas y ninguna pasa de 1.600 votos. Sacando la
  // constante de un percentil del propio país se movía el 69 % de sus notas y
  // le cambiaba el orden de los diez primeros; con el cien fijo, el orden de
  // Armenia se queda como estaba y solo se mueve lo que de verdad no tiene
  // gente detrás.
  const armenia = [
    { lb: 7.8, lb_votes: 1584, avales: 0, ganados: 0, title: 'Aurora' },
    { lb: 7.8, lb_votes: 954, avales: 0, ganados: 0, title: 'Kyank' },
    { lb: 7.4, lb_votes: 641, avales: 0, ganados: 0, title: 'Avetik' },
    { lb: 7.4, lb_votes: 331, avales: 0, ganados: 0, title: '1489' },
    { lb: 7.2, lb_votes: 1116, avales: 0, ganados: 0, title: 'Vodka Lemon' },
  ];
  assert.deepEqual(
    ordenarPais([...armenia]).map((x) => x.title),
    ['Aurora', 'Kyank', 'Avetik', '1489', 'Vodka Lemon']
  );
});

test('la media del país es la de sus notas, al décimo, y las sin nota no cuentan', () => {
  assert.equal(mediaDelPais([{ lb: 7 }, { lb: 8 }, { lb: null }]), 7.5);
  assert.equal(mediaDelPais([{ lb: null }]), 0);
});
