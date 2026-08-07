import { db, getSetting } from './db.js';

/**
 * Auditoría de subtítulos y de audio.
 *
 * Para una colección de cine no anglosajón, una película sin subtítulos es una
 * película que no tienes. Los datos salen de `movie_streams`, que el sync
 * rellena con lo que Plex ya mandaba y se tiraba.
 *
 * El criterio de «cubierta» lo pones tú en Ajustes: qué idiomas de subtítulo te
 * sirven, en cualquier combinación. `vo` es especial —significa «en el idioma
 * en que se rodó»— y se resuelve contra `movies.original_language`.
 */

/** Idiomas admitidos como criterio, en el orden en que se pintan. */
export const SUB_LANG_OPTIONS = [
  { key: 'vo', label: 'Versión original' },
  { key: 'spa', label: 'Español' },
  { key: 'eng', label: 'Inglés' },
];
const VALID = new Set(SUB_LANG_OPTIONS.map((o) => o.key));

/** Lo elegido en Ajustes; vacío = auditoría apagada. */
export function subCriteria() {
  const raw = getSetting('subs_ok_langs');
  if (raw == null) return []; // nunca configurado: apagada hasta que lo elijas
  return String(raw).split(',').map((x) => x.trim()).filter((x) => VALID.has(x));
}

/**
 * TMDB usa ISO-639-1 ('ja') y Plex ISO-639-2/B ('jpn'). Sin este puente, el
 * criterio «VO» no casaría nunca para casi ninguna película.
 */
const ISO1_A_ISO2 = {
  es: 'spa', en: 'eng', fr: 'fra', de: 'deu', it: 'ita', pt: 'por', ja: 'jpn', zh: 'zho',
  ko: 'kor', ru: 'rus', ar: 'ara', hi: 'hin', fa: 'fas', tr: 'tur', pl: 'pol', nl: 'nld',
  sv: 'swe', da: 'dan', no: 'nor', fi: 'fin', el: 'ell', he: 'heb', cs: 'ces', hu: 'hun',
  ro: 'ron', th: 'tha', vi: 'vie', uk: 'ukr', ca: 'cat', eu: 'eus', gl: 'glg', sr: 'srp',
  hr: 'hrv', bg: 'bul', sk: 'slk', sl: 'slv', et: 'est', lv: 'lav', lt: 'lit', is: 'isl',
};
// Plex a veces manda la variante 'T' del código (fre/ger/dut/gre/chi/per/cze/rum/slo/ice)
const EQUIVALENTES = {
  fra: ['fre'], deu: ['ger'], nld: ['dut'], ell: ['gre'], zho: ['chi'], fas: ['per'],
  ces: ['cze'], ron: ['rum'], slk: ['slo'], isl: ['ice'], eus: ['baq'], cat: [], spa: [], eng: [],
};

/** Todos los códigos de Plex que valen para un idioma dado. */
export function codigosDe(iso) {
  if (!iso) return [];
  const base = ISO1_A_ISO2[String(iso).toLowerCase()] || String(iso).toLowerCase();
  return [base, ...(EQUIVALENTES[base] || [])];
}

/**
 * ¿Esta película cumple el criterio? Pura y exportada para poder testearla sin
 * base de datos: recibe las pistas y el idioma original ya resueltos.
 */
export function cumpleCriterio({ subs = [], originalLanguage = null }, criteria) {
  if (!criteria.length) return true; // sin criterio no hay nada que incumplir
  const tiene = new Set(subs.filter(Boolean).map((l) => String(l).toLowerCase()));
  for (const c of criteria) {
    if (c === 'vo') {
      if (codigosDe(originalLanguage).some((x) => tiene.has(x))) return true;
    } else if (codigosDe(c).some((x) => tiene.has(x))) return true;
  }
  return false;
}

