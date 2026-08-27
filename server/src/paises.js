/**
 * EL CINE POR PAÍSES.
 *
 * Las mejores películas de cada cinematografía, históricas y año a año. Tres
 * decisiones mandan sobre todo lo demás, y las tres se tomaron midiendo:
 *
 * 1. ORDENA LETTERBOXD, NO LA Σ NI TMDB. La nota de TMDB es popular y reciente:
 *    ordenando España por ella, «Culpa mía» sale por delante de «El espíritu de
 *    la colmena». La Σ de MDBList es peor todavía para esto, porque castiga a
 *    quien no tiene Metacritic ni Rotten Tomatoes —o sea, a casi todo el cine
 *    no anglosajón anterior a los setenta—: «Vida en sombras» tiene 7,2 en
 *    Letterboxd y una Σ de 16. Letterboxd es la única fuente que puntúa el cine
 *    del mundo. La Σ se guarda y se enseña, pero no ordena.
 *
 * 2. SE RECORRE AÑO POR AÑO, no un charco global. Un listón de votos global
 *    deja fuera lo antiguo y lo pequeño («Vida en sombras» tiene DOCE votos en
 *    TMDB), y bajarlo llena la lista de conciertos y monólogos. Recorriendo por
 *    años el problema desaparece solo: en España 1949 hay 49 películas en toda
 *    la base y la buena es la más votada de las 49.
 *
 * 3. EL PAÍS DE UNA PELÍCULA ES EL DE QUIEN LA DIRIGE. El `origin_country` de
 *    TMDB falla en las dos direcciones: da «Viridiana» por mexicana y «La
 *    batalla de Chile» por española (España no está ni entre sus productoras).
 *    Cruzándolo con la nacionalidad de la dirección las ocho pruebas salen
 *    bien. Ver `atribuir`.
 *
 * Regla que manda sobre todas, la de la casa: mejor sin película que la
 * película de otro país.
 *
 * LO QUE ESTA PÁGINA NO PUEDE VER, y hay que saberlo. El recorrido por años
 * solo puede preguntarle a TMDB por `with_origin_country`, que es el único
 * campo de país por el que deja filtrar. Una película que TMDB no atribuya a
 * ese país NO LLEGA NI A CANDIDATA, y entonces la regla de la dirección —que
 * existe justo para rescatarla— no la ve nunca. Pasa con «Los otros» (TMDB la
 * da estadounidense) y con «As bestas» (la da francesa), las dos con España
 * entre sus productoras. El palmarés empaquetado rescata las que estén en algún
 * premio; para el resto está el ✎, que es de lo que se ocupa `country_overrides`.
 */
import { db } from './db.js';
import { tmdbGet, movieDetail, personDetails, setBuildProgress, clearBuildProgress, classifyGenres } from './tmdb.js';
import { esLargometraje } from './releases.js';
import { enrichWithScores, hayClaveMdblist, titulosQueCaben } from './mdblist.js';
import { conteoAvales } from './avales.js';
import { REGISTRY, filasEmpaquetadas } from './festivals.js';
import { mapPool, cedeElHilo } from './pool.js';
import { normName } from './names.js';
import { cachePrefix } from './cache-versions.js';
import { PAQUETES } from './data/paises/index.js';

/**
 * La versión del ÍNDICE construido (no la de la caché de TMDB, que vive en
 * `cache-versions.js` como todas). Se guarda en cada fila de
 * `country_builds`, así que al subirla los países construidos con la regla
 * vieja se pueden señalar y reconstruir en vez de servirse en silencio como si
 * siguieran valiendo.
 */
export const PAISES_VERSION = 1;

// El primer año que se mira. 1915 y no 1930 porque el mudo tardío está en las
// listas: «A Page of Madness» (1926) es de las mejor puntuadas de Japón.
export const DESDE = 1915;

/**
 * LOS TAMAÑOS: 200 para los dos grandes, 100 para los importantes y 50 para el
 * resto; 20 por año arriba y 10 abajo.
 *
 * `red` es cuántos candidatos se piden a TMDB por año ANTES de saber sus notas.
 * Va bastante por encima del objetivo porque solo la mitad de los candidatos
 * tiene nota de Letterboxd: midiendo España con 25 por año salían 12 puntuados
 * y no llegaban a los 20 que la página promete.
 */
export const TIERS = {
  grande: { global: 200, anio: 20, red: 40 },
  importante: { global: 100, anio: 20, red: 40 },
  menor: { global: 50, anio: 10, red: 25 },
};

/**
 * EL CATÁLOGO. Los códigos son ISO 3166-1 alfa-2, que es lo que entiende
 * `with_origin_country`. Los estados que ya no existen (URSS, Alemania del
 * Este, Checoslovaquia, Yugoslavia) tienen código propio en TMDB y hay que
 * dejarlos: media historia del cine se rodó ahí.
 */
