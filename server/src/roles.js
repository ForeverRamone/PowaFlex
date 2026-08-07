/**
 * Los oficios que PowaFlex sabe seguir, en UN solo sitio.
 *
 * Hasta la 1.04 la lista de roles válidos estaba escrita a mano como
 * `['director', 'actor']` en una docena de puntos de index.js: añadir un oficio
 * significaba acordarse de doce sitios, y olvidarse de uno no rompía nada
 * visible —simplemente ese endpoint rechazaba el rol en silencio—. Ahora los
 * metadatos viven aquí y todo el mundo pregunta.
 *
 * LA DIRECCIÓN MANDA: el orden de esta lista es el orden en que se pintan las
 * facetas y las pestañas, y `PRINCIPAL` marca los dos oficios que conservan
 * tratamiento propio (regla automática de facetas, auto-Radarr, apertura por
 * defecto). Los demás usan la misma maquinaria en segundo plano.
 */

export const ROLES = [
  {
    key: 'director',
    label: 'Directores/as',
    singular: 'director/a',
    // cómo se reconoce el crédito en TMDB
    tmdb: { jobs: ['Director'] },
    hint: 'Directing',
    fromPlex: true, // Plex guarda este crédito → hay ranking de biblioteca
    principal: true,
  },
  {
    key: 'actor',
    label: 'Actores/actrices',
    singular: 'actor/actriz',
    tmdb: { cast: true },
    hint: 'Acting',
    fromPlex: true,
    principal: true,
  },
  {
    key: 'writer',
    label: 'Guionistas',
    singular: 'guionista',
    // en guion sí vale el departamento: los puestos son muchos y todos cuentan
    // (Screenplay, Writer, Story, Novel…) y es lo que ya hacía la 1.03
    tmdb: { department: 'Writing' },
    hint: 'Writing',
    fromPlex: true,
    principal: false,
  },
  {
    key: 'dop',
    label: 'Dirección de fotografía',
    singular: 'director/a de fotografía',
    // los puestos que SÍ son este oficio. Nada de aceptar el departamento
    // entero: en «Camera» también están los operadores y los foquistas
    tmdb: { jobs: ['Director of Photography', 'Cinematography', 'Cinematographer'] },
    hint: 'Camera',
    fromPlex: false, // Plex no da este crédito → sin ranking de biblioteca
    principal: false,
  },
  {
    key: 'composer',
    label: 'Música',
    singular: 'compositor/a',
    // «Sound» incluye a mezcladores y montadores de sonido: no son la música
    tmdb: { jobs: ['Original Music Composer', 'Music', 'Composer'] },
    hint: 'Sound',
    fromPlex: false,
    principal: false,
  },
  {
    key: 'editor',
    label: 'Montaje',
    singular: 'montador/a',
    // «Editing» incluye ayudantes y montadores adicionales
    tmdb: { jobs: ['Editor', 'Film Editor'] },
    hint: 'Editing',
    fromPlex: false,
    principal: false,
  },
];

export const ROLE_KEYS = ROLES.map((r) => r.key);
const BY_KEY = new Map(ROLES.map((r) => [r.key, r]));

/** El oficio, o undefined si no existe. */
export const roleInfo = (key) => BY_KEY.get(key);

/** ¿Es un rol que este servidor admite? */
export const isRole = (key) => BY_KEY.has(key);

/**
 * Normaliza lo que llega por la API: devuelve el rol pedido o `fallback`
 * (null si no se pasa). Sustituye a los `['director','actor'].includes(x)`.
 */
export const asRole = (key, fallback = null) => (BY_KEY.has(key) ? key : fallback);

/** Solo los que Plex sabe dar: los únicos con ranking «top de tu biblioteca». */
export const RANKABLE_ROLES = ROLES.filter((r) => r.fromPlex).map((r) => r.key);
export const isRankable = (key) => BY_KEY.get(key)?.fromPlex === true;

/** Dirección e interpretación: los que conservan tratamiento propio. */
export const PRINCIPAL_ROLES = ROLES.filter((r) => r.principal).map((r) => r.key);

/** La pista de departamento que se le pasa a la búsqueda de personas en TMDB. */
export const roleHint = (key) => BY_KEY.get(key)?.hint || null;

/**
 * Los créditos de TMDB de ese oficio. El reparto para actor; para el resto,
 * el equipo filtrado por puesto exacto si lo hay y, si no, por departamento
 * (hay fichas donde el puesto viene con variantes: «Director of Photography»
 * y «Cinematography» conviven en TMDB).
 */
export function creditsForRole(credits, key) {
  const info = BY_KEY.get(key);
  if (!info) return [];
  if (info.tmdb.cast) return credits.cast || [];
  const crew = credits.crew || [];
  // Por PUESTO, no por departamento. El respaldo por departamento entero
  // convertía a un mezclador de sonido en compositor y a un foquista en
  // director de fotografía: con eso, seguir a alguien te generaba una
  // filmografía y unos «huecos» de una obra que esa persona nunca firmó.
  if (info.tmdb.jobs) {
    const jobs = new Set(info.tmdb.jobs);
    return crew.filter((c) => jobs.has(c.job));
  }
  if (info.tmdb.department) return crew.filter((c) => c.department === info.tmdb.department);
  return [];
}

/** ¿Esta persona tiene créditos de este oficio? */
export const hasRoleCredits = (credits, key) => creditsForRole(credits, key).length > 0;
