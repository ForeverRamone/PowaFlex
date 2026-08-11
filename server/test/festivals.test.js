import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGISTRY, parseSelectionTable, parseSundanceWinners, parseWinnersTables, stripTags, directorsMatch, cleanTableTitle,
  parseCahiersTables, splitDirectors, elegirCandidato, faltaElTituloOriginal, esGrisNeutro, filaResaltada,
  expandirColspan, partePorSalto, esSerieConocida, anuarioKeys,
} from '../src/festivals.js';
import { mismoDiminutivo } from '../src/names.js';
import { SIGHT_AND_SOUND_2022 } from '../src/data/sight-and-sound-2022.js';
import { MIL_UNA_2021 } from '../src/data/1001-movies-2021.js';

/**
 * Festivales: la convención de títulos de artículo y el parser de wikitables.
 *
 * Los artículos numerados (Venecia, Berlinale, Busan) se generan restando el
 * año de origen; si alguien toca esa aritmética, la página pediría a Wikipedia
 * un artículo que no existe y TODAS las ediciones fallarían igual de raro.
 */

test('los títulos de artículo siguen la convención de la Wikipedia inglesa', () => {
  assert.equal(REGISTRY.cannes.article(2025), '2025 Cannes Film Festival');
  assert.equal(REGISTRY.venecia.article(2025), '82nd Venice International Film Festival');
  assert.equal(REGISTRY.venecia.article(2024), '81st Venice International Film Festival');
  assert.equal(REGISTRY.venecia.article(2023), '80th Venice International Film Festival');
  assert.equal(REGISTRY.berlinale.article(2025), '75th Berlin International Film Festival');
  assert.equal(REGISTRY.busan.article(2025), '30th Busan International Film Festival');
  assert.equal(REGISTRY.sundance.article(2025), '2025 Sundance Film Festival');
  assert.equal(REGISTRY.tiff.article(2025), '2025 Toronto International Film Festival');
  assert.equal(REGISTRY.sansebastian.article(2025), '73rd San Sebastián International Film Festival');
  assert.equal(REGISTRY.horizontes.article(2024), '72nd San Sebastián International Film Festival');
});

test('cada festival casa el nombre real de su sección oficial', () => {
  assert.ok(REGISTRY.cannes.section.test('In Competition'));
  assert.ok(REGISTRY.venecia.section.test('In Competition (Venezia 82)'));
  assert.ok(REGISTRY.berlinale.section.test('Main Competition'));
  assert.ok(REGISTRY.sundance.section.test('World Cinema Dramatic Competition'));
  assert.ok(REGISTRY.tiff.section.test('Platform'));
  assert.ok(REGISTRY.busan.section.test('Competition'));
  assert.ok(REGISTRY.sansebastian.section.test('In competition'));
  assert.ok(REGISTRY.horizontes.section.test('Latin Horizons (Horizontes latinos)'));
});

// Las secciones de DEBUT son donde estrena quien empieza, y sus nombres reales
// se comprobaron uno a uno contra los artículos de Wikipedia de 2010 a 2025:
// la Berlinale cambió Encounters por Perspectives en 2025 y Venecia titula su
// sección «Horizons (Orizzonti)» en los artículos viejos y «Orizzonti» ahora.
test('cada sección de debut casa el nombre real que usa Wikipedia', () => {
  // Un Certain Regard es la SEGUNDA competición oficial de Cannes, no una
  // sección paralela, y el artículo la titula así en las tres apariciones
  // (jurado, selección y premios): el ^…$ evita que cace la del palmarés antes
  assert.ok(REGISTRY.uncertainregard.section.test('Un Certain Regard'));
  assert.equal(REGISTRY.uncertainregard.section.test('Un Certain Regard Award'), false);
  assert.ok(REGISTRY.semaine.section.test("Critics' Week (Semaine de la critique)"));
  assert.ok(REGISTRY.semaine.section.test('Critics’ Week'));
  assert.ok(REGISTRY.quinzaine.section.test("Directors' Fortnight (Quinzaine des cinéastes)"));
  assert.ok(REGISTRY.orizzonti.section.test('Orizzonti'));
  assert.ok(REGISTRY.orizzonti.section.test('Horizons (Orizzonti)'));
  assert.ok(REGISTRY.perspectives.section.test('Encounters'));
  assert.ok(REGISTRY.perspectives.section.test('Perspectives'));
  assert.ok(REGISTRY.ssnuevos.section.test('New Directors'));
  // y comparten artículo con su festival madre
  assert.equal(REGISTRY.semaine.article(2025), '2025 Cannes Film Festival');
  assert.equal(REGISTRY.orizzonti.article(2025), '82nd Venice International Film Festival');
  assert.equal(REGISTRY.ssnuevos.article(2025), '73rd San Sebastián International Film Festival');
});

// Qué ofrece cada sección de debut: cuatro solo tienen edición por año
// (ofrecer «palmarés» sería ofrecer una opción que revienta), dos ganaron
// palmarés con artículo propio (Un Certain Regard y el Gran Premio de la
// Semana), y la Cámara de Oro es SOLO palmarés — premia la mejor ópera prima
// de todo Cannes y no tiene sección propia que listar por año.
test('las secciones de debut ofrecen lo que su artículo de Wikipedia aguanta', () => {
  for (const key of ['quinzaine', 'orizzonti', 'perspectives', 'ssnuevos']) {
    const f = REGISTRY[key];
    assert.equal(f.group, 'debut', key);
    assert.ok(!f.awardPage && !f.staticList && !f.staticAward, key);
    assert.ok(!f.onlyWinners && !f.awardNominees, key);
  }
  for (const key of ['uncertainregard', 'semaine']) {
    const f = REGISTRY[key];
    assert.equal(f.group, 'debut', key);
    assert.ok(f.awardPage && f.awardSection, key);
    assert.ok(!f.onlyWinners && !f.awardNominees, key);
  }
  assert.equal(REGISTRY.camaradeoro.group, 'debut');
  assert.ok(REGISTRY.camaradeoro.onlyWinners);
  assert.ok(REGISTRY.camaradeoro.awardPage && REGISTRY.camaradeoro.awardSection);
  assert.ok(!REGISTRY.camaradeoro.section && !REGISTRY.camaradeoro.article);
  // y el palmarés de Sundance EE UU llega hasta 1984 (Blood Simple), aunque
  // sus ediciones tabuladas empiecen en 2005
  assert.equal(REGISTRY.sundanceus.awardSinceYear, 1984);
});

// una tabla como las reales: cursivas, enlaces, notas [1], celdas con <br>
const TABLA = `
<table class="wikitable sortable">
<tr><th>English title</th><th>Original title</th><th>Director(s)</th><th>Production country</th></tr>
<tr><td><i><a href="/wiki/x">It Was Just an Accident</a></i></td><td><i>Yek tasadof-e sadeh</i></td><td><a href="/wiki/y">Jafar Panahi</a><sup>[1]</sup></td><td>Iran</td></tr>
<tr><td><i>Sentimental Value</i></td><td><i>Affeksjonsverdi</i></td><td>Joachim Trier</td><td>Norway<br>Denmark</td></tr>
<tr><td><i>Alpha</i> <a href="#qp">(QP)</a></td><td>Julia Ducournau</td><td>France</td></tr>
<tr><td colspan="4">Fila de relleno sin película</td></tr>
</table>`;