export const PAISES = {
  US: { es: 'Estados Unidos', en: 'United States', tier: 'grande' },
  GB: { es: 'Reino Unido', en: 'United Kingdom', tier: 'grande' },

  FR: { es: 'Francia', en: 'France', tier: 'importante' },
  IT: { es: 'Italia', en: 'Italy', tier: 'importante' },
  JP: { es: 'Japón', en: 'Japan', tier: 'importante' },
  ES: { es: 'España', en: 'Spain', tier: 'importante' },
  DE: { es: 'Alemania', en: 'Germany', tier: 'importante' },
  KR: { es: 'Corea del Sur', en: 'South Korea', tier: 'importante' },
  SU: { es: 'Unión Soviética', en: 'Soviet Union', tier: 'importante' },
  RU: { es: 'Rusia', en: 'Russia', tier: 'importante' },
  SE: { es: 'Suecia', en: 'Sweden', tier: 'importante' },
  DK: { es: 'Dinamarca', en: 'Denmark', tier: 'importante' },
  IN: { es: 'India', en: 'India', tier: 'importante' },
  CN: { es: 'China', en: 'China', tier: 'importante' },
  HK: { es: 'Hong Kong', en: 'Hong Kong', tier: 'importante' },
  TW: { es: 'Taiwán', en: 'Taiwan', tier: 'importante' },
  MX: { es: 'México', en: 'Mexico', tier: 'importante' },
  AR: { es: 'Argentina', en: 'Argentina', tier: 'importante' },
  BR: { es: 'Brasil', en: 'Brazil', tier: 'importante' },
  PL: { es: 'Polonia', en: 'Poland', tier: 'importante' },
  IR: { es: 'Irán', en: 'Iran', tier: 'importante' },
  CA: { es: 'Canadá', en: 'Canada', tier: 'importante' },
  AU: { es: 'Australia', en: 'Australia', tier: 'importante' },

  AT: { es: 'Austria', en: 'Austria', tier: 'menor' },
  BE: { es: 'Bélgica', en: 'Belgium', tier: 'menor' },
  CH: { es: 'Suiza', en: 'Switzerland', tier: 'menor' },
  CZ: { es: 'Chequia', en: 'Czech Republic', tier: 'menor' },
  // Los dos estados desaparecidos que TMDB NO indexa por su ISO. Comprobado
  // contra /discover: `CS` devuelve 90 películas SERBIAS —para TMDB ese código
  // es «Serbia and Montenegro»— y `DD` devuelve cero. Los suyos son `XC`
  // (7.844 películas: «Las margaritas», «Marketa Lazarová») y `XG` (1.144:
  // «Solo Sunny»). Sin esto, «Checoslovaquia» habría servido cine serbio de los
  // 2000 bajo el rótulo equivocado, que es peor que servir una lista vacía.
  CS: { es: 'Checoslovaquia', en: 'Czechoslovakia', tier: 'menor', tmdb: 'XC' },
  DD: { es: 'Alemania del Este', en: 'East Germany', tier: 'menor', tmdb: 'XG' },
  FI: { es: 'Finlandia', en: 'Finland', tier: 'menor' },
  GR: { es: 'Grecia', en: 'Greece', tier: 'menor' },
  HU: { es: 'Hungría', en: 'Hungary', tier: 'menor' },
  IE: { es: 'Irlanda', en: 'Ireland', tier: 'menor' },
  IS: { es: 'Islandia', en: 'Iceland', tier: 'menor' },
  NL: { es: 'Países Bajos', en: 'Netherlands', tier: 'menor' },
  NO: { es: 'Noruega', en: 'Norway', tier: 'menor' },
  PT: { es: 'Portugal', en: 'Portugal', tier: 'menor' },
  RO: { es: 'Rumanía', en: 'Romania', tier: 'menor' },
  RS: { es: 'Serbia', en: 'Serbia', tier: 'menor' },
  YU: { es: 'Yugoslavia', en: 'Yugoslavia', tier: 'menor' },
  TR: { es: 'Turquía', en: 'Turkey', tier: 'menor' },
  UA: { es: 'Ucrania', en: 'Ukraine', tier: 'menor' },
  BG: { es: 'Bulgaria', en: 'Bulgaria', tier: 'menor' },
  HR: { es: 'Croacia', en: 'Croatia', tier: 'menor' },
  CL: { es: 'Chile', en: 'Chile', tier: 'menor' },
  CO: { es: 'Colombia', en: 'Colombia', tier: 'menor' },
  CU: { es: 'Cuba', en: 'Cuba', tier: 'menor' },
  PE: { es: 'Perú', en: 'Peru', tier: 'menor' },
  UY: { es: 'Uruguay', en: 'Uruguay', tier: 'menor' },
  VE: { es: 'Venezuela', en: 'Venezuela', tier: 'menor' },
  EG: { es: 'Egipto', en: 'Egypt', tier: 'menor' },
  MA: { es: 'Marruecos', en: 'Morocco', tier: 'menor' },
  SN: { es: 'Senegal', en: 'Senegal', tier: 'menor' },
  ZA: { es: 'Sudáfrica', en: 'South Africa', tier: 'menor' },
  DZ: { es: 'Argelia', en: 'Algeria', tier: 'menor' },
  TN: { es: 'Túnez', en: 'Tunisia', tier: 'menor' },
  BF: { es: 'Burkina Faso', en: 'Burkina Faso', tier: 'menor' },
  IL: { es: 'Israel', en: 'Israel', tier: 'menor' },
  TH: { es: 'Tailandia', en: 'Thailand', tier: 'menor' },
  PH: { es: 'Filipinas', en: 'Philippines', tier: 'menor' },
  VN: { es: 'Vietnam', en: 'Vietnam', tier: 'menor' },
  ID: { es: 'Indonesia', en: 'Indonesia', tier: 'menor' },
  NZ: { es: 'Nueva Zelanda', en: 'New Zealand', tier: 'menor' },
  LB: { es: 'Líbano', en: 'Lebanon', tier: 'menor' },
  GE: { es: 'Georgia', en: 'Georgia', tier: 'menor' },
  AM: { es: 'Armenia', en: 'Armenia', tier: 'menor' },
  KZ: { es: 'Kazajistán', en: 'Kazakhstan', tier: 'menor' },
  EE: { es: 'Estonia', en: 'Estonia', tier: 'menor' },
  LT: { es: 'Lituania', en: 'Lithuania', tier: 'menor' },
  MK: { es: 'Macedonia del Norte', en: 'North Macedonia', tier: 'menor' },
  BA: { es: 'Bosnia y Herzegovina', en: 'Bosnia and Herzegovina', tier: 'menor' },
  CI: { es: 'Costa de Marfil', en: 'Ivory Coast', tier: 'menor' },
};

export const tierDe = (iso) => TIERS[PAISES[String(iso || '').toUpperCase()]?.tier || 'menor'];

/**
 * El código con el que hay que PREGUNTARLE A TMDB. Casi siempre es el mismo
 * ISO, pero no para los estados que ellos indexan aparte (ver `CS` y `DD`).
 */
export const codigoTmdb = (iso) => {
  const ISO = String(iso || '').toUpperCase();
  return PAISES[ISO]?.tmdb || ISO;
};
export const esPaisConocido = (iso) => Object.hasOwn(PAISES, String(iso || '').toUpperCase());

/**
 * DE UN NOMBRE DE LUGAR AL CÓDIGO ISO.
 *
 * El `place_of_birth` de TMDB es texto libre escrito por quien editó la ficha,
 * así que el mismo país llega en castellano, en inglés o con el nombre de un
 * estado que ya no existe: Buñuel nació en «Calanda, Teruel, España» y Ocelot
 * en «Villefranche-sur-Saône, France». Sin este diccionario la nacionalidad de
 * la dirección no casa nunca, la atribución se cae al `origin_country` y
 * volvemos al problema que veníamos a arreglar.
 */
const ALIAS = {
  USA: 'US', 'U.S.A.': 'US', 'United States of America': 'US', 'EE UU': 'US', EEUU: 'US',
  'Estados Unidos de América': 'US', 'Puerto Rico': 'US',
  UK: 'GB', England: 'GB', Scotland: 'GB', Wales: 'GB', 'Northern Ireland': 'GB',
  Inglaterra: 'GB', Escocia: 'GB', Gales: 'GB', 'Great Britain': 'GB', 'Gran Bretaña': 'GB',
  USSR: 'SU', 'U.S.S.R.': 'SU', 'Soviet Union': 'SU', URSS: 'SU', 'Russian SFSR': 'SU',
  'Unión Soviética': 'SU', 'Union of Soviet Socialist Republics': 'SU',
  'Russian Empire': 'RU', 'Imperio ruso': 'RU', Rusia: 'RU',
  'West Germany': 'DE', 'Alemania Occidental': 'DE', 'Alemania del Oeste': 'DE',
  'Federal Republic of Germany': 'DE', RFA: 'DE', Deutschland: 'DE', Alemania: 'DE',
  'German Democratic Republic': 'DD', RDA: 'DD', 'East Germany': 'DD',
  Czechia: 'CZ', 'República Checa': 'CZ', Bohemia: 'CZ',
  Korea: 'KR', 'South Korea': 'KR', Corea: 'KR', 'Republic of Korea': 'KR',
  "People's Republic of China": 'CN', 'Republic of China': 'TW',
  'Hong Kong SAR China': 'HK', 'Hong Kong, China': 'HK',
  Espanha: 'ES', Espagne: 'ES', Spagna: 'ES',
  Frankreich: 'FR', Italie: 'IT', Italien: 'IT',
  Nippon: 'JP', Japon: 'JP',
  Holanda: 'NL', Holland: 'NL', 'The Netherlands': 'NL',
  Brésil: 'BR',
  'SFR Yugoslavia': 'YU', 'Socialist Federal Republic of Yugoslavia': 'YU',
  'Serbia and Montenegro': 'RS', 'Kingdom of Yugoslavia': 'YU',
  Persia: 'IR', 'Islamic Republic of Iran': 'IR',
  Siam: 'TH',

  // Los que salen DE VERDAD en las fichas de TMDB, contados sobre las 1.732 con
  // lugar de nacimiento que hay en la caché: 115 colas distintas no casaban con
  // nada, y no eran ruido suelto sino sistemáticamente el bloque soviético, las
  // dos Alemanias y los nombres en otros idiomas.
  Danmark: 'DK', Dänemark: 'DK',
  Türkiye: 'TR', Turkiye: 'TR',
  Germania: 'DE', Allemagne: 'DE',
  'Corea del Sud': 'KR', 'Corée du Sud': 'KR',
  Island: 'IS', Islande: 'IS',
  Macedonia: 'MK', 'Republic of Macedonia': 'MK',
  "Côte d'Ivoire": 'CI', 'Cote d Ivoire': 'CI',
  'Hungarian People’s Republic': 'HU', "Hungarian People's Republic": 'HU',
  'Austria-Hungary': 'AT', 'Austro-Hungarian Empire': 'AT',
  'Bosnia & Herzegovina': 'BA', 'Bosnia-Herzegovina': 'BA',
  'U.S.': 'US', 'U.S.A.': 'US',
  Suomi: 'FI',
  Sverige: 'SE',
  Norge: 'NO',
  Polska: 'PL',
  Magyarország: 'HU',
  Éire: 'IE',
  Nederland: 'NL',
  Belgique: 'BE', België: 'BE',
  Schweiz: 'CH', Suisse: 'CH',
  Österreich: 'AT',
};

