/**
 * Las versiones de las páginas cacheadas, en UN solo sitio.
 *
 * Cada una de estas cachés guarda un resultado ya masticado (el calendario, los
 * huecos, los grandes ausentes). Cuando cambian las reglas con las que se
 * construyó —qué cuenta como largometraje, qué campos lleva cada persona— lo
 * guardado deja de valer y hay que subir su número.
 *
 * Antes esto vivía por duplicado: la clave en el módulo que la escribe y la
 * lista de versiones buenas en la purga de arranque de `db.js`. Subir una y
 * olvidar la otra hacía que la caché nueva se borrara en cada arranque, en
 * silencio. Ahora la purga se genera de aquí, así que no hay nada que
 * sincronizar a mano: se sube el número y ya está.
 */
export const CACHE_VERSIONS = {
  calendar: 7,
  // v8/v9: el umbral de ruido pasó a mirar también los votos de Letterboxd
  discover_gaps: 8,
  discover_favorites: 9,
  discover_absent: 5,
  // v2: el emparejado con TMDB se verifica contra el director/a (antes un
  // título genérico enganchaba otra película del mismo año)
  // v3: nombres insensibles al orden (Imamura Shōhei), fichas sin equipo aún
  // aceptadas por título clavado, y los 429 ya no se cachean como «sin ficha»
  // v4: abreviaturas (Carl Th. Dreyer), desempate por año exacto y por «ya en
  // tu Plex» (ITMFL vs su making-of, Fanny cine vs TV), y emparejado por
  // película cacheado para que los reintentos no relancen la ráfaga entera
  // v5: las fichas sin créditos solo valen como ÚLTIMO recurso (la Undercover
  // ajena se colaba por delante de la de Echevarría por orden de búsqueda)
  festival: 5,
};

/** Prefijo con versión de una caché: `calendar:v7`, `discover_gaps:v7`… */
export const cachePrefix = (name) => `${name}:v${CACHE_VERSIONS[name]}`;

/**
 * Condición SQL que casa con todo lo cacheado bajo una versión ANTERIOR de
 * cualquiera de estas familias. Se usa al arrancar para tirarlo.
 */
export function staleCacheSql() {
  return Object.keys(CACHE_VERSIONS)
    .map((name) => `(key LIKE '${name}:%' AND key NOT LIKE '${cachePrefix(name)}:%' AND key <> '${cachePrefix(name)}')`)
    .join(' OR ');
}