test('parseSelectionTable saca título, original, director y país', () => {
  const rows = parseSelectionTable(TABLA);
  // tres películas: la fila de una sola celda que abarca la tabla es una
  // cabecera interna («In Competition», «Feature films»), no una película. Así
  // parten su tabla las secciones paralelas de Cannes, y antes se colaba como
  // ficha fantasma que además salía a buscarse a TMDB.
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    title: 'It Was Just an Accident',
    original_title: 'Yek tasadof-e sadeh',
    director: 'Jafar Panahi',
    country: 'Iran',
  });
  assert.equal(rows[1].country, 'Norway, Denmark'); // <br> se vuelve coma
});

// Cannes 2025: si el título original coincide con el inglés, la fila viene SIN
// esa celda y sin recolocar las columnas el país acababa como director/a
test('una fila sin celda de título original se recoloca, y el marcador (QP) se limpia', () => {
  const alpha = parseSelectionTable(TABLA)[2];
  assert.deepEqual(alpha, {
    title: 'Alpha',
    original_title: 'Alpha',
    director: 'Julia Ducournau',
    country: 'France',
  });
});

test('sin columna de director no es una tabla de selección', () => {
  const sinDirector = '<table class="wikitable"><tr><th>Award</th><th>Winner</th></tr><tr><td>Palme</td><td>X</td></tr></table>';
  assert.deepEqual(parseSelectionTable(sinDirector), []);
});

// El emparejado con TMDB se verifica contra la dirección: sin esto, «Bunker»
// de Florian Zeller acababa siendo otra Bunker de 2026, y «Look Back» de
// Kore-eda, un especial de Euphoria (visto en producción con Venecia).
test('directorsMatch: acepta la dirección correcta, con o sin guiones y acentos', () => {
  assert.ok(directorsMatch('Hirokazu Kore-eda', ['Hirokazu Koreeda']));
  assert.ok(directorsMatch('Agnès Varda', ['Agnes Varda']));
  assert.ok(directorsMatch('Ludovic and Zoran Boukherma', ['Zoran Boukherma', 'Ludovic Boukherma']));
  assert.ok(directorsMatch('Joachim Trier, Otro Nombre', ['Joachim Trier']));
});

// las tablas de Wikipedia usan a veces el orden japonés de apellido primero:
// «The Eel» de Imamura quedaba sin ficha por esto (visto en producción)
test('directorsMatch: insensible al orden de las palabras del nombre', () => {
  assert.ok(directorsMatch('Imamura Shōhei', ['Shohei Imamura']));
  assert.ok(directorsMatch('Ozu Yasujirō', ['Yasujirō Ozu']));
  assert.ok(directorsMatch('Kore-eda Hirokazu', ['Hirokazu Koreeda']));
  assert.ok(directorsMatch('Joseph L. Mankiewicz', ['Joseph Mankiewicz']));
  // abreviaturas: el S&S y las tablas escriben «Carl Th. Dreyer»
  assert.ok(directorsMatch('Carl Th. Dreyer', ['Carl Theodor Dreyer']));
  assert.ok(directorsMatch('Wong Kar Wai', ['Wong Kar-wai']));
  // pero el orden no convierte a un tercero en válido
  assert.equal(directorsMatch('Imamura Shōhei', ['Sohei Imamoto']), false);
  assert.equal(directorsMatch('Carl Th. Dreyer', ['Carla Theron']), false);
});

/**
 * Los tres casos REALES que en producción dejaban sin cartel a tres películas
 * del canon de Sight & Sound (captura de Ramón sobre la Beta 1.08). Ninguno es
 * un fallo de título: los tres fallaban al comparar el nombre de quien dirige.
 */
test('directorsMatch: colectivos y transliteraciones (los tres del canon)', () => {
  // un colectivo en plural contra las dos personas que lo forman
  assert.ok(directorsMatch('The Wachowskis', ['Lana Wachowski', 'Lilly Wachowski']));
  // dobles que cada fuente transcribe a su manera desde el ruso y el persa
  assert.ok(directorsMatch('Larissa Shepitko', ['Larisa Shepitko']));
  assert.ok(directorsMatch('Forough Farokhzad', ['Forugh Farrokhzad']));
  // y el artículo no vuelve buena a otra persona
  assert.equal(directorsMatch('The Wachowskis', ['Lana Kowalski']), false);
});

test('directorsMatch: la tolerancia NO llega a otro apellido', () => {
  // el límite de lo que se acepta: una letra en palabras largas, no una sílaba
  for (const [wiki, tmdb] of [
    ['Claire Denis', ['Claire Simon']],
    ['Jean Renoir', ['Jean Rouch']],
    ['Michael Bay', ['Michael Mann']],
    ['Wang Bing', ['Wang Xiaoshuai']],
    ['Kelly Reichardt', ['Kelly Richards']],
    ['Lars von Trier', ['Lars Ohlson']],
  ]) {
    assert.equal(directorsMatch(wiki, tmdb), false, `${wiki} NO es ${tmdb[0]}`);
  }
});

test('directorsMatch: rechaza a otro director/a aunque el título y el año casen', () => {
  assert.equal(directorsMatch('Florian Zeller', ['Otra Persona']), false);
  assert.equal(directorsMatch('Casey Affleck', ['Jason Laurits']), false);
});

test('directorsMatch: sin director en la tabla no hay contra qué verificar', () => {
  assert.ok(directorsMatch(null, ['Cualquiera']));
  assert.ok(directorsMatch('', []));
});

// El palmarés de Sundance va en viñetas por año: el Grand Jury es la PRIMERA
// línea «World Cinema Dramatic – Título by Director» de cada año; las
// siguientes son el premio del público (mismo patrón) y el de dirección
// («Nombre for Título»), que no deben colarse.
const SUNDANCE_HTML = `
<h3 id="2025">2025</h3>
<ul>
<li>U.S. Dramatic – <i>Atropia</i> by Hailey Gates<sup>[1]</sup></li>
<li>World Cinema Dramatic – <i>Cactus Pears</i> by Rohan Parashuram Kanawade</li>
<li>World Cinema Documentary – <i>Cutting Through Rocks</i> by Sara Khaki</li>
</ul>
<ul><li>World Cinema Dramatic – <i>DJ Ahmet</i> by Georgi M. Unkovski</li></ul>
<ul><li>World Cinema Dramatic – Alireza Khatami for <i>The Things You Kill</i></li></ul>
<h3 id="2022">2022</h3>
<ul>
<li>Audience Award: World Cinema Dramatic – <i>Girl Picture</i> (Alli Haapasalo)</li>
<li>World Cinema Grand Jury Prize: Dramatic Competition – <i>Utama</i> (Alejandro Loayza Grisi)</li>
</ul>
<h3 id="2017">2017</h3>
<ul>
<li>World Cinema Grand Jury Prize: Dramatic – <i>The Nile Hilton Incident</i> by Tarik Saleh</li>
<li>World Cinema Directing Award: Dramatic – Francis Lee for <i>God's Own Country</i></li>
</ul>
<h3 id="2006">2006</h3>
<ul>
<li>World Cinema Audience Award Dramatic – <i>No. 2</i></li>
<li>World Cinema Jury Prize Dramatic – <i>13 Tzameti</i></li>
</ul>`;

// tres épocas de etiqueta («Jury Prize Dramatic», «Grand Jury Prize: Dramatic»,
// «World Cinema Dramatic» a secas) y tres formas de acreditar la dirección
// («by», paréntesis, o nada en los primeros años). El premio del público a
// veces se lista ANTES: la etiqueta explícita de jurado siempre manda.
test('parseSundanceWinners: solo el Grand Jury de cada año, en sus tres épocas', () => {
  const rows = parseSundanceWinners(SUNDANCE_HTML);
  assert.deepEqual(
    rows.map((r) => [r.year, r.title, r.director]),
    [
      [2025, 'Cactus Pears', 'Rohan Parashuram Kanawade'],
      [2022, 'Utama', 'Alejandro Loayza Grisi'],
      [2017, 'The Nile Hilton Incident', 'Tarik Saleh'],
      [2006, '13 Tzameti', null],
    ]
  );
});