// La normalización es la de `names.js` —la única de la casa— y no una propia:
// pliega la ø y la ł igual que para los nombres de persona, que es justo lo que
// hace falta para «Ørsta, Noruega» o para los topónimos polacos.
const normalizar = (s) => normName(s);

// Índice de nombre normalizado → iso, construido una vez con las tres
// procedencias: el castellano del catálogo, el inglés y los alias.
const POR_NOMBRE = (() => {
  const m = new Map();
  for (const [iso, p] of Object.entries(PAISES)) {
    m.set(normalizar(p.es), iso);
    m.set(normalizar(p.en), iso);
  }
  for (const [nombre, iso] of Object.entries(ALIAS)) m.set(normalizar(nombre), iso);
  return m;
})();

/**
 * NOMBRES QUE NO SE PUEDEN RESOLVER SIN MENTIR.
 *
 * «Savannah, Georgia» es Estados Unidos y «Tbilisi, Georgia» es Georgia, y la
 * cadena no trae nada más con lo que decidir: dos personas distintas salían una
 * estadounidense y otra georgiana según cómo hubiera escrito su ficha quien la
 * editó. Aquí se contesta que no se sabe, y la atribución se cae al país de
 * origen — que es peor dato, pero es un dato honesto. Manda la regla de la
 * casa: mejor sin ficha que la ficha de otra.
 */
const AMBIGUOS = new Set(['georgia']);

/**
 * TMDB anota los países desaparecidos con su equivalente de hoy entre
 * paréntesis o entre corchetes: «Moscow, USSR (Russia)», «Berlin, West Germany
 * [now Germany]», «Prague, Czechoslovakia [now Czech Republic]». Sin quitar esa
 * coletilla no casaba NINGUNO, y son justo los países que el catálogo conserva
 * a propósito: la URSS, las dos Alemanias, Checoslovaquia.
 */
const sinAnotacion = (s) => String(s).replace(/\s*[([][^)\]]*[)\]]\s*$/, '').trim();

/** El ISO de un lugar de nacimiento («Calanda, Teruel, España» → ES). */
export function isoDeLugar(lugar) {
  if (!lugar) return null;
  // El país es lo último de la cadena, igual que en `geoDeLugar` de tmdb.js.
  // Se parte también por guion porque hay fichas escritas «Madrid - Spain».
  const cola = sinAnotacion(
    String(lugar).split(/[,;]| - /).map((s) => s.trim()).filter(Boolean).pop() || ''
  );
  const clave = normalizar(cola);
  if (AMBIGUOS.has(clave)) return null;
  return POR_NOMBRE.get(clave) || null;
}

/**
 * TODOS los países que menciona un texto suelto.
 *
 * El palmarés empaquetado escribe los países de una coproducción de dos
 * maneras, y a veces las dos en la misma fila: «France, Senegal, Benin» pero
 * también «Spain France Italy» y hasta «Argentina France, Netherlands Spain».
 * Partiendo por coma —que era lo que se hacía— 51 filas no resolvían enteras, y
 * entre ellas «Los lunes al sol», «Los pasos dobles» o «Tortugas voladoras»: o
 * sea que el rescate de coproducciones no funcionaba EN LAS COPRODUCCIONES,
 * que es para lo único que existe.
 *
 * En vez de adivinar el separador se busca: se normaliza el texto entero —lo
 * que ya deja los espacios fuera— y se recorre casando el nombre más largo que
 * empiece en cada punto. Así «unitedstates» no se lee como «united» + algo, y
 * da igual con qué se hayan separado.
 */
export function isosDeTexto(texto) {
  const cadena = normalizar(sinAnotacion(String(texto || '')));
  if (!cadena) return [];
  const out = [];
  let i = 0;
  while (i < cadena.length) {
    let casado = null;
    for (const largo of LARGOS) {
      if (largo > cadena.length - i) continue;
      const iso = POR_NOMBRE.get(cadena.slice(i, i + largo));
      if (iso) {
        casado = { iso, largo };
        break; // LARGOS va de mayor a menor: el primero es el más largo
      }
    }
    if (!casado) {
      i++;
      continue;
    }
    if (!out.includes(casado.iso)) out.push(casado.iso);
    i += casado.largo;
  }
  return out;
}

/**
 * Las longitudes de nombre que existen, de mayor a menor: es lo que permite
 * preferir «unitedkingdom» sobre cualquier trozo suyo más corto.
 *
 * Se dejan fuera los nombres de menos de cuatro letras. Al normalizar
 * desaparecen los puntos, así que «U.S.» queda en «us» — y buscando eso DENTRO
 * de una cadena, «belarus» acabaría siendo Estados Unidos. Para la cola de un
 * lugar de nacimiento, que se compara entera, sí valen: ahí no hay nada dentro
 * de lo que colarse.
 */
const LARGOS = [...new Set([...POR_NOMBRE.keys()].filter((k) => k.length >= 4).map((k) => k.length))].sort(
  (a, b) => b - a
);

/**
 * ¿ES DE ESTE PAÍS?
 *
 * Cuatro señales y un orden. Lo mandan los ocho casos que se midieron antes de
 * escribir esto (ver la cabecera del fichero):
 *
 *   - Tu mano gana siempre: un `drop` la tira y un `add` la mete.
 *   - Si el país no está entre las PRODUCTORAS, fuera. Es el filtro que echa a
 *     «La batalla de Chile» de España: TMDB la marca de origen español y en su
 *     ficha España no aparece por ningún lado.
 *   - Si quien dirige es del país, dentro. Esto rescata «Viridiana» (Buñuel es
 *     de Calanda) aunque TMDB la dé por mexicana, y mantiene «El verdugo»
 *     aunque ponga Italia delante.
 *   - Si quien dirige es de OTRO país, fuera. Aquí se van «Azur & Asmar»
 *     (Ocelot es francés), «El secreto de sus ojos» y «Medianeras» (Campanella
 *     y Taretto son argentinos). También se va «El laberinto del fauno» de
 *     España —del Toro es mexicano— y aparece en México, que es además donde
 *     TMDB pone su primer origen. Es discutible, y para lo discutible está el ✎.
 *   - Sin saber quién dirige, o sin saber de dónde es, decide el
 *     `origin_country`: es lo único que queda.
 */
