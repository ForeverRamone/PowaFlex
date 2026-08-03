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
import { cachePrefix } from './cache-versions.js';
import { searchMovieCandidates, movieDirectors, movieSummary } from './tmdb.js';
import { enrichWithScores } from './mdblist.js';
import { watchedIndex, isWatched } from './letterboxd.js';
import { SIGHT_AND_SOUND_2022 } from './data/sight-and-sound-2022.js';

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
  // --- premios anuales: solo palmarés, del artículo-lista de cada premio.
  // Sus tablas mezclan ganadora y nominadas con la ganadora sombreada: el
  // filtro de resaltadas de parseWinnersTables se queda solo con el palmarés.
  goya: {
    name: 'Premios Goya',
    award: 'Goya a la mejor película',
    group: 'premio',
    onlyWinners: true,
    awardPage: 'Goya Award for Best Film',
    awardSection: /^winners and nominees$/i,
  },
  cesar: {
    name: 'Premios César',
    award: 'César a la mejor película',
    group: 'premio',
    onlyWinners: true,
    awardPage: 'César Award for Best Film',
    awardSection: /^winners and nominees$/i,
  },
  bafta: {
    name: 'BAFTA',
    award: 'BAFTA a la mejor película',
    group: 'premio',
    onlyWinners: true,
    awardPage: 'BAFTA Award for Best Film',
    awardSection: /^winners and nominees$/i,
  },
  efa: {
    name: 'Cine Europeo (EFA)',
    award: 'Premio del Cine Europeo a la mejor película',
    group: 'premio',
    onlyWinners: true,
    awardPage: 'European Film Award for Best Film',
    awardSection: /^winners and nominees$/i,
  },
  oscarint: {
    name: 'Óscar internacional',
    award: 'Óscar a la mejor película internacional',
    group: 'premio',
    onlyWinners: true,
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
      // fuera los marcadores de premio pegados al título: «Alpha (QP)», «(CdO)»
      const clean = (s) => (s ? s.replace(/\s*\([A-Z][A-Za-z'’.]{0,4}\)\s*$/, '').trim() : null);
      out.push({
        title: clean(rawTitle),
        original_title: sinOriginal ? clean(rawTitle) : clean(cell(idxOrig)),
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
export function parseWinnersTables(html) {
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
      const clean = (s) => (s ? s.replace(/†/g, '').replace(/\s*\([A-Z][A-Za-z'’.]{0,4}\)\s*$/, '').trim() : null);
      const director = cell(idxDir);
      const title = clean(cell(idxTitle));
      // años sin premio (COVID, festival cancelado) vienen sin director
      if (!lastYear || !title || !director) continue;
      delTable.push({
        // el artículo del Platform Prize lista la sección ENTERA con la
        // ganadora sombreada: si la tabla resalta filas, solo esas son palmarés
        highlighted: /background\s*:|#faeb86|#eedd82/i.test(row),
        film: {
          year: lastYear,
          title,
          original_title: sinOriginal ? title : clean(cell(idxOrig)) || title,
          director,
          country: cell(idxCountry),
        },
      });
    }
    const hi = delTable.filter((r) => r.highlighted);
    for (const r of hi.length && hi.length < delTable.length ? hi : delTable) out.push(r.film);
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
  const set = new Set(largo);
  return corto.every((t) => set.has(t));
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
async function resolveFilms(rows, yearOf) {
  const films = new Array(rows.length);
  let errors = 0; // fallos de RED (429 de TMDB…): quien llama no debe cachear
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= rows.length) return;
      const r = rows[idx];
      const y = yearOf(r);

      const cands = [...(await searchMovieCandidates(r.title, y))];
      if (r.original_title && r.original_title !== r.title) {
        const vistos = new Set(cands.map((c) => c.id));
        for (const c of await searchMovieCandidates(r.original_title, y)) {
          if (!vistos.has(c.id)) cands.push(c);
        }
      }
      // el estreno puede bailar un año respecto al festival; sin fecha aún
      // (película recién anunciada) también vale como candidata
      const enVentana = cands.filter((c) => !c.date || Math.abs(Number(c.date.slice(0, 4)) - y) <= 1);
      // los títulos clavados primero: entre dos candidatos verificables, gana
      // el que además se llama igual
      const wanted = normName(r.title);
      const tituloClavado = (c) => normName(c.title) === wanted || normName(c.original_title) === wanted;
      enVentana.sort((a, b) => (tituloClavado(a) ? 0 : 1) - (tituloClavado(b) ? 0 : 1));

      let tmdbId = null;
      let fallosRed = false;
      for (const c of enVentana) {
        // null = fallo de red (no «sin créditos»): probar el siguiente y, si la
        // película acaba sin ficha por esto, avisar para que NO se cachee
        const dirs = await movieDirectors(c.id).catch(() => null);
        if (dirs === null) {
          fallosRed = true;
          continue;
        }
        // Recién anunciadas: TMDB puede tener la ficha SIN equipo todavía. Sin
        // director que comprobar, el título clavado basta (los dobles como la
        // otra «Bunker» sí tienen créditos y caen en la comprobación normal).
        const vale = dirs.length ? directorsMatch(r.director, dirs) : !r.director || tituloClavado(c);
        if (vale) {
          tmdbId = c.id;
          break;
        }
      }
      if (!tmdbId && fallosRed) errors++;

      let sum = null;
      if (tmdbId) {
        try {
          sum = await movieSummary(tmdbId);
        } catch {}
      }
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

async function buildEdition(key, f, year) {
  if (f.onlyWinners) throw new Error(`${f.name} no tiene ediciones por año: mira su palmarés.`);
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

  // resolver cada título contra TMDB, verificando la dirección
  const { films, errors } = await resolveFilms(rows, () => year);

  return {
    festival: key,
    name: f.name,
    award: f.award,
    year,
    section: stripTags(sec.line),
    note: special?.note || null,
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
 * El palmarés histórico del premio que clasifica (todas las ganadoras, de la
 * más reciente a la más antigua), desde el artículo del premio en Wikipedia.
 * Cacheado 30 días: solo cambia una vez al año.
 */
export async function festivalWinners(key, { refresh = false } = {}) {
  const f = REGISTRY[key];
  if (!f) throw new Error('Festival desconocido');
  if (!f.awardPage && !f.staticList) {
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
    if (f.staticList) {
      // dataset fijo empaquetado con la app (Sight & Sound se renueva en 2032)
      rows = f.staticList.map((r) => ({
        year: r.year, title: r.title, original_title: r.title, director: r.director, country: null, rank: r.rank,
      }));
      source = 'https://www.bfi.org.uk/sight-and-sound/greatest-films-all-time';
      note = `La lista extendida de la encuesta de la crítica (${rows.length} películas, empates incluidos), ordenada por puesto. Se renueva cada década: la próxima, en 2032.`;
    } else if (f.awardParse === 'sundanceList') {
      // la lista de Sundance va por años con viñetas: página entera de una vez
      const parsed = await wikiParse({ page: f.awardPage, prop: 'text' });
      rows = parseSundanceWinners(parsed.text).filter((r) => r.year >= f.sinceYear);
    } else {
      const meta = await wikiParse({ page: f.awardPage, prop: 'sections' });
      const sec = (meta.sections || []).find((s) => f.awardSection.test(stripTags(s.line)));
      if (!sec) throw new Error(`No se encontró la lista de ganadoras en «${f.awardPage}» de Wikipedia.`);
      // la sección «Winners» suele incluir sus subsecciones por década…
      const parsed = await wikiParse({ page: f.awardPage, section: String(sec.index), prop: 'text' });
      rows = parseWinnersTables(parsed.text);
      if (!rows.length) {
        // …pero en algunos artículos (Goya, BAFTA) las décadas son secciones
        // HERMANAS y la de «Winners» llega vacía: página entera, y que el
        // parser descarte las tablas que no son palmarés
        const full = await wikiParse({ page: f.awardPage, prop: 'text' });
        rows = parseWinnersTables(full.text);
      }
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