// El canon de Sight & Sound viaja empaquetado (dataset fijo hasta 2032): si un
// retoque del fichero lo rompe, mejor que lo diga un test y no la página.
test('el dataset de Sight & Sound 2022 está completo y bien formado', () => {
  assert.ok(SIGHT_AND_SOUND_2022.length >= 250, `solo ${SIGHT_AND_SOUND_2022.length} entradas`);
  assert.ok(SIGHT_AND_SOUND_2022.every((r) => r.rank && r.title && r.year && r.director));
  const n1 = SIGHT_AND_SOUND_2022[0];
  assert.equal(n1.rank, 1);
  assert.ok(/Jeanne Dielman/.test(n1.title));
  assert.equal(n1.director, 'Chantal Akerman');
  assert.ok(REGISTRY.sightsound.onlyWinners);
  assert.equal(REGISTRY.sightsound.staticList, SIGHT_AND_SOUND_2022);
});

// El otro canon empaquetado: el libro de las 1001. Son exactamente 1001 (los
// cuatro bloques colapsados hacen que no sean 1008), todas las filas completas,
// y su entrada del REGISTRY va como canon de solo-palmarés con fuente y nota
// propias — festivalWinners ya no tiene nada de Sight & Sound cableado a mano.
test('el dataset de las 1001 películas está completo y cableado como canon', () => {
  assert.equal(MIL_UNA_2021.length, 1001);
  assert.ok(MIL_UNA_2021.every((r) => r.title && r.year && r.director));
  const claves = new Set(MIL_UNA_2021.map((r) => `${r.title}:${r.year}`));
  assert.equal(claves.size, 1001, 'hay filas duplicadas');
  assert.ok(/Trip to the Moon/.test(MIL_UNA_2021[0].title)); // orden cronológico del libro
  assert.equal(REGISTRY.mil1.group, 'canon');
  assert.ok(REGISTRY.mil1.onlyWinners);
  assert.equal(REGISTRY.mil1.staticList, MIL_UNA_2021);
  // las dos entradas estáticas llevan su fuente y su nota en el REGISTRY:
  // si faltan, el palmarés saldría con la fuente de otra o sin explicación
  for (const key of ['sightsound', 'mil1']) {
    assert.ok(REGISTRY[key].staticSource, `${key} sin staticSource`);
    assert.ok(REGISTRY[key].staticNote, `${key} sin staticNote`);
  }
});

// Las tablas viejas de BAFTA pegan el «(ex-æquo)» y hasta el título original
// entre paréntesis en la MISMA celda: sin limpiarlos, la búsqueda en TMDB no
// encontraba nada (visto en producción).
test('cleanTableTitle pela ex-æquo, títulos originales entre paréntesis y dagas', () => {
  assert.equal(cleanTableTitle('The Hustler (ex-æquo)'), 'The Hustler');
  assert.equal(
    cleanTableTitle('Ballad of a Soldier (Баллада о солдате, Ballada o soldate) (ex-æquo)'),
    'Ballad of a Soldier'
  );
  assert.equal(cleanTableTitle('Nomadland †'), 'Nomadland');
  assert.equal(cleanTableTitle('Alpha (QP)'), 'Alpha');
  // un título QUE ES un paréntesis no se queda en nada
  assert.equal(cleanTableTitle('(Untitled)'), '(Untitled)');
});

// tabla mixta de premio (ganadora sombreada entre nominadas): keepAll devuelve
// todas con su bandera, y el modo normal solo la ganadora
const TABLA_PREMIO = `
<table class="wikitable">
<tr><th>Year</th><th>English title</th><th>Original title</th><th>Director(s)</th></tr>
<tr><td rowspan="3">2024 (39th)</td><td style="background:#eedd82"><b>The 47</b></td><td style="background:#eedd82"><i>El 47</i></td><td style="background:#eedd82">Marcel Barrena</td></tr>
<tr><td><i>Saturn Return</i></td><td><i>Segundo premio</i></td><td>Isaki Lacuesta</td></tr>
<tr><td><i>The Red Virgin</i></td><td><i>La virgen roja</i></td><td>Paula Ortiz</td></tr>
</table>`;

test('parseWinnersTables: keepAll marca la ganadora entre las nominadas', () => {
  const ganadoras = parseWinnersTables(TABLA_PREMIO);
  assert.equal(ganadoras.length, 1);
  assert.equal(ganadoras[0].title, 'The 47');
  const todas = parseWinnersTables(TABLA_PREMIO, { keepAll: true });
  assert.equal(todas.length, 3);
  assert.deepEqual(todas.map((r) => [r.title, r.winner]), [
    ['The 47', true],
    ['Saturn Return', false],
    ['The Red Virgin', false],
  ]);
  assert.ok(todas.every((r) => r.year === 2024));
});

// --- lo que destaparon los premios de la crítica --------------------------------

// «Tiene fondo, luego ganó» dejó de valer con Critics’ Choice y el David di
// Donatello, que pintan sus tablas A RAYAS: media lista de nominadas salía
// marcada como ganadora, un año sí y otro no. El gris es decoración.
test('el gris de las rayas no es el sombreado de una ganadora', () => {
  for (const gris of ['#eee', '#EEEEEE', '#f2f2f2', 'transparent', 'whitesmoke', '#bebebe']) {
    assert.ok(esGrisNeutro(gris), gris);
  }
  for (const marca of ['#faeb86', '#eedd82', '#b0c4de', '#DDBF5F', '#efd']) {
    assert.equal(esGrisNeutro(marca), false, marca);
  }
  assert.ok(filaResaltada('<tr style="background:#FAEB86"><td>Nomadland</td></tr>'));
  assert.equal(filaResaltada('<tr style="background:#eee;"><td>Mank</td></tr>'), false);
  assert.equal(filaResaltada('<tr><td>Minari</td></tr>'), false);
  // el bgcolor suelto NO cuenta: tres filas del artículo de la Palma lo llevan
  // como nota, y darlas por palmarés dejaba fuera a toda su década
  assert.equal(filaResaltada('<tr bgcolor="#efd"><td>Taste of Cherry</td></tr>'), false);
});

// Chicago 2004 solo tiene ganadora, sin nominadas, y por eso el artículo no la
// sombrea: desaparecía del palmarés sin dejar rastro.
const TABLA_UN_SOLO_AÑO = `
<table class="wikitable">
<tr><th>Year</th><th>Winner and nominees</th><th>Director(s)</th></tr>
<tr><td>2004</td><td><i><b><a href="/wiki/Sideways">Sideways</a></b></i></td><td>Alexander Payne</td></tr>
<tr><td rowspan="2">2005</td><td style="background:#B0C4DE;"><i><b><a href="/wiki/Crash">Crash</a></b></i></td><td style="background:#B0C4DE;">Paul Haggis</td></tr>
<tr><td><i><a href="/wiki/Brokeback_Mountain">Brokeback Mountain</a></i></td><td>Ang Lee</td></tr>
</table>`;

