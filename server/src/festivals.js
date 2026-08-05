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
import { mapPool } from './pool.js';
import { cachePrefix } from './cache-versions.js';
import { searchMovieCandidates, movieDirectors, movieSummary, findPersonInfo, latinizeNames } from './tmdb.js';
import { enrichWithScores } from './mdblist.js';
import { watchedIndex, isWatched } from './letterboxd.js';
import { SIGHT_AND_SOUND_2022 } from './data/sight-and-sound-2022.js';
import { OSCAR_BEST_PICTURE } from './data/oscar-best-picture.js';

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
  tiff: {
    name: 'Toronto (TIFF)',
    award: 'Platform Prize',
    article: (y) => `${y} Toronto International Film Festival`,
    section: /^platform/i,
    sinceYear: 2015, // la sección Platform nació en 2015
    awardPage: 'Platform Prize',
    awardSection: /^competition$/i,
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
  horizontes: {
    name: 'S.S. · Horizontes Latinos',
    award: 'Premio Horizontes',
    article: (y) => `${nth(y - 1952)} San Sebastián International Film Festival`,
    section: /latin horizons|horizontes latinos/i,
    sinceYear: 2002, // la sección nació en 2002
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
  },
  cesar: {
    name: 'Premios César',
    award: 'César a la mejor película',
    group: 'premio',
    awardNominees: true,
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

export function festivalsIndex() {
  return {
    currentYear: new Date().getFullYear(),
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

async function wikiParse(params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', action: 'parse', ...params });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${qs}`, {
    headers: { 'User-Agent': 'PowaFlex/0.9 (self-hosted; https://github.com/ForeverRamone/PowaFlex)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Wikipedia respondió ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`Wikipedia: ${j.error.info || j.error.code}`);
  return j.parse;
}

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
    // enlaces sin renderizar que se cuelan en algunos artículos (Sundance):
    // «[[Fulano|Fulano]] [wd]» debe quedar en «Fulano»
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    // marcadores tipo [wd] (wikidata) o [ja] (interwiki) junto a los nombres
    .replace(/\[\s*[a-z]{2,3}\s*\]/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*$/, '')
    .trim();
}

/**
 * Limpia un título de celda de tabla: marcadores de premio («Alpha (QP)»), el
 * «(ex-æquo)» de los empates de BAFTA, dagas, y los paréntesis finales con el
 * título original que las tablas viejas pegan en la misma celda («Ballad of a
 * Soldier (Баллада о солдате, Ballada o soldate)»). Los grupos finales de
 * paréntesis se pelan repetidamente: un título real no termina en paréntesis.
 */
export function cleanTableTitle(s) {
  if (!s) return null;
  let t = String(s).replace(/†/g, '').trim();
  for (let i = 0; i < 3; i++) {
    const pelado = t.replace(/\s*\([^()]*\)$/, '').trim();
    if (pelado === t || !pelado) break;
    t = pelado;
  }
  return t || String(s).replace(/†/g, '').trim();
}

/**
 * Saca de la sección la primera wikitable que parezca una selección: necesita
 * una columna de director/a y otra de título. Las tablas de estos artículos
 * llevan cabeceras tipo «English title / Original title / Director(s) /
 * Production country» y varían poco entre festivales; se localiza cada columna
 * por su cabecera en vez de por posición para aguantar los cambios de orden.
 */
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
    for (const row of rows.slice(1)) {
      const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(stripTags);
      if (!cells.length) continue;
      // Cuando el título original coincide con el inglés, la fila viene SIN esa
      // celda y todas las columnas posteriores se corren una a la izquierda
      // (pasaba en Cannes 2025: el país acababa de director/a). Se detecta por
      // el número de celdas y se recoloca.
      const sinOriginal = idxOrig >= 0 && cells.length === headers.length - 1;
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
export function parseWinnersTables(html, { keepAll = false } = {}) {
  const out = [];
  const tables = String(html || '').match(/<table[^>]*wikitable[\s\S]*?<\/table>/gi) || [];
  for (const t of tables) {
    const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (rows.length < 2) continue;
    const headers = (rows[0].match(/<th[\s\S]*?<\/th>/gi) || []).map((c) => stripTags(c).toLowerCase());
    const idxYear = headers.findIndex((h) => /year/.test(h));
    const idxTitle = headers.findIndex((h) => /english title|^film\b|^title/.test(h));
    const idxOrig = headers.findIndex((h) => /original title/.test(h));
    const idxDir = headers.findIndex((h) => /director/.test(h));
    const idxCountry = headers.findIndex((h) => /countr/.test(h));
    if (idxYear === -1 || idxDir === -1 || idxTitle === -1) continue;

    let lastYear = null;
    const delTable = [];
    for (const row of rows.slice(1)) {
      const rawCells = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
      let cells = rawCells.map(stripTags);
      if (!cells.length) continue;
      // El año abre la fila de la ganadora — como <th> (Palma), como <td
      // rowspan> que abraza a las nominadas (Goya, BAFTA) o con adorno
      // («2020 (35th)»)— y desaparece en ex aequo y nominadas. OJO con las
      // películas tituladas «1917»: un año pelado en <td> solo cuenta si la
      // fila trae TODAS las columnas (las nominadas van a una de menos).
      const y0 = cells[0].match(/^((?:19|20)\d{2})\b/);
      const esFilaDeAño =
        !!y0 &&
        (/^<th/i.test(rawCells[0]) ||
          /rowspan/i.test(rawCells[0]) ||
          /^(?:19|20)\d{2}\s*[([]/.test(cells[0]) ||
          (/^(?:19|20)\d{2}$/.test(cells[0]) && cells.length === headers.length));
      if (esFilaDeAño) {
        lastYear = Number(y0[1]);
        cells = [String(lastYear), ...cells.slice(1)];
      } else {
        cells = [String(lastYear ?? ''), ...cells];
      }
      // sin celda de título original (coincide con el inglés): recolocar
      const sinOriginal = idxOrig >= 0 && cells.length === headers.length - 1;
      const cell = (i) => {
        if (i < 0) return null;
        const j = sinOriginal && i > idxOrig ? i - 1 : i;
        return j < cells.length ? cells[j] : null;
      };
      const director = cell(idxDir);
      const title = cleanTableTitle(cell(idxTitle));
      // años sin premio (COVID, festival cancelado) vienen sin director
      if (!lastYear || !title || !director) continue;
      delTable.push({
        // el artículo del Platform Prize lista la sección ENTERA con la
        // ganadora sombreada: si la tabla resalta filas, solo esas son palmarés
        highlighted: /background\s*:|#faeb86|#eedd82/i.test(row),
        film: {
          year: lastYear,
          title,
          original_title: sinOriginal ? title : cleanTableTitle(cell(idxOrig)) || title,
          director,
          country: cell(idxCountry),
        },
      });
    }
    const hi = delTable.filter((r) => r.highlighted);
    // tabla mixta (ganadora sombreada entre nominadas) vs tabla de solo
    // ganadoras (Palme): en la mixta, «winner» es el sombreado; en la de solo
    // ganadoras lo son todas
    const mixta = hi.length && hi.length < delTable.length;
    if (keepAll) {
      for (const r of delTable) out.push({ ...r.film, winner: mixta ? r.highlighted : true });
    } else {
      for (const r of mixta ? hi : delTable) out.push(r.film);
    }
  }
  return out.sort((a, b) => b.year - a.year);
}

/**
 * Palmarés de Sundance: «List of Sundance Film Festival award winners» no
 * lleva tablas sino viñetas por año, con los Grand Jury Prize en el PRIMER
 * bloque («World Cinema Dramatic – Título by Director»). Nos quedamos solo con
 * el premio gordo de la vía Óscar: la primera línea de cada año que casa con
 * ese patrón (las siguientes apariciones de «World Cinema Dramatic» son el
 * premio del público y el de dirección, que además usa «for» en vez de «by»).
 */
export function parseSundanceWinners(html) {
  const out = [];
  const src = String(html || '');
  const headings = [...src.matchAll(/<h[23][^>]*>[\s\S]*?<\/h[23]>/gi)];
  // la etiqueta del premio ha cambiado tres veces: «World Cinema Jury Prize
  // Dramatic» (2005-2012), «World Cinema Grand Jury Prize: Dramatic
  // [Competition]» (2013-2022) y el «World Cinema Dramatic» a secas de ahora.
  // La forma explícita manda (el premio del público a veces se lista ANTES);
  // la corta solo vale como respaldo, fiándose de que el bloque del jurado va
  // primero. Fuera dirección/guion/montaje y documentales.
  const esGranPremio = (label) =>
    /world cinema/.test(label) &&
    /dramatic/.test(label) &&
    !/documentary|directing|special|cinematography|editing|screenwriting|audience/.test(label) &&
    /jury prize/.test(label);
  const esFormaCorta = (label) => /^world cinema dramatic$/.test(label);

  for (let h = 0; h < headings.length; h++) {
    const year = Number((stripTags(headings[h][0]).match(/^((?:19|20)\d{2})/) || [])[1]);
    if (!year) continue;
    const chunk = src.slice(
      headings[h].index + headings[h][0].length,
      h + 1 < headings.length ? headings[h + 1].index : src.length
    );
    let ganadora = null;
    for (const li of chunk.match(/<li[\s\S]*?<\/li>/gi) || []) {
      const texto = stripTags(li);
      const m = /^(.+?)\s*[–—-]\s*(.+)$/.exec(texto);
      if (!m) continue;
      const label = m[1].trim().toLowerCase();
      if (!esGranPremio(label) && !esFormaCorta(label)) continue;
      // el crédito de dirección ha ido variando: «Título by Director»,
      // «Título (Director)» o, en los primeros años, solo el título
      const resto = m[2].trim();
      let title = resto;
      let director = null;
      const porBy = /^(.+?)\s+by\s+(.+)$/.exec(resto);
      const porParens = /^(.+?)\s*\(([^)]+)\)$/.exec(resto);
      if (porBy) [, title, director] = porBy;
      else if (porParens && /[a-z]\s+[a-z]/i.test(porParens[2])) [, title, director] = porParens;
      const fila = { year, title: title.trim(), original_title: title.trim(), director: director?.trim() || null, country: null };
      if (esGranPremio(label)) {
        ganadora = fila;
        break; // la etiqueta explícita es inequívoca
      }
      if (!ganadora) ganadora = fila; // forma corta: la primera aparición
    }
    if (ganadora) out.push(ganadora);
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
// espacios («Hirokazu Kore-eda» y «Hirokazu Koreeda» son la misma persona)
const normName = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

// tokens de un nombre: guiones fusionados («Kore-eda» → «koreeda»), sin
// acentos, y fuera iniciales sueltas («Joseph L. Mankiewicz» → joseph,
// mankiewicz)
const nameTokens = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);

// ¿Mismo nombre? Insensible al ORDEN de las palabras: las tablas de Wikipedia
// usan a veces el orden japonés («Imamura Shōhei») donde TMDB dice «Shohei
// Imamura». Basta con que los tokens del nombre corto estén todos en el largo
// (cubre también segundos nombres e iniciales).
const sameName = (a, b) => {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // cada token del nombre corto debe estar en el largo, o ser su abreviatura:
  // «Carl Th. Dreyer» ≡ «Carl Theodor Dreyer» (el S&S y las tablas abrevian)
  return corto.every((t) => largo.some((l) => l === t || l.startsWith(t)));
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
export async function elegirCandidato(row, year, candidatos, inLib, dirsDe) {
  // el estreno puede bailar un año respecto al festival; sin fecha aún
  // (película recién anunciada) también vale como candidata.
  // Si el año de la fila viniera roto, filtrar por ventana descartaría a TODOS
  // los candidatos con fecha y solo quedaría morralla sin fecha.
  const enVentana = Number.isFinite(year)
    ? candidatos.filter((c) => !c.date || Math.abs(Number(c.date.slice(0, 4)) - year) <= 1)
    : [...candidatos];

  const wanted = normName(row.title);
  const tituloClavado = (c) => normName(c.title) === wanted || normName(c.original_title) === wanted;
  const distAño = (c) => (c.date && Number.isFinite(year) ? Math.abs(Number(c.date.slice(0, 4)) - year) : 0.5);
  enVentana.sort(
    (a, b) =>
      (tituloClavado(a) ? 0 : 1) - (tituloClavado(b) ? 0 : 1) ||
      (inLib.has(a.id) ? 0 : 1) - (inLib.has(b.id) ? 0 : 1) ||
      distAño(a) - distAño(b)
  );

  let tmdbId = null;
  let fallosRed = false;
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
    if (dirs.length) {
      if (directorsMatch(row.director, dirs)) {
        tmdbId = c.id;
        break;
      }
    } else {
      sinCreditos.push(c);
    }
  }
  // Solo si NADIE con créditos lo demostró (y sin cortes de red a medias),
  // valen las fichas sin equipo por título clavado — las recién anunciadas.
  if (!tmdbId && !fallosRed) {
    const c = sinCreditos.find((x) => !row.director || tituloClavado(x));
    if (c) tmdbId = c.id;
  }
  return { tmdbId, fallosRed };
}

async function resolveFilms(rows, yearOf) {
  const films = new Array(rows.length);
  let errors = 0; // fallos de RED (429 de TMDB…): quien llama no debe cachear
  // correcciones manuales del usuario: mandan sobre todo lo demás
  const overrides = new Map(
    db.prepare('SELECT key, tmdb_id FROM match_overrides').all().map((o) => [o.key, o.tmdb_id])
  );
  // para desempatar dobles legítimos (Fanny y Alexander cine vs TV, ambos de
  // Bergman): entre candidatos verificados, gana el que YA está en tu Plex
  const inLib = new Set(db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((m) => m.tmdb_id));
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= rows.length) return;
      const r = rows[idx];
      const y = yearOf(r);

      // Emparejado verificado YA cacheado (30 días): ni búsquedas ni créditos.
      // Clave: sin esto, un palmarés grande con un solo 429 no se cacheaba
      // entero y CADA visita relanzaba la ráfaga completa contra TMDB — que
      // volvía a cortar. Con la caché por película, cada reintento solo toca
      // lo que falló y converge en un par de cargas.
      const claveBase = festivalOverrideKey(r.title, y, r.director);
      const matchKey = `film_match:v2:${claveBase}`;
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
        let sum = null;
        try {
          sum = await movieSummary(matchHit.id);
        } catch {
          errors++; // ficha coja por la red: que no se cachee la página y se reintente
        }
        films[idx] = {
          ...r,
          tmdb_id: matchHit.id,
          poster_path: sum?.poster_path || null,
          date: sum?.date || null,
          year: r.year ?? (sum?.date ? Number(sum.date.slice(0, 4)) : null),
        };
        continue;
      }

      // filas con TMDB id de origen (dataset de Wikidata): nada que verificar
      if (r.tmdb_id) {
        let sum = null;
        try {
          sum = await movieSummary(r.tmdb_id);
        } catch {
          errors++;
        }
        films[idx] = {
          ...r,
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
      const { tmdbId, fallosRed } = await elegirCandidato(r, y, cands, inLib, (id) =>
        movieDirectors(id).catch(() => null)
      );
      // el emparejado limpio se guarda por película: los reintentos tras un
      // corte de red solo tocan lo que falló
      if (tmdbId && !fallosRed) cacheWrite(matchKey, { id: tmdbId });

      let sum = null;
      let fichaCoja = false;
      if (tmdbId) {
        try {
          sum = await movieSummary(tmdbId);
        } catch {
          fichaCoja = true; // ficha coja: no cachear la página, reintentar luego
        }
      }
      if (fallosRed || fichaCoja) errors++;
      films[idx] = {
        ...r,
        tmdb_id: tmdbId,
        poster_path: sum?.poster_path || null,
        date: sum?.date || null,
        // en el palmarés `year` ya es el del premio y se respeta; en una
        // edición no viene y se toma el de estreno de TMDB
        year: r.year ?? (sum?.date ? Number(sum.date.slice(0, 4)) : null),
      };
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
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

  return {
    festival: key,
    name: f.name,
    award: f.award,
    year,
    section,
    note,
    source: `https://en.wikipedia.org/wiki/${page.replace(/ /g, '_')}`,
    fetchedAt: Date.now(),
    films,
    unresolved: films.filter((x) => !x.tmdb_id).length,
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
async function decorateLive(films) {
  const inLib = new Set(db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id));
  const widx = watchedIndex();
  const out = films.map((x) => ({
    ...x,
    owned: x.tmdb_id ? inLib.has(x.tmdb_id) : false,
    watched: isWatched({ tmdb_id: x.tmdb_id, title: x.title, year: x.year }, widx),
  }));
  await enrichWithScores(out, { maxFetch: 50 });
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

async function cachedAwardRows(f, sufijo, build) {
  const key = `${cachePrefix('festival')}:awardrows:${sufijo}:${f.awardPage}`;
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
async function getAwardRows(f, { keepAll = false } = {}) {
  return cachedAwardRows(f, keepAll ? 'todas' : 'ganadoras', async () => {
    const meta = await wikiParse({ page: f.awardPage, prop: 'sections' });
    const sec = (meta.sections || []).find((s) => f.awardSection.test(stripTags(s.line)));
    if (!sec) throw new Error(`No se encontró la lista de ganadoras en «${f.awardPage}» de Wikipedia.`);
    const parsed = await wikiParse({ page: f.awardPage, section: String(sec.index), prop: 'text' });
    let rows = parseWinnersTables(parsed.text, { keepAll });
    if (!rows.length) {
      const full = await wikiParse({ page: f.awardPage, prop: 'text' });
      rows = parseWinnersTables(full.text, { keepAll });
    }
    return rows;
  });
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
      : (await getAwardRows(f, { keepAll: true })).filter((r) => r.year === year);
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
      : `https://en.wikipedia.org/wiki/${f.awardPage.replace(/ /g, '_')}`,
    fetchedAt: Date.now(),
    films,
    unresolved: films.filter((x) => !x.tmdb_id).length,
    resolveErrors: errors,
  };
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
    let source = f.awardPage ? `https://en.wikipedia.org/wiki/${f.awardPage.replace(/ /g, '_')}` : null;
    let note = null;
    if (f.staticAward) {
      // solo las ganadoras del dataset (las nominadas viven en la vista por año)
      rows = f.staticAward.filter((r) => r.winner);
      source = 'https://www.wikidata.org/wiki/Q102427';
      note = `Las ${rows.length} ganadoras de la historia; en «Nominadas por año» están las ${f.staticAward.length} candidatas completas.`;
    } else if (f.staticList) {
      // dataset fijo empaquetado con la app (Sight & Sound se renueva en 2032)
      rows = f.staticList.map((r) => ({
        year: r.year, title: r.title, original_title: r.title, director: r.director, country: null, rank: r.rank,
      }));
      source = 'https://www.bfi.org.uk/sight-and-sound/greatest-films-all-time';
      note = `La lista extendida de la encuesta de la crítica (${rows.length} películas, empates incluidos), ordenada por puesto. Se renueva cada década: la próxima, en 2032.`;
    } else if (f.awardParse === 'cahiers') {
      // el «palmarés» de Cahiers: la número 1 de cada año, reciente primero
      // como el resto de palmareses
      rows = (await getCahiersRows(f))
        .filter((r) => r.rank === 1)
        .map(({ rank, tied, ...r }) => r)
        .sort((a, b) => b.year - a.year);
      note = 'La número 1 de cada año para la crítica de Cahiers; en «Top 10 por año» está la lista completa de cada año.';
    } else if (f.awardParse === 'sundanceList') {
      // la lista de Sundance va por años con viñetas: página entera de una vez
      const parsed = await wikiParse({ page: f.awardPage, prop: 'text' });
      rows = parseSundanceWinners(parsed.text).filter((r) => r.year >= f.sinceYear);
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
      unresolved: films.filter((x) => !x.tmdb_id).length,
      resolveErrors: errors,
    };
    // con fallos de red no se cachea: se reintenta en la siguiente visita
    if (!base.resolveErrors) cacheWrite(cacheKey, base);
  }
  return { ...base, films: await decorateLive(base.films) };
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
async function editionRowsLight(key, f, year) {
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
    for (const fest of agg.festivals) {
      const people = [];
      for (const d of fest.directors) {
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