export function atribuir({ iso, origen = [], produccion = [], directorIso = null, override = null }) {
  if (override === 'drop') return null;
  if (override === 'add') return 'manual';
  // Sin países de producción en la ficha no se puede exigir nada: se cae al
  // origen, que es lo único que hay.
  if (produccion.length && !produccion.includes(iso)) return null;
  if (directorIso === iso) return 'director';
  // LA VÁLVULA. Que quien dirige haya nacido en otro sitio solo descarta si ESE
  // país es además uno de los de la propia película: entonces la película es de
  // allí y no de aquí, y por eso «Azur & Asmar» no es española (Ocelot es
  // francés y Francia está entre sus países) y «El secreto de sus ojos» tampoco
  // (Campanella es argentino y Argentina también).
  //
  // Sin esta condición la regla echaba a los emigrados y a los nacidos al otro
  // lado de una frontera que se movió: Alemania se quedaba sin «M» ni
  // «Metrópolis» —Fritz Lang nació en Viena— y sin «El gabinete del doctor
  // Caligari»; España, sin «Tesis» ni «Los otros» (Amenábar nació en Santiago
  // de Chile) y sin «El extraño viaje» (Fernán Gómez nació en Lima). «M» es
  // alemana, y una lista del cine alemán sin ella no la firma nadie.
  const suyos = new Set([...origen, ...produccion]);
  if (directorIso && suyos.has(directorIso)) return null;
  return origen.includes(iso) ? 'origen' : null;
}

// --- la construcción ----------------------------------------------------------

/**
 * La ficha de TMDB con las banderas de género puestas, que es lo que
 * `esLargometraje` sabe leer. El detalle trae `genres` (objetos con nombre) y
 * `classifyGenres` espera los ids sueltos, como en las listas.
 */
const clasificar = (d) => classifyGenres({ ...d }, (d.genres || []).map((g) => g.id));

/**
 * ¿Está estrenada YA?
 *
 * Sin fecha se acepta: hay clásicos con la ficha incompleta y no es motivo para
 * echarlos. Lo que se echa es lo que TIENE fecha y esa fecha es futura, que es
 * otra cosa: una película sin estrenar no puede estar en un top histórico, y su
 * nota alta no es una nota sino la expectación de quien la espera.
 */
/**
 * ¿ES UN CONCIERTO FILMADO?
 *
 * `classifyGenres` marca como música lo que lleva Música Y Documental, y así
 * caza «Pink Floyd: Live at Pompeii». Pero «Dua Lipa: Live from Mexico» lleva
 * SOLO Música —125 minutos, sin más géneros— y se plantó de número uno de
 * México, por delante de «El laberinto del fauno» y «El ángel exterminador».
 *
 * La firma de un concierto es justamente esa: Música y nada más, o Música y
 * Documental. Un musical de verdad nunca va solo — «Cabaret» es Drama y Música,
 * «La La Land» es Comedia, Drama, Romance y Música—, así que exigir que no haya
 * ningún otro género deja los musicales dentro y echa los directos.
 */
const MUSICA = 10402;
const DOCUMENTAL = 99;

/**
 * Y el que no se deja cazar por los géneros: «Flight of the Conchords: Live in
 * London» viene como Comedia y Música, así que el «ningún otro género» no lo
 * pilla, y se plantó de séptimo de Nueva Zelanda. Cuando hay género musical,
 * el «Live in / at / from» del título termina de decidirlo.
 *
 * La condición del género es imprescindible: sin ella, «Live Flesh» —«Carne
 * trémula» de Almodóvar— saldría de la lista española por llamarse como se
 * llama.
 */
const EN_DIRECTO = /\b(live (at|from|in|on)|en (directo|vivo)|unplugged)\b/i;

export const esConcierto = (d) => {
  const ids = (d.genres || []).map((g) => g.id);
  if (!ids.includes(MUSICA)) return false;
  if (ids.every((id) => id === MUSICA || id === DOCUMENTAL)) return true;
  return EN_DIRECTO.test(d.title || '') || EN_DIRECTO.test(d.original_title || '');
};

export const estaEstrenada = (d) => {
  const fecha = String(d.release_date || '').slice(0, 10);
  return !fecha || fecha <= new Date().toISOString().slice(0, 10);
};

/**
 * LOS CANDIDATOS QUE APORTA EL PALMARÉS.
 *
 * El recorrido por años pregunta a TMDB por `with_origin_country`, así que una
 * película que TMDB no cree de este país NO LLEGA NI A CANDIDATA — y entonces
 * la regla de la dirección, que existe justo para rescatarla, no la ve nunca.
 * Es literalmente el caso «Viridiana»: TMDB la da por mexicana, no sale en el
 * recorrido español, y da igual que Buñuel sea de Calanda.
 *
 * El palmarés empaquetado lo arregla porque trae el país escrito en cada fila
 * —Cannes 1961 dice «Spain»— y ya viene con el `tmdb_id` resuelto. Son 2.241
 * filas con país repartidas en 158 países: por país es un puñado, y son
 * exactamente las que más duele perder.
 *
 * Aporta CANDIDATAS, no plazas: entrar sigue dependiendo de `atribuir`. Una
 * fila de Cahiers que llame mexicana a «Viridiana» no la mete en México si
 * quien la dirige es español.
 */
function candidatosDelPalmares(iso) {
  const out = new Map();
  for (const key of Object.keys(REGISTRY)) {
    let filas;
    try {
      filas = filasEmpaquetadas(key, { keepAll: true }) || [];
    } catch {
      continue;
    }
    for (const r of filas) {
      // una serie premiada no es una película que buscar, y sin id no hay a
      // qué película apuntar
      if (r.tv || !r.tmdb_id || !r.country) continue;
      if (!isosDeTexto(r.country).includes(iso)) continue;
      if (!out.has(r.tmdb_id)) {
        out.set(r.tmdb_id, {
          tmdb_id: r.tmdb_id,
          title: r.title,
          original_title: r.original_title,
          // el año de la fila es el de la EDICIÓN del premio, que no siempre es
          // el del estreno; el de verdad lo pone después la ficha de TMDB
          year: Number(r.year) || null,
          poster: null,
        });
      }
    }
  }
  return [...out.values()];
}

/** Los candidatos de un año: los más votados de TMDB con ese país de origen. */
async function candidatosDelAnio(iso, anio, cuantos) {
  const out = [];
  for (let page = 1; page <= Math.ceil(cuantos / 20); page++) {
    const data = await tmdbGet(
      '/discover/movie',
      { with_origin_country: codigoTmdb(iso), primary_release_year: anio, sort_by: 'vote_count.desc', page },
      { cacheKey: `${cachePrefix('paises')}:${iso}:${anio}:${page}`, cacheMs: 7 * 24 * 3600 * 1000 }
    );
    out.push(...(data.results || []));
    if (page >= (data.total_pages || 1)) break;
  }
  return out.slice(0, cuantos);
}

