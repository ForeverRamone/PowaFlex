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
  // v8: el umbral de ruido pasó a mirar también los votos de Letterboxd
  // v9: la clave lleva los filtros demográficos (género/vida/continente/país)
  discover_gaps: 9,
  // v10: el umbral de ruido mira también los votos de IMDb del volcado local,
  // así que lo cacheado con dos fuentes escondía películas que ahora sí pasan
  discover_favorites: 10,
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
  // v6: títulos con «(ex-æquo)» y título original inline limpiados, y premios
  // con vista de nominadas por año
  // v7: segunda vuelta sin ventana de año exigiendo título clavado Y dirección
  // verificada — lo cacheado antes tiene como «sin ficha» los clásicos que el
  // BFI fecha por producción y TMDB por estreno comercial (Beau travail,
  // Partie de campagne…)
  // v8: la comparación de nombres tolera colectivos en plural («The Wachowskis»
  // por «Lana Wachowski») y las transliteraciones que cada fuente escribe a su
  // manera («Larissa»/«Larisa», «Forough Farokhzad»/«Forugh Farrokhzad»). Lo
  // cacheado antes tiene esas tres como «sin ficha en TMDB».
  // v9: la fila corta de Wikipedia ya no mete el título original en el campo
  // del director (lo decide la cursiva), y las ediciones marcan su ganadora
  // v10: sin director en la fila se exige título clavado (antes se emparejaba
  // sin verificar nada); el título clavado tolera letras dobladas de erratas
  // («Angelo azzuro»); los nombres pliegan dígrafos de transliteración
  // («Chukhrai»/«Tchoukhrai»); stripTags decodifica entidades numéricas y los
  // marcadores en lista de {{ill}} («Veni Vidi Vici» de Sundance); y los
  // bloques de cortos de Orizzonti ya no se cuelan como películas
  // v11: la entrada film_match guarda cartel y fecha (v3 de su clave: antes
  // reconstruir una página caducada pedía movieSummary de cada película); los
  // datasets fijos conservan su tmdb_id puesto a mano y sus filas tv ya no se
  // buscan contra TMDB ni cuentan como «sin casar»; y la segunda vuelta sin
  // ventana de año vale también para filas sin director (título clavado y
  // ficha con equipo). Lo cacheado antes tiene esas películas como «sin ficha».
  festival: 11,
  // v1: estrenos por región (cines ES/US, plataformas ES) con Σ y proveedores
  // v2: pestañas de plataformas y VOD de ES y US, y el alquiler/compra deja de
  // ser un sí/no para traer los NOMBRES de dónde se alquila (campo `vod`)
  releases: 2,
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
