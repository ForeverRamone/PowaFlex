/**
 * Secciones oficiales de los grandes festivales, desde Wikipedia.
 *
 * Los seis festivales son los de la «festival pathway» de la Academia (reglas
 * del 99.º Óscar): ganar el premio gordo de uno de ellos clasifica una película
 * no inglesa para el Óscar internacional sin pasar por el comité de su país.
 *
 * La fuente es la Wikipedia inglesa: es la única que cubre los seis con tablas
 * consistentes por edición (título, título original, director/a, país), tiene
 * API estable y licencia sin problemas. Las webs de los festivales cambian de
 * marcado cada año (la de Busan directamente se cae), TMDB aún no expone los
 * premios por API e IMDb bloquea bots. El título de cada artículo se genera
 * por convención («2025 Cannes Film Festival», «82nd Venice International Film
 * Festival»…) con redirects=1 de red de seguridad.
 */
import { db, cacheRead, cacheWrite } from './db.js';
import { mapPool, cedeElHilo } from './pool.js';
import { cachePrefix } from './cache-versions.js';
import { foldName, normName, mismoDiminutivo } from './names.js';
import {
  searchMovieCandidates, movieDirectors, movieCrewNames, movieSummary, findPersonInfo, latinizeNames,
  personCredits, englishTitle, searchPersonCandidates, TMDB_CONCURRENCY,
  setBuildProgress, clearBuildProgress,
} from './tmdb.js';
import { enrichWithScores } from './mdblist.js';
import { watchedIndex, isWatched } from './letterboxd.js';
import { SIGHT_AND_SOUND_2022 } from './data/sight-and-sound-2022.js';
import { MIL_UNA_2021 } from './data/1001-movies-2021.js';
import { OSCAR_BEST_PICTURE } from './data/oscar-best-picture.js';
import { PALMARES } from './data/palmares-2026.js';

const DAY = 24 * 3600 * 1000;

// 82.ª Mostra = 2025, 75.ª Berlinale = 2025, 30.º Busan = 2025
const nth = (n) => {
  const s = ['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4] || 'th';
  return `${n}${s}`;
};

// El mapeo festival → sección es configurable por año a propósito: las
// secciones cambian de nombre con el tiempo (Busan estrenó «Competition» en
// 2025, la Berlinale ha renombrado la suya). `sinceYear` corta con un error
// claro las ediciones donde la sección aún no existía.
// `awardPage`/`awardSection`: dónde vive el palmarés histórico del premio que
// clasifica. Sundance y Busan no tienen artículo de premio utilizable (el de
// Busan nació en 2025); su palmarés queda sin servir, con aviso claro.
export const REGISTRY = {
  cannes: {
    name: 'Cannes',
    award: 'Palma de Oro',
    article: (y) => `${y} Cannes Film Festival`,
    section: /^(in )?competition/i,
    sinceYear: 1946,
    awardPage: "Palme d'Or",
    awardSection: /^winners$/i,
  },
  venecia: {
    name: 'Venecia',
    award: 'León de Oro',
    article: (y) => `${nth(y - 1943)} Venice International Film Festival`,
    section: /^in competition/i,
    sinceYear: 1980, // numeración moderna estable; antes hubo años sin mostra
    awardPage: 'Golden Lion',
    awardSection: /^winners$/i,
  },
  berlinale: {
    name: 'Berlinale',
    award: 'Oso de Oro',
    article: (y) => `${nth(y - 1950)} Berlin International Film Festival`,
    section: /^(main )?competition/i,
    sinceYear: 1951,
    awardPage: 'Golden Bear',
    awardSection: /^winners$/i,
  },
  sundance: {
    name: 'Sundance',
    award: 'World Cinema Grand Jury Prize',
    article: (y) => `${y} Sundance Film Festival`,
    section: /world cinema dramatic competition/i,
    sinceYear: 2005,
    // el palmarés no tiene artículo propio del premio: sale de la lista global
    // de premiados, que va por AÑOS con viñetas en vez de tablas
    awardPage: 'List of Sundance Film Festival award winners',
    awardParse: 'sundanceList',
  },
  // El OTRO premio gordo de Sundance. La entrada `sundance` sigue el World
  // Cinema Dramatic porque es el que clasifica para el Óscar internacional,
  // pero la competición estadounidense es igual de grande —es la que ganó CODA
  // en 2021— y sin ella faltaba media Sundance.
  sundanceus: {
    name: 'Sundance · Competición de EE UU',
    award: 'U.S. Grand Jury Prize: Dramatic',
    article: (y) => `${y} Sundance Film Festival`,
    section: /u\.?s\.? dramatic competition/i,
    sinceYear: 2005,
    awardPage: 'List of Sundance Film Festival award winners',
    awardParse: 'sundanceList',
    sundanceAmbito: 'us',
    // el premio estadounidense es MUY anterior a que Wikipedia tabule la
    // sección por ediciones: Blood Simple lo ganó en 1985. `sinceYear` acota
    // las ediciones (tablas desde 2005); el palmarés llega hasta 1984.
    awardSinceYear: 1984,
  },
  tiff: {
    name: 'Toronto (TIFF)',
    award: 'Platform Prize',
    article: (y) => `${y} Toronto International Film Festival`,
    section: /^platform/i,
    sinceYear: 2015, // la sección Platform nació en 2015
    awardPage: 'Platform Prize',
    awardSection: /^competition$/i,
  },
  // Toronto no tiene jurado en su sección grande: su premio gordo lo vota el
  // PÚBLICO, y es el mejor pronóstico del Óscar que existe (Nomadland, Green
  // Book, La La Land, 12 años de esclavitud, El discurso del rey…). La entrada
  // `tiff` sigue el Platform Prize, que es la competición con jurado; sin esta
  // faltaba justo lo que hace famoso a Toronto. Solo palmarés: la tabla lista
  // la ganadora sombreada con sus dos finalistas por año, desde 1978.
  tiffpublico: {
    name: 'Toronto · Premio del Público',
    award: 'People’s Choice Award de Toronto',
    onlyWinners: true,
    sinceYear: 1978,
    awardPage: "Toronto International Film Festival People's Choice Award",
    awardSection: /^winners$/i,
  },
  busan: {
    name: 'Busan (BIFF)',
    award: 'Busan Award – Best Film',
    article: (y) => `${nth(y - 1995)} Busan International Film Festival`,
    section: /^competition/i,
    sinceYear: 2025, // la sección competitiva se estrenó en el 30.º BIFF
  },
  // San Sebastián no está en la vía Óscar, pero para un cinéfilo español es el
  // festival que más cine acaba llegando a distribución en España. El artículo
  // de la 73.ª edición = 2025 → año − 1952. La sección de jurado «Latin
  // Horizons» de algunos años no lleva la palabra “jury” y no la filtra el
  // /jur/i: no importa, su tabla (nombres, no películas) no pasa el parser y
  // el bucle salta a la sección buena.
  sansebastian: {
    name: 'San Sebastián',
    award: 'Concha de Oro',
    article: (y) => `${nth(y - 1952)} San Sebastián International Film Festival`,
    section: /^in competition/i,
    sinceYear: 1953,
    awardPage: 'Golden Shell',
    awardSection: /^winners$/i,
  },
  // El festival de clase A de América Latina, y la puerta por la que pasa el
  // cine argentino y brasileño antes de llegar a Europa. Wikipedia no tabula
  // sus ediciones, pero sí el palmarés completo del Ástor de Oro desde 1954,
  // con título original y país.
  mardelplata: {
    name: 'Mar del Plata',
    award: 'Ástor de Oro a la mejor película',
    onlyWinners: true,
    sinceYear: 1959, // el primer Ástor de Oro; las ediciones de 1954-58 no lo dieron
    awardPage: 'Mar del Plata International Film Festival',
    awardSection: /^golden [aá]stor winners$/i,
  },
  // Los dos festivales españoles que faltaban, y los dos entran solo por el
  // palmarés: sus ediciones no están tabuladas en Wikipedia (Sitges tiene
  // artículo propio desde la 56.ª y nada más atrás).
  //
  // La Seminci es el caso raro del REGISTRY: su mejor artículo —el único con
  // dirección y país— está en la Wikipedia ESPAÑOLA, y ahí la tabla llega
  // entera de 1956 a 2025. La inglesa se conforma con una viñeta por año desde
  // 1999, sin dirección, y encima avisa de que lista «algunos» ganadores. Las
  // dos primeras ediciones no tuvieron competición y salen sin dirección, así
  // que el propio parser las descarta.
  seminci: {
    name: 'Seminci (Valladolid)',
    award: 'Espiga de Oro a la mejor película',
    onlyWinners: true,
    sinceYear: 1958, // la primera Espiga: en 1956 y 1957 no hubo competición
    awardPage: 'Espiga de Oro',
    awardLang: 'es',
    awardSection: /^palmar[ée]s hist[óo]rico/i,
  },
  // Sitges pone CUATRO premios en columnas de la misma tabla (película,
  // dirección, actor y actriz), así que sus columnas van declaradas: dejar que
  // el parser adivine emparejaría cada ganadora con el director de OTRA
  // película —«The Cremator» firmada por Robert Mulligan— sin que nada
  // chirriara. Al no haber columna de dirección de la ganadora, el emparejado
  // con TMDB exige título clavado, como en el David di Donatello.
  sitges: {
    name: 'Sitges',
    award: 'Sitges a la mejor película',
    onlyWinners: true,
    sinceYear: 1972, // la primera mejor película; 1971 y 1973-82 no la dieron
    awardPage: 'Sitges Film Festival',
    awardSection: /^winners$/i,
    awardSinDirector: true,
    awardColumns: { title: /^best film$/, director: null },
  },
  horizontes: {
    name: 'S.S. · Horizontes Latinos',
    award: 'Premio Horizontes',
    article: (y) => `${nth(y - 1952)} San Sebastián International Film Festival`,
    section: /latin horizons|horizontes latinos/i,
    sinceYear: 2002, // la sección nació en 2002
  },
  // --- LAS SECCIONES DE DEBUT -------------------------------------------------
  //
  // Aquí es donde aparecen los grandes ANTES de serlo. La competición principal
  // de Cannes o Venecia la pisa quien ya llegó; el primer largo de quien va a
  // llegar se estrena en la Semana de la Crítica, en la Quincena, en Orizzonti,
  // en Perspectives o en Nuevos Directores. Sin estas cinco, un detector de
  // emergentes mira justo el sitio donde los emergentes todavía no están.
  //
  // Tres tienen palmarés con artículo utilizable en Wikipedia: Un Certain
  // Regard (su premio, desde 1998), la Semana de la Crítica (el Gran Premio) y
  // la Cámara de Oro (mejor ópera prima de TODO Cannes, con entrada propia).
  // El resto solo ofrece «sección oficial por año», como Busan y Horizontes.
  //
  // OJO con `sinceYear`: NO es el año de fundación de la sección sino aquel
  // desde el que el artículo INGLÉS de cada edición la tabula. La Semaine
  // existe desde 1962 y la Quinzaine desde 1969, pero sus tablas no están en
  // los artículos viejos, y prometer ediciones que solo saben devolver «no se
  // encontró la sección» es peor que no ofrecerlas.
  // Un Certain Regard NO es una sección paralela: es la SEGUNDA competición
  // oficial de Cannes, y es donde más nombres nuevos con recorrido aparecen —
  // por delante de la Semana de la Crítica y de la Quincena. Va en este grupo
  // porque para lo que aquí interesa (dónde asoma quien todavía no es nadie)
  // hace exactamente ese papel, aunque también seleccione a consagrados.
  uncertainregard: {
    name: 'Cannes · Un Certain Regard',
    award: 'Un Certain Regard: la segunda competición oficial de Cannes',
    group: 'debut',
    article: (y) => `${y} Cannes Film Festival`,
    section: /^un certain regard$/i,
    sinceYear: 2010,
    // el premio existe desde 1998 y su artículo lista las ganadoras por década
    awardPage: 'Un Certain Regard',
    awardSection: /^winners$/i,
  },
  semaine: {
    name: 'Cannes · Semana de la Crítica',
    award: 'Semaine de la critique: primeras y segundas películas',
    group: 'debut',
    article: (y) => `${y} Cannes Film Festival`,
    section: /critics.? week/i,
    sinceYear: 2010,
    // el Gran Premio de la Semana tiene su lista en el artículo de la sección
    awardPage: "Critics' Week",
    awardSection: /^grand prize winners$/i,
  },
  // La Cámara de Oro premia la mejor ÓPERA PRIMA de todo Cannes (sección
  // oficial, Semana y Quincena a la vez): no es el palmarés de ninguna sección
  // concreta, así que va como entrada propia de solo-palmarés — el radar de
  // debuts por excelencia, con historia desde 1978.
  camaradeoro: {
    name: 'Cannes · Cámara de Oro',
    award: "Caméra d'Or: la mejor ópera prima de todo Cannes (oficial, Semana y Quincena)",
    group: 'debut',
    onlyWinners: true,
    awardPage: "Caméra d'Or",
    awardSection: /^winners$/i,
  },
  quinzaine: {
    name: 'Cannes · Quincena',
    award: 'Quinzaine des cinéastes (Directors’ Fortnight)',
    group: 'debut',
    article: (y) => `${y} Cannes Film Festival`,
    section: /directors.? fortnight|quinzaine/i,
    sinceYear: 2010,
  },
  orizzonti: {
    name: 'Venecia · Orizzonti',
    award: 'Orizzonti: nuevas tendencias del cine mundial',
    group: 'debut',
    // los artículos de 2015 la titulan «Horizons (Orizzonti)» y los de ahora
    // «Orizzonti» a secas
    article: (y) => `${nth(y - 1943)} Venice International Film Festival`,
    section: /orizzonti|^horizons/i,
    sinceYear: 2010,
  },
  // La Berlinale cambió de sección para lo nuevo a mitad de camino: Encounters
  // (2020-2024) y Perspectives (desde 2025, y esta ya es explícitamente de
  // ópera prima). Van bajo la misma entrada porque para lo que aquí interesa
  // —dónde estrena quien empieza— son la misma cosa en dos épocas.
  perspectives: {
    name: 'Berlinale · Perspectives',
    award: 'Perspectives / Encounters: óperas primas y voces nuevas',
    group: 'debut',
    article: (y) => `${nth(y - 1950)} Berlin International Film Festival`,
    section: /^(encounters|perspectives)$/i,
    sinceYear: 2020,
  },
  ssnuevos: {
    name: 'S.S. · Nuevos Directores',
    award: 'Premio Kutxabank-Nuev@s Director@s',
    group: 'debut',
    article: (y) => `${nth(y - 1952)} San Sebastián International Film Festival`,
    section: /new directors/i,
    sinceYear: 2010,
  },

  // No es un festival: es EL canon de la crítica, fijo hasta 2032. Vive aquí
  // porque la vista de palmarés le da gratis todo lo que necesita (tengo/vista,
  // notas, Radarr en bloque, seguir directores/as).
  sightsound: {
    name: 'Sight & Sound 2022',
    award: 'The Greatest Films of All Time (encuesta de la crítica del BFI)',
    group: 'canon',
    onlyWinners: true,
    staticList: SIGHT_AND_SOUND_2022,
    staticSource: 'https://www.bfi.org.uk/sight-and-sound/greatest-films-all-time',
    staticNote: `La lista extendida de la encuesta de la crítica (${SIGHT_AND_SOUND_2022.length} películas, empates incluidos), ordenada por puesto. Se renueva cada década: la próxima, en 2032.`,
  },
  // El canon populista que complementa al de la crítica: el libro de Schneider,
  // en su 15.ª edición (2021), la última con registro bibliográfico — la
  // «edición 2024» que circula por listas no existe como libro. Dataset fijo,
  // como Sight & Sound.
  mil1: {
    name: '1001 películas',
    award: '«1001 Movies You Must See Before You Die» (Steven Jay Schneider, ed.; 15.ª edición, 2021)',
    group: 'canon',
    onlyWinners: true,
    staticList: MIL_UNA_2021,
    staticSource: 'https://en.wikipedia.org/wiki/1001_Movies_You_Must_See_Before_You_Die',
    staticNote:
      'Las 1001 del libro (15.ª edición, 2021), en su orden cronológico. Cuatro bloques que el libro trata como una sola entrada (Toy Story, El Señor de los Anillos, Iván el Terrible y Olympia) aparecen con su primera película.',
  },
  // El otro canon de la crítica: el top 10 que Cahiers du Cinéma publica cada
  // año desde 1951 (con el paréntesis de 1969-1980, cuando la revista dejó de
  // votar listas). Va por año como los premios, pero lo que se enseña es la
  // lista ordenada, no unas nominadas: por eso lleva `editionLabel` propio.
  cahiers: {
    name: 'Cahiers du Cinéma',
    award: 'Top 10 anual de la crítica de Cahiers du Cinéma',
    group: 'canon',
    awardNominees: true,
    editionLabel: 'Top 10 por año',
    sinceYear: 1951,
    awardPage: "Cahiers du Cinéma's Annual Top 10 Lists",
    awardParse: 'cahiers',
  },
  // --- premios anuales, del artículo-lista de cada premio. Sus tablas llevan
  // la ganadora sombreada entre las nominadas: el palmarés es el sombreado, y
  // la vista por año (`awardNominees`) enseña TODAS las candidatas del año con
  // su 🏆 en la ganadora.
  goya: {
    name: 'Premios Goya',
    award: 'Goya a la mejor película',
    group: 'premio',
    awardNominees: true,
    sinceYear: 1986,
    awardPage: 'Goya Award for Best Film',
    awardSection: /^winners and nominees$/i,
    editionArticle: (y) => `${nth(y - 1985)} Goya Awards`,
  },
  // El César es el ÚNICO cuya tabla va por año de GALA y no de película: la
  // fila «2026 (51.ª)» premia el cine francés de 2025, mientras que las del
  // Goya, el BAFTA o el Óscar ya vienen por año de película. Su vista por año
  // se queda como está —quien busca «César 2025» busca la gala de 2025—, pero
  // en «Lo mejor del año», que compara un mismo año entre premios, se lee con
  // el desfase puesto.
  cesar: {
    name: 'Premios César',
    award: 'César a la mejor película',
    group: 'premio',
    awardNominees: true,
    anuarioOffset: 1,
    sinceYear: 1976,
    awardPage: 'César Award for Best Film',
    awardSection: /^winners and nominees$/i,
  },
  bafta: {
    name: 'BAFTA',
    award: 'BAFTA a la mejor película',
    group: 'premio',
    awardNominees: true,
    sinceYear: 1948,
    awardPage: 'BAFTA Award for Best Film',
    awardSection: /^winners and nominees$/i,
    editionArticle: (y) => `${nth(y - 1946)} British Academy Film Awards`,
  },
  efa: {
    name: 'Cine Europeo (EFA)',
    award: 'Premio del Cine Europeo a la mejor película',
    group: 'premio',
    awardNominees: true,
    sinceYear: 1988,
    awardPage: 'European Film Award for Best Film',
    awardSection: /^winners and nominees$/i,
  },
  // El artículo de Wikipedia perdió sus tablas en 2026: este premio viaja como
  // dataset de Wikidata empaquetado, con los TMDB id ya resueltos de origen.
  oscar: {
    name: 'Óscar a la mejor película',
    award: 'Óscar a la mejor película (Best Picture)',
    group: 'premio',
    awardNominees: true,
    sinceYear: 1927,
    staticAward: OSCAR_BEST_PICTURE,
  },
  oscarint: {
    name: 'Óscar internacional',
    award: 'Óscar a la mejor película internacional',
    group: 'premio',
    awardNominees: true,
    sinceYear: 1947,
    awardPage: 'List of Academy Award winners and nominees for Best International Feature Film',
    awardSection: /^winners and nominees$/i,
  },
  globosdrama: {
    name: 'Globos de Oro · Drama',
    award: 'Globo de Oro a la mejor película dramática',
    group: 'premio',
    awardNominees: true,
    sinceYear: 1943, // el año de las PELÍCULAS; la primera gala fue en 1944
    awardPage: 'Golden Globe Award for Best Motion Picture – Drama',
    awardSection: /^winners and nominees$/i,
  },
  // La otra mitad del premio: los Globos parten la mejor película en dos desde
  // 1951. Su artículo titula la sección «Winners and nominations» (el de drama,
  // «Winners and Nominees»), y entre 1958 y 1962 —cuando comedia y musical eran
  // DOS premios distintos— la tabla los pone en columnas gemelas: el parser
  // busca una sola columna de película y esos cinco años (más 1953, sin premio)
  // se quedan sin servir. Se ofrecen igual desde 1951, porque el resto de esa
  // década sí está y un «Wikipedia no tiene nominadas de 1959» dice la verdad.
  globoscomedia: {
    name: 'Globos de Oro · Comedia o musical',
    award: 'Globo de Oro a la mejor película de comedia o musical',
    group: 'premio',
    awardNominees: true,
    sinceYear: 1951,
    awardPage: 'Golden Globe Award for Best Motion Picture – Musical or Comedy',
    awardSection: /^winners and nominations$/i,
  },
  // El David di Donatello es el ÚNICO cuya tabla no lleva columna de dirección:
  // lista productores. Por eso `awardSinDirector`, que a cambio obliga al
  // emparejado a exigir título clavado contra TMDB.
  donatello: {
    name: 'David di Donatello',
    award: 'David di Donatello a la mejor película',
    group: 'premio',
    awardNominees: true,
    awardSinDirector: true,
    sinceYear: 1969,
    awardPage: 'David di Donatello for Best Film',
    awardSection: /^winners and nominees$/i,
  },
  guldbagge: {
    name: 'Guldbagge (Suecia)',
    award: 'Guldbagge a la mejor película',
    group: 'premio',
    awardNominees: true,
    sinceYear: 1963, // el año de las películas: el Guldbagge se falla en enero
    awardPage: 'Guldbagge Award for Best Film',
    awardSection: /^winners and nominees$/i,
    // el artículo-lista se quedó en 2024 con la 61.ª edición ya publicada
    editionArticle: (y) => `${nth(y - 1964)} Guldbagge Awards`,
  },
  // El Lola alemán solo publica ganadoras (oro), sin nominadas: palmarés y ya.
  // El artículo vive en «German Film Award for Best Fiction Film» (el título
  // por el que se le conoce, «Deutscher Filmpreis», redirige ahí).
  lola: {
    name: 'Lola (Alemania)',
    award: 'Deutscher Filmpreis: Lola de Oro a la mejor película',
    group: 'premio',
    onlyWinners: true,
    sinceYear: 1951,
    awardPage: 'German Film Award for Best Fiction Film',
    awardSection: /^list of winning films$/i,
  },

  // --- LOS PREMIOS DE LA CRÍTICA GREMIAL --------------------------------------
  //
  // Las academias nacionales (Goya, César, BAFTA, Óscar) votan por gremios de
  // la industria; estos los votan CRÍTICOS, y se fallan entre diciembre y
  // enero, antes que ninguna academia. Por eso llevan décadas siendo el
  // termómetro de la temporada: la lista de la crítica de Nueva York o de Los
  // Ángeles adelanta lo que van a hacer los premios grandes, y a menudo se
  // desmarca (Boston y Los Ángeles premian cine que el Óscar ni nomina).
  //
  // Cuatro de los seis solo publican ganadora. Chicago y Critics’ Choice sí
  // llevan nominadas, con la ganadora sombreada en la misma tabla.
  nbr: {
    name: 'NBR (crítica de EE UU)',
    award: 'National Board of Review a la mejor película',
    group: 'critica',
    onlyWinners: true,
    sinceYear: 1932,
    awardPage: 'National Board of Review Award for Best Film',
    awardSection: /^winners$/i,
  },
  nyfcc: {
    name: 'Críticos de Nueva York',
    award: 'New York Film Critics Circle a la mejor película',
    group: 'critica',
    onlyWinners: true,
    sinceYear: 1935,
    awardPage: 'New York Film Critics Circle Award for Best Film',
    awardSection: /^winners$/i,
  },
  lafca: {
    name: 'Críticos de Los Ángeles',
    award: 'Los Angeles Film Critics Association a la mejor película',
    group: 'critica',
    onlyWinners: true,
    sinceYear: 1975,
    awardPage: 'Los Angeles Film Critics Association Award for Best Film',
    awardSection: /^winners$/i,
  },
  chicago: {
    name: 'Críticos de Chicago',
    award: 'Chicago Film Critics Association a la mejor película',
    group: 'critica',
    awardNominees: true,
    sinceYear: 1988,
    awardPage: 'Chicago Film Critics Association Award for Best Film',
    awardSection: /^winners$/i,
  },
  boston: {
    name: 'Críticos de Boston',
    award: 'Boston Society of Film Critics a la mejor película',
    group: 'critica',
    onlyWinners: true,
    sinceYear: 1980,
    awardPage: 'Boston Society of Film Critics Award for Best Film',
    awardSection: /^winners$/i,
  },
  criticschoice: {
    name: 'Critics’ Choice',
    award: 'Critics’ Choice Movie Award a la mejor película',
    group: 'critica',
    awardNominees: true,
    sinceYear: 1995,
    awardPage: "Critics' Choice Movie Award for Best Picture",
    awardSection: /^winners and nominees$/i,
    editionArticle: (y) => `${nth(y - 1994)} Critics' Choice Awards`,
  },
};

// Ediciones que se salieron del molde, casi todas por la pandemia: o no hubo
// sección de competición, o la selección se publicó con otro nombre. Mejor una
// explicación exacta que un «no se encontró la sección» que suena a fallo.
const SPECIAL_EDITIONS = {
  'cannes:2020': {
    section: /^official sections/i,
    allTables: true, // la selección simbólica va repartida en varias tablas temáticas
    note:
      'Edición cancelada por la pandemia: no hubo competición ni premios, solo una «Selección Oficial 2020» simbólica. Esta es esa lista.',
  },
  'tiff:2020': {
    unavailable: 'En 2020 la sección Platform no se celebró: el programa quedó reducido por la pandemia.',
  },
};

/**
 * Las entradas que saben decir QUIÉN ganó en un año concreto: las que tienen
 * palmarés, sea artículo de premio, dataset empaquetado o parser propio. Fuera
 * quedan los cánones fijos (Sight & Sound y las 1001 no van por años) y las
 * secciones sin premio utilizable en Wikipedia (Busan, Horizontes y las de
 * debut), que solo saben listar su selección.
 */
export function anuarioKeys() {
  return Object.entries(REGISTRY)
    .filter(([, f]) => !f.staticList && (f.awardPage || f.staticAward))
    .map(([key]) => key);
}

export function festivalsIndex() {
  const claves = anuarioKeys();
  return {
    currentYear: new Date().getFullYear(),
    // para el desplegable de «Lo mejor del año»: hasta dónde llega hacia atrás
    // el más viejo de los palmareses (el Óscar, 1927)
    anuario: {
      count: claves.length,
      sinceYear: Math.min(...claves.map((k) => REGISTRY[k].awardSinceYear ?? REGISTRY[k].sinceYear ?? 9999)),
    },
    festivals: Object.entries(REGISTRY).map(([key, f]) => ({
      key,
      name: f.name,
      award: f.award,
      group: f.group || 'festival',
      sinceYear: f.sinceYear ?? null,
      onlyWinners: !!f.onlyWinners,
      awardNominees: !!f.awardNominees,
      editionLabel: f.editionLabel || null,
    })),
  };
}

// --- Wikipedia ----------------------------------------------------------------

/**
 * La Wikipedia de la que sale cada cosa. Por defecto la INGLESA, que es la
 * única que cubre los seis grandes con tablas consistentes; pero hay premios
 * cuyo mejor artículo (a veces el único con dirección y país) está en otra
 * lengua: la Espiga de Oro de la Seminci se tabula entera —1956-2025, con
 * director y país— en la española, mientras la inglesa se conforma con una
 * viñeta por año desde 1999 y sin dirección. El idioma va en el REGISTRY
 * (`awardLang`) y viaja hasta la clave de caché y el enlace de la fuente.
 */
const wikiUrl = (page, lang = 'en') =>
  `https://${lang}.wikipedia.org/wiki/${String(page).replace(/ /g, '_')}`;

async function wikiParse({ lang = 'en', ...params }) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', action: 'parse', ...params });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${qs}`, {
    headers: { 'User-Agent': 'PowaFlex/0.9 (self-hosted; https://github.com/ForeverRamone/PowaFlex)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Wikipedia respondió ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`Wikipedia: ${j.error.info || j.error.code}`);
  return j.parse;
}

// una entidad numérica rota («&#99999999;») no puede tumbar el parseo entero
const codePoint = (n) => (Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');

export function stripTags(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<sup[\s\S]*?<\/sup>/gi, '') // fuera las notas [1][a]
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;|&#8217;|&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    // el resto de entidades numéricas, decodificadas de verdad: el «Veni Vidi
    // Vici» de Sundance 2024 llegaba con &#8202; (espacio fino) entre palabra
    // y palabra, y como texto literal no casaba con nada. Va DESPUÉS de las
    // específicas de arriba (que normalizan a tipográficas) y antes del
    // colapso de espacios, que pliega los espacios raros decodificados.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => codePoint(Number(n)))
    // Los espacios INVISIBLES, que no son espacios para nadie salvo para el
    // ojo: la plantilla de referencias de la Wikipedia española deja un
    // &#8203; (espacio de ancho cero) pegado detrás de cada celda, así que el
    // año de la Espiga de Oro llegaba como «1971␋» y `\s` no lo toca —en
    // JavaScript U+200B no es espacio—. Con eso la fila dejaba de reconocerse
    // como fila de año y la tabla entera se leía corrida una columna. Se van
    // SOLO los que no significan nada (U+200B, U+2060, U+FEFF): el ZWNJ
    // U+200C y el ZWJ U+200D sí son letra en persa y en las lenguas índicas
    // —«دانه‌ی انجیر معابد», la EFA de 2024, los lleva dentro— y borrarlos
    // cambia el título original.
    .replace(/[\u200b\u2060\ufeff]/g, '')
    // enlaces sin renderizar que se cuelan en algunos artículos (Sundance):
    // «[[Fulano|Fulano]] [wd]» debe quedar en «Fulano»
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    // marcadores tipo [wd] (wikidata) o [ja] (interwiki) junto a los nombres,
    // también en lista («[de; fr]», que es como los deja la plantilla {{ill}})
    .replace(/\[\s*[a-z]{2,3}(?:\s*;\s*[a-z]{2,3})*\s*\]/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*$/, '')
    .trim();
}

/**
 * Los símbolos que las tablas cuelgan del título para remitir a su leyenda:
 * la daga de siempre y los que traen los premios de la crítica —«Nomadland ‡»
 * (también ganó el Óscar) en Critics’ Choice, «One Battle After Another≈» y
 * «The Zone of Interest±» en Los Ángeles—. Pegados al título no casan con
 * ninguna ficha de TMDB. El asterisco NO está: hay títulos que lo llevan
 * dentro («M*A*S*H»).
 */
const MARCA_DE_LEYENDA = /[†‡±≈]/g;

/**
 * Limpia un título de celda de tabla: marcadores de premio («Alpha (QP)»), el
 * «(ex-æquo)» de los empates de BAFTA, dagas, y los paréntesis finales con el
 * título original que las tablas viejas pegan en la misma celda («Ballad of a
 * Soldier (Баллада о солдате, Ballada o soldate)»). Los grupos finales de
 * paréntesis se pelan repetidamente: un título real no termina en paréntesis.
 */
export function cleanTableTitle(s) {
  if (!s) return null;
  const sinMarcas = String(s).replace(MARCA_DE_LEYENDA, '').trim();
  let t = sinMarcas;
  for (let i = 0; i < 3; i++) {
    const pelado = t.replace(/\s*\([^()]*\)$/, '').trim();
    if (pelado === t || !pelado) break;
    t = pelado;
  }
  return t || sinMarcas;
}

/**
 * ¿Es este color el gris de decorar y no la marca de una ganadora?
 *
 * El sombreado del palmarés no es un color fijo —#faeb86 (BAFTA, EFA,
 * Platform), #eedd82 (Goya, César), #b0c4de (Óscar internacional), #ddbf5f
 * (David di Donatello)—, así que la regla siempre ha sido «tiene fondo, luego
 * ganó». Pero algunas tablas pintan las filas A RAYAS con un gris (#eee en
 * Critics’ Choice y en Donatello) y con esa regla media lista de nominadas
 * salía marcada como ganadora, un año sí y otro no. Un gris neutro (r≈g≈b) es
 * decoración; un color con tono es la marca.
 */
export function esGrisNeutro(color) {
  const c = String(color || '').trim().toLowerCase();
  if (/^(transparent|inherit|initial|unset|none|white|whitesmoke|gainsboro|silver|(?:light|dark)?gr[ae]y)$/.test(c)) return true;
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!hex) return false;
  const h = hex[1];
  const [r, g, b] =
    h.length === 3 ? [...h].map((x) => parseInt(x + x, 16)) : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8;
}