/**
 * El ISO de quien dirige, con su memo: un director firma muchas películas y
 * pedir su ficha una vez por película multiplicaría por veinte las llamadas.
 */
const memoDirector = new Map();
export const olvidarDirectores = () => memoDirector.clear();

async function isoDeDirector(personId) {
  if (!personId) return null;
  if (memoDirector.has(personId)) return memoDirector.get(personId);
  // Si ya está en tu biblioteca su país está calculado: no se vuelve a pedir.
  const fila = db.prepare('SELECT country FROM people WHERE tmdb_id = ? AND country IS NOT NULL').get(personId);
  let iso = fila ? isoDeLugar(fila.country) : null;
  let falloDeRed = false;
  if (!iso) {
    try {
      const d = await personDetails(personId);
      iso = isoDeLugar(d?.place_of_birth);
    } catch {
      // Un 429 o un timeout NO es «no se sabe de dónde es»: es «no se ha
      // podido mirar». Memorizándolo, un corte de un segundo dejaba a ese
      // director sin nacionalidad para todo lo que quedara de proceso, y todas
      // sus películas caían al país de origen de TMDB — que es justo lo que
      // este módulo existe para corregir.
      falloDeRed = true;
      iso = null;
    }
  }
  if (!falloDeRed) memoDirector.set(personId, iso);
  return iso;
}

/**
 * Cuántas de estas películas tienen ya fila en `mdb_ratings`, o sea cuántas NO
 * hay que pagar. Va en trozos porque un país grande son cuatro mil ids y
 * meterlos todos en un `IN` de golpe es tentar al límite de variables de SQLite.
 */
function contarConNota(ids) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const trozo = ids.slice(i, i + 500);
    n += db
      .prepare(`SELECT COUNT(*) n FROM mdb_ratings WHERE tmdb_id IN (${trozo.map(() => '?').join(',')})`)
      .get(...trozo).n;
  }
  return n;
}

const overridesDe = (iso) =>
  new Map(
    db.prepare('SELECT tmdb_id, modo FROM country_overrides WHERE iso = ?').all(iso).map((r) => [r.tmdb_id, r.modo])
  );

/**
 * EL DESEMPATE ES EL CANON.
 *
 * La nota de Letterboxd llega con UN decimal —MDBList no da más, se miró el
 * payload crudo— y eso empata a mansalva: en el top-100 de España la nota de
 * corte es 7,6 y hay 49 películas con exactamente 7,6. O sea que media lista la
 * decide el desempate y no la nota. Desempatar por votos sería desempatar por
 * popularidad, el sesgo del que veníamos huyendo; desempata el canon, que ya
 * está medido en `avales.js`: entre dos de 7,6 gana la que está en Cannes o en
 * Sight & Sound. Los votos quedan de último recurso.
 */
/**
 * La nota de Letterboxd, o nada.
 *
 * Letterboxd puntúa sobre 10 y MDBList devolvió un **14,6** para «Ваш сын и
 * брат»: un solo valor fuera de rango en toda la tabla, que nadie validaba y
 * que `ordenar` colocaba tan campante por delante de «Stalker» como número uno
 * de la Unión Soviética. Un dato imposible no es un dato: se descarta, y la
 * película se queda sin nota como cualquier otra sin nota.
 */
export const notaValida = (n) => (typeof n === 'number' && n >= 0 && n <= 10 ? n : null);

export const ordenar = (a, b) =>
  (b.lb ?? -1) - (a.lb ?? -1) ||
  (b.avales || 0) - (a.avales || 0) ||
  (b.ganados || 0) - (a.ganados || 0) ||
  (b.lb_votes || 0) - (a.lb_votes || 0);

/**
 * Construye (o reconstruye) el índice de un país. Devuelve el resumen que se
 * guarda en `country_builds` y que la página enseña: sin saber cuántos
 * candidatos se miraron y cuántos tenían nota, un país con doce películas
 * parece un fallo cuando lo que pasa es que ese cine es el que es.
 */