test('en una tabla mixta, el año con una sola película es su ganadora aunque no vaya sombreada', () => {
  const ganadoras = parseWinnersTables(TABLA_UN_SOLO_AÑO);
  assert.deepEqual(ganadoras.map((r) => [r.year, r.title]), [[2005, 'Crash'], [2004, 'Sideways']]);
  const todas = parseWinnersTables(TABLA_UN_SOLO_AÑO, { keepAll: true });
  assert.deepEqual(todas.map((r) => [r.title, r.winner]), [
    ['Crash', true],
    ['Brokeback Mountain', false],
    ['Sideways', true],
  ]);
});

// El premio alemán se deja la columna del trofeo en casi todas sus filas, y
// exigir el ancho completo hacía que «1955» dejara de ser un año: pasaba a ser
// el TÍTULO de la película de 1954 y el título original acababa de director.
// La columna de película va en cursiva o enlazada; la del año, nunca.
const TABLA_COLUMNA_QUE_FALTA = `
<table class="wikitable">
<tr><th>Year</th><th>English title</th><th>Original title</th><th>Director(s)</th><th>Trophy received</th></tr>
<tr><td style="text-align:center;">1954</td><td><i><a href="/wiki/No_Way_Back">No Way Back</a></i></td><td><i>Weg ohne Umkehr</i></td><td>Victor Vicas</td><td>Golden Bowl</td></tr>
<tr><td style="text-align:center;">1955</td><td><i><a href="/wiki/Canaris">Canaris: Master Spy</a></i></td><td><i>Canaris</i></td><td>Alfred Weidenmann</td></tr>
<tr><td style="text-align:center;">2026</td><td colspan="2"><i><a href="/wiki/Luecke">Ach, diese Lücke</a></i></td><td>Simon Verhoeven</td></tr>
</table>`;

test('un año en <td> abre fila aunque la tabla se deje columnas por el camino', () => {
  const rows = parseWinnersTables(TABLA_COLUMNA_QUE_FALTA);
  assert.deepEqual(rows.map((r) => [r.year, r.title, r.director]), [
    [2026, 'Ach, diese Lücke', 'Simon Verhoeven'],
    [1955, 'Canaris: Master Spy', 'Alfred Weidenmann'],
    [1954, 'No Way Back', 'Victor Vicas'],
  ]);
});

// Los 25 inviernos que Mar del Plata no se celebró van en UNA fila, con el
// rango en la columna del año: sin reconocerlo, «1971–1995» entraba en el
// palmarés como si fuera una película.
const TABLA_CON_RANGO = `
<table class="wikitable">
<tr><th>Year</th><th>Film</th><th>Original Title</th><th>Director</th><th>Country</th></tr>
<tr><td>1970</td><td colspan="2"><i><a href="/wiki/Macunaima">Macunaíma</a></i></td><td>Joaquim Pedro de Andrade</td><td>Brazil</td></tr>
<tr><td>1971–1995</td><td colspan="4" style="text-align:center;">Festival Cancelled </td></tr>
<tr><td>1996</td><td><i><a href="/wiki/Dog">The Dog in the Manger</a></i></td><td><i>El perro del hortelano</i></td><td>Pilar Miró</td><td>Spain</td></tr>
</table>`;

test('un rango de años cancelados no se cuela como película', () => {
  const rows = parseWinnersTables(TABLA_CON_RANGO);
  assert.deepEqual(rows.map((r) => [r.year, r.title]), [[1996, 'The Dog in the Manger'], [1970, 'Macunaíma']]);
});

// Una celda con colspan ocupa VARIAS columnas: contarla como una sola descoloca
// todo lo que viene detrás. La fila de 1959 de los Globos fusiona dirección y
// producción, y sin esto el musical de ese año salía con el nombre de su
// director de TÍTULO.
test('expandirColspan pone cada celda en todas las columnas que ocupa', () => {
  assert.deepEqual(expandirColspan(['<td>a</td>', '<td colspan="2">b</td>', '<td>c</td>']), [
    '<td>a</td>', '<td colspan="2">b</td>', '<td colspan="2">b</td>', '<td>c</td>',
  ]);
  assert.deepEqual(expandirColspan([null, '<td>x</td>']), [null, '<td>x</td>']);
});

// Los Globos de 1958-1962, cuando comedia y musical eran dos premios distintos:
// dos pares (película, dirección) en la misma fila. Sin leer los dos, esos cinco
// años se quedaban fuera del palmarés enteros.
const TABLA_COLUMNAS_GEMELAS = `
<table class="wikitable">
<tr><th>Year</th><th>Comedy</th><th>Director</th><th>Producer</th><th>Musical</th><th>Director</th><th>Producer</th></tr>
<tr><td rowspan="2">1959</td><td><i><b>Some Like It Hot</b></i></td><td colspan="2">Billy Wilder</td><td><i><b>Porgy and Bess</b></i></td><td>Otto Preminger</td><td>Samuel Goldwyn</td></tr>
<tr><td><i>But Not for Me</i></td><td>Walter Lang</td><td>William Perlberg</td><td><i>The Five Pennies</i></td><td>Melville Shavelson</td><td>Jack Rose</td></tr>
</table>`;

test('una tabla con columnas gemelas de comedia y musical se lee entera', () => {
  const rows = parseWinnersTables(TABLA_COLUMNAS_GEMELAS);
  assert.deepEqual(rows.map((r) => [r.year, r.title, r.director]), [
    [1959, 'Some Like It Hot', 'Billy Wilder'],
    [1959, 'Porgy and Bess', 'Otto Preminger'],
    [1959, 'But Not for Me', 'Walter Lang'],
    [1959, 'The Five Pennies', 'Melville Shavelson'],
  ]);
});

// Boston 2008 mete su empate en UNA celda partida por <br>. Pero un <br> en la
// celda de dirección con UN solo título es una codirección (la Palma de 1956):
// ahí no se parte nada, o se perdía el segundo nombre.
test('un empate en una sola celda se desdobla; una codirección no', () => {
  const EMPATE = `
<table class="wikitable">
<tr><th>Year</th><th>Winner</th><th>Director(s)</th></tr>
<tr><td>2008</td><td><i><b>Slumdog Millionaire</b></i><br /><i><b>WALL-E</b></i></td><td>Danny Boyle<br />Andrew Stanton</td></tr>
</table>`;
  assert.deepEqual(parseWinnersTables(EMPATE).map((r) => [r.title, r.director]), [
    ['Slumdog Millionaire', 'Danny Boyle'],
    ['WALL-E', 'Andrew Stanton'],
  ]);
  const CODIRECCION = `
<table class="wikitable">
<tr><th>Year</th><th>English title</th><th>Original title</th><th>Director</th></tr>
<tr><td>1956</td><td><i>The Silent World</i></td><td><i>Le monde du silence</i></td><td>Jacques Cousteau<br />Louis Malle</td></tr>
</table>`;
  assert.deepEqual(parseWinnersTables(CODIRECCION).map((r) => [r.title, r.director]), [
    ['The Silent World', 'Jacques Cousteau, Louis Malle'],
  ]);
  assert.equal(partePorSalto('<td>sin saltos</td>'), null);
});

// Los críticos de Los Ángeles premiaron en 2020 a «Small Axe», que es una
// antología de la BBC. Buscarla en TMDB es gastar búsquedas para acabar en el
// mismo sitio, y encima contarlo como emparejado fallido.
test('lo que ganó un premio de cine y no es cine se marca como serie', () => {
  assert.ok(esSerieConocida('Small Axe', 2020));
  assert.equal(esSerieConocida('Small Axe', 2019), false);
  assert.equal(esSerieConocida('Nomadland', 2020), false);
  const LAFCA = `
<table class="wikitable">
<tr><th>Year</th><th>Film</th><th>Director</th></tr>
<tr><td>2020</td><td><i><b>Small Axe</b></i></td><td>Steve McQueen</td></tr>
</table>`;
  assert.equal(parseWinnersTables(LAFCA)[0].tv, true);
});

