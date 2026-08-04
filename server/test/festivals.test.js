import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGISTRY, parseSelectionTable, parseSundanceWinners, parseWinnersTables, stripTags, directorsMatch, cleanTableTitle,
  parseCahiersTables, splitDirectors,
} from '../src/festivals.js';
import { SIGHT_AND_SOUND_2022 } from '../src/data/sight-and-sound-2022.js';

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
  assert.equal(rows.length, 4); // la fila de relleno cae en la celda de título
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