export async function construirPais(iso, { hasta = new Date().getFullYear() } = {}) {
  const ISO = String(iso || '').toUpperCase();
  if (!esPaisConocido(ISO)) throw new Error(`País desconocido: ${iso}`);
  if (!hayClaveMdblist()) throw new Error('Sin clave de MDBList no hay notas de Letterboxd que ordenar');

  const t0 = Date.now();
  const tier = tierDe(ISO);
  const job = `paises:${ISO}`;
  const nombre = PAISES[ISO].es;
  const anios = [];
  for (let y = DESDE; y <= hasta; y++) anios.push(y);

  try {
    // 1. los candidatos, año a año. TMDB no cobra, así que la red va ancha.
    const porId = new Map();
    setBuildProgress(job, `Recorriendo los años de ${nombre}`, 0, anios.length);
    for (let i = 0; i < anios.length; i++) {
      try {
        for (const r of await candidatosDelAnio(ISO, anios[i], tier.red)) {
          if (!porId.has(r.id)) {
            porId.set(r.id, {
              tmdb_id: r.id,
              title: r.title,
              original_title: r.original_title,
              year: anios[i],
              poster: r.poster_path || null,
            });
          }
        }
      } catch {
        /* un año que falla no tumba el país entero */
      }
      setBuildProgress(job, `Recorriendo los años de ${nombre}`, i + 1, anios.length);
      await cedeElHilo();
    }
    // y las que el palmarés conoce y TMDB no atribuye a este país
    let delPalmares = 0;
    for (const c of candidatosDelPalmares(ISO)) {
      if (!porId.has(c.tmdb_id)) {
        porId.set(c.tmdb_id, c);
        delPalmares++;
      }
    }
    const candidatos = [...porId.values()];

    // 2. las notas de Letterboxd. Es lo único que se paga, y hay que saber si
    //    se pagó ENTERO.
    //
    //    Un país grande son unas cuatro mil candidatas, y `enrichWithScores`
    //    corta por lo sano cuando el cupo del día no da para todas: pide las
    //    que quepan y se calla. El país se guardaba entonces como bueno, con un
    //    `con_nota` bajo y `error: null` — o sea, indistinguible de «ese cine es
    //    el que es». Es exactamente el «sin dato ≠ cero» de la casa: la señal
    //    que falta tiene que DECIRSE, no colarse como un cero.
    const yaSabidas = contarConNota(candidatos.map((c) => c.tmdb_id));
    const porPedir = candidatos.length - yaSabidas;
    // Se compara en TÍTULOS, no en peticiones: cien títulos viajan en una sola
    // llamada, y confundir las dos unidades es lo que tenía a la aplicación
    // racionándose a sí misma con el 98% del día libre.
    const sinCupo = Math.max(0, porPedir - titulosQueCaben());

    // Va en tandas y no de una sola vez PARA QUE LATA. `enrichWithScores` no
    // admite callback, así que pedir los cuatro mil de golpe dejaba la barra
    // clavada en 0 durante minutos y, como `buildProgress.at` no se refrescaba,
    // a los 60 s se apagaba sola mientras el trabajo seguía. La regla de la
    // casa es que el porcentaje sea peticiones terminadas / total.
    setBuildProgress(job, 'Pidiendo las notas de Letterboxd', 0, candidatos.length);
    for (let i = 0; i < candidatos.length; i += 300) {
      const tanda = candidatos.slice(i, i + 300);
      await enrichWithScores(tanda, { fetchMissing: true, maxFetch: tanda.length });
      setBuildProgress(job, 'Pidiendo las notas de Letterboxd', Math.min(i + 300, candidatos.length), candidatos.length);
      await cedeElHilo();
    }
    for (const c of candidatos) {
      if (c.mdb) c.mdb.letterboxd = notaValida(c.mdb.letterboxd);
    }
    const conNota = candidatos.filter((c) => c.mdb?.letterboxd != null);

    // 3. de dónde es cada una DE VERDAD. Solo se mira lo que puede entrar en la
    //    lista: pedir la ficha de las que no tienen nota sería trabajo tirado.
    const overrides = overridesDe(ISO);
    const admitidas = [];
    let hechas = 0;
    setBuildProgress(job, 'Comprobando de dónde es cada una', 0, conNota.length);
    await mapPool(conNota, 6, async (c) => {
      try {
        const d = await movieDetail(c.tmdb_id, { withCredits: true });
        // Solo cine largometraje, con la misma vara que Estrenos: sin esto se
        // cuelan los cortos y los telefilmes —a Islandia le entró
        // «Næturvaktin», que es una serie— y una lista de las mejores de un
        // país con una sitcom dentro no se puede enseñar.
        const clasificada = clasificar(d);
        if (!esLargometraje(clasificada)) return;
        // Y FUERA LOS CONCIERTOS. El top de Reino Unido abría con «Pink Floyd:
        // Live at Pompeii» y un directo de BTS, las dos con 8,8 de Letterboxd:
        // el público las puntúa como lo que son, un buen concierto, y así se
        // cuelan entre «Lawrence de Arabia» y «Las zapatillas rojas». Filmar un
        // concierto no es hacer cine, y una lista de las mejores películas de
        // un país con dos directos dentro no se puede enseñar.
        if (clasificada.isMusic || esConcierto(d)) return;
        // Y LO QUE NO SE HA ESTRENADO. «La Odisea» de Nolan aparecía tercera de
        // Reino Unido con un 8,8 que no es una nota: son las ganas de verla. Un
        // canon histórico no puede incluir lo que todavía no existe.
        if (!estaEstrenada(d)) return;
        const dirs = (d.credits?.crew || []).filter((x) => x.job === 'Director');
        const origen = d.origin_country || [];
        const produccion = (d.production_countries || []).map((x) => x.iso_3166_1);
        // Con codirección basta con que UNO sea del país.
        const isos = (await Promise.all(dirs.map((x) => isoDeDirector(x.id)))).filter(Boolean);
        const directorIso = isos.includes(ISO) ? ISO : isos[0] || null;
        // La ficha de TMDB trae SU código (XC, XG), no el ISO que enseñamos:
        // hay que comparar con el mismo con el que se preguntó.
        const codigo = codigoTmdb(ISO);
        const motivo = atribuir({
          iso: codigo,
          origen,
          produccion,
          directorIso: directorIso === ISO ? codigo : directorIso,
          override: overrides.get(c.tmdb_id),
        });
        if (motivo) {
          admitidas.push({
            tmdb_id: c.tmdb_id,
            title: c.title,
            original_title: c.original_title,
            year: Number(String(d.release_date || '').slice(0, 4)) || c.year,
            poster: d.poster_path || c.poster,
            lb: c.mdb.letterboxd,
            lb_votes: c.mdb.lb_votes ?? null,
            sigma: c.mdb.score ?? null,
            imdb: c.mdb.imdb ?? null,
            director: dirs[0]?.name || null,
            director_iso: directorIso,
            origen: origen.join(','),
            motivo,
          });
        }
      } catch {
        /* una ficha que no baja no puede tumbar el país */
      }
      setBuildProgress(job, 'Comprobando de dónde es cada una', ++hechas, conNota.length);
    });

    // 3 bis. las añadidas a mano que ni siquiera salían de candidatas: si TMDB
    //        no la pone en ningún origen de este país, no la ha visto nadie.
    for (const [tmdbId, modo] of overrides) {
      if (modo !== 'add' || admitidas.some((a) => a.tmdb_id === tmdbId)) continue;
      try {
        const d = await movieDetail(tmdbId, { withCredits: true });
        const [suya] = await enrichWithScores([{ tmdb_id: tmdbId }], { fetchMissing: true, maxFetch: 1 });
        admitidas.push({
          tmdb_id: tmdbId,
          title: d.title,
          original_title: d.original_title,
          year: Number(String(d.release_date || '').slice(0, 4)) || null,
          poster: d.poster_path || null,
          lb: suya?.mdb?.letterboxd ?? null,
          lb_votes: suya?.mdb?.lb_votes ?? null,
          sigma: suya?.mdb?.score ?? null,
          imdb: suya?.mdb?.imdb ?? null,
          director: (d.credits?.crew || []).find((x) => x.job === 'Director')?.name || null,
          director_iso: null,
          origen: (d.origin_country || []).join(','),
          motivo: 'manual',
        });
      } catch {
        /* si TMDB no la conoce, no hay nada que añadir */
      }
    }

    // 4. el orden, el desempate por canon y los dos puestos
    const avales = conteoAvales(admitidas.map((a) => a.tmdb_id));
    for (const a of admitidas) {
      a.avales = avales[a.tmdb_id]?.total || 0;
      a.ganados = avales[a.tmdb_id]?.ganados || 0;
    }
    admitidas.sort(ordenar);
    admitidas.forEach((a, i) => {
      a.rank_global = i + 1;
    });
    const porAnio = new Map();
    for (const a of admitidas) {
      const lista = porAnio.get(a.year) || [];
      lista.push(a);
      porAnio.set(a.year, lista);
    }
    for (const lista of porAnio.values()) {
      lista.forEach((a, i) => {
        a.rank_anio = i + 1;
      });
    }

    // 4 bis. ¿SE PUEDE GUARDAR ESTO?
    //
    // El guardado empieza por un DELETE, así que una reconstrucción que salió
    // corta no deja un país peor: lo deja VACÍO, y encima con `error: null`.
    // Pasaba de verdad —con el cupo del día gastado, `enrichWithScores` no pide
    // nada, se calla, y `conNota` queda en cero—, y el país bueno de ayer
    // desaparecía por pulsar un botón. Antes que eso, no se toca nada y se dice
    // por qué.
    const previas = yaConstruidas(ISO);
    // Se corta por lo sano en los DOS casos, y no solo al reconstruir: un país
    // que se construye POR PRIMERA VEZ con el cupo corto se guardaba entero y
    // sin error, o sea que quedaba a medias con pinta de completo — y luego se
    // empaquetaba así en el repositorio, que es peor todavía. Un décimo de las
    // notas sin pedir ya deforma el orden: lo que falta no es un ruido, es
    // justamente lo que no se ha podido puntuar.
    if (sinCupo > porPedir / 10 || (previas && admitidas.length < previas / 2)) {
      throw new Error(
        `Cupo de MDBList agotado: quedaban ${sinCupo} notas por pedir de ${porPedir} y ${nombre} saldría a medias. ` +
          (previas ? 'No se ha tocado el que ya había. ' : 'No se ha guardado nada. ') +
          'Vuelve a intentarlo mañana, cuando el cupo se reponga.'
      );
    }

    // 5. guardar. Se queda TODO lo admitido y no solo el top: el recorte a 100
    //    o a 20 lo hace la consulta, así que cambiar los tamaños no obliga a
    //    reconstruir el país entero.
    const guardar = db.transaction((filas) => {
      db.prepare("DELETE FROM country_films WHERE iso = ? AND fuente = 'lb'").run(ISO);
      const ins = db.prepare(
        `INSERT INTO country_films (iso, fuente, tmdb_id, title, original_title, year, poster, lb, lb_votes, sigma, imdb,
           avales, ganados, director, director_iso, origen, motivo, rank_global, rank_anio)
         VALUES (@iso, 'lb', @tmdb_id, @title, @original_title, @year, @poster, @lb, @lb_votes, @sigma, @imdb,
           @avales, @ganados, @director, @director_iso, @origen, @motivo, @rank_global, @rank_anio)`
      );
      for (const f of filas) ins.run({ iso: ISO, ...f });
    });
    guardar(admitidas);

    const resumen = {
      iso: ISO,
      fuente: 'lb',
      at: Date.now(),
      candidatos: candidatos.length,
      con_nota: conNota.length,
      guardadas: admitidas.length,
      del_palmares: delPalmares,
      sin_cupo: sinCupo,
      segundos: Math.round((Date.now() - t0) / 1000),
      error: null,
    };
    guardarBuild(resumen);
    return resumen;
  } finally {
    // pase lo que pase la barra se apaga: una barra encendida para siempre
    // deja la página diciendo que trabaja cuando ya no trabaja nadie
    clearBuildProgress(job);
  }
}