// Wikipedia acredita «Thomas McCarthy» y «Rick Kaplan»; TMDB, «Tom» y
// «Richard». Sin la lista, la verificación de dirección tumbaba el emparejado
// de Spotlight y de The Eleanor Roosevelt Story.
test('la dirección casa aunque una fuente use el diminutivo', () => {
  assert.ok(mismoDiminutivo('tom', 'thomas'));
  assert.ok(mismoDiminutivo('thomas', 'tom'));
  assert.ok(mismoDiminutivo('rick', 'richard'));
  // dos diminutivos del mismo nombre NO se dan por iguales
  assert.equal(mismoDiminutivo('rick', 'dick'), false);
  assert.equal(mismoDiminutivo('tom', 'timothy'), false);
  assert.ok(directorsMatch('Thomas McCarthy', ['Tom McCarthy']));
  assert.ok(directorsMatch('Rick Kaplan', ['Richard Kaplan']));
  // y sigue rechazando a otra persona con el mismo apellido
  assert.equal(directorsMatch('Thomas McCarthy', ['Anna McCarthy']), false);
});

// «Lo mejor del año» corta por un año TODO lo que tenga palmarés. Los cánones
// fijos no van por años y las secciones sin premio utilizable no tienen
// ganadora que dar: ni unos ni otras deben aparecer.
test('el corte por año coge todo lo que tiene palmarés y nada más', () => {
  const claves = anuarioKeys();
  for (const k of ['cannes', 'oscar', 'cahiers', 'sundance', 'criticschoice', 'globosdrama', 'mardelplata']) {
    assert.ok(claves.includes(k), `falta ${k}`);
  }
  for (const k of ['sightsound', 'mil1', 'busan', 'horizontes', 'quinzaine', 'orizzonti', 'perspectives', 'ssnuevos']) {
    assert.equal(claves.includes(k), false, `sobra ${k}`);
  }
  // el César es el único que va por año de GALA: su fila 2026 es el cine de 2025
  assert.equal(REGISTRY.cesar.anuarioOffset, 1);
  for (const k of claves) {
    if (k !== 'cesar') assert.ok(!REGISTRY[k].anuarioOffset, `${k} no debería llevar desfase`);
  }
});

// ...y la contrapartida: una nominada TITULADA con cuatro cifras sigue siendo
// una película, porque su celda va en cursiva y enlazada.
const TABLA_TITULO_QUE_ES_UN_AÑO = `
<table class="wikitable">
<tr><th>Year</th><th>English title</th><th>Original title</th><th>Director(s)</th></tr>
<tr><td rowspan="2">2019</td><td style="background:#faeb86"><i><b>Parasite</b></i></td><td style="background:#faeb86"><i>기생충</i></td><td style="background:#faeb86">Bong Joon-ho</td></tr>
<tr><td><i><a href="/wiki/1917_(2019_film)">1917</a></i></td><td><i>1917</i></td><td>Sam Mendes</td></tr>
</table>`;

test('una nominada que se llama «1917» no se convierte en un año', () => {
  const todas = parseWinnersTables(TABLA_TITULO_QUE_ES_UN_AÑO, { keepAll: true });
  assert.deepEqual(todas.map((r) => [r.year, r.title, r.winner]), [
    [2019, 'Parasite', true],
    [2019, '1917', false],
  ]);
});

// El David di Donatello es el único que no publica dirección: lista
// productores. Sin `sinDirector` su tabla entera se descartaba.
const TABLA_SIN_DIRECTOR = `
<table class="wikitable">
<tr><th>Year</th><th>Film</th><th>Producer(s)</th></tr>
<tr><td rowspan="3">2020 (66th)</td></tr>
<tr><td style="background:#DDBF5F"><i><b>Hidden Away</b></i></td><td style="background:#DDBF5F">Carlo Degli Esposti</td></tr>
<tr style="background:#eee;"><td><i>Hammamet</i></td><td>Agostino Saccà</td></tr>
</table>`;

test('un premio sin columna de dirección solo se lee si su entrada lo pide', () => {
  assert.deepEqual(parseWinnersTables(TABLA_SIN_DIRECTOR), []);
  const todas = parseWinnersTables(TABLA_SIN_DIRECTOR, { keepAll: true, sinDirector: true });
  assert.deepEqual(todas.map((r) => [r.year, r.title, r.winner]), [
    [2020, 'Hidden Away', true],
    [2020, 'Hammamet', false],
  ]);
  assert.ok(todas.every((r) => r.director === null));
  assert.ok(REGISTRY.donatello.awardSinDirector, 'el Donatello es quien lo pide');
});

// Los premios de la crítica cuelgan símbolos del título para remitir a su
// leyenda («‡ = ganó también el Óscar»). Pegados, no casan con nada en TMDB.
test('cleanTableTitle quita los símbolos de leyenda, pero no el asterisco de M*A*S*H', () => {
  assert.equal(cleanTableTitle('Nomadland ‡'), 'Nomadland');
  assert.equal(cleanTableTitle('One Battle After Another≈'), 'One Battle After Another');
  assert.equal(cleanTableTitle('The Zone of Interest±'), 'The Zone of Interest');
  assert.equal(cleanTableTitle('M*A*S*H'), 'M*A*S*H');
});

// Los trece premios nuevos: cada uno tiene artículo y sección de Wikipedia, y
// ninguno promete una vista por año que su fuente no sepa servir.
test('los premios de la crítica y los nacionales nuevos están completos', () => {
  const CRITICA = ['nbr', 'nyfcc', 'lafca', 'chicago', 'boston', 'criticschoice'];
  for (const key of CRITICA) assert.equal(REGISTRY[key].group, 'critica', key);
  const NUEVOS = [
    ...CRITICA, 'globosdrama', 'globoscomedia', 'donatello', 'guldbagge', 'lola', 'tiffpublico', 'mardelplata',
  ];
  for (const key of NUEVOS) {
    const f = REGISTRY[key];
    assert.ok(f, key);
    assert.ok(f.awardPage && f.awardSection, `${key} sin artículo de palmarés`);
    assert.ok(!f.article, `${key} no tiene ediciones que listar`);
    // o palmarés solo, o palmarés + nominadas por año: nunca las dos banderas
    assert.equal(!!f.onlyWinners, !f.awardNominees, `${key} con las dos vistas a la vez`);
    assert.ok(f.sinceYear >= 1932 && f.sinceYear <= new Date().getFullYear(), `${key} sinceYear=${f.sinceYear}`);
  }
  // los que sí son festivales van con los festivales, no con los premios
  assert.equal(REGISTRY.tiffpublico.group, undefined);
  assert.equal(REGISTRY.mardelplata.group, undefined);
});