const filaPelicula = (m) => ({
  id: m.rating_key,
  title: m.title,
  year: m.year,
  tmdb_id: m.tmdb_id,
  originalLanguage: m.original_language || null,
  subs: m.subs ? m.subs.split(',').filter(Boolean) : [],
  audio: m.audio ? m.audio.split(',').filter(Boolean) : [],
  radarrId: m.radarr_id ?? null,
  // «analizada» = el sync ya leyó sus pistas alguna vez
  analizada: !!(m.n_streams > 0),
});

/** Una consulta con las pistas ya agregadas por película. */
const SELECT_CON_PISTAS = `
  SELECT m.rating_key, m.title, m.year, m.tmdb_id, m.original_language, r.radarr_id,
         (SELECT group_concat(DISTINCT s.lang) FROM movie_streams s
           WHERE s.movie_id = m.rating_key AND s.kind = 'sub')   AS subs,
         (SELECT group_concat(DISTINCT s.lang) FROM movie_streams s
           WHERE s.movie_id = m.rating_key AND s.kind = 'audio') AS audio,
         (SELECT COUNT(*) FROM movie_streams s WHERE s.movie_id = m.rating_key) AS n_streams
    FROM movies m
    LEFT JOIN radarr_movies r ON r.tmdb_id = m.tmdb_id
   WHERE m.full_synced = 1`;

/**
 * Estado general + las que incumplen. `limit` acota lo que viaja al navegador;
 * los totales se cuentan sobre todo, no sobre la página.
 */
export function subtitleAudit({ limit = 300 } = {}) {
  const criteria = subCriteria();
  // SIN ANALIZAR ≠ SIN SUBTÍTULOS. Las películas sincronizadas antes de la
  // 1.04 no tienen ni una fila de pistas porque el sync las tiraba, y acusarlas
  // de no tener subtítulos sería mentir a lo grande (en una biblioteca de doce
  // mil, todas). Como cualquier fichero real tiene al menos una pista de audio,
  // «ninguna fila» identifica sin ambigüedad lo que aún no se ha mirado: se
  // cuenta aparte y se pide una re-sincronización completa.
  const sinAnalizar = db.prepare(
    `SELECT COUNT(*) n FROM movies m
      WHERE NOT EXISTS (SELECT 1 FROM movie_streams s WHERE s.movie_id = m.rating_key)`
  ).get().n;
  if (!criteria.length) {
    return { enabled: false, criteria, sinAnalizar, total: 0, faltan: [], sinNinguno: 0 };
  }
  const filas = db.prepare(SELECT_CON_PISTAS).all().map(filaPelicula).filter((f) => f.analizada);
  const faltan = [];
  let sinNinguno = 0;
  for (const f of filas) {
    if (f.subs.length === 0) sinNinguno++;
    if (!cumpleCriterio(f, criteria)) faltan.push(f);
  }
  // primero las que no tienen NADA, y dentro, las más recientes arriba
  faltan.sort((a, b) => (a.subs.length - b.subs.length) || (b.year || 0) - (a.year || 0));
  return {
    enabled: true,
    criteria,
    total: filas.length,
    conProblema: faltan.length,
    sinNinguno,
    sinAnalizar,
    faltan: faltan.slice(0, limit),
  };
}

/**
 * Doblaje colado: la tienes solo con audio en otro idioma que el original.
 * Para un cinéfilo esto es tan grave como no tener subtítulos.
 */
export function audioAudit({ limit = 300 } = {}) {
  const filas = db.prepare(SELECT_CON_PISTAS).all().map(filaPelicula).filter((f) => f.analizada);
  const faltan = filas.filter((f) => {
    if (!f.analizada) return false; // sin analizar no se acusa
    if (!f.originalLanguage || f.audio.length === 0) return false; // sin datos tampoco
    const ok = new Set(codigosDe(f.originalLanguage));
    return !f.audio.some((l) => ok.has(String(l).toLowerCase()));
  });
  return { total: filas.length, conProblema: faltan.length, faltan: faltan.slice(0, limit) };
}