/**
 * EL ESTADO DEL PASE, para poder arrancarlo y sondearlo.
 *
 * Construir un país son minutos: recorre cien años de TMDB, pide un par de
 * miles de notas a MDBList y baja la ficha de cada superviviente. Servir eso
 * DENTRO de la petición acaba en un 504 del proxy inverso mientras el servidor
 * sigue trabajando por detrás, así que se arranca y se pregunta — el mismo
 * trato que la detección de emergentes.
 *
 * El detalle de la barra (qué paso y por dónde va) sale de `/api/build-progress`,
 * que ya lo publica `setBuildProgress`.
 */
export const paisesStatus = { running: false, iso: null, fuente: null, desde: 0, error: null, ultimo: null };

export function arrancarPais(iso, fuente = 'lb') {
  const ISO = String(iso || '').toUpperCase();
  const F = fuente === 'fa' ? 'fa' : 'lb';
  paisesStatus.running = true;
  paisesStatus.iso = ISO;
  paisesStatus.fuente = F;
  paisesStatus.desde = Date.now();
  paisesStatus.error = null;
  // El import de FilmAffinity va aquí dentro y no arriba porque ese módulo
  // importa de este: cargarlo al vuelo rompe el ciclo sin tener que partir el
  // catálogo de países en dos ficheros.
  const trabajo =
    F === 'fa'
      ? import('./filmaffinity.js').then((m) => m.construirPaisFA(ISO))
      : construirPais(ISO);
  trabajo
    .then((r) => {
      paisesStatus.ultimo = r;
    })
    .catch((err) => {
      // el fallo se guarda TAMBIÉN en la tabla: si no, al recargar la página el
      // país aparece simplemente vacío y no hay forma de saber que se intentó
      paisesStatus.error = String(err.message || err);
      apuntarFallo(ISO, paisesStatus.error, F);
    })
    .finally(() => {
      paisesStatus.running = false;
    });
  return { started: true, iso: ISO, fuente: F };
}

/** Cuántas películas tiene ya construidas ese país en la lista nuestra. */
const yaConstruidas = (iso) =>
  db.prepare("SELECT COUNT(*) n FROM country_films WHERE iso = ? AND fuente = 'lb'").get(iso).n;

export function guardarBuild(r) {
  db.prepare(
    `INSERT INTO country_builds (iso, fuente, at, candidatos, con_nota, guardadas, del_palmares, sin_cupo, segundos, error)
     VALUES (@iso, @fuente, @at, @candidatos, @con_nota, @guardadas, @del_palmares, @sin_cupo, @segundos, @error)
     ON CONFLICT(iso, fuente) DO UPDATE SET at = @at, candidatos = @candidatos, con_nota = @con_nota,
       guardadas = @guardadas, del_palmares = @del_palmares, sin_cupo = @sin_cupo, segundos = @segundos,
       error = @error`
  ).run(r);
}

/** Deja constancia de que un país se intentó y falló, para poder decirlo. */
export function apuntarFallo(iso, mensaje, fuente = 'lb') {
  const ISO = String(iso).toUpperCase();
  const previo = db.prepare('SELECT * FROM country_builds WHERE iso = ? AND fuente = ?').get(ISO, fuente);
  guardarBuild({
    iso: ISO,
    fuente,
    // La fecha y las cifras NO se tocan: siguen siendo las de la última
    // construcción buena, que es la que de verdad hay en la tabla. Poniéndolas
    // a cero, la página servía 1.230 películas encima de un letrero que decía
    // «0 candidatas, 0 con nota»: las dos cosas no pueden ser verdad a la vez.
    at: previo?.at ?? Date.now(),
    candidatos: previo?.candidatos ?? 0,
    con_nota: previo?.con_nota ?? 0,
    guardadas: previo?.guardadas ?? 0,
    del_palmares: previo?.del_palmares ?? 0,
    sin_cupo: previo?.sin_cupo ?? 0,
    segundos: previo?.segundos ?? 0,
    error: String(mensaje || 'error').slice(0, 300),
  });
}

// --- las consultas ------------------------------------------------------------

/**
 * Lo tuyo: qué tienes y qué has visto. Las dos cosas en una consulta porque la
 * parrilla las pinta juntas —la estrella de vista va sobre el cartel— y son la
 * diferencia entre una lista y una caza.
 */
/**
 * LOS PAÍSES QUE VIENEN HECHOS.
 *
 * Construir un país son minutos de TMDB y unas cuatro mil peticiones de
 * MDBList, y el cupo diario son veinte mil: el catálogo entero serían más de
 * diez días. Así que los que están construidos VIAJAN con el software, en
 * `data/paises/XX.js`, y la primera vez que se piden se siembran en la tabla.
 * Desde ahí todo funciona igual —el cruce con tu Plex, el ✎, Radarr—, y quien
 * quiera rehacer uno sigue teniendo el botón.
 *
 * Se carga al vuelo y no de golpe: son nueve megas si se empaquetan los setenta
 * y dos, y no tiene sentido tenerlos todos en memoria para mirar uno.
 */
export const PAQUETE_VERSION = 1;
const MOTIVO_DE = { 1: 'director', 2: 'origen', 3: 'manual' };