// El artículo de Cahiers: una tabla por década, años como filas-cabecera,
// rowspan en empates y países, colspan cuando el título original coincide, y
// al final la lista «de la década» («2010s (2010–2019)») que NO es un año.
const TABLA_CAHIERS = `
<table class="wikitable">
<tr><th>#</th><th>English Title</th><th>Original Title</th><th>Director(s)</th><th>Production Country</th></tr>
<tr><th colspan="5">2010<sup>[1]</sup></th></tr>
<tr><th>1.</th><td><i>Uncle Boonmee</i></td><td>ลุงบุญมี</td><td>Apichatpong Weerasethakul</td><td rowspan="2">Thailand</td></tr>
<tr><th>2.</th><td colspan="2"><i>The Social Network</i></td><td>David Fincher</td></tr>
<tr><th colspan="5">2011<sup>[2]</sup></th></tr>
<tr><th>1.</th><td><i>We Have a Pope</i></td><td><i>Habemus Papam</i></td><td>Nanni Moretti</td><td>Italy</td></tr>
<tr><th rowspan="2">2.</th><td colspan="2"><i>The Tree of Life</i></td><td>Terrence Malick</td><td>United States</td></tr>
<tr><td><i>Outside Satan</i></td><td><i>Hors Satan</i></td><td>Bruno Dumont</td><td>France</td></tr>
<tr><th colspan="5">No list for 2012</th></tr>
<tr><th colspan="5">2010s (2010–2019)</th></tr>
<tr><th>1.</th><td colspan="2"><i>Twin Peaks: The Return</i></td><td>David Lynch</td><td>United States</td></tr>
</table>`;

test('parseCahiersTables: años, empates por rowspan, colspan de título y país arrastrado', () => {
  const rows = parseCahiersTables(TABLA_CAHIERS);
  assert.deepEqual(
    rows.map((r) => [r.year, r.rank, r.tied, r.title, r.original_title, r.director, r.country]),
    [
      [2010, 1, false, 'Uncle Boonmee', 'ลุงบุญมี', 'Apichatpong Weerasethakul', 'Thailand'],
      // sin celda de título original (colspan) y con el país heredado por rowspan
      [2010, 2, false, 'The Social Network', 'The Social Network', 'David Fincher', 'Thailand'],
      [2011, 1, false, 'We Have a Pope', 'Habemus Papam', 'Nanni Moretti', 'Italy'],
      // empate: el rowspan del puesto abraza dos películas
      [2011, 2, true, 'The Tree of Life', 'The Tree of Life', 'Terrence Malick', 'United States'],
      [2011, 2, true, 'Outside Satan', 'Hors Satan', 'Bruno Dumont', 'France'],
      // la lista «de la década» y el hueco de 2012 no cuelan como años
    ]
  );
});

test('la entrada de Cahiers del REGISTRY va por año con etiqueta propia', () => {
  assert.equal(REGISTRY.cahiers.group, 'canon');
  assert.ok(REGISTRY.cahiers.awardNominees);
  assert.equal(REGISTRY.cahiers.awardParse, 'cahiers');
  assert.equal(REGISTRY.cahiers.sinceYear, 1951);
  assert.equal(REGISTRY.cahiers.editionLabel, 'Top 10 por año');
});

// una celda con varios nombres se parte en personas seguibles por separado;
// con apellido compartido, el nombre suelto lo hereda del último completo
test('splitDirectors parte celdas multi-nombre y completa apellidos compartidos', () => {
  assert.deepEqual(splitDirectors('Javier Calvo and Javier Ambrossi'), ['Javier Calvo', 'Javier Ambrossi']);
  assert.deepEqual(splitDirectors('Joel and Ethan Coen'), ['Joel Coen', 'Ethan Coen']);
  assert.deepEqual(splitDirectors('Jean-Marie Straub, Danièle Huillet'), ['Jean-Marie Straub', 'Danièle Huillet']);
  assert.deepEqual(splitDirectors('Anton Balekdjian, Léo Couture and Mattéo Eustachon'),
    ['Anton Balekdjian', 'Léo Couture', 'Mattéo Eustachon']);
  assert.deepEqual(splitDirectors('Hirokazu Kore-eda'), ['Hirokazu Kore-eda']);
  assert.deepEqual(splitDirectors(null), []);
});

test('stripTags limpia notas, estilos y entidades', () => {
  assert.equal(stripTags('<i><a href="#">Título</a></i><sup>[2]</sup>'), 'Título');
  assert.equal(stripTags('A&amp;B &quot;C&quot;'), 'A&B "C"');
});

// --- la decisión del emparejado, sin salir a internet -------------------------
// Cuatro rondas de fallos de producción vivían aquí (las versiones v2…v6 de la
// caché) y ninguna tenía prueba porque hacía falta red. Con elegirCandidato
// separada del código de red, cada regresión conocida queda fijada.

const dirsFijos = (mapa) => async (id) => (id in mapa ? mapa[id] : []);
const SIN_LIB = new Set();

test('un título genérico no engancha a otra película: manda el director', async () => {
  const row = { title: 'Bunker', director: 'Florian Zeller' };
  const cands = [
    { id: 1, title: 'Bunker', original_title: 'Bunker', date: '2026-03-01' },
    { id: 2, title: 'Bunker', original_title: 'Bunker', date: '2026-08-01' },
  ];
  const { tmdbId } = await elegirCandidato(row, 2026, cands, SIN_LIB, dirsFijos({
    1: ['Otra Persona'], 2: ['Florian Zeller'],
  }));
  assert.equal(tmdbId, 2);
});

test('sin ningún director que case, mejor sin ficha que con la equivocada', async () => {
  const row = { title: 'Bunker', director: 'Florian Zeller' };
  const cands = [{ id: 1, title: 'Bunker', original_title: 'Bunker', date: '2026-03-01' }];
  const { tmdbId } = await elegirCandidato(row, 2026, cands, SIN_LIB, dirsFijos({ 1: ['Otra Persona'] }));
  assert.equal(tmdbId, null);
});

// «@ In the Mood for Love» (making-of, 2001) normaliza al mismo título que el
// largometraje (2000) y lo dirige el mismo Wong Kar Wai: solo el año los separa
test('a igualdad de director gana el título clavado y el año exacto', async () => {
  const row = { title: 'In the Mood for Love', director: 'Wong Kar Wai' };
  const cands = [
    { id: 10, title: '@ In the Mood for Love', original_title: '@ In the Mood for Love', date: '2001-01-01' },
    { id: 11, title: 'In the Mood for Love', original_title: 'Fa yeung nin wa', date: '2000-09-29' },
  ];
  const { tmdbId } = await elegirCandidato(row, 2000, cands, SIN_LIB, dirsFijos({
    10: ['Wong Kar-wai'], 11: ['Wong Kar-wai'],
  }));
  assert.equal(tmdbId, 11);
});

// Fanny y Alexander existe como película y como serie de TV, ambas de Bergman
test('entre dos verificados legítimos, gana el que ya tienes en Plex', async () => {
  const row = { title: 'Fanny and Alexander', director: 'Ingmar Bergman' };
  const cands = [
    { id: 20, title: 'Fanny and Alexander', original_title: 'Fanny och Alexander', date: '1982-12-17' },
    { id: 21, title: 'Fanny and Alexander', original_title: 'Fanny och Alexander', date: '1982-12-17' },
  ];
  const { tmdbId } = await elegirCandidato(row, 1982, cands, new Set([21]), dirsFijos({
    20: ['Ingmar Bergman'], 21: ['Ingmar Bergman'],
  }));
  assert.equal(tmdbId, 21);
});

// una «Undercover» ajena y sin créditos se colaba por delante de la de Arantxa
// Echevarría solo por el orden en que TMDB devolvía la búsqueda
test('las fichas sin equipo son el último recurso, nunca antes que una verificada', async () => {
  const row = { title: 'Undercover', director: 'Arantxa Echevarría' };
  const cands = [
    { id: 30, title: 'Undercover', original_title: 'Undercover', date: '2024-01-01' },   // sin créditos
    { id: 31, title: 'Undercover', original_title: 'La infiltrada', date: '2024-09-01' },
  ];
  const { tmdbId } = await elegirCandidato(row, 2024, cands, SIN_LIB, dirsFijos({
    30: [], 31: ['Arantxa Echevarría'],
  }));
  assert.equal(tmdbId, 31);
});