/**
 * ¿Va esta fila sombreada como ganadora? Solo cuenta el `background` de un
 * atributo `style`, que es lo que ha marcado siempre a las ganadoras: el
 * `bgcolor="#efd"` suelto de tres filas del artículo de la Palma es otra cosa
 * (una nota de la tabla) y darlo por palmarés dejaría fuera a toda su década,
 * porque una tabla con parte de las filas resaltadas se lee como «ganadora
 * entre nominadas». Los `<style>` que Wikipedia mete dentro de las celdas de
 * referencias traen colores que no pintan ninguna fila: fuera antes de mirar.
 */
export function filaResaltada(row) {
  const src = String(row || '').replace(/<style[\s\S]*?<\/style>/gi, '');
  if (/#faeb86|#eedd82/i.test(src)) return true;
  return [...src.matchAll(/background(?:-color)?\s*:\s*([^;"']+)/gi)].some((m) => !esGrisNeutro(m[1]));
}

/**
 * Saca de la sección la primera wikitable que parezca una selección: necesita
 * una columna de director/a y otra de título. Las tablas de estos artículos
 * llevan cabeceras tipo «English title / Original title / Director(s) /
 * Production country» y varían poco entre festivales; se localiza cada columna
 * por su cabecera en vez de por posición para aguantar los cambios de orden.
 */
/**
 * A una fila corta, ¿QUÉ celda le falta? Es la pregunta que rompía el
 * emparejado, y por número de celdas no tiene respuesta.
 *
 * Las tablas de cine de Wikipedia omiten dos columnas indistintamente: el
 * título original (cuando coincide con el inglés) y el país (cuando lo absorbe
 * el `rowspan` de la fila de arriba). Las dos dejan la fila con una celda
 * menos, pero suponer siempre que falta el título original CORRE las columnas
 * y mete el título original en el campo del director/a — con lo que ninguna
 * verificación de dirección puede salir bien y la ficha se descarta. Así se
 * quedaron sin cartel «What Max Said», «Red Desert», «Last Year at Marienbad»
 * o «The Tree of Wooden Clogs».
 *
 * EL DISCRIMINADOR ES LA CURSIVA: en estas tablas los títulos van en <i> y las
 * personas no. Si lo que cae en la columna del título original viene en
 * cursiva, es un título y la que falta es otra columna; si no, es el nombre de
 * quien dirige y hay que recolocar.
 */
/**
 * Cómo se llama la columna de la película. Cada familia de artículos la titula
 * a su manera: «English title» en los festivales, «Film» en casi todos los
 * premios, «Winner» en los críticos de EE UU, «Winner and nominees» en los de
 * Chicago, «Comedy»/«Musical» en los Globos de 1958-1962 (cuando eran dos
 * premios distintos en columnas gemelas) y «Película» en la Wikipedia española,
 * de donde sale la Espiga de Oro.
 *
 * OJO con ensanchar esto a «best film» y parecidos: hay artículos que ponen
 * VARIOS premios en columnas (Sitges lista mejor película, dirección, actor y
 * actriz en la misma tabla) y ahí «Best Director» no es quien dirige a la
 * ganadora, sino otro premio de otra película. Esas tablas declaran sus
 * columnas en el REGISTRY (`awardColumns`) en vez de adivinarlas.
 */
const RX_COLUMNA_TITULO = /english title|^film\b|^title|^winner|^comedy$|^musical$|^pel[íi]cula/;
const RX_COLUMNA_AÑO = /year|^a[ñn]o/;
const RX_COLUMNA_DIRECCION = /director|direcci[óo]n/;
const RX_COLUMNA_ORIGINAL = /original title|t[íi]tulo original/;
const RX_COLUMNA_PAIS = /countr|^pa[íi]s/;

/**
 * Las celdas que traen VARIAS películas (o varios nombres) partidas por un
 * salto de línea. Devuelve null cuando no hay salto, que es el caso normal:
 * así quien llama se queda con la celda de siempre y no hay nada que cambiar.
 *
 * El corte es el `<br>` del HTML y no la coma del texto ya limpio: hay títulos
 * con coma dentro y ninguno con salto de línea.
 */
/**
 * Las celdas de una fila puestas cada una en TODAS las columnas que ocupa: una
 * celda con `colspan="2"` aparece dos veces. Sin esto, la posición de la celda
 * y el índice de su columna dejan de coincidir en cuanto una fila fusiona dos
 * campos, y todo lo que viene detrás se lee corrido.
 */
export function expandirColspan(rawCells) {
  return rawCells.flatMap((c) => {
    const n = Number((String(c ?? '').match(/colspan\s*=\s*"?(\d+)/i) || [])[1]) || 1;
    return new Array(Math.min(n, 12)).fill(c);
  });
}

const atributo = (raw, nombre, tope) => {
  const n = Number((String(raw ?? '').match(new RegExp(`${nombre}\\s*=\\s*"?(\\d+)`, 'i')) || [])[1]) || 1;
  return Math.min(Math.max(n, 1), tope);
};

/**
 * La tabla entera puesta en REJILLA: cada fila con una entrada por columna, con
 * las celdas anchas (`colspan`) repetidas a lo ancho y las altas (`rowspan`)
 * repetidas hacia abajo en las filas que ocupan.
 *
 * Cada entrada es `{ raw, propia, heredada }`, y las tres cosas hacen falta:
 * `propia` marca UNA vez la celda que esta fila escribe de verdad (es la lista
 * que miran los heurísticos del año, y por eso el eco de un colspan no la
 * lleva), y `heredada` marca la que baja de una fila anterior.
 *
 * Por qué hacía falta: el parser expandía el `colspan` DENTRO de una fila pero
 * no arrastraba nada ENTRE filas, así que una celda con `rowspan` dejaba a las
 * filas siguientes con un hueco que nadie rellenaba y todo lo que venía detrás
 * se leía corrido. En Sitges es catastrófico y silencioso: 1973 abre una celda
 * de película VACÍA con `rowspan="5"`, así que las filas de 1974-77 llegan con
 * cuatro celdas y «Robert Fuest (Dr. Phibes Rises Again)» —que es el premio a
 * la mejor DIRECCIÓN de otra película— se leería como la ganadora del año.
 *
 * El caso del país absorbido por un rowspan que hasta ahora resolvía la cursiva
 * (`faltaElTituloOriginal`) queda cubierto aquí de raíz; aquella sigue viva
 * para las filas que de verdad se dejan una columna sin escribir (el premio
 * alemán omite la del trofeo).
 */
export function expandirTabla(filas) {
  const arrastre = new Map(); // columna → { raw, quedan }
  return filas.map((row) => {
    const propias = String(row || '').match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
    const linea = [];
    const nuevas = new Map();
    let col = 0;
    let k = 0;
    while ((k < propias.length || arrastre.has(col)) && col < 64) {
      const deArriba = arrastre.get(col);
      if (deArriba) {
        linea.push({ raw: deArriba.raw, propia: false, heredada: true });
        deArriba.quedan -= 1;
        if (deArriba.quedan <= 0) arrastre.delete(col);
        col += 1;
        continue;
      }
      const raw = propias[k];
      k += 1;
      const ancho = atributo(raw, 'colspan', 12);
      const alto = atributo(raw, 'rowspan', 60);
      for (let j = 0; j < ancho; j++) {
        linea.push({ raw, propia: j === 0, heredada: false });
        if (alto > 1) nuevas.set(col, { raw, quedan: alto - 1 });
        col += 1;
      }
    }
    for (const [c, v] of nuevas) arrastre.set(c, v);
    return linea;
  });
}

/**
 * El otro empate: DOS TÍTULOS EN CURSIVA dentro de la misma celda, unidos por
 * una «&» en vez de por un salto de línea. Sitges 1994 dio su premio ex aequo a
 * «71 Fragmente einer Chronologie des Zufalls» y a «Justino, un asesino de la
 * tercera edad», y sin partirlo el palmarés enseña un título imposible que
 * además solo empareja con el primero.
 *
 * La cursiva es lo que lo hace seguro: en estas tablas los títulos van en <i> y
 * un título con «&» dentro («Sex & Drugs & Rock & Roll») vive en UNA sola. Se
 * exige además que lo que quede fuera de las cursivas sean solo separadores: si
 * hay texto de verdad entre medias, la celda dice otra cosa y se deja en paz.
 */
export function parteEnCursivas(rawCell) {
  const src = String(rawCell || '');
  const cursivas = [...src.matchAll(/<i[^>]*>([\s\S]*?)<\/i>/gi)].map((m) => stripTags(m[1]).trim()).filter(Boolean);
  if (cursivas.length < 2) return null;
  const fuera = stripTags(src.replace(/<i[^>]*>[\s\S]*?<\/i>/gi, '|'));
  if (!/^[|\s&+,;·y]*(?:\(?ex\s*[ -]?\s*ae?quo\)?)?[|\s&+,;·y]*$/i.test(fuera)) return null;
  return cursivas;
}

export function partePorSalto(rawCell) {
  if (!rawCell || !/<br\s*\/?>/i.test(rawCell)) return null;
  const trozos = String(rawCell)
    .split(/<br\s*\/?>/i)
    .map((x) => stripTags(x).trim())
    .filter(Boolean);
  return trozos.length > 1 ? trozos : null;
}

/**
 * Lo que estos palmareses premiaron y NO es una película. Los críticos de Los
 * Ángeles dieron su premio de 2020 a «Small Axe», que es una antología de la
 * BBC en cinco capítulos: buscarla en TMDB es gastar búsquedas para acabar en
 * el mismo «sin ficha» y encima contarlo como fallo del emparejado. Marcada
 * como serie, la interfaz lo dice —igual que con el «Twin Peaks» de Sight &
 * Sound— y deja de parecer un hueco.
 */
const NO_SON_PELICULAS = new Set(['small axe|2020']);

export const esSerieConocida = (title, year) =>
  NO_SON_PELICULAS.has(`${String(title || '').trim().toLowerCase()}|${year}`);

export function faltaElTituloOriginal(rawCells, headers, idxOrig) {
  if (idxOrig < 0 || rawCells.length >= headers.length) return false;
  const enOrig = rawCells[idxOrig];
  if (enOrig == null) return true; // no llega ni ahí: falta por la izquierda
  return !/<i[\s>]/i.test(enOrig);
}

export function parseSelectionTable(html, { all = false } = {}) {
  const acumulado = [];
  const tables = String(html || '').match(/<table[^>]*wikitable[\s\S]*?<\/table>/gi) || [];
  for (const t of tables) {
    const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (rows.length < 2) continue;
    const headers = (rows[0].match(/<th[\s\S]*?<\/th>/gi) || []).map((c) => stripTags(c).toLowerCase());
    const idxTitle = headers.findIndex((h) => /english title|^film$|^title/.test(h));
    const idxOrig = headers.findIndex((h) => /original title/.test(h));
    const idxDir = headers.findIndex((h) => /director/.test(h));
    const idxCountry = headers.findIndex((h) => /countr/.test(h));
    if (idxDir === -1 || (idxTitle === -1 && idxOrig === -1)) continue;

    const out = [];
    // Orizzonti 2026 mete cortos y largos en la MISMA tabla, separados solo
    // por filas-cabecera internas («In Competition», «Short Films Competition»,
    // «Short Films — Out of Competition»). Un corto no es una película que
    // mandar a Radarr: al entrar en un bloque de cortos se salta todo hasta la
    // siguiente cabecera interna que no lo sea.
    let enBloqueDeCortos = false;
    for (const row of rows.slice(1)) {
      const rawCells = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
      const cells = rawCells.map(stripTags);
      if (!cells.length) continue;
      // Fila-cabecera DENTRO de la tabla: una sola celda que abarca el ancho
      // («In Competition», «Feature films», «Special Screenings»), que es como
      // parten su tabla las secciones paralelas de Cannes. Sin este corte se
      // colaba como película, salía a buscarla a TMDB y aparecía en la lista
      // como una ficha sin emparejar que no existe.
      if (cells.length < 2) {
        // solo una cabecera que HABLE de películas cambia el estado: dentro de
        // un bloque de cortos puede haber subcabeceras de país («France») que
        // no cierran el bloque — sin esto, los cortos se colaban tras ellas
        const h = cells[0] || '';
        if (/short film|cortometraje/i.test(h)) enBloqueDeCortos = true;
        else if (/film|competition|feature|screening|documentar/i.test(h)) enBloqueDeCortos = false;
        continue;
      }
      if (enBloqueDeCortos) continue;
      // Cuando el título original coincide con el inglés, la fila viene SIN esa
      // celda y todas las columnas posteriores se corren una a la izquierda
      // (pasaba en Cannes 2025: el país acababa de director/a). Pero la que
      // falta puede ser otra —el país—, así que la decide la cursiva y no el
      // recuento: ver `faltaElTituloOriginal`.
      const sinOriginal = faltaElTituloOriginal(rawCells, headers, idxOrig);
      const cell = (i) => {
        if (i < 0) return null;
        const j = sinOriginal && i > idxOrig ? i - 1 : i;
        return j < cells.length ? cells[j] : null;
      };
      const rawTitle = cell(idxTitle) || (sinOriginal ? null : cell(idxOrig));
      if (!rawTitle) continue;
      out.push({
        title: cleanTableTitle(rawTitle),
        original_title: sinOriginal ? cleanTableTitle(rawTitle) : cleanTableTitle(cell(idxOrig)),
        director: cell(idxDir) || null,
        country: cell(idxCountry) || null,
      });
    }
    // con `all`, la selección vive repartida en varias tablas (Cannes 2020,
    // que publicó su lista simbólica por bloques temáticos): se suman todas
    if (out.length && !all) return out;
    acumulado.push(...out);
  }
  return acumulado;
}

/**
 * Palmarés: los artículos de premio (Palme d'Or, Golden Lion…) llevan una
 * tabla por década con Year / English Title / Original Title / Director(s) /
 * Country. El año va en celda-cabecera de fila y desaparece con rowspan cuando
 * hay ex aequo; la celda de título original falta cuando coincide con el
 * inglés; y los años COVID son una sola celda de texto sin película. Todo eso
 * se recoloca aquí. Devuelve filas {year, title, original_title, director,
 * country}, de la más reciente a la más antigua.
 */
export function parseWinnersTables(html, { keepAll = false, sinDirector = false, columnas = null } = {}) {
  const out = [];
  const tables = String(html || '').match(/<table[^>]*wikitable[\s\S]*?<\/table>/gi) || [];
  for (const t of tables) {
    const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (rows.length < 2) continue;
    const headers = (rows[0].match(/<th[\s\S]*?<\/th>/gi) || []).map((c) => stripTags(c).toLowerCase());
    const idxYear = headers.findIndex((h) => RX_COLUMNA_AÑO.test(h));
    const columnasTitulo = headers
      .map((h, i) => ((columnas?.title || RX_COLUMNA_TITULO).test(h) ? i : -1))
      .filter((i) => i >= 0);
    // `columnas.director: null` es «esta tabla NO tiene columna de dirección»,
    // que no es lo mismo que no haber encontrado ninguna: ver `columnas`.
    const columnasDir =
      columnas && 'director' in columnas && !columnas.director
        ? []
        : headers.map((h, i) => (RX_COLUMNA_DIRECCION.test(h) ? i : -1)).filter((i) => i >= 0);
    const idxOrig = headers.findIndex((h) => RX_COLUMNA_ORIGINAL.test(h));
    const idxCountry = headers.findIndex((h) => RX_COLUMNA_PAIS.test(h));
    if (idxYear === -1 || !columnasTitulo.length) continue;
    // Casi todas las tablas traen UNA columna de película. La de los Globos de
    // 1958-1962, cuando comedia y musical eran DOS premios distintos, trae dos
    // pares (película, dirección) en la misma fila: se leen los dos, porque los
    // dos ganaron ese año. Cada título se empareja con la primera columna de
    // dirección que tiene a su derecha.
    const gemelas = columnasTitulo.length > 1 && columnasDir.length >= columnasTitulo.length;
    const parejas = gemelas
      ? columnasTitulo.map((ti) => ({ ti, di: columnasDir.find((d) => d > ti) ?? -1 }))
      : [{ ti: columnasTitulo[0], di: columnasDir[0] ?? -1 }];
    // sin columna de dirección la tabla no sirve —es la que verifica el
    // emparejado—, salvo que el premio no la tenga a propósito: el David di
    // Donatello lista productores, y sin director el emparejado exige título
    // clavado (ver `resolveFilms`)
    if (parejas.some((p) => p.di === -1) && !sinDirector) continue;

    let lastYear = null;
    const delTable = [];
    // La tabla en rejilla, con las celdas que se estiran hacia abajo repetidas
    // en las filas que ocupan (ver `expandirTabla`). Se calcula sobre la tabla
    // entera porque un `rowspan` es, por definición, cosa de varias filas.
    const rejilla = expandirTabla(rows);
    for (let ri = 1; ri < rows.length; ri++) {
      const row = rows[ri];
      const linea = rejilla[ri] || [];
      // «las celdas que esta fila escribe», que es lo que miran los heurísticos
      // del año: una celda heredada de la fila de arriba no dice nada de esta
      const rawCells = linea.filter((c) => c.propia).map((c) => c.raw);
      const crudas = rawCells.map(stripTags);
      if (!crudas.length) continue;
      // El año abre la fila de la ganadora — como <th> (Palma), como <td
      // rowspan> que abraza a las nominadas (Goya, BAFTA) o con adorno
      // («2020 (35th)»)— y desaparece en ex aequo y nominadas. OJO con las
      // películas tituladas «1917»: un año pelado en <td> solo cuenta si la
      // fila trae TODAS las columnas (las nominadas van a una de menos).
      const y0 = crudas[0].match(/^((?:19|20)\d{2})\b/);
      // «trae todas las columnas» hay que contarlo con los colspan puestos: la
      // fila de 2026 del premio alemán es «2026 | <td colspan=2>título |
      // director», tres celdas para cuatro columnas, y contando celdas a pelo
      // dejaba de ser fila de año — la película se apuntaba al año anterior con
      // «2026» de título.
      const ancho = rawCells.reduce((n, c) => n + (Number((c.match(/colspan\s*=\s*"?(\d+)/i) || [])[1]) || 1), 0);
      // Hay tablas que se dejan columnas por el camino en casi todas sus filas
      // (el premio alemán omite la del trofeo salvo en los años en que cambió
      // de nombre), y ahí exigir el ancho completo dejaba de reconocer el año:
      // «1955» pasaba a ser el TÍTULO de la película de 1954 y todo se corría
      // una columna, con el título original de director. El discriminador es
      // el mismo de siempre: una celda de título va en cursiva o enlazada, y
      // una de año, nunca — así «1917» de nominada sigue siendo una película.
      const primeraEsTitulo = /<i[\s>]|<a\s/i.test(rawCells[0] || '');
      const esFilaDeAño =
        !!y0 &&
        (/^<th/i.test(rawCells[0]) ||
          /rowspan/i.test(rawCells[0]) ||
          /^(?:19|20)\d{2}\s*[([]/.test(crudas[0]) ||
          // el rango va en la columna del año igual que un año suelto: es como
          // Mar del Plata tapa los 25 inviernos que no se celebró («1971–1995 ·
          // Festival Cancelled»), y sin reconocerlo esa fila se colaba en el
          // palmarés como una película titulada «1971–1995»
          (/^(?:19|20)\d{2}(?:\s*[–—-]\s*(?:19|20)\d{2})?$/.test(crudas[0]) &&
            (ancho === headers.length || !primeraEsTitulo)));
      if (esFilaDeAño) lastYear = Number(y0[1]);
      // El HTML alineado con las columnas, para poder mirar la cursiva de la
      // celda que caería en el título original.
      //
      // Cuando la fila HEREDA alguna celda de la de arriba, la rejilla ya la
      // trae completa y colocada: se usa tal cual. Si no hereda ninguna, la
      // rejilla y la fila son la misma cosa y se mantiene el camino de siempre,
      // con la celda del año puesta a la izquierda cuando no viene escrita.
      let rawPorColumna;
      if (linea.some((c) => c.heredada)) {
        rawPorColumna = linea.map((c) => c.raw);
        // el año puede ser justo la celda heredada (Goya y BAFTA lo estiran
        // sobre la ganadora y sus nominadas): es el mismo año de la fila de
        // arriba, así que `lastYear` no cambia, pero sí hay que reconocerlo
        // para no correr las columnas
        if (!esFilaDeAño && idxYear >= 0 && linea[idxYear]?.heredada) {
          const heredado = stripTags(linea[idxYear].raw).match(/^((?:19|20)\d{2})\b/);
          if (heredado) lastYear = Number(heredado[1]);
        }
      } else {
        // Cada celda, en TODAS las columnas que ocupa: la fila de 1959 de los
        // Globos mete «Billy Wilder» en dirección y producción de una vez con
        // un colspan, y contando celdas a pelo lo que viene detrás se lee
        // corrido — el musical de ese año salía con el nombre del director de
        // título.
        rawPorColumna = expandirColspan(esFilaDeAño ? rawCells : [null, ...rawCells]);
      }
      const cells = rawPorColumna.map((c) => (c == null ? '' : stripTags(c)));
      cells[0] = String(lastYear ?? '');
      // ¿Sin celda de título original, o sin celda de PAÍS? En las tablas de
      // premio el país va con `rowspan` a menudo, así que la fila corta es lo
      // normal y suponer que falta el título original corría las columnas: el
      // director acababa con el título original dentro y la película se quedaba
      // sin ficha. Lo decide la cursiva.
      const sinOriginal = faltaElTituloOriginal(rawPorColumna, headers, idxOrig);
      const columna = (i) => (sinOriginal && i > idxOrig ? i - 1 : i);
      const cell = (i) => {
        if (i < 0) return null;
        const j = columna(i);
        return j < cells.length ? cells[j] : null;
      };
      // el HTML de esa misma celda, para poder mirar por dentro (los <br> que
      // parten un empate en dos películas)
      const cellRaw = (i) => {
        if (i < 0) return null;
        const j = columna(i);
        return j < rawPorColumna.length ? rawPorColumna[j] : null;
      };
      if (!lastYear) continue;
      for (const { ti, di } of parejas) {
        // Una película cuya celda BAJA de la fila de arriba ya se apuntó allí:
        // es la misma, no una nueva. Los Globos de 1961 tienen cinco nominadas
        // de comedia y cuatro de musical, así que «Babes in Toyland» ocupa dos
        // filas con un rowspan para cuadrar la rejilla — y sin esto salía dos
        // veces. La celda del AÑO sí puede venir heredada (Goya, BAFTA): lo que
        // manda aquí es la del título.
        if (linea[columna(ti)]?.heredada) continue;
        // Una nota que abarca la fila entera («No awards given», «Festival
        // Cancelled» de los 25 inviernos que Mar del Plata no se celebró) cae
        // con su colspan en la columna del título Y en la de la dirección: es
        // LA MISMA celda, y una película nunca lo es.
        if (di >= 0 && cellRaw(ti) && cellRaw(ti) === cellRaw(di)) continue;
        // Boston 2008 mete su empate —Slumdog Millionaire y WALL-E— en UNA
        // celda partida por <br>, con los dos directores igual. Sin desdoblarlo
        // el título quedaba en «Slumdog Millionaire , WALL-E» y se perdían las
        // dos películas; se parte por el salto, que no puede aparecer dentro de
        // un título, y no por la coma, que sí.
        const titulos = partePorSalto(cellRaw(ti)) || parteEnCursivas(cellRaw(ti)) || [cell(ti)];
        // La dirección solo se parte si el TÍTULO se partió: un salto en la
        // celda de dirección casi siempre es una CODIRECCIÓN de una sola
        // película —la Palma de 1946 (Ipsen y Lauritzen) y la de 1956
        // (Cousteau y Malle)— y partirla dejaba fuera al segundo nombre.
        const directores = titulos.length > 1 ? partePorSalto(cellRaw(di)) || [cell(di)] : [cell(di)];
        for (let k = 0; k < titulos.length; k++) {
          const title = cleanTableTitle(titulos[k]);
          // con un solo nombre para varias películas (codirección compartida),
          // ese nombre vale para todas
          const director = directores.length === titulos.length ? directores[k] : directores[0] || null;
          // años sin premio (COVID, festival cancelado) vienen sin director
          if (!title || (!director && !sinDirector)) continue;
          delTable.push({
            // el artículo del Platform Prize lista la sección ENTERA con la
            // ganadora sombreada: si la tabla resalta filas, solo esas son palmarés
            highlighted: filaResaltada(row),
            film: {
              year: lastYear,
              title,
              original_title:
                titulos.length > 1 || sinOriginal ? title : cleanTableTitle(cell(idxOrig)) || title,
              director: director || null,
              country: cell(idxCountry),
              // lo que ganó un premio de cine y NO es cine se marca aquí: ni se
              // busca en TMDB ni cuenta como emparejado fallido
              ...(esSerieConocida(title, lastYear) ? { tv: true } : {}),
            },
          });
        }
      }
    }
    const hi = delTable.filter((r) => r.highlighted);
    // tabla mixta (ganadora sombreada entre nominadas) vs tabla de solo
    // ganadoras (Palme): en la mixta, «winner» es el sombreado; en la de solo
    // ganadoras lo son todas
    const mixta = hi.length && hi.length < delTable.length;
    // ...salvo el año que en una tabla mixta trae UNA sola película: entonces
    // no hay nada de lo que distinguirla y el artículo no la sombrea. Le pasa
    // a 2004 en los críticos de Chicago, que sin esto desaparecía del palmarés
    // sin dejar rastro: ni ganadora, ni nominada, ni error.
    const porAño = new Map();
    for (const r of delTable) porAño.set(r.film.year, (porAño.get(r.film.year) || 0) + 1);
    const ganó = (r) => !mixta || r.highlighted || porAño.get(r.film.year) === 1;
    if (keepAll) {
      for (const r of delTable) out.push({ ...r.film, winner: ganó(r) });
    } else {
      for (const r of delTable) if (ganó(r)) out.push(r.film);
    }
  }
  return out.sort((a, b) => b.year - a.year);
}

/**
 * La ganadora (y las nominadas) de UNA edición suelta.
 *
 * El artículo-lista de un premio se actualiza cuando alguien se acuerda: el del
 * Guldbagge seguía terminando en 2024 mientras la 61.ª edición —«Eagles of the
 * Republic», enero de 2026— llevaba meses con su propio artículo. Donde la
 * gente escribe primero es en la edición.
 *
 * Esos artículos van todos con el mismo molde: una rejilla de categorías, y
 * cada categoría abre con un rótulo que ENLAZA al artículo del premio. Ese
 * enlace es la llave —el mismo `awardPage` que ya está en el REGISTRY—, así que
 * no hay que reconocer el nombre de la categoría en cada idioma ni fiarse del
 * orden. Dentro, una viñeta por película con la ganadora en negrita.
 *
 * Si el artículo no sigue ese molde no se devuelve nada y el año se queda como
 * estaba: es un respaldo, no una fuente.
 */
export function parseEditionRows(html, awardPage, year) {
  const ruta = `/wiki/${String(awardPage).replace(/ /g, '_')}`;
  const variantes = [ruta, ruta.replace(/'/g, '%27'), ruta.replace(/–/g, '%E2%80%93')];
  for (const td of String(html || '').match(/<td[\s\S]*?<\/td>/gi) || []) {
    const rotulo = (td.match(/<div[\s\S]*?<\/div>/i) || [])[0] || '';
    if (!variantes.some((v) => rotulo.includes(`href="${v}"`))) continue;
    const filas = (td.match(/<li[\s\S]*?<\/li>/gi) || [])
      .map((li) => ({
        // la ganadora va en negrita; el título, en cursiva (detrás va quien
        // produce, que en estos artículos es lo que acompaña al título)
        winner: /<b[\s>]/i.test(li),
        title: cleanTableTitle(stripTags((li.match(/<i[\s\S]*?<\/i>/i) || [])[0] || '')),
      }))
      .filter((r) => r.title);
    if (!filas.length) continue;
    // sin negritas, manda la convención: la ganadora abre la lista
    if (!filas.some((r) => r.winner)) filas[0].winner = true;
    return filas.map((r) => ({
      year,
      title: r.title,
      original_title: r.title,
      director: null, // estos artículos acreditan producción, no dirección
      country: null,
      winner: r.winner,
    }));
  }
  return [];
}

/**
 * Palmarés de Sundance: «List of Sundance Film Festival award winners» no
 * lleva tablas sino viñetas por año, con los Grand Jury Prize en el PRIMER
 * bloque («World Cinema Dramatic – Título by Director»). Nos quedamos solo con
 * el premio gordo de la vía Óscar: la primera línea de cada año que casa con
 * ese patrón (las siguientes apariciones de «World Cinema Dramatic» son el
 * premio del público y el de dirección, que además usa «for» en vez de «by»).
 */
/**
 * Los dos premios gordos de Sundance, que son DOS competiciones distintas: la
 * internacional (World Cinema Dramatic, la que clasifica para el Óscar) y la
 * estadounidense (U.S. Dramatic), que es la que ganó CODA en 2021 y que faltaba
 * entera. Cada una tiene su entrada en el REGISTRY.
 */
const PREMIOS_SUNDANCE = {
  world: {
    // la etiqueta ha cambiado tres veces: «World Cinema Jury Prize Dramatic»
    // (2005-2012), «World Cinema Grand Jury Prize: Dramatic [Competition]»
    // (2013-2022) y «World Cinema Dramatic» a secas
    explicito: (l) => /world cinema/.test(l) && /dramatic/.test(l) && /jury prize/.test(l),
    corto: (l) => /^world cinema dramatic$/.test(l),
  },
  us: {
    // «U.S. Grand Jury Prize: Dramatic Competition», «US Dramatic Grand Jury
    // Prize», «U.S. Dramatic Grand Jury Prize Award»… con y sin puntos, y
    // hasta con espacio dentro («U. S. Grand Jury Prize», 2013): sin tolerarlo
    // Fruitvale Station desaparecía del palmarés en silencio.
    // antes de ~2010 no llevaba el «U.S.» delante: era «Grand Jury Prize:
    // Dramatic» a secas, y el «World Cinema» es lo que distingue a la otra
    explicito: (l) =>
      /dramatic/.test(l) && /(grand )?jury prize/.test(l) && !/world/.test(l) &&
      (/^u\.?\s?s\.?\b/.test(l) || /^grand jury prize/.test(l)),
    corto: (l) => /^u\.?\s?s\.? dramatic$/.test(l),
  },
};

/**
 * ¿Lo de dentro del paréntesis es un NOMBRE DE PERSONA o un título original?
 * Un nombre: de dos a cinco palabras, cada una o inicial («A.V.»), o partícula
 * de apellido («de», «van»), o conector de colectivo («and»), o palabra con
 * mayúscula inicial — y la primera no puede ser un artículo, que es como
 * empiezan los títulos («La Nana», «The Maid»). Los títulos largos («Violeta
 * se Fue a Los Cielos») caen por longitud o por sus palabras en minúscula.
 */
export function pareceNombreDePersona(s) {
  const palabras = String(s || '').trim().split(/\s+/);
  if (palabras.length < 2 || palabras.length > 5) return false;
  if (/^(the|a|an|la|el|los|las|le|les|un|una|il|lo|der|die|das)$/i.test(palabras[0])) return false;
  const inicial = /^\p{Lu}(\.\p{Lu})*\.?$/u; // A. · A.V. · J.R.R.
  const particula = /^(de|del|da|dos|das|van|von|der|den|di|do|le|la|bin|al|ter|ten)$/;
  const conector = /^(and|y|&)$/i;
  return palabras.every(
    (p) => inicial.test(p) || particula.test(p) || conector.test(p) || /^\p{Lu}/u.test(p)
  );
}

/**
 * ¿Lo del paréntesis REPITE palabras del título? Entonces es el título
 * original, no una persona: «King of Ping Pong (Ping Pongkingen)» pasaba el
 * filtro de nombre (dos palabras capitalizadas) y ponía al título sueco de
 * director. Ningún director comparte raíces de cuatro letras con el título de
 * su película en la misma línea; un título original traducido casi siempre sí.
 */
export function ecoDelTitulo(titulo, dentro) {
  const toks = (x) =>
    String(x || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4);
  const tt = toks(titulo);
  const dd = toks(dentro);
  return dd.some((d) => tt.some((t) => d.startsWith(t) || t.startsWith(d)));
}

export function parseSundanceWinners(html, { ambito = 'world' } = {}) {
  const out = [];
  const src = String(html || '');
  const headings = [...src.matchAll(/<h[23][^>]*>[\s\S]*?<\/h[23]>/gi)];
  // la etiqueta del premio ha cambiado tres veces: «World Cinema Jury Prize
  // Dramatic» (2005-2012), «World Cinema Grand Jury Prize: Dramatic
  // [Competition]» (2013-2022) y el «World Cinema Dramatic» a secas de ahora.
  // La forma explícita manda (el premio del público a veces se lista ANTES);
  // la corta solo vale como respaldo, fiándose de que el bloque del jurado va
  // primero. Fuera dirección/guion/montaje y documentales.
  const premio = PREMIOS_SUNDANCE[ambito] || PREMIOS_SUNDANCE.world;
  const otroPremio = (label) =>
    /documentary|directing|special|cinematography|editing|screenwriting|audience|acting|ensemble|innovat/.test(label);
  const esGranPremio = (label) => premio.explicito(label) && !otroPremio(label);
  const esFormaCorta = (label) => premio.corto(label) && !otroPremio(label);

  for (let h = 0; h < headings.length; h++) {
    const year = Number((stripTags(headings[h][0]).match(/^((?:19|20)\d{2})/) || [])[1]);
    if (!year) continue;
    const chunk = src.slice(
      headings[h].index + headings[h][0].length,
      h + 1 < headings.length ? headings[h + 1].index : src.length
    );
    let ganadora = null;
    const explicitas = []; // los empates viejos van en dos líneas: caben varias
    for (const li of chunk.match(/<li[\s\S]*?<\/li>/gi) || []) {
      const texto = stripTags(li);
      // El separador entre el premio y la película NO es siempre un guion: en
      // 2018, 2019 y 2020 la lista usa DOS PUNTOS, y esos tres años se caían
      // enteros sin hacer ruido —ni siquiera aparecían como «sin emparejar»—.
      // El guion manda cuando existe, porque la etiqueta de 2021 ya lleva dos
      // puntos dentro («U.S. Grand Jury Prize: Dramatic Competition – CODA»).
      const m = /^(.+?)\s*[–—-]\s*(.+)$/.exec(texto) || /^([^:]+):\s*(.+)$/.exec(texto);
      if (!m) continue;
      const label = m[1].trim().toLowerCase();
      if (!esGranPremio(label) && !esFormaCorta(label)) continue;
      // el crédito de dirección ha ido variando: «Título by Director»,
      // «Título (Director)» o, en los primeros años, solo el título
      const resto = m[2].trim().replace(/,\s*$/, '');
      // el empate del 2000 viene como «Girlfight & You Can Count on Me (tie)»:
      // son DOS ganadoras, y sin partirlas ninguna encontraba ficha. El «&»
      // solo parte cuando el marcador (tie) está presente — hay títulos con
      // «&» legítimo.
      const esEmpate = /\(tie\)\s*$/i.test(resto);
      const cuerpos = esEmpate
        ? resto.replace(/\s*\(tie\)\s*$/i, '').split(/\s*&\s*/).filter(Boolean)
        : [resto];
      const filas = cuerpos.map((cuerpo) => {
        let title = cuerpo;
        let director = null;
        let original = null;
        // «Título, directed by Fulano» · «Título by Fulano» · «Título (Fulano)»
        // OJO: el «by» puede ser PARTE del título — «Precious: Based on the
        // Novel "Push" by Sapphire» lleva a su novelista dentro, y partirlo
        // ahí ponía a Sapphire de directora y la verificación no podía salir
        // bien. Solo parte si lo que sigue parece un nombre de persona.
        const porBy = /^(.+?),?\s+(?:directed\s+)?by\s+(.+)$/.exec(cuerpo);
        const porParens = /^(.+?)\s*\(([^)]+)\)$/.exec(cuerpo);
        // «Fruitvale (retitled Fruitvale Station)»: el paréntesis trae el
        // título DEFINITIVO, que es el que TMDB conoce — se intercambian
        const retitulada = porParens && /^(?:later\s+)?(?:retitled|renamed)\s+(.+)$/i.exec(porParens[2].trim());
        if (porBy && pareceNombreDePersona(porBy[2])) [, title, director] = porBy;
        else if (retitulada) {
          title = retitulada[1].trim();
          original = porParens[1].trim();
        } else if (porParens && ecoDelTitulo(porParens[1], porParens[2])) {
          // repite palabras del título: es el título original, no una persona
          // («King of Ping Pong (Ping Pongkingen)»)
          title = porParens[1];
          original = porParens[2].trim();
        } else if (porParens) {
          // El paréntesis trae o el DIRECTOR o el TÍTULO ORIGINAL, y había que
          // distinguirlos mejor: la heurística vieja vetaba los nombres con
          // partícula («Beth de Araújo»), las iniciales («A.V. Rockwell», el
          // \b casaba la A suelta) y los colectivos de cinco palabras («Astrid
          // Rondero and Fernanda Valadez») — y esas tres ganadoras se quedaban
          // con el director incrustado en el título, sin ficha posible.
          const dentro = porParens[2].trim();
          if (pareceNombreDePersona(dentro)) {
            title = porParens[1];
            director = dentro;
          } else {
            // no es un nombre: es el título original («The Maid (La Nana)»).
            // Pegado al título tampoco encontraba ficha: va a su campo.
            title = porParens[1];
            original = dentro;
          }
        }
        return {
          year,
          title: title.trim(),
          original_title: (original || title).trim(),
          director: director?.trim() || null,
          country: null,
        };
      });
      if (esGranPremio(label)) {
        // la etiqueta explícita es inequívoca — pero NO se corta aquí: los
        // empates viejos van en DOS líneas separadas («Public Access» en 1993,
        // «The Trouble with Dick» en 1987) y el break se quedaba solo con la
        // primera ganadora del año
        explicitas.push(...filas);
        continue;
      }
      if (!ganadora) ganadora = filas; // forma corta: la primera aparición
    }
    const delAño = explicitas.length ? explicitas : ganadora || [];
    out.push(...delAño);
  }
  return out.sort((a, b) => b.year - a.year);
}

/**
 * Top 10 anual de Cahiers: el artículo lleva UNA wikitable por década con
 * filas-cabecera de año («2010») intercaladas, el puesto en <th> («1.», con
 * rowspan en los empates), la celda de título con colspan cuando el original
 * coincide con el inglés, y el país con rowspan abrazando varias filas. Nada de
 * eso lo aguanta el parser posicional de los premios, así que aquí la tabla se
 * expande a una rejilla resolviendo rowspan/colspan y LUEGO se leen las
 * columnas por cabecera. Devuelve {year, rank, tied, title, original_title,
 * director, country}, en el orden del artículo.
 */
export function parseCahiersTables(html) {
  const out = [];
  const tables = String(html || '').match(/<table[^>]*wikitable[\s\S]*?<\/table>/gi) || [];
  for (const t of tables) {
    const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (rows.length < 2) continue;
    const headers = (rows[0].match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map((c) => stripTags(c).toLowerCase());
    const idxRank = headers.findIndex((h) => h === '#' || /^no\.?$/.test(h));
    const idxTitle = headers.findIndex((h) => /english title|^film\b|^title/.test(h));
    const idxOrig = headers.findIndex((h) => /original title/.test(h));
    const idxDir = headers.findIndex((h) => /director/.test(h));
    const idxCountry = headers.findIndex((h) => /countr/.test(h));
    if (idxRank === -1 || idxDir === -1 || idxTitle === -1) continue;
    const nCols = headers.length;

    // arrastre de rowspans: pending[col] = {text, left} mientras la celda siga viva
    const pending = new Array(nCols).fill(null);
    let year = null;
    for (const row of rows.slice(1)) {
      const cells = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
      if (!cells.length) continue;
      // Fila-cabecera que abarca la tabla: un año («2010[1]») abre lista; todo
      // lo demás la CIERRA (year = null). Sin eso, la lista «de la década»
      // («2010s (2010–2019)») y los huecos («No list for 2003») colgaban sus
      // filas del último año visto. El (?!s) descarta el propio «2010s».
      const primerSpan = Number((cells[0].match(/colspan="?(\d+)/i) || [])[1] || 1);
      if (cells.length === 1 && primerSpan >= nCols - 1) {
        const y = stripTags(cells[0]).match(/^((?:19|20)\d{2})(?!s)/);
        year = y ? Number(y[1]) : null;
        continue;
      }
      const fila = new Array(nCols).fill(null);
      let ci = 0;
      for (let col = 0; col < nCols; col++) {
        if (pending[col]) {
          fila[col] = pending[col].text;
          if (--pending[col].left <= 0) pending[col] = null;
          continue;
        }
        const cell = cells[ci++];
        if (!cell) continue;
        const text = stripTags(cell);
        const cspan = Number((cell.match(/colspan="?(\d+)/i) || [])[1] || 1);
        const rspan = Number((cell.match(/rowspan="?(\d+)/i) || [])[1] || 1);
        for (let k = 0; k < cspan && col + k < nCols; k++) {
          fila[col + k] = text;
          if (rspan > 1) pending[col + k] = { text, left: rspan - 1 };
        }
        col += cspan - 1;
      }
      if (!year) continue;
      const rank = Number((String(fila[idxRank] || '').match(/^(\d+)/) || [])[1]) || null;
      const title = cleanTableTitle(fila[idxTitle]);
      const director = fila[idxDir] || null;
      if (!rank || !title || !director) continue;
      const orig = idxOrig >= 0 && fila[idxOrig] && fila[idxOrig] !== fila[idxTitle] ? cleanTableTitle(fila[idxOrig]) : title;
      out.push({ year, rank, title, original_title: orig, director, country: idxCountry >= 0 ? fila[idxCountry] : null });
    }
  }
  // empates: dos filas del mismo año compartiendo puesto por rowspan
  const porPuesto = new Map();
  for (const r of out) porPuesto.set(`${r.year}:${r.rank}`, (porPuesto.get(`${r.year}:${r.rank}`) || 0) + 1);
  for (const r of out) r.tied = porPuesto.get(`${r.year}:${r.rank}`) > 1;
  return out;
}

/**
 * Una celda de dirección puede traer varios nombres («Joel and Ethan Coen»,
 * «A, B & C»): esta es LA forma canónica de partirla, compartida con el
 * front (que pinta una estrella de seguir por persona). El filtro de longitud
 * tira restos de puntuación, no nombres reales.
 */
export function splitDirectors(s) {
  const parts = String(s || '')
    .split(/,|;|&| and | y /i)
    .map((x) => x.trim())
    .filter(Boolean);
  // apellido compartido: en «Joel and Ethan Coen» el primer trozo queda en
  // «Joel» a secas; se le pega el apellido del último nombre completo
  const last = parts[parts.length - 1] || '';
  const apellido = last.includes(' ') ? last.slice(last.indexOf(' ') + 1) : '';
  return parts
    .map((p) => (p !== last && !p.includes(' ') && apellido ? `${p} ${apellido}` : p))
    .filter((x) => normName(x).length >= 4);
}

// nombres comparables entre Wikipedia y TMDB: sin acentos, sin guiones ni
// espacios («Hirokazu Kore-eda» y «Hirokazu Koreeda» son la misma persona), y
// con las letras que NFD no descompone plegadas a ASCII — «Paweł» y «Pawel»
// tienen que ser el mismo señor (ver names.js)

// tokens de un nombre: guiones fusionados («Kore-eda» → «koreeda»), sin
// acentos, y fuera iniciales sueltas («Joseph L. Mankiewicz» → joseph,
// mankiewicz)
const nameTokens = (s) =>
  foldName(s) // «Paweł» → «Pawel» antes de partir: si no, el token queda en «Pawe»
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-/g, '')
    .split(/[^a-z0-9]+/)
    // «The Wachowskis»: el artículo no es parte del nombre de nadie y estorba
    // al comparar un colectivo con una persona
    .filter((t) => t.length >= 2 && t !== 'the');

/**
 * Letras dobles colapsadas: «Larissa» → «larisa», «Farrokhzad» → «farokhzad».
 *
 * No es un capricho ortográfico: al transliterar del ruso, del persa o del
 * árabe, cada fuente dobla las consonantes donde le parece, y Wikipedia y TMDB
 * no se ponen de acuerdo. Colapsar es CONSERVADOR —no acerca dos apellidos
 * distintos, solo dos grafías del mismo.
 */
const sinDobles = (t) => t.replace(/(.)\1+/g, '$1');

/**
 * Dígrafos de transliteración plegados: la MISMA persona sale «Chukhrai» en la
 * Wikipedia inglesa y «Tchoukhrai» en fuentes que copian la grafía francesa
 * (pasaba en el palmarés de BAFTA con «Ballad of a Soldier»). El francés
 * escribe «tch» donde el inglés «ch» y «ou» donde el inglés «u»: se pliegan
 * las dos ANTES de comparar. Como el colapso de dobles, es conservador — no
 * acerca dos apellidos distintos, solo dos grafías del mismo.
 */
const sinTranslit = (t) => t.replace(/tch/g, 'ch').replace(/ou/g, 'u');

/** Distancia de edición, cortada en 2: solo hace falta saber si es 0, 1 o más. */
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const nueva = [i];
    for (let j = 1; j <= b.length; j++) {
      nueva[j] = Math.min(
        fila[j] + 1,
        nueva[j - 1] + 1,
        fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    fila = nueva;
    if (Math.min(...fila) > 1) return 2; // ya no puede bajar de 2
  }
  return Math.min(fila[b.length], 2);
}

/**
 * ¿Dos tokens son el mismo, tolerando cómo se transcriba? Por orden de
 * exigencia: iguales, abreviatura («Th.» de «Theodor»), plural de colectivo
 * («Wachowskis» de «Wachowski»), la misma palabra con dobles colapsadas, y como
 * último recurso una sola letra de diferencia en palabras largas
 * («Forough»/«Forugh»).
 *
 * Lo de la letra suelta suena arriesgado y no lo es tanto: esta comparación NO
 * elige película, solo CONFIRMA una que ya coincidió en título y año. Para que
 * colara la persona equivocada haría falta que otra película del mismo título y
 * del mismo año estuviera dirigida por alguien que se escribe casi igual.
 */
const mismoToken = (a, b) => {
  // OJO con la dirección de la abreviatura: solo el token LARGO puede empezar
  // por el corto («Theodor» por «Th.»), nunca al revés. Al hacerlo simétrico,
  // «Carla Theron» pasaba por «Carl Th. Dreyer» — lo cazó su test.
  if (a === b || b.startsWith(a)) return true;
  // «Tom» por «Thomas», «Rick» por «Richard»: dos formas del mismo nombre de
  // pila que ninguna de las reglas de parecido junta (ver names.js)
  if (mismoDiminutivo(a, b)) return true;
  if (a === `${b}s` || b === `${a}s`) return true;
  const da = sinDobles(a);
  const dbb = sinDobles(b);
  if (da === dbb) return true;
  // «chukhrai» (inglés) y «tchoukhrai» (francés) son la misma palabra con los
  // dígrafos de otra lengua: plegados quedan idénticos. PERO el plegado solo
  // vale cuando UNO de los lados es la grafía extranjera del otro: si pliegan
  // LOS DOS, son dos palabras distintas que convergen — «Boucher» (ou) y
  // «Butcher» (tch) acababan iguales, y son dos apellidos reales distintos.
  // Con cuerpo mínimo de 4, que «Lou» y «Lu» no son la misma persona por esto.
  const ta = sinTranslit(da);
  const tb = sinTranslit(dbb);
  const plegoUnoSolo = (ta !== da) !== (tb !== dbb);
  if (plegoUnoSolo && Math.min(da.length, dbb.length) >= 4 && ta === tb) return true;
  // la letra suelta de tolerancia se mide sobre las formas plegadas SOLO si
  // plegó un lado («Tchoukhrai»/«Chukhray»: dígrafo Y vocal final a la vez);
  // si no, sobre las crudas, como siempre
  const [fa, fb] = plegoUnoSolo ? [ta, tb] : [da, dbb];
  return Math.min(a.length, b.length) >= 5 && distancia(fa, fb) <= 1;
};

// ¿Mismo nombre? Insensible al ORDEN de las palabras: las tablas de Wikipedia
// usan a veces el orden japonés («Imamura Shōhei») donde TMDB dice «Shohei
// Imamura». Basta con que los tokens del nombre corto estén todos en el largo
// (cubre también segundos nombres e iniciales).
const sameName = (a, b) => {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return corto.every((t) => largo.some((l) => mismoToken(t, l)));
};

/**
 * ¿La dirección que dice Wikipedia casa con la de TMDB? La celda puede traer
 * varios nombres («Ludovic and Zoran Boukherma», «A, B»); basta con que uno
 * coincida. Sin director en la tabla no hay contra qué verificar: pasa.
 */
export function directorsMatch(wikiDirector, tmdbDirectors) {
  if (!wikiDirector) return true;
  const wiki = String(wikiDirector)
    .split(/,|&| and | y /i)
    .filter((s) => normName(s).length >= 4);
  if (!wiki.length) return true;
  const tm = (tmdbDirectors || []).filter(Boolean);
  return wiki.some((w) =>
    tm.some((t) => {
      if (sameName(w, t)) return true;
      // respaldo pegado: cubre grafías fusionadas en cualquiera de los lados
      const nw = normName(w);
      const nt = normName(t);
      // AGUJERO QUE ESTUVO ABIERTO: `normName` borra todo lo que no sea a-z0-9,
      // así que un nombre en japonés, cirílico, árabe o griego se normaliza a
      // cadena VACÍA — y `nw.includes('')` es siempre cierto. Con eso, un
      // director acreditado en su alfabeto casaba con CUALQUIER nombre de
      // Wikipedia y podía colar la ficha de otra película. Sin letras que
      // comparar no hay verificación: se dice que no, no que sí.
      if (!nw || !nt) return false;
      return nt === nw || nt.includes(nw) || nw.includes(nt);
    })
  );
}

/**
 * Casa cada fila con TMDB y le cuelga cartel y fecha. `yearOf` da el año de
 * búsqueda por fila (el de la edición, o el propio de cada ganadora).
 *
 * El emparejado se VERIFICA contra el director/a: con títulos genéricos
 * («Bunker», «Company», «Look Back») la búsqueda por título+año devolvía otra
 * película del mismo año. Ahora un candidato solo vale si su dirección en TMDB
 * coincide con la de la tabla de Wikipedia; si ninguno la demuestra, mejor sin
 * ficha que con la ficha equivocada.
 */
/** Clave estable de un emparejado (título+año+director normalizados): la usan
 *  la caché film_match y las correcciones manuales de match_overrides. */
export function festivalOverrideKey(title, year, director) {
  return `${normName(title)}:${Number(year)}:${normName(director || '')}`;
}

/**
 * LA decisión del emparejado: dados los candidatos de TMDB ya buscados, ¿cuál
 * es esta película, si es alguna?
 *
 * Vive aparte del código de red a propósito. Aquí se han corregido cuatro
 * rondas de fallos de producción (las versiones v2…v6 de la caché de
 * festivales) y no había forma de probar ninguno sin salir a internet; con la
 * decisión separada, cada regresión conocida tiene su test:
 *
 *  1. Un título genérico («Bunker», «Look Back») enganchaba otra película del
 *     mismo año → un candidato solo vale si su dirección lo demuestra.
 *  2. «In the Mood for Love» acababa siendo su propio making-of, del mismo
 *     director → a igualdad, gana el título clavado y luego el año exacto.
 *  3. «Fanny y Alexander» tiene versión de cine y de televisión, ambas de
 *     Bergman → entre verificados, gana el que ya está en tu Plex.
 *  4. Una «Undercover» ajena sin créditos se colaba por delante de la de
 *     Echevarría → las fichas sin equipo son el ÚLTIMO recurso, y solo por
 *     título clavado.
 *  5. Un 429 a mitad de comprobación dejaba ganar al siguiente de la fila →
 *     un fallo de red ABORTA la resolución (nadie gana por incomparecencia).
 *
 * `dirsDe` devuelve los directores de un candidato, o null si la red falló.
 */
/**
 * Lo que devuelve `dirsDe` cuando la ficha NO EXISTE (404 de TMDB), que no es
 * lo mismo que un corte de red.
 *
 * La búsqueda de TMDB devuelve a veces fichas fantasma —entradas borradas que
 * su índice todavía sirve—, y pedir sus créditos da 404. Como cualquier error
 * se traducía a «null», eso se leía como fallo de red y ABORTABA la resolución
 * entera de esa película: la candidata buena venía detrás y ya no se llegaba a
 * mirar. Así se quedaron sin ficha «Der bewegte Mann» (Lola 1995) y «Die
 * Artisten in der Zirkuskuppel» (Lola 1969), con su ficha correcta y su
 * director exacto en la lista. Y de propina, la página no se cacheaba nunca:
 * cada visita repetía la ráfaga entera contra TMDB.
 */
export const FICHA_FANTASMA = Symbol('TMDB 404');

/** ¿Este error es un 404 (ficha que ya no existe) y no un corte de red? */
export const esFichaFantasma = (err) => /\b404\b/.test(String(err?.message || err || ''));

export async function elegirCandidato(row, year, candidatos, inLib, dirsDe, tituloEnDe = null, equipoDe = null) {
  // el estreno puede bailar un año respecto al festival; sin fecha aún
  // (película recién anunciada) también vale como candidata.
  // Si el año de la fila viniera roto, filtrar por ventana descartaría a TODOS
  // los candidatos con fecha y solo quedaría morralla sin fecha.
  const enVentana = Number.isFinite(year)
    ? candidatos.filter(
        (c) =>
          // una ficha SIN FECHA vale de candidata (película recién anunciada),
          // pero solo cuando hay una dirección que la verifique: para una fila
          // sin director el año es la segunda prueba, y una ficha sin fecha no
          // la aporta —encima entra en la ventana Y ordena por delante de las
          // fechadas, así que un homónimo fantasma le ganaba siempre a la
          // película buena. Le pasaba a «The Cremator» de Sitges 1972, que
          // acabó en un documental nepalí sin fecha, y a «The Invitation».
          (!c.date && (row.director || !Number.isFinite(year))) ||
          (c.date && Math.abs(Number(c.date.slice(0, 4)) - year) <= 1)
      )
    : [...candidatos];

  // Los DOS títulos con los que la fila nombra a la MISMA película: el
  // internacional y el original. Comparar solo con el primero dejaba fuera al
  // candidato que TMDB guarda por el original —el Ástor de 1959 es
  // «Smultronstället», y TMDB lo tiene como «Fresas salvajes»— y, peor, abría
  // la puerta a que ganara un parecido: ese año acabó emparejado con
  // «Bakomfilm Smultronstället», el MAKING-OF, que también es de 1957 y
  // también lo firma Bergman. Dos nombres de la misma película son dos
  // pruebas igual de buenas, no una relajación.
  const deseados = [...new Set([normName(row.title), normName(row.original_title)].filter(Boolean))];
  // «Clavado» tolera UNA cosa: letras dobladas de más o de menos. «Angelo
  // azzuro» es una errata de Wikipedia (Orizzonti 2026) que TMDB escribe
  // «Angelo Azzurro», y sin esto la búsqueda ni siquiera la consideraba título
  // exacto. Solo se colapsan LETRAS: colapsar dígitos convertiría «Apollo 11»
  // en «apolo1» y lo casaría con otra película.
  const plegado = (s) => String(s || '').replace(/([a-z])\1+/g, '$1');
  const clava = (s) => {
    const n = normName(s);
    if (!n) return false;
    // el plegado de dobles solo con cuerpo: «Anna» y «Ana» son DOS películas
    // distintas y con cuatro letras no hay errata que valga
    return deseados.some((w) => n === w || (w.length >= 5 && plegado(n) === plegado(w)));
  };
  const tituloClavado = (c) => clava(c.title) || clava(c.original_title);
  // Para filas SIN director, el título es la única prueba y se pide clavado —
  // pero con una tolerancia: que uno contenga al otro si el SOBRANTE es un
  // subtítulo de verdad (≥8 letras). Las listas viejas de Sundance escriben
  // «Personal Velocity: Three Portraits» donde TMDB dice «Personal Velocity».
  // El sobrante mínimo evita que «Halloween» case con «Halloween II» o «The
  // Godfather» con «The Godfather Part II»: un ordinal no es un subtítulo.
  const contiene = (a, b) => {
    if (a.length < 8 || b.length < 8) return false;
    const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
    return largo.includes(corto) && largo.length - corto.length >= 8;
  };
  const tituloBastaSinDirector = (c) =>
    tituloClavado(c) ||
    deseados.some((w) => contiene(normName(c.title), w) || contiene(normName(c.original_title || ''), w));
  const distAño = (c) => (c.date && Number.isFinite(year) ? Math.abs(Number(c.date.slice(0, 4)) - year) : 0.5);
  enVentana.sort(
    (a, b) =>
      (tituloClavado(a) ? 0 : 1) - (tituloClavado(b) ? 0 : 1) ||
      (inLib.has(a.id) ? 0 : 1) - (inLib.has(b.id) ? 0 : 1) ||
      distAño(a) - distAño(b)
  );

  let tmdbId = null;
  let fallosRed = false;
  let porEquipo = false;
  const sinCreditos = [];
  for (const c of enVentana) {
    // null = fallo de red (no «sin créditos»). Se ABORTA la resolución de esta
    // película: seguir probando dejaría ganar a un candidato peor solo porque
    // al bueno le tocó el 429, y encima se cachearía como válido.
    const dirs = await dirsDe(c.id);
    if (dirs === null) {
      fallosRed = true;
      break;
    }
    if (dirs === FICHA_FANTASMA) continue; // ficha borrada que la búsqueda aún sirve
    if (dirs.length) {
      // Sin director en la fila no hay contra qué verificar (directorsMatch
      // pasa por diseño), así que la ÚNICA prueba que queda es el título: se
      // exige clavado. Antes, una fila de dos celdas que dejaba el director en
      // null se emparejaba con el primer candidato con créditos de la ventana
      // — un falso positivo esperando su momento.
      let vale = directorsMatch(row.director, dirs) && (row.director || tituloBastaSinDirector(c));
      // El título clavado puede vivir SOLO en la traducción inglesa: «Three
      // Seasons» (Sundance 1999) es «Tres estaciones» de título y «Ba mùa» de
      // original en TMDB. Para una fila sin director, el título internacional
      // EXACTO es la misma prueba que el clavado — y se consulta solo cuando
      // los otros dos ya fallaron, que es cuando merece la llamada (cacheada).
      if (!vale && !row.director && tituloEnDe) {
        vale = clava(await tituloEnDe(c.id));
      }
      if (vale) {
        tmdbId = c.id;
        break;
      }
    } else {
      sinCreditos.push(c);
    }
  }
  // SEGUNDA VUELTA, sin ventana de año. Los cánones y los palmareses fechan por
  // producción o por estreno en festival, y TMDB por estreno comercial: «Beau
  // travail» es 1998 para Sight & Sound y 2000 para TMDB, y «Partie de
  // campagne» se rodó en 1936 y se estrenó en 1946. Con la ventana de ±1 esos
  // candidatos ni se llegaban a mirar, y la película se quedaba sin ficha aunque
  // el buscador manual la encontrara a la primera.
  //
  // Esto NO relaja la regla de «mejor sin ficha que la ficha de otra»: al
  // contrario, aquí se EXIGEN las dos pruebas a la vez —título clavado Y
  // dirección verificada—, que es más de lo que se pide dentro de la ventana.
  // Con las dos, el año deja de aportar nada.
  //
  // El título clavado puede estar en el INTERNACIONAL y no en los dos que trae
  // la búsqueda: «West of the Tracks» es «铁西区» tanto de título como de título
  // original en TMDB, y su nombre inglés solo aparece en la traducción. Por eso
  // `tituloEnDe` —cuando quien llama lo da— se consulta solo de los candidatos
  // que no clavan por los otros dos, y solo en esta segunda vuelta.
  if (!tmdbId && !fallosRed && row.director) {
    const dentro = new Set(enVentana.map((c) => c.id));
    const fuera = candidatos.filter((x) => !dentro.has(x.id));
    const porTitulo = fuera.filter(tituloClavado);
    const porRevisar = [...porTitulo, ...fuera.filter((x) => !porTitulo.includes(x))];
    for (const c of porRevisar) {
      let clavaAqui = tituloClavado(c);
      if (!clavaAqui && tituloEnDe) {
        const en = normName(await tituloEnDe(c.id));
        // El título internacional puede llevar delante el original transcrito:
        // «Tie Xi Qu: West of the Tracks». Se acepta que lo CONTENGA, pero solo
        // en títulos largos — dejar que «M» o «Vertigo» casen por estar dentro
        // de otro título sería colar cualquier cosa.
        clavaAqui = deseados.some((w) => en === w || (w.length >= 8 && en.includes(w)));
      }
      if (!clavaAqui) continue;
      const dirs = await dirsDe(c.id);
      if (dirs === null) {
        fallosRed = true;
        break;
      }
      if (dirs === FICHA_FANTASMA) continue;
      if (dirs.length && directorsMatch(row.director, dirs)) {
        tmdbId = c.id;
        break;
      }
    }
  }

  // La misma segunda vuelta para las filas SIN director, pero CON EL AÑO
  // PUESTO. Aquí no hay dirección que verificar, así que el año no es un
  // detalle que se pueda soltar: es la otra mitad de la prueba. Sin acotarlo,
  // «In the Light of the Moon» (Sitges 2000, que es el otro nombre de «Ed
  // Gein») se emparejó con una película de 2025 que se llama igual, y el
  // «Ringu» de 1999 con la versión de televisión de 1995. Las dos con título
  // clavado y equipo acreditado: exactamente lo que se les pedía.
  //
  // La ventana de esta vuelta es ASIMÉTRICA y sale de lo que un palmarés puede
  // decir: un premio de 1972 no puede haberlo ganado una película que aún no
  // existe (+1 por el estreno comercial que sigue al festival), y hacia atrás
  // caben los años que un festival tarda en enseñar una película de fuera —«The
  // Cremator» es de 1969 y ganó Sitges en 1972—. Más allá de eso, mejor sin
  // ficha: es la regla de la casa y aquí no hay nada más que la sostenga.
  const ATRAS_SIN_DIRECTOR = 3;
  if (!tmdbId && !fallosRed && !row.director && Number.isFinite(year)) {
    const dentro = new Set(enVentana.map((c) => c.id));
    const cerca = candidatos.filter((x) => {
      if (dentro.has(x.id) || !x.date) return false;
      const d = Number(x.date.slice(0, 4)) - year;
      return d <= 1 && d >= -ATRAS_SIN_DIRECTOR;
    });
    // el año más cercano primero: si dos fichas se llaman igual dentro del
    // margen, la del año del premio se parece más a lo que dice la fila
    cerca.sort((a, b) => distAño(a) - distAño(b));
    for (const c of cerca) {
      let clavaAqui = tituloClavado(c);
      if (!clavaAqui && tituloEnDe) clavaAqui = clava(await tituloEnDe(c.id));
      if (!clavaAqui) continue;
      const dirs = await dirsDe(c.id);
      if (dirs === null) {
        fallosRed = true;
        break;
      }
      if (dirs === FICHA_FANTASMA) continue;
      if (dirs.length) {
        tmdbId = c.id;
        break;
      }
    }
  }

  // ÚLTIMA VUELTA CON PRUEBA: ¿y si la columna no era de dirección?
  //
  // La tabla del Guldbagge titula su columna «Director(s)» y en los años
  // recientes mete PRODUCTORES: «Triangle of Sadness» sale con Erik Hemmendorff
  // y Philippe Bober, que son sus productores, y ningún director casaba jamás.
  // Con la película más conocida del palmarés quedándose sin ficha, la
  // alternativa a esto era darla por perdida.
  //
  // No afloja la regla de oro —mejor sin ficha que la ficha de otra—, porque
  // sigue habiendo DOS pruebas: el título tiene que ser clavado (ni «contiene»
  // ni internacional) y el nombre tiene que estar acreditado de verdad en esa
  // ficha, en producción o en guion. Que otra película del mismo título y del
  // mismo año tenga en su equipo a alguien que se llama igual es mucho pedir.
  if (!tmdbId && !fallosRed && row.director && equipoDe) {
    for (const c of enVentana.filter(tituloClavado)) {
      const equipo = await equipoDe(c.id);
      if (equipo === null) {
        fallosRed = true;
        break;
      }
      if (equipo === FICHA_FANTASMA) continue;
      if (equipo.length && directorsMatch(row.director, equipo)) {
        tmdbId = c.id;
        porEquipo = true; // quien llama sabrá que la celda NO traía dirección
        break;
      }
    }
  }

  // Solo si NADIE con créditos lo demostró (y sin cortes de red a medias),
  // valen las fichas sin equipo por título clavado — las recién anunciadas.
  // El título clavado se exige SIEMPRE: en las filas sin director era la única
  // prueba disponible y ni esa se pedía.
  if (!tmdbId && !fallosRed) {
    const c = sinCreditos.find((x) => (row.director ? tituloClavado(x) : tituloBastaSinDirector(x)));
    if (c) tmdbId = c.id;
  }
  return { tmdbId, fallosRed, porEquipo };
}

/**
 * ÚLTIMO RECURSO: buscar la película DENTRO DE LA FILMOGRAFÍA DE SU DIRECTOR.
 *
 * Idea de Ramón, y resuelve los dos casos que la búsqueda por título no puede:
 *
 *  - **«West of the Tracks»**: TMDB tiene la película, pero acredita a su
 *    director como «王兵» y no como «Wang Bing», así que la verificación por
 *    nombre no tenía con qué comparar y la descartaba. Llegando por su
 *    filmografía, la dirección está demostrada por construcción: no hay ningún
 *    nombre que comparar.
 *  - **«The Intruder»**: hay una docena de películas que se llaman así y
 *    «L'Intrus» de Claire Denis no está entre las que devuelve el buscador.
 *    Su filmografía sí la tiene.
 *
 * Solo se llama cuando el emparejado por título ya ha fracasado, así que su
 * coste —una búsqueda de persona y una filmografía, ambas cacheadas— lo paga
 * únicamente lo que de otro modo se quedaría sin ficha.
 */
export async function peliculaPorDirector({ title, year, director }, { personasPosibles, creditosDe, tituloIngles }) {
  if (!director || !Number.isFinite(year)) return null;
  const buscado = normName(title);
  const nombres = splitDirectors(director);
  // Se prueban VARIAS personas por nombre, no solo la más popular: hay cuatro
  // «Wang Bing» en TMDB y el de «West of the Tracks» no es el más conocido.
  // Aquí el título desambigua a la persona y la persona desambigua la
  // película, que es más fuerte que cualquiera de las dos por separado.
  const personas = [];
  for (const nombre of nombres) personas.push(...(await personasPosibles(nombre)));
  for (const persona of personas) {
    let credits = null;
    try {
      credits = await creditosDe(persona.id);
    } catch {
      continue; // un fallo con una persona no puede tumbar la fila entera
    }
    const dirigidas = (credits?.crew || []).filter((c) => c.job === 'Director' && !c.video && c.release_date);
    if (!dirigidas.length) continue;
    const distancia = (c) => Math.abs(Number(String(c.release_date).slice(0, 4)) - year);

    // 1) El título, en TODA su filmografía y SIN ventana de año. Aquí la
    //    dirección ya está demostrada por construcción —estamos dentro de su
    //    filmografía—, así que el año deja de ser necesario: «West of the
    //    Tracks» es 2002 para el BFI y 2004 para TMDB, dos años de diferencia
    //    que dejaban fuera a la única película que podía ser.
    // misma tolerancia de letras dobladas que el título clavado del emparejado
    // general (y con el mismo cuerpo mínimo: «Anna» ≠ «Ana»): la errata de una
    // fuente no puede esconder la película
    const plegado = (s) => String(s || '').replace(/([a-z])\1+/g, '$1');
    const clava = (s) =>
      normName(s) === buscado || (buscado.length >= 5 && plegado(normName(s)) === plegado(buscado));
    const porTitulo = dirigidas.filter((c) => clava(c.title) || clava(c.original_title));
    if (porTitulo.length) return porTitulo.sort((a, b) => distancia(a) - distancia(b))[0].id;

    // 2) El título internacional en inglés, que es como está escrito el canon.
    //    Se pide solo de las suyas más cercanas en el tiempo: pedirlo de la
    //    filmografía entera de alguien prolífico son decenas de llamadas.
    const cercanas = dirigidas.filter((c) => distancia(c) <= 4).sort((a, b) => distancia(a) - distancia(b)).slice(0, 12);
    for (const c of cercanas) {
      const en = await tituloIngles(c.id);
      if (en && (normName(en) === buscado || normName(en).includes(buscado))) return c.id;
    }

    // Y NO hay regla 3. La tentación era aceptar «la única película suya de ese
    // año», y es exactamente como «Twin Peaks: The Return» —que es una SERIE y
    // no tiene ficha de película— acabó emparejada con «Trial», otro trabajo de
    // Lynch. Que alguien dirigiera una sola cosa ese año no dice nada sobre el
    // título que buscamos: sigue mandando «mejor sin ficha que la ficha de
    // otra», que es la regla que costó tres versiones aprender.
  }
  return null;
}

export async function resolveFilms(rows, yearOf) {
  const films = new Array(rows.length);
  let errors = 0; // fallos de RED (429 de TMDB…): quien llama no debe cachear
  // correcciones manuales del usuario: mandan sobre todo lo demás
  const overrides = new Map(
    db.prepare('SELECT key, tmdb_id FROM match_overrides').all().map((o) => [o.key, o.tmdb_id])
  );
  // para desempatar dobles legítimos (Fanny y Alexander cine vs TV, ambos de
  // Bergman): entre candidatos verificados, gana el que YA está en tu Plex
  const inLib = liveSets().inLib;
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= rows.length) return;
      const r = rows[idx];
      const y = yearOf(r);

      // Una serie no tiene ficha de película en TMDB y nunca la va a tener:
      // buscarla en cada reconstrucción era gastar búsquedas para acabar en el
      // mismo «sin ficha» — y encima contaba como fallo del emparejado.
      if (r.tv) {
        films[idx] = { ...r, tmdb_id: null, poster_path: null, date: null, year: r.year ?? null };
        continue;
      }

      // Emparejado verificado YA cacheado (30 días): ni búsquedas ni créditos.
      // Clave: sin esto, un palmarés grande con un solo 429 no se cacheaba
      // entero y CADA visita relanzaba la ráfaga completa contra TMDB — que
      // volvía a cortar. Con la caché por película, cada reintento solo toca
      // lo que falló y converge en un par de cargas.
      const claveBase = festivalOverrideKey(r.title, y, r.director);
      // v3: la entrada guarda también poster_path y date. Antes solo llevaba
      // {id} y reconstruir la página caducada pedía movieSummary de CADA
      // película: en las 1001, mil GETs a TMDB para repetir lo ya sabido.
      // v4: y la dirección corregida de las fichas rescatadas por el equipo.
      // v5: para las filas SIN director, el año vuelve a contar (ventana
      // asimétrica de tres años atrás y uno adelante) y una ficha sin fecha ya
      // no es candidata. Sin subir esto sobrevivirían los aciertos falsos que
      // destapó Sitges: «In the Light of the Moon» en una película de 2025.
      // OJO: esta caché dura un AÑO y NO la barre el bump de `festival`, así
      // que cuando cambian las reglas del emparejado hay que subir ESTE número
      // o los aciertos viejos —«Smultronstället» emparejado con su making-of—
      // sobreviven a la versión nueva.
      const matchKey = `film_match:v5:${claveBase}`;
      // corrección manual: ni búsqueda ni verificación, lo que dijo el usuario
      const override = overrides.has(claveBase) ? overrides.get(claveBase) : undefined;
      // Un año de vida, MUY por encima de los 30 días de la página: «este
      // título, de este año, de esta dirección» es la misma película para
      // siempre. Cuando ambos TTL coincidían, al mes caducaba todo a la vez y
      // reconstruir un palmarés repetía la verificación completa —cientos de
      // llamadas en ráfaga—, que es justo lo que dispara los 429. Las
      // correcciones siguen entrando por match_overrides, y si cambian las
      // reglas del emparejado se sube la versión en cache-versions.js.
      const matchHit = override !== undefined ? { id: override } : cacheRead(matchKey, 365 * DAY);
      if (matchHit?.id) {
        // si la entrada ya trae el cartel y la fecha (v3), no hay nada que
        // pedir; movieSummary queda de respaldo para overrides y entradas
        // guardadas antes de tener los dos campos
        let sum = 'poster_path' in matchHit ? { poster_path: matchHit.poster_path, date: matchHit.date } : null;
        if (!sum) {
          try {
            sum = await movieSummary(matchHit.id);
          } catch {
            errors++; // ficha coja por la red: que no se cachee la página y se reintente
          }
        }
        // La dirección corregida (ver `direccionReal`) viaja en la entrada. Si
        // la fila no la trae y la entrada tampoco —porque se guardó antes de
        // que se rellenara—, se completa aquí y se reescribe: si no, el David
        // di Donatello se quedaba sin un solo nombre hasta que caducara una
        // caché de un año.
        let director = matchHit.director || r.director;
        if (!director) {
          const reales = await movieDirectors(matchHit.id).catch(() => null);
          if (reales?.length) {
            director = reales.join(', ');
            if (override === undefined) cacheWrite(matchKey, { ...matchHit, director });
          }
        }
        films[idx] = {
          ...r,
          director,
          tmdb_id: matchHit.id,
          poster_path: sum?.poster_path || null,
          date: sum?.date || null,
          year: r.year ?? (sum?.date ? Number(sum.date.slice(0, 4)) : null),
        };
        continue;
      }

      // filas con TMDB id de origen (dataset de Wikidata o palmarés empaquetado):
      // nada que verificar.
      if (r.tmdb_id) {
        // …pero SÍ hay que ponerle nombre a la dirección. Los palmareses que
        // vienen dentro de la app salen de tablas sin columna de dirección
        // (Sundance lista en viñetas, Sitges pone cuatro premios en columnas,
        // el Donatello acredita productores): sus filas llegan con id y sin
        // ningún nombre, y esta rama —la más corta— era la única que no lo
        // rellenaba desde TMDB. Resultado: media «Lo mejor del año» con la
        // estrella de seguir en blanco. La ficha con créditos se pide PRIMERO
        // porque `movieSummary` reaprovecha ese superset y así no cuesta una
        // petición de más.
        let dirs = null;
        if (!r.director) {
          dirs = await movieDirectors(r.tmdb_id).catch((e) => (esFichaFantasma(e) ? [] : null));
          if (dirs === null) errors++; // fallo de red: que no se cachee sin nombres
        }
        let sum = null;
        try {
          sum = await movieSummary(r.tmdb_id);
        } catch {
          errors++;
        }
        films[idx] = {
          ...r,
          director: r.director || (dirs?.length ? dirs.join(', ') : null),
          poster_path: sum?.poster_path || null,
          date: sum?.date || null,
          year: r.year ?? (sum?.date ? Number(sum.date.slice(0, 4)) : null),
        };
        continue;
      }

      const cands = [...(await searchMovieCandidates(r.title, y))];
      if (r.original_title && r.original_title !== r.title) {
        const vistos = new Set(cands.map((c) => c.id));
        for (const c of await searchMovieCandidates(r.original_title, y)) {
          if (!vistos.has(c.id)) cands.push(c);
        }
      }
      let { tmdbId, fallosRed, porEquipo } = await elegirCandidato(
        r, y, cands, inLib,
        // un 404 es una ficha fantasma (saltar), cualquier otro fallo es red (abortar)
        (id) => movieDirectors(id).catch((e) => (esFichaFantasma(e) ? FICHA_FANTASMA : null)),
        (id) => englishTitle(id).catch(() => null),
        (id) => movieCrewNames(id).catch((e) => (esFichaFantasma(e) ? FICHA_FANTASMA : null))
      );
      // por título no ha salido: se prueba por la filmografía de su director
      if (!tmdbId && !fallosRed && r.director) {
        tmdbId = await peliculaPorDirector(
          { title: r.title, year: y, director: r.director },
          {
            personasPosibles: (n) => searchPersonCandidates(n),
            creditosDe: (id) => personCredits(id),
            tituloIngles: (id) => englishTitle(id),
          }
        );
      }
      let sum = null;
      let fichaCoja = false;
      if (tmdbId) {
        try {
          sum = await movieSummary(tmdbId);
        } catch {
          fichaCoja = true; // ficha coja: no cachear la página, reintentar luego
        }
      }
      // Si la ficha se rescató por el EQUIPO, la celda de Wikipedia no traía
      // dirección por mucho que su cabecera dijera «Director(s)»: eran los
      // productores. La dirección buena es la de TMDB — «Paradise Is Burning»
      // salía firmada por su productor, Nima Yousefi, y la dirige Mika
      // Gustafson. Va también a la caché por película, que dura un año: si no,
      // volvía el nombre malo en cuanto caducara la página.
      // ...y también cuando la fila NO trae dirección: el David di Donatello
      // lista productores, y las filas que salen del artículo de una edición
      // suelta tampoco la traen. Sin esto se quedaban sin nombre que enseñar y
      // sin estrella que pulsar. La ficha ya está pedida (la usó el emparejado),
      // así que no cuesta una petición más.
      let direccionReal = null;
      if (tmdbId && !fallosRed && (porEquipo || !r.director)) {
        const reales = await movieDirectors(tmdbId).catch(() => null);
        if (reales?.length) direccionReal = reales.join(', ');
      }
      // el emparejado limpio se guarda por película: los reintentos tras un
      // corte de red solo tocan lo que falló. Con la ficha a mano se guardan
      // también cartel y fecha; coja, solo el id (el hit los completará)
      if (tmdbId && !fallosRed) {
        const guardar = sum
          ? { id: tmdbId, poster_path: sum.poster_path || null, date: sum.date || null }
          : { id: tmdbId };
        if (direccionReal) guardar.director = direccionReal;
        cacheWrite(matchKey, guardar);
      }
      if (fallosRed || fichaCoja) errors++;
      films[idx] = {
        ...r,
        director: direccionReal || r.director,
        tmdb_id: tmdbId,
        poster_path: sum?.poster_path || null,
        date: sum?.date || null,
        // en el palmarés `year` ya es el del premio y se respeta; en una
        // edición no viene y se toma el de estreno de TMDB
        year: r.year ?? (sum?.date ? Number(sum.date.slice(0, 4)) : null),
      };
    }
  }
  // el mismo límite que el propio cliente de TMDB: con menos workers, la carga
  // en frío de un canon grande (las 1001 son ~71 s con 5) tarda el doble sin
  // proteger a TMDB de nada — el limitador de tmdb.js ya frena lo que sobre
  await Promise.all(Array.from({ length: TMDB_CONCURRENCY }, worker));
  return { films, errors };
}

// --- edición de un festival ----------------------------------------------------

/**
 * Solo la parte de Wikipedia de una edición: la tabla de la sección oficial ya
 * parseada, SIN casar nada contra TMDB. La usan buildEdition (que después
 * resuelve las fichas) y el agregado de directores habituales (al que le
 * bastan los nombres tal cual vienen de la tabla).
 */
async function fetchSelectionRows(key, f, year) {
  if (f.onlyWinners || f.awardNominees) throw new Error(`${f.name} no tiene sección oficial por año.`);
  const special = SPECIAL_EDITIONS[`${key}:${year}`];
  if (special?.unavailable) throw new Error(special.unavailable);
  const sectionRe = special?.section || f.section;

  const page = f.article(year);
  // el mismo síntoma significa cosas distintas según el año: hacia delante,
  // programa aún sin publicar; hacia atrás, edición que no se celebró
  const sinEdicion =
    year >= new Date().getFullYear()
      ? `Wikipedia aún no tiene el programa de ${f.name} ${year}. Vuelve cuando se anuncie la selección.`
      : `Wikipedia no tiene la edición de ${f.name} de ${year}: seguramente ese año no se celebró.`;
  let meta;
  try {
    meta = await wikiParse({ page, prop: 'sections' });
  } catch (err) {
    if (/doesn'?t exist|missingtitle/i.test(String(err.message || ''))) throw new Error(sinEdicion);
    throw err;
  }
  // «Main Competition» puede aparecer tres veces en el mismo artículo (jurado,
  // sección oficial, palmarés): fuera los jurados, y del resto se queda la
  // primera candidata que tenga una tabla de películas de verdad. El palmarés
  // no cuela porque la sección oficial siempre va antes en el artículo.
  const candidates = (meta.sections || []).filter(
    (s) => sectionRe.test(stripTags(s.line)) && !/jur/i.test(stripTags(s.line))
  );
  if (!candidates.length) {
    throw new Error(
      year >= new Date().getFullYear()
        ? `No se encontró la sección de competición en «${page}» de Wikipedia. Puede que esa edición aún no tenga el programa publicado.`
        : `El artículo «${page}» de Wikipedia no tiene sección de competición: esa edición pudo no celebrarse o quedarse sin competición (pasó en los años de la pandemia).`
    );
  }
  let rows = [];
  let sec = candidates[0];
  for (const cand of candidates) {
    const parsed = await wikiParse({ page, section: String(cand.index), prop: 'text' });
    const r = parseSelectionTable(parsed.text, { all: !!special?.allTables });
    if (r.length) {
      rows = r;
      sec = cand;
      break;
    }
  }
  if (!rows.length) {
    throw new Error(`Las secciones de competición de «${page}» no tienen una tabla de películas reconocible.`);
  }
  return { rows, section: stripTags(sec.line), note: special?.note || null, page };
}

async function buildEdition(key, f, year) {
  // los premios sí tienen «edición por año»: sus nominadas
  if (f.awardNominees) return buildAwardYear(key, f, year);
  if (f.onlyWinners) throw new Error(`${f.name} no tiene ediciones por año: mira su palmarés.`);
  const { rows, section, note, page } = await fetchSelectionRows(key, f, year);

  // resolver cada título contra TMDB, verificando la dirección
  const { films, errors } = await resolveFilms(rows, () => year);

  // LA GANADORA, marcada y la primera. Es lo primero que se busca al abrir una
  // edición, y hasta ahora había que irse al palmarés a mirarla. Sale de las
  // filas del premio, que ya están cacheadas; las secciones sin palmarés
  // (Busan, Horizontes, las de debut) simplemente no marcan ninguna.
  try {
    const delAño = (await winnersRowsLight(key)).filter((w) => Math.abs(Number(w.year) - year) <= 1);
    for (const f of films) {
      const t = normName(f.title);
      const o = normName(f.original_title || '');
      if (delAño.some((w) => (t && normName(w.title) === t) || (o && normName(w.original_title || '') === o))) {
        f.winner = true;
      }
    }
    // estable: solo sube la ganadora, el resto conserva el orden de la tabla
    films.sort((a, b) => (b.winner ? 1 : 0) - (a.winner ? 1 : 0));
  } catch {
    // sin palmarés utilizable la edición se sirve igual, sin marcar a nadie
  }

  return {
    festival: key,
    name: f.name,
    award: f.award,
    year,
    section,
    note,
    source: wikiUrl(page),
    fetchedAt: Date.now(),
    films,
    unresolved: films.filter((x) => !x.tmdb_id && !x.tv).length, // una serie sin ficha no es un fallo del emparejado
    resolveErrors: errors,
  };
}

/**
 * La edición de un festival, cacheada: las pasadas son inmutables (180 días),
 * la del año en curso se rehace a diario porque Wikipedia completa las tablas
 * durante semanas tras el anuncio. Lo vivo (la tienes, vista, notas) se añade
 * al leer, nunca se cachea.
 */
export async function festivalEdition(key, year, { refresh = false } = {}) {
  const f = REGISTRY[key];
  if (!f) throw new Error('Festival desconocido');
  const y = Number(year);
  const nowYear = new Date().getFullYear();
  if (!y || y < f.sinceYear || y > nowYear + 1) {
    throw new Error(`${f.name} no tiene esta sección antes de ${f.sinceYear} (ni ediciones futuras).`);
  }

  const cacheKey = `${cachePrefix('festival')}:${key}:${y}`;
  let base = refresh ? null : cacheRead(cacheKey, y < nowYear ? 180 * DAY : DAY);
  if (!base) {
    base = await buildEdition(key, f, y);
    // un resultado con fallos de red (429 de TMDB en plena ráfaga) NO se
    // cachea: la siguiente visita lo reintenta y el hueco se cura solo
    if (!base.resolveErrors) cacheWrite(cacheKey, base);
  }

  return { ...base, films: await decorateLive(base.films) };
}

/**
 * La vigía: ¿alguno de los festivales ya tiene publicada la sección de su
 * edición en curso (o la del año que viene, para los de enero)? La primera vez
 * que aparece se apunta como novedad — con deep-link a la edición, donde ya
 * esperan los botones de «seguir a todos» y «mandar a Radarr». El INSERT OR
 * IGNORE sobre (type, ref) evita repetir el aviso cada noche.
 */
export async function watchFestivalEditions() {
  const nowYear = new Date().getFullYear();
  const ins = db.prepare(
    `INSERT OR IGNORE INTO app_events (type, ref, title, body, url, created_at)
     VALUES ('festival_edition', ?, ?, ?, ?, ?)`
  );
  const vistos = new Set(
    db.prepare(`SELECT ref FROM app_events WHERE type = 'festival_edition'`).all().map((r) => r.ref)
  );
  let checked = 0;
  let found = 0;
  for (const [key, f] of Object.entries(REGISTRY)) {
    if (f.onlyWinners) continue;
    for (const y of [nowYear, nowYear + 1]) {
      if (y < f.sinceYear) continue;
      const ref = `${key}:${y}`;
      if (vistos.has(ref)) continue;
      checked++;
      try {
        const ed = await festivalEdition(key, y);
        if (ed.films.length) {
          ins.run(
            ref,
            `🎪 ${f.name} ${y}: sección oficial publicada`,
            `${ed.films.length} películas en «${ed.section}». Desde Festivales puedes seguir a toda su dirección o mandarlas a Radarr.`,
            `/festivales?f=${key}&y=${y}`,
            Date.now()
          );
          found++;
        }
      } catch {
        // aún sin programa (o Wikipedia caída): se reintenta en el siguiente pase
      }
    }
  }
  return { checked, found };
}

// Lo vivo (la tienes, vista, notas) se calcula al leer, nunca se cachea.
//
// Pero sus dos ingredientes pesados sí se memoizan 60 segundos: en el Beelink,
// el set de «ya en tu Plex» y el índice de vistas son ~12.400 filas CADA UNO,
// y se estaban montando de cero en cada visita a cualquier palmarés. Un minuto
// basta para que pasear por los festivales no lo repita, y es lo bastante
// corto para que un sync de Plex o un import de Letterboxd se noten solos, sin
// tener que avisar desde plex.js/letterboxd.js de que invaliden nada.
const LIVE_SETS_TTL = 60 * 1000;
let liveSetsMemo = { at: 0, inLib: null, widx: null };
function liveSets() {
  if (Date.now() - liveSetsMemo.at > LIVE_SETS_TTL) {
    liveSetsMemo = {
      at: Date.now(),
      inLib: new Set(db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id)),
      widx: watchedIndex(),
    };
  }
  return liveSetsMemo;
}

async function decorateLive(films) {
  const { inLib, widx } = liveSets();
  const out = films.map((x) => ({
    ...x,
    owned: x.tmdb_id ? inLib.has(x.tmdb_id) : false,
    watched: isWatched({ tmdb_id: x.tmdb_id, title: x.title, year: x.year }, widx),
  }));
  // Las notas se sirven con lo que YA hay en mdb_ratings: pedir las que faltan
  // aquí bloqueaba la respuesta ~300 ms y quemaba 50 peticiones de MDBList por
  // visita. Las ausentes se piden al colgar, fuera de la respuesta —el fetch
  // las deja guardadas en la tabla y la SIGUIENTE visita ya las trae; la
  // interfaz tolera films sin f.mdb.
  await enrichWithScores(out, { fetchMissing: false });
  const sinNota = out.filter((x) => x.tmdb_id && !x.mdb).map((x) => ({ tmdb_id: x.tmdb_id }));
  if (sinNota.length) {
    setImmediate(() => {
      enrichWithScores(sinNota, { maxFetch: 50 }).catch(() => {});
    });
  }
  return out;
}

/**
 * Las filas ya parseadas de un artículo-lista, cacheadas UN DÍA.
 *
 * Sin esto, cada año que miras de un premio vuelve a descargar el artículo
 * entero: pasear diez años del Goya eran diez descargas del mismo texto, y en
 * Goya y BAFTA la sección «Winners» llega vacía y cae al respaldo de página
 * completa, que es la llamada más pesada. Peor aún, la vigía nocturna prueba
 * cada noche los premios del año en curso y el siguiente, y los años sin
 * nominadas publicadas lanzan sin cachear nada: esas descargas se repetían
 * todas las noches durante meses.
 *
 * Un día de vida mantiene vivo lo único que se mueve (las nominadas del año en
 * curso, que Wikipedia va completando).
 */
const AWARD_ROWS_TTL = DAY;

/**
 * EL PALMARÉS EMPAQUETADO CON LA APP.
 *
 * Los años cerrados no cambian: la Palma de 1978 es la de 1978 y su ficha de
 * TMDB es la misma hoy que dentro de diez años. Preguntarle eso a Wikipedia y a
 * TMDB en cada instalación nueva, cada vez que caduca una caché, es trabajo
 * tirado — y era el trabajo CARO: reconstruir los treinta palmareses son unas
 * cuatro mil búsquedas contra TMDB con su verificación de dirección, que es
 * justo el proceso que se ha ido puliendo versión a versión.
 *
 * Así que se guarda hecho. `snapshot-palmares.mjs` corre los parsers y el
 * emparejado de siempre sobre cada premio y escribe el resultado en
 * `data/palmares-*.js` con el `tmdb_id` ya resuelto, igual que el dataset del
 * Óscar lleva haciendo desde la 1.11. **Wikipedia se queda para lo que se
 * mueve**: cada premio dice hasta qué año está empaquetado y de ahí en adelante
 * —el año en curso, la temporada a medias, la edición recién fallada— manda la
 * fuente viva, exactamente igual que antes.
 *
 * Tres cosas que esto arregla de propina:
 *  - «Lo mejor del año» de un año viejo no toca la red: eran treinta artículos.
 *  - Si Wikipedia falla o le cambian el molde a una tabla, lo viejo se sigue
 *    sirviendo (el respaldo está en `getAwardRows`).
 *  - Las correcciones manuales del usuario siguen mandando sobre todo esto,
 *    porque se aplican después, en `resolveFilms`.
 *
 * Lo que hay que recordar: **un fallo empaquetado se queda hasta que se
 * regenere**, y lo que alguien arregle en Wikipedia sobre un año viejo no llega
 * solo. Se regenera con `npm run snapshot` en cada temporada de premios.
 */
const CLAVE_DE = new Map(Object.entries(REGISTRY).map(([k, f]) => [f, k]));

/** Una fila empaquetada, devuelta a su forma de siempre. */
const hidratar = (r) => ({
  year: r.y,
  title: r.t,
  original_title: r.o ?? r.t,
  director: r.d ?? null,
  country: r.c ?? null,
  tmdb_id: r.i ?? null,
  winner: !!r.w,
  ...(r.tv ? { tv: true } : {}),
  ...(r.r ? { rank: r.r } : {}),
  ...(r.x ? { tied: true } : {}),
});

/** Hasta qué año está empaquetado este premio (o null si no lo está). */
export const empaquetadoHasta = (key) => (Number.isFinite(PALMARES[key]?.hasta) ? PALMARES[key].hasta : null);

/** Las filas empaquetadas de un premio, o null si no hay. */
export function filasEmpaquetadas(key, { keepAll = false } = {}) {
  const snap = PALMARES[key];
  if (!snap?.rows?.length) return null;
  const rows = snap.rows.map(hidratar);
  return keepAll ? rows : rows.filter((r) => r.winner).map(({ winner, ...r }) => r);
}

async function cachedAwardRows(f, sufijo, build) {
  // el idioma va en la clave: dos artículos pueden llamarse igual en dos
  // Wikipedias y no ser la misma lista
  const key = `${cachePrefix('festival')}:awardrows:${sufijo}:${f.awardLang || 'en'}:${f.awardPage}`;
  const hit = cacheRead(key, AWARD_ROWS_TTL);
  if (hit?.rows) return hit.rows;
  const rows = await build();
  if (rows.length) cacheWrite(key, { rows });
  return rows;
}

/**
 * Filas del artículo-lista de un premio. La sección «Winners» suele incluir
 * sus décadas como subsecciones, pero en algunos artículos (Goya, BAFTA) son
 * secciones HERMANAS y la de Winners llega vacía: respaldo de página entera,
 * y que el parser descarte las tablas que no son de películas.
 */
async function getAwardRows(f, { keepAll = false, hasta = null, sinPaquete = false } = {}) {
  const key = sinPaquete ? null : CLAVE_DE.get(f);
  const empaquetadas = key ? filasEmpaquetadas(key, { keepAll }) : null;
  const corte = key ? empaquetadoHasta(key) : null;
  // El año que se pide ya está empaquetado: ni una petición a Wikipedia. Es lo
  // que hace que «Lo mejor de 1998» salga sin tocar la red.
  if (empaquetadas && hasta != null && corte != null && hasta <= corte) return empaquetadas;

  const vivas = async () => {
    const lang = f.awardLang || 'en';
    const meta = await wikiParse({ lang, page: f.awardPage, prop: 'sections' });
    const sec = (meta.sections || []).find((s) => f.awardSection.test(stripTags(s.line)));
    if (!sec) throw new Error(`No se encontró la lista de ganadoras en «${f.awardPage}» de Wikipedia.`);
    const parsed = await wikiParse({ lang, page: f.awardPage, section: String(sec.index), prop: 'text' });
    const opciones = { keepAll, sinDirector: !!f.awardSinDirector, columnas: f.awardColumns || null };
    let rows = parseWinnersTables(parsed.text, opciones);
    if (!rows.length) {
      const full = await wikiParse({ lang, page: f.awardPage, prop: 'text' });
      rows = parseWinnersTables(full.text, opciones);
    }
    return conEdicionesRecientes(f, rows, keepAll);
  };

  if (!empaquetadas) return cachedAwardRows(f, keepAll ? 'todas' : 'ganadoras', vivas);

  return cachedAwardRows(f, keepAll ? 'todas' : 'ganadoras', async () => {
    let recientes;
    try {
      recientes = await vivas();
    } catch (err) {
      // Wikipedia caída, artículo movido, molde cambiado: lo empaquetado se
      // sigue sirviendo. Antes de tener esto, cualquiera de las tres dejaba el
      // palmarés entero en un mensaje de error.
      return empaquetadas;
    }
    // Cada tramo, de su fuente: lo cerrado del paquete —con su `tmdb_id` ya
    // resuelto— y lo que va después, de Wikipedia.
    return [...recientes.filter((r) => Number(r.year) > corte), ...empaquetadas];
  });
}

// Hasta dos años por delante de lo que llegue la lista: uno es el premio recién
// fallado que nadie ha volcado todavía, y el segundo cubre el año que se saltó.
// Más atrás no hay nada que rescatar y solo serían peticiones a artículos que
// no existen.
const ANIOS_DE_RESPALDO = 2;

/**
 * La lista del premio, rematada con las ediciones que aún no le han volcado.
 *
 * Regla de la casa (pedida por Ramón): manda el artículo-lista, pero si se ha
 * quedado atrás se mira la edición suelta de los años que faltan. Solo se
 * consulta lo que la lista NO tiene, así que en cuanto alguien la actualice
 * estas peticiones dejan de hacerse solas.
 *
 * Va aquí dentro, en `getAwardRows`, para que lo aproveche todo lo que cuelga
 * de él: el palmarés, las nominadas por año y «Lo mejor del año».
 */
async function conEdicionesRecientes(f, rows, keepAll) {
  if (!f.editionArticle || !rows.length) return rows;
  const ultimo = Math.max(...rows.map((r) => r.year));
  const hasta = Math.min(new Date().getFullYear(), ultimo + ANIOS_DE_RESPALDO);
  const extra = [];
  for (let y = ultimo + 1; y <= hasta; y++) {
    let parsed = null;
    try {
      parsed = await wikiParse({ page: f.editionArticle(y), prop: 'text' });
    } catch {
      continue; // esa edición aún no tiene artículo: nada que rescatar
    }
    const filas = parseEditionRows(parsed.text, f.awardPage, y);
    if (!filas.length) continue;
    extra.push(
      ...(keepAll ? filas : filas.filter((r) => r.winner).map(({ winner, ...r }) => r))
    );
  }
  return extra.length ? [...extra, ...rows].sort((a, b) => b.year - a.year) : rows;
}

/** El artículo de Cahiers entero, parseado con su parser propio. */
async function getCahiersRows(f) {
  return cachedAwardRows(f, 'cahiers', async () => {
    const parsed = await wikiParse({ page: f.awardPage, prop: 'text' });
    const rows = parseCahiersTables(parsed.text);
    if (!rows.length) throw new Error(`El artículo «${f.awardPage}» no tiene listas anuales reconocibles.`);
    return rows;
  });
}

/**
 * La «edición» de un premio: todas las NOMINADAS de ese año, con la ganadora
 * marcada (🏆). Sale del mismo artículo-lista que el palmarés, sin el filtro
 * de sombreadas. Cahiers pasa por aquí también: su «edición» es el top 10
 * ordenado del año, con el puesto en vez de la bandera de ganadora.
 */
async function buildAwardYear(key, f, year) {
  const rows = f.staticAward
    ? f.staticAward.filter((r) => r.year === year)
    : f.awardParse === 'cahiers'
      ? (await getCahiersRows(f)).filter((r) => r.year === year)
      : (await getAwardRows(f, { keepAll: true, hasta: year })).filter((r) => r.year === year);
  if (!rows.length) {
    if (f.awardParse === 'cahiers' && year >= 1969 && year <= 1980) {
      throw new Error(`Cahiers no publicó top 10 entre 1969 y 1980: no hay lista de ${year}.`);
    }
    throw new Error(
      year >= new Date().getFullYear()
        ? `Wikipedia aún no lista ${f.awardParse === 'cahiers' ? 'el top 10' : 'las nominadas'} de ${f.name} ${year}.`
        : `Wikipedia no tiene ${f.awardParse === 'cahiers' ? 'top 10' : 'nominadas'} de ${f.name} en ${year}.`
    );
  }
  const { films, errors } = await resolveFilms(rows, () => year);
  return {
    festival: key,
    name: f.name,
    award: f.award,
    year,
    section: f.awardParse === 'cahiers' ? 'Top 10 del año' : 'Nominadas',
    note: null,
    source: f.staticAward
      ? 'https://www.wikidata.org/wiki/Q102427'
      : wikiUrl(f.awardPage, f.awardLang),
    fetchedAt: Date.now(),
    films,
    unresolved: films.filter((x) => !x.tmdb_id && !x.tv).length, // una serie sin ficha no es un fallo del emparejado
    resolveErrors: errors,
  };
}

/**
 * Filas de un dataset fijo empaquetado con la app (Sight & Sound, las 1001):
 * cada entrada trae su fuente y su nota en el REGISTRY. El `tmdb_id` puesto a
 * mano en el dataset tiene que sobrevivir al mapeo — resolveFilms lo usa para
 * saltarse la búsqueda entera— y ya se perdió una vez por no copiarlo aquí.
 */
export function staticListRows(f) {
  return f.staticList.map((r) => ({
    year: r.year, title: r.title, original_title: r.title, director: r.director, country: null, rank: r.rank,
    tmdb_id: r.tmdb_id || null,
    tv: !!r.tv, // una serie no tiene ficha de película: la interfaz lo dice
  }));
}

/**
 * El palmarés histórico del premio que clasifica (todas las ganadoras, de la
 * más reciente a la más antigua), desde el artículo del premio en Wikipedia.
 * Cacheado 30 días: solo cambia una vez al año.
 */
export async function festivalWinners(key, { refresh = false } = {}) {
  const f = REGISTRY[key];
  if (!f) throw new Error('Festival desconocido');
  if (!f.awardPage && !f.staticList && !f.staticAward) {
    throw new Error(
      `El palmarés de ${f.name} aún no tiene artículo utilizable en Wikipedia` +
        (key === 'busan' ? ' (el premio nació en 2025: mira la edición del 2025)' : '') +
        '.'
    );
  }
  const cacheKey = `${cachePrefix('festival')}:${key}:palmares`;
  let base = refresh ? null : cacheRead(cacheKey, 30 * DAY);
  if (!base) {
    let rows;
    let source = f.awardPage ? wikiUrl(f.awardPage, f.awardLang) : null;
    let note = null;
    if (f.staticAward) {
      // solo las ganadoras del dataset (las nominadas viven en la vista por año)
      rows = f.staticAward.filter((r) => r.winner);
      source = 'https://www.wikidata.org/wiki/Q102427';
      note = `Las ${rows.length} ganadoras de la historia; en «Nominadas por año» están las ${f.staticAward.length} candidatas completas.`;
    } else if (f.staticList) {
      rows = staticListRows(f);
      source = f.staticSource || source;
      note = f.staticNote || null;
    } else if (f.awardParse === 'cahiers') {
      // el «palmarés» de Cahiers: la número 1 de cada año, reciente primero
      // como el resto de palmareses
      rows = (await getCahiersRows(f))
        .filter((r) => r.rank === 1)
        .map(({ rank, tied, ...r }) => r)
        .sort((a, b) => b.year - a.year);
      note = 'La número 1 de cada año para la crítica de Cahiers; en «Top 10 por año» está la lista completa de cada año.';
    } else if (f.awardParse === 'sundanceList') {
      // la lista de Sundance va por años con viñetas: página entera de una vez.
      // El corte del palmarés es `awardSinceYear` si existe: el premio de EE UU
      // es de 1984 aunque su sección no se tabule por ediciones hasta 2005.
      const parsed = await wikiParse({ page: f.awardPage, prop: 'text' });
      rows = parseSundanceWinners(parsed.text, { ambito: f.sundanceAmbito || 'world' })
        .filter((r) => r.year >= (f.awardSinceYear ?? f.sinceYear));
    } else {
      rows = await getAwardRows(f);
    }
    if (!rows.length) throw new Error(`El artículo «${f.awardPage}» no tiene una lista de ganadoras reconocible.`);
    const { films, errors } = await resolveFilms(rows, (r) => r.year);
    base = {
      festival: key,
      name: f.name,
      award: f.award,
      note,
      source,
      fetchedAt: Date.now(),
      films,
      unresolved: films.filter((x) => !x.tmdb_id && !x.tv).length, // una serie sin ficha no es un fallo del emparejado
      resolveErrors: errors,
    };
    // con fallos de red no se cachea: se reintenta en la siguiente visita
    if (!base.resolveErrors) cacheWrite(cacheKey, base);
  }
  return { ...base, films: await decorateLive(base.films) };
}

// --- lo mejor del año ----------------------------------------------------------

// A Wikipedia se le piden los palmareses que falten de cuatro en cuatro: la
// primera visita a un año sin cachear son ~30 artículos, y una ráfaga de treinta
// peticiones a la vez se gana un 429 con toda la razón.
const ANUARIO_CONCURRENCY = 4;

/**
 * El corte transversal: quién ganó QUÉ en un año, en los treinta y tantos
 * palmareses a la vez. Es la vista que la página no tenía —se navegaba premio a
 * premio— y la que contesta de un vistazo «¿qué pasó en 2025?».
 *
 * Sale casi gratis de lo que ya hay: `winnersRowsLight` aprovecha el palmarés
 * completo si está cacheado y, si no, trae del artículo solo las filas (que
 * quedan cacheadas un día para todo el mundo). El emparejado contra TMDB pasa
 * por la misma caché por película que el resto, así que un año cuyos premios ya
 * se han mirado no gasta ni una búsqueda.
 *
 * Un premio que falle —artículo movido, red caída— no tumba el año: se queda
 * fuera con su motivo, y los que aún no han fallado ese año salen aparte como
 * `pendientes`, que en el año en curso es información y no un hueco.
 */
export async function festivalYear(year, { refresh = false } = {}) {
  if (!Number.isInteger(year)) throw new Error('Año no válido');
  const cacheKey = `${cachePrefix('festival')}:anuario:${year}`;
  // un año cerrado ya no cambia; el que corre y el que viene se van completando
  // a lo largo de la temporada de premios
  const ttl = year >= new Date().getFullYear() - 1 ? DAY : 30 * DAY;
  let base = refresh ? null : cacheRead(cacheKey, ttl);
  if (!base) {
    const claves = anuarioKeys();
    const traidas = await mapPool(claves, ANUARIO_CONCURRENCY, async (key) => {
      // el año que hay que buscar EN LA FUENTE: para casi todas es el mismo,
      // pero la tabla del César va por año de gala (ver `anuarioOffset`)
      const enFuente = year + (REGISTRY[key].anuarioOffset || 0);
      try {
        const filas = await winnersRowsLight(key, { hasta: enFuente });
        return { key, enFuente, rows: filas.filter((r) => Number(r.year) === enFuente) };
      } catch (err) {
        return { key, enFuente, rows: [], error: String(err.message || err) };
      }
    });

    // el emparejado, de una sola tacada para todo el año: así comparte pool y
    // caché en vez de resolverse premio a premio
    const planas = traidas.flatMap((x) => x.rows.map((r) => ({ key: x.key, r })));
    // el año del emparejado es el de la FILA, no el de la página: así la clave
    // (título + año + dirección) es la misma que en el palmarés y comparten
    // caché y correcciones manuales — con el desfase del César no lo sería
    const { films, errors } = await resolveFilms(planas.map((x) => x.r), (r) => r.year);
    const porEntrada = new Map();
    films.forEach((f, i) => {
      const k = planas[i].key;
      if (!porEntrada.has(k)) porEntrada.set(k, []);
      // La fila del César dice 2026 porque es su año de GALA, pero la película
      // es de 2025 y con ese año se pintaría la ficha. Manda el año de TMDB, y
      // el de la fila viaja aparte porque es el que forma la clave de las
      // correcciones manuales.
      // Fuera la bandera de ganadora: aquí TODAS lo son, cada una de lo suyo, y
      // el 🏆 solo sobre las que traen la bandera de su palmarés (el Óscar, que
      // viene de un dataset con nominadas) hacía parecer que las demás no.
      const { winner, ...pelicula } = f;
      porEntrada.get(k).push(
        REGISTRY[k].anuarioOffset
          ? { ...pelicula, matchYear: pelicula.year, year: pelicula.date ? Number(pelicula.date.slice(0, 4)) : year }
          : pelicula
      );
    });

    const entries = [];
    const pendientes = [];
    const fallos = [];
    for (const { key, enFuente, error } of traidas) {
      const f = REGISTRY[key];
      const suyas = porEntrada.get(key) || [];
      if (error) fallos.push({ key, name: f.name, error });
      else if (suyas.length) {
        entries.push({
          key,
          name: f.name,
          award: f.award,
          group: f.group || 'festival',
          // solo cuando la fuente lo indexa por otro año (César): la interfaz
          // lo dice en vez de dejar que parezca un error
          galaYear: enFuente === year ? null : enFuente,
          films: suyas,
        });
      } else if (enFuente >= (f.awardSinceYear ?? f.sinceYear ?? 0)) {
        // dentro de su historia pero sin ganadora: o no se ha fallado todavía
        // (el año en curso) o Wikipedia aún no lo ha escrito
        pendientes.push({ key, name: f.name });
      }
    }
    base = {
      year,
      entries,
      pendientes,
      fallos,
      total: entries.reduce((n, e) => n + e.films.length, 0),
      fetchedAt: Date.now(),
      unresolved: films.filter((x) => !x.tmdb_id && !x.tv).length,
      resolveErrors: errors,
    };
    // con fallos de red no se cachea: se reintenta en la siguiente visita
    if (!errors) cacheWrite(cacheKey, base);
  }
  // lo vivo (tengo/vista/notas) se pega al servir, como en el resto de vistas
  const planas = await decorateLive(base.entries.flatMap((e) => e.films));
  let i = 0;
  return { ...base, entries: base.entries.map((e) => ({ ...e, films: e.films.map(() => planas[i++]) })) };
}

// --- directores habituales de la última década ---------------------------------

// Los tres grandes con competición estable y peso real de autor: para sugerir
// «a quién seguir», Cannes, Venecia y Berlín son el radar.
const DECADE_FESTIVALS = ['cannes', 'venecia', 'berlinale'];

/**
 * Filas de una edición SIN tocar TMDB: si la edición completa ya está en caché
 * se aprovechan sus películas (llevan director), y si no se trae solo la tabla
 * de Wikipedia y se guarda cruda 180 días. El agregado de una década no puede
 * permitirse resolver ~600 fichas contra TMDB solo para contar nombres.
 */
export async function editionRowsLight(key, f, year) {
  const full = cacheRead(`${cachePrefix('festival')}:${key}:${year}`, 180 * DAY);
  if (full?.films?.length) return full.films;
  const rawKey = `${cachePrefix('festival')}:raw:${key}:${year}`;
  const hit = cacheRead(rawKey, 180 * DAY);
  if (hit?.rows) return hit.rows;
  const { rows } = await fetchSelectionRows(key, f, year);
  cacheWrite(rawKey, { rows });
  return rows;
}

/**
 * El palmarés SIN tocar TMDB: solo las filas del artículo (o del dataset), que
 * es todo lo que hace falta para saber QUIÉN ganó QUÉ y en qué año.
 *
 * Existe por lo mismo que `editionRowsLight`: el detector de emergentes cruza
 * doce palmareses para marcar las ganadoras y no puede permitirse resolver
 * cientos de fichas contra TMDB para comparar nombres. Si el palmarés completo
 * ya está cacheado se aprovecha; si no, las filas crudas cuestan una llamada a
 * Wikipedia que además queda cacheada un día para todo el mundo.
 */
export async function winnersRowsLight(key, { hasta = null } = {}) {
  const f = REGISTRY[key];
  if (!f) return [];
  // el año que se pide ya está empaquetado con la app: ni caché ni red
  const corte = empaquetadoHasta(key);
  if (hasta != null && corte != null && hasta <= corte) return filasEmpaquetadas(key) || [];
  const full = cacheRead(`${cachePrefix('festival')}:${key}:palmares`, 30 * DAY);
  if (full?.films?.length) return full.films;
  if (f.staticAward) return f.staticAward.filter((r) => r.winner);
  if (f.staticList) return [];
  if (!f.awardPage) return []; // Busan, Horizontes y las secciones de debut
  if (f.awardParse === 'cahiers') return (await getCahiersRows(f)).filter((r) => r.rank === 1);
  if (f.awardParse === 'sundanceList') {
    const parsed = await wikiParse({ page: f.awardPage, prop: 'text' });
    return parseSundanceWinners(parsed.text, { ambito: f.sundanceAmbito || 'world' });
  }
  return getAwardRows(f);
}

/**
 * Las filas de un premio traídas SIEMPRE de la fuente viva, sin mirar el
 * paquete. La usa `snapshot-palmares.mjs` y solo ella: si el generador leyera
 * el paquete anterior, regenerar no traería nunca nada nuevo.
 */
export async function filasVivasDePremio(key, { keepAll = true } = {}) {
  const f = REGISTRY[key];
  if (!f) return [];
  if (f.staticAward) return f.staticAward; // ya es un dataset: no se reempaqueta
  if (f.staticList) return [];
  if (!f.awardPage) return [];
  if (f.awardParse === 'cahiers') return getCahiersRows(f);
  if (f.awardParse === 'sundanceList') {
    const parsed = await wikiParse({ page: f.awardPage, prop: 'text' });
    return parseSundanceWinners(parsed.text, { ambito: f.sundanceAmbito || 'world' })
      .filter((r) => r.year >= (f.awardSinceYear ?? f.sinceYear))
      .map((r) => ({ ...r, winner: true }));
  }
  const filas = await getAwardRows(f, { keepAll: keepAll && !!f.awardNominees, sinPaquete: true });
  return f.awardNominees ? filas : filas.map((r) => ({ ...r, winner: true }));
}

/**
 * Lo mismo, pero con las NOMINADAS incluidas cuando el premio las publica.
 *
 * Para el detector de emergentes una nominación al Goya, al César o al
 * Guldbagge con una primera película es tan reveladora como el premio: entra en
 * la terna quien acaba de llegar, lo gana quien ya está. Las filas salen de la
 * misma caché diaria que el palmarés, así que ampliar el radar no cuesta ni una
 * petición extra a Wikipedia.
 *
 * Devuelve las filas con `winner` marcado; los premios que solo publican
 * ganadora caen en `winnersRowsLight` y todas vienen marcadas.
 */
export async function awardRowsLight(key) {
  const f = REGISTRY[key];
  if (!f) return [];
  if (!f.awardNominees) return (await winnersRowsLight(key)).map((r) => ({ ...r, winner: true }));
  if (f.staticAward) return f.staticAward;
  return getAwardRows(f, { keepAll: true });
}

/**
 * Los directores/as con más películas en la competición de Cannes, Venecia y
 * Berlín en las últimas `years` ediciones publicadas. Cuenta películas (no
 * ediciones), separa las celdas con varios nombres y devuelve, por festival,
 * los repetidores (2+) ordenados por presencia. Cacheado 7 días.
 */
export async function festivalTopDirectors({ years = 10, top = 12, refresh = false } = {}) {
  const cacheKey = `${cachePrefix('festival')}:topdirs:${years}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 7 * DAY);
    if (hit) return hit;
  }
  const nowYear = new Date().getFullYear();
  const festivals = [];
  for (const key of DECADE_FESTIVALS) {
    const f = REGISTRY[key];
    const porDirector = new Map();
    const editions = [];
    // desde el año en curso hacia atrás hasta juntar `years` ediciones con
    // programa publicado (la del año corriente puede no existir aún)
    for (let y = nowYear; y > nowYear - years - 2 && editions.length < years; y--) {
      let rows;
      try {
        rows = await editionRowsLight(key, f, y);
      } catch {
        continue; // sin programa (aún) o edición no celebrada: no cuenta
      }
      if (!rows?.length) continue;
      editions.push(y);
      for (const r of rows) {
        for (const name of splitDirectors(r.director)) {
          const k = normName(name);
          if (!k) continue;
          const d = porDirector.get(k) || { name, count: 0, years: new Set(), films: [] };
          d.count++;
          d.years.add(y);
          if (d.films.length < 6 && r.title) d.films.push(r.title);
          porDirector.set(k, d);
        }
      }
    }
    editions.sort();
    festivals.push({
      festival: key,
      name: f.name,
      award: f.award,
      editions,
      directors: [...porDirector.values()]
        .filter((d) => d.count >= 2)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, top)
        .map((d) => ({ name: d.name, count: d.count, years: [...d.years].sort(), films: d.films })),
    });
  }
  const res = { generatedAt: Date.now(), years, festivals };
  cacheWrite(cacheKey, res);
  return res;
}

const FESTIVAL_PACK_META = {
  cannes: { emoji: '🌴', accent: 'gold' },
  venecia: { emoji: '🦁', accent: 'sky' },
  berlinale: { emoji: '🐻', accent: 'orange' },
};

/**
 * Los habituales de cada festival como «packs» de Favoritos → Añadir: mismos
 * campos que los packs curados de suggestedPeople, con la presencia en
 * competición como texto de apoyo. Los nombres resueltos contra TMDB se
 * cachean 7 días; la bandera `tracked` se calcula SIEMPRE al servir, porque
 * congelada en la caché marcaba como seguidos a quienes ya no lo estaban.
 */
export async function festivalDirectorPacks({ refresh = false } = {}) {
  const cacheKey = `${cachePrefix('festival')}:topdirs-packs`;
  let base = refresh ? null : cacheRead(cacheKey, 7 * DAY);
  if (!base) {
    const agg = await festivalTopDirectors({ refresh });
    const packs = [];
    // Resolver contra TMDB a los habituales de cada festival, de uno en uno,
    // es medio minuto la primera vez (después vive una semana en caché). Va por
    // la misma barra que los huecos y el canon en vez de por un giro mudo.
    const totalDirs = agg.festivals.reduce((n, f) => n + f.directors.length, 0);
    let hechos = 0;
    setBuildProgress('festival:packs', 'Buscando en TMDB a los habituales', 0, totalDirs);
    for (const fest of agg.festivals) {
      const people = [];
      for (const d of fest.directors) {
        setBuildProgress('festival:packs', 'Buscando en TMDB a los habituales', ++hechos, totalDirs);
        await cedeElHilo(); // con todo cacheado, este bucle no suelta el servidor
        try {
          const info = await findPersonInfo(d.name, 'Directing');
          if (!info?.id) continue;
          const rango = d.years[0] === d.years[d.years.length - 1] ? `${d.years[0]}` : `${d.years[0]}–${d.years[d.years.length - 1]}`;
          people.push({
            tmdb_id: info.id,
            name: info.name || d.name,
            profile_path: info.profile_path || null,
            knownFor: [`${d.count} en competición (${rango})`, d.films[d.films.length - 1]].filter(Boolean),
          });
        } catch {
          // sin ficha en TMDB: fuera del pack, no hay a quién seguir
        }
      }
      if (!people.length) continue;
      const meta = FESTIVAL_PACK_META[fest.festival] || {};
      const rango = fest.editions.length ? `${fest.editions[0]}–${fest.editions[fest.editions.length - 1]}` : 'última década';
      packs.push({
        key: `habituales-${fest.festival}`,
        title: `Habituales de ${fest.name}`,
        emoji: meta.emoji || '🎪',
        accent: meta.accent || 'gold',
        description: `Con más películas en la competición de ${fest.name} en la última década (${rango}).`,
        people,
      });
    }
    await latinizeNames(packs.flatMap((p) => p.people));
    clearBuildProgress('festival:packs');
    base = { generatedAt: Date.now(), packs };
    if (packs.length) cacheWrite(cacheKey, base);
  }
  const trackedTmdb = new Set(
    db.prepare(`SELECT p.tmdb_id FROM tracked_people t JOIN people p ON p.id = t.person_id
                WHERE p.tmdb_id IS NOT NULL AND t.role = 'director'`)
      .all().map((r) => r.tmdb_id)
  );
  return {
    ...base,
    packs: base.packs.map((p) => ({
      ...p,
      people: p.people.map((x) => ({ ...x, tracked: trackedTmdb.has(x.tmdb_id) })),
    })),
  };
}