export async function sembrarPais(iso) {
  const ISO = String(iso || '').toUpperCase();
  if (!esPaisConocido(ISO)) return false;
  // si ya está construido (o sembrado) en esta base, no se toca nada
  if (db.prepare("SELECT 1 FROM country_builds WHERE iso = ? AND fuente = 'lb'").get(ISO)) return false;

  let paquete;
  try {
    ({ PAIS: paquete } = await import(`./data/paises/${ISO}.js`));
  } catch {
    return false; // ese país no viene empaquetado todavía
  }
  if (!paquete?.filas?.length) return false;

  const sembrar = db.transaction(() => {
    const ins = db.prepare(
      `INSERT OR REPLACE INTO country_films
         (iso, fuente, tmdb_id, title, year, poster, lb, lb_votes, sigma, avales, ganados,
          director, motivo, rank_global, rank_anio)
       VALUES (@iso, 'lb', @tmdb_id, @title, @year, @poster, @lb, @lb_votes, @sigma, @avales, @ganados,
          @director, @motivo, @rank_global, @rank_anio)`
    );
    for (const t of paquete.filas) {
      const [rank_global, rank_anio, tmdb_id, year, lb, lb_votes, sigma, avales, ganados, motivo, title, poster, director] = t;
      ins.run({
        iso: ISO, tmdb_id, title, year, poster, lb, lb_votes, sigma, avales, ganados, director,
        motivo: MOTIVO_DE[motivo] || 'origen', rank_global, rank_anio,
      });
    }
    guardarBuild({
      iso: ISO,
      fuente: 'lb',
      at: Date.parse(`${paquete.hasta}T12:00:00Z`) || Date.now(),
      candidatos: paquete.candidatos || 0,
      con_nota: paquete.con_nota || 0,
      guardadas: paquete.guardadas || paquete.filas.length,
      del_palmares: paquete.del_palmares || 0,
      sin_cupo: 0,
      segundos: 0,
      error: null,
    });
  });
  sembrar();
  // Las correcciones a mano mandan también sobre lo que viene de fábrica.
  for (const o of overridesDePais(ISO)) {
    if (o.modo === 'drop') db.prepare('DELETE FROM country_films WHERE iso = ? AND tmdb_id = ?').run(ISO, o.tmdb_id);
  }
  return true;
}

const libreria = () => {
  const tengo = new Set();
  const visto = new Set();
  for (const r of db.prepare('SELECT tmdb_id, view_count FROM movies WHERE tmdb_id IS NOT NULL').all()) {
    tengo.add(r.tmdb_id);
    if (r.view_count > 0) visto.add(r.tmdb_id);
  }
  return { tengo, visto };
};

/** El catálogo entero con el estado de cada país: lo que pinta el selector. */
export function catalogoPaises() {
  const construidos = new Map();
  for (const r of db
    .prepare('SELECT iso, fuente, at, candidatos, con_nota, guardadas, del_palmares, sin_cupo, segundos, error FROM country_builds')
    .all()) {
    construidos.set(`${r.iso}:${r.fuente}`, r);
  }
  return Object.entries(PAISES)
    .map(([iso, p]) => ({
      iso,
      ...p,
      ...TIERS[p.tier],
      // Un país empaquetado cuenta como construido aunque esta base no lo haya
      // sembrado todavía: se siembra sola en cuanto se pide, y decir «sin
      // construir» de algo que abre hecho sería mentir en el desplegable.
      build: construidos.get(`${iso}:lb`) || (PAQUETES[iso] ? { ...PAQUETES[iso], deFabrica: true } : null),
      buildFa: construidos.get(`${iso}:fa`) || null,
    }))
    .sort((a, b) => a.es.localeCompare(b.es, 'es'));
}

/**
 * Las películas de un país. Sin año, el top histórico; con año, las de ese año.
 * `owned` sale de tu Plex, que es lo que convierte una lista en una caza.
 */
export function peliculasDePais(iso, { anio = null, limite = null, fuente = 'lb' } = {}) {
  const ISO = String(iso || '').toUpperCase();
  if (!esPaisConocido(ISO)) throw new Error(`País desconocido: ${iso}`);
  const F = fuente === 'fa' ? 'fa' : 'lb';
  // Un año se compara con `!= null`, no por verdadero: el 0 es falsy y colaba
  // como «sin año», devolviendo el top histórico mientras la respuesta seguía
  // diciendo `anio: 0`.
  const anioValido = anio != null && Number.isInteger(anio) ? anio : null;
  const tier = tierDe(ISO);
  // El ranking de FilmAffinity es suyo y llega tal cual: no tiene vista por
  // año que recortar ni tamaño por categoría que aplicar.
  const tope = Math.min(limite || (F === 'fa' ? 200 : anioValido != null ? tier.anio : tier.global), 500);
  const filas = anioValido != null && F === 'lb'
    ? db
        .prepare("SELECT * FROM country_films WHERE iso = ? AND fuente = 'lb' AND year = ? ORDER BY rank_anio LIMIT ?")
        .all(ISO, anioValido, tope)
    : db
        .prepare('SELECT * FROM country_films WHERE iso = ? AND fuente = ? ORDER BY rank_global LIMIT ?')
        .all(ISO, F, tope);
  const { tengo, visto } = libreria();
  // `poster_path` y `avales` con la forma que ya lee `TmdbCard`: adaptar aquí
  // es una línea, y adaptar la tarjeta sería tocar la parrilla de nueve páginas
  return filas.map((f) => ({
    ...f,
    poster_path: f.poster,
    // `TmdbCard` pinta la fecha desde `date`, y sin esto las cien tarjetas
    // decían «Sin fecha» encima de su propio año
    date: f.year ? `${f.year}-01-01` : null,
    avales: f.avales ? { total: f.avales, ganados: f.ganados } : null,
    owned: tengo.has(f.tmdb_id),
    watched: visto.has(f.tmdb_id),
  }));
}

/** Los años que tienen película, con cuántas: la regleta de la vista por año. */
export function aniosDePais(iso) {
  const ISO = String(iso || '').toUpperCase();
  if (!esPaisConocido(ISO)) throw new Error(`País desconocido: ${iso}`);
  return db
    .prepare(
      "SELECT year, COUNT(*) n FROM country_films WHERE iso = ? AND fuente = 'lb' AND year IS NOT NULL GROUP BY year ORDER BY year"
    )
    .all(ISO);
}

export function ponerOverride(iso, tmdbId, modo, title = null) {
  const ISO = String(iso || '').toUpperCase();
  if (!esPaisConocido(ISO)) throw new Error(`País desconocido: ${iso}`);
  if (modo !== 'add' && modo !== 'drop') throw new Error('El modo solo puede ser add o drop');
  const id = Number(tmdbId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Eso no es un id de TMDB');
  db.prepare(
    `INSERT INTO country_overrides (iso, tmdb_id, modo, title, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(iso, tmdb_id) DO UPDATE SET modo = excluded.modo, title = excluded.title, at = excluded.at`
  ).run(ISO, id, modo, title, Date.now());
  // El `drop` se aplica en el acto sobre lo ya construido: obligar a
  // reconstruir el país entero para quitar UNA película sería castigar la
  // corrección, que es justo lo que queremos que sea fácil. El `add` sí espera
  // a la reconstrucción, porque hay que ir a buscar su ficha y sus notas.
  // borra en las DOS fuentes: la corrección dice «esta película no es de este
  // país», y eso no depende de quién la haya listado
  if (modo === 'drop') db.prepare('DELETE FROM country_films WHERE iso = ? AND tmdb_id = ?').run(ISO, id);
  return { ok: true, pendiente: modo === 'add' };
}

export function quitarOverride(iso, tmdbId) {
  const ISO = String(iso || '').toUpperCase();
  if (!esPaisConocido(ISO)) throw new Error(`País desconocido: ${iso}`);
  db.prepare('DELETE FROM country_overrides WHERE iso = ? AND tmdb_id = ?').run(ISO, Number(tmdbId));
  return { ok: true };
}

export const overridesDePais = (iso) =>
  db
    .prepare('SELECT tmdb_id, modo, title, at FROM country_overrides WHERE iso = ? ORDER BY at DESC')
    .all(String(iso || '').toUpperCase());