test('sin nadie que lo demuestre, una ficha sin equipo vale si el título es clavado', async () => {
  const row = { title: 'Sheep in the Box', director: 'Hirokazu Kore-eda' };
  const cands = [{ id: 40, title: 'Sheep in the Box', original_title: 'Sheep in the Box', date: null }];
  const { tmdbId } = await elegirCandidato(row, 2026, cands, SIN_LIB, dirsFijos({ 40: [] }));
  assert.equal(tmdbId, 40);
});

// un 429 a mitad de comprobación dejaba ganar al siguiente de la fila, y encima
// se cacheaba como bueno
test('un fallo de red aborta la resolución: nadie gana por incomparecencia', async () => {
  const row = { title: 'Alguna', director: 'Quien Sea' };
  const cands = [
    { id: 50, title: 'Alguna', original_title: 'Alguna', date: '2020-01-01' },
    { id: 51, title: 'Alguna', original_title: 'Alguna', date: '2020-06-01' },
  ];
  const { tmdbId, fallosRed } = await elegirCandidato(row, 2020, cands, SIN_LIB, async (id) =>
    (id === 50 ? null : ['Quien Sea'])
  );
  assert.equal(tmdbId, null, 'no puede elegir al segundo cuando el primero se cayó');
  assert.equal(fallosRed, true, 'y hay que marcarlo para no cachear la página');
});

test('un año roto no deja fuera a todos los candidatos con fecha', async () => {
  const row = { title: 'Algo', director: 'Alguien' };
  const cands = [{ id: 60, title: 'Algo', original_title: 'Algo', date: '1999-01-01' }];
  const { tmdbId } = await elegirCandidato(row, NaN, cands, SIN_LIB, dirsFijos({ 60: ['Alguien'] }));
  assert.equal(tmdbId, 60);
});

/**
 * LA FILA CORTA: ¿le falta el título original o le falta el país?
 *
 * Por número de celdas no se distingue, y suponer siempre lo primero corría las
 * columnas y metía el TÍTULO ORIGINAL en el campo del director. Con eso ninguna
 * verificación de dirección podía salir bien, así que se quedaron sin cartel
 * «What Max Said» (Berlinale), «Red Desert» y «Last Year at Marienbad»
 * (Venecia), «The Tree of Wooden Clogs» (Cannes) y «The Railroad Man» (San
 * Sebastián). Lo decide la CURSIVA: los títulos van en <i> y las personas no.
 */
const CABECERAS = ['english title', 'original title', 'director(s)', 'production country'];

test('fila corta: sin título original (Cannes 2025) se recoloca', () => {
  // «Alpha» de Julia Ducournau: el original coincide con el inglés y Wikipedia
  // omite esa celda, así que la segunda celda es una PERSONA, sin cursiva
  const raw = ['<td><i>Alpha</i> (QP)</td>', '<td><a>Julia Ducournau</a></td>', '<td>France, Belgium</td>'];
  assert.equal(faltaElTituloOriginal(raw, CABECERAS, 1), true);
});

test('fila corta: sin país (palmarés con rowspan) NO se recoloca', () => {
  // «What Max Said»: el país lo absorbió el rowspan de la fila de arriba, así
  // que la segunda celda es el TÍTULO ORIGINAL y va en cursiva
  const raw = ['<td><i>What Max Said</i></td>', '<td><i>Las palabras de Max</i></td>', '<td><a>Emilio Martínez-Lázaro</a></td>'];
  assert.equal(faltaElTituloOriginal(raw, CABECERAS, 1), false);
});

test('fila completa: no se recoloca nada', () => {
  const raw = ['<td><i>A</i></td>', '<td><i>B</i></td>', '<td>C</td>', '<td>D</td>'];
  assert.equal(faltaElTituloOriginal(raw, CABECERAS, 1), false);
});

test('un director acreditado en su alfabeto NO casa con cualquiera', () => {
  // `normName` borra todo lo que no sea a-z0-9, así que un nombre en japonés o
  // en cirílico quedaba en cadena VACÍA — y `incluye('')` es siempre cierto:
  // cualquier película dirigida por alguien acreditado en su alfabeto casaba
  // con cualquier fila de Wikipedia y podía colar la ficha de otra.
  assert.equal(directorsMatch('Michelangelo Antonioni', ['藤田敏八']), false);
  assert.equal(directorsMatch('Claire Denis', ['Андрей Тарковский']), false);
  // y el caso legítimo sigue funcionando por la transcripción de TMDB
  assert.ok(directorsMatch('Wang Bing', ['Wáng Bīng']));
});

// Los otros flecos de la auditoría de la 1.10, fijados aquí porque viven en el
// parser y en la comparación de nombres.
test('stripTags decodifica entidades numéricas y los marcadores en lista de {{ill}}', () => {
  // «Veni Vidi Vici» (Sundance 2024) llegaba con espacios finos &#8202; que no
  // casaban con nada, y con el marcador de idiomas [de; fr] de {{ill}} pegado
  assert.equal(stripTags('Veni&#8202;Vidi&#8202;Vici'), 'Veni Vidi Vici');
  assert.equal(stripTags('Fulano Menganez [de; fr]'), 'Fulano Menganez');
  assert.equal(stripTags('Fulana [wd]'), 'Fulana');
  assert.equal(stripTags('&#x48;ola'), 'Hola');
  // una entidad rota no tumba el parseo
  assert.equal(stripTags('a&#99999999;b'), 'ab');
});

test('directorsMatch pliega los dígrafos de transliteración francesa', () => {
  // «Ballad of a Soldier» fallaba en el palmarés de BAFTA por esto
  assert.ok(directorsMatch('Grigori Chukhrai', ['Grigoriy Tchoukhrai']));
  assert.ok(directorsMatch('Grigory Tchoukhrai', ['Grigoriy Chukhray']));
  // y el plegado no acerca apellidos distintos
  assert.equal(directorsMatch('Grigori Chukhrai', ['Grigori Chereau']), false);
});

// Orizzonti 2026 mete cortos y largos en la MISMA tabla, separados por
// filas-cabecera internas: los bloques de cortos se saltan enteros.
test('parseSelectionTable salta los bloques de cortometrajes', () => {
  const tabla = `
<table class="wikitable">
<tr><th>English Title</th><th>Original Title</th><th>Director(s)</th><th>Production Country</th></tr>
<tr><td colspan="4">In Competition</td></tr>
<tr><td><i>Largo Uno</i></td><td><i>Largo Uno</i></td><td>Directora Una</td><td>Italy</td></tr>
<tr><td colspan="4">Short Films Competition</td></tr>
<tr><td><i>Corto Uno</i></td><td><i>Corto Uno</i></td><td>Director Corto</td><td>France</td></tr>
<tr><td colspan="4">Short Films — Out of Competition</td></tr>
<tr><td><i>Corto Dos</i></td><td><i>Corto Dos</i></td><td>Directora Corta</td><td>Spain</td></tr>
</table>`;
  const rows = parseSelectionTable(tabla);
  assert.deepEqual(rows.map((r) => r.title), ['Largo Uno']);
  // y si tras los cortos vuelve un bloque de largos, se retoma
  const conVuelta = tabla.replace(
    '</table>',
    '<tr><td colspan="4">Feature Films — Out of Competition</td></tr>' +
      '<tr><td><i>Largo Dos</i></td><td><i>Largo Dos</i></td><td>Director Dos</td><td>Japan</td></tr></table>'
  );
  assert.deepEqual(parseSelectionTable(conVuelta).map((r) => r.title), ['Largo Uno', 'Largo Dos']);
});

// Los fallos del palmarés de Sundance que Ramón vio en producción (Beta 1.10):
// tres formas de «Título (algo)» y un «by» traicionero, todos del artículo real.
test('parseSundanceWinners: nombres con partícula, iniciales y colectivos salen del título', () => {
  const html = `
<h3>2026</h3><ul><li>U.S. Grand Jury Prize: Dramatic – Josephine (Beth de Araújo)</li></ul>
<h3>2024</h3><ul><li>U.S. Grand Jury Prize: Dramatic – Sujo (Astrid Rondero and Fernanda Valadez)</li></ul>
<h3>2023</h3><ul><li>U.S. Grand Jury Prize: Dramatic – A Thousand and One (A.V. Rockwell)</li></ul>`;
  const rows = parseSundanceWinners(html, { ambito: 'us' });
  assert.deepEqual(
    rows.map((r) => [r.title, r.director]),
    [
      ['Josephine', 'Beth de Araújo'],
      ['Sujo', 'Astrid Rondero and Fernanda Valadez'],
      ['A Thousand and One', 'A.V. Rockwell'],
    ]
  );
});

test('parseSundanceWinners: el título original va a su campo y el empate se parte en dos', () => {
  const html = `
<h3>2009</h3><ul><li>World Cinema Jury Prize Dramatic – The Maid (La Nana)</li></ul>
<h3>2000</h3><ul><li>Grand Jury Prize: Dramatic – Girlfight &amp; You Can Count on Me (tie)</li></ul>`;
  const world = parseSundanceWinners(html, { ambito: 'world' });
  assert.deepEqual(world.filter((r) => r.year === 2009).map((r) => [r.title, r.original_title, r.director]),
    [['The Maid', 'La Nana', null]]);
  const us = parseSundanceWinners(html, { ambito: 'us' });
  assert.deepEqual(us.filter((r) => r.year === 2000).map((r) => r.title).sort(),
    ['Girlfight', 'You Can Count on Me']);
});

test('parseSundanceWinners: un «by» que es parte del título no fabrica directora', () => {
  const html = `<h3>2009</h3><ul><li>Grand Jury Prize: Dramatic – Precious: Based on the Novel "Push" by Sapphire</li></ul>`;
  const [fila] = parseSundanceWinners(html, { ambito: 'us' });
  assert.equal(fila.director, null); // Sapphire es la novelista, no la directora
  assert.ok(/Precious/.test(fila.title));
  // y un «by Fulano Mengano» de verdad sí parte
  const html2 = `<h3>2021</h3><ul><li>U.S. Grand Jury Prize: Dramatic Competition – CODA by Sian Heder</li></ul>`;
  assert.deepEqual(parseSundanceWinners(html2, { ambito: 'us' })[0].director, 'Sian Heder');
});

// El dataset del Óscar se completó el 2026-08-09 contra las 98 ceremonias de
// Wikipedia (a Wikidata le faltaban 21 nominadas, Forrest Gump incluida).
// Estas cifras fijan esa completitud: si una regeneración vuelve a perderlas,
// que lo diga un test y no la página.
test('el dataset del Óscar está completo: 98 ganadoras y 10 nominadas recientes', async () => {
  const { OSCAR_BEST_PICTURE } = await import('../src/data/oscar-best-picture.js');
  assert.equal(OSCAR_BEST_PICTURE.filter((r) => r.winner).length, 98);
  for (const y of [2022, 2023, 2024, 2025]) {
    assert.equal(OSCAR_BEST_PICTURE.filter((r) => r.year === y).length, 10, `año ${y}`);
  }
  const gump = OSCAR_BEST_PICTURE.find((r) => r.title === 'Forrest Gump');
  assert.ok(gump?.winner, 'Forrest Gump ganadora');
  assert.equal(OSCAR_BEST_PICTURE.find((r) => r.title === 'My Left Foot')?.year, 1989);
});

// Los hallazgos del revisor adversarial de la misma sesión, fijados:
test('el «U. S.» con espacio de 2013 no borra a Fruitvale Station', () => {
  const html = `<h3>2013</h3><ul><li>U. S. Grand Jury Prize: Dramatic – Fruitvale (retitled Fruitvale Station), directed by Ryan Coogler</li></ul>`;
  const [fila] = parseSundanceWinners(html, { ambito: 'us' });
  assert.ok(fila, 'el año 2013 desaparecía entero');
  assert.equal(fila.year, 2013);
  assert.equal(fila.director, 'Ryan Coogler');
});

test('un empate en DOS líneas conserva a las dos ganadoras', () => {
  const html = `<h3>1993</h3><ul>
<li>Grand Jury Prize Dramatic – Ruby in Paradise, directed by Victor Nunez</li>
<li>Grand Jury Prize Dramatic – Public Access, directed by Bryan Singer</li>
</ul>`;
  const filas = parseSundanceWinners(html, { ambito: 'us' });
  assert.deepEqual(filas.map((f) => f.title).sort(), ['Public Access', 'Ruby in Paradise']);
});

test('un título original que repite palabras del título no se vuelve director', () => {
  const html = `<h3>2008</h3><ul><li>World Cinema Jury Prize Dramatic – King of Ping Pong (Ping Pongkingen)</li></ul>`;
  const [fila] = parseSundanceWinners(html, { ambito: 'world' });
  assert.equal(fila.director, null);
  assert.equal(fila.title, 'King of Ping Pong');
  assert.equal(fila.original_title, 'Ping Pongkingen');
});

test('el plegado de dígrafos no iguala dos apellidos que pliegan LOS DOS', () => {
  // Boucher (ou) y Butcher (tch) convergen en «bucher» y son personas distintas
  assert.equal(directorsMatch('Marie Boucher', ['Marie Butcher']), false);
  // y los tokens cortos tampoco: Lou Ye y Lu Ye no son la misma persona por esto
  assert.equal(directorsMatch('Lou Ye', ['Lu Yeo']), false);
  // pero la grafía extranjera de UN lado sigue plegando (BAFTA, Ballad of a Soldier)
  assert.ok(directorsMatch('Grigori Chukhrai', ['Grigoriy Tchoukhrai']));
  assert.ok(directorsMatch('Grigory Tchoukhrai', ['Grigoriy Chukhray']));
});

test('en bloque de cortos, una subcabecera de país no reabre el grifo', () => {
  const tabla = `
<table class="wikitable">
<tr><th>English Title</th><th>Original Title</th><th>Director(s)</th><th>Production Country</th></tr>
<tr><td><i>Largo Uno</i></td><td><i>Largo Uno</i></td><td>Directora Una</td><td>Italy</td></tr>
<tr><td colspan="4">Short Films Competition</td></tr>
<tr><td colspan="4">France</td></tr>
<tr><td><i>Corto Francés</i></td><td><i>Corto Francés</i></td><td>Director Corto</td><td>France</td></tr>
</table>`;
  assert.deepEqual(parseSelectionTable(tabla).map((r) => r.title), ['Largo Uno']);
});

test('«Título (retitled Otro)» se queda con el título definitivo', () => {
  const html = `<h3>2013</h3><ul><li>U. S. Grand Jury Prize: Dramatic – Fruitvale (retitled Fruitvale Station)</li></ul>`;
  const [fila] = parseSundanceWinners(html, { ambito: 'us' });
  assert.equal(fila.title, 'Fruitvale Station');
  assert.equal(fila.original_title, 'Fruitvale');
});
