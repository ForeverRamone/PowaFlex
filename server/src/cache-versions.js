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
  // v8: cada estreno dice si entra por alguien a quien sigues como DIRECCIÓN o
  // por reparto/otros oficios (`porDireccion`, `porQuien`). Lo cacheado antes no
  // lo lleva, y sin ese dato la separación de la página se deducía del crédito
  // —que siempre trae al director real de la ficha— y salía mal.
  calendar: 8,
  // v8: el umbral de ruido pasó a mirar también los votos de Letterboxd
  // v9: la clave lleva los filtros demográficos (género/vida/continente/país)
  // v10: cada película va podada de los datos de trabajo del servidor que no se
  // pintan (idioma, países, id de IMDb, duración, personaje…): lo cacheado antes
  // los lleva y son una cuarta parte del JSON — ver podarDatosDeTrabajo
  discover_gaps: 10,
  // v10: el umbral de ruido mira también los votos de IMDb del volcado local,
  // así que lo cacheado con dos fuentes escondía películas que ahora sí pasan
  // v11: podadas también aquí (ver discover_gaps v10)
  discover_favorites: 11,
  // v6: podadas también aquí (ver discover_gaps v10)
  discover_absent: 6,
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
  // v12: la ganadora ya no se detecta por «tiene fondo» sino por «tiene fondo
  // CON TONO» (las tablas de Critics’ Choice y del Donatello van a rayas con un
  // gris, y media lista de nominadas salía marcada como ganadora); los títulos
  // pierden los símbolos de leyenda pegados («Nomadland ‡», «The Zone of
  // Interest±»), que no casaban con ninguna ficha; y la fila de año se reconoce
  // contando colspan (la de 2026 del premio alemán se apuntaba al año anterior
  // con «2026» de título); un empate metido en una sola celda se desdobla en
  // sus dos películas (Boston 2008); una tabla con columnas gemelas de comedia
  // y musical se lee entera (Globos, 1958-1962); «Small Axe» se sirve como lo
  // que es, una serie; y la comparación de dirección tolera los diminutivos
  // ingleses («Tom» por «Thomas», «Rick» por «Richard»). Lo cacheado antes
  // lleva esos fallos.
  // v13: el emparejado compara con los DOS títulos de la fila (el internacional
  // y el original), que es lo que separa «Smultronstället» de su making-of; un
  // 404 de TMDB ya no aborta la resolución entera; y la dirección de las fichas
  // rescatadas por el equipo sale de TMDB, no de la celda que decía dirección y
  // traía productores. Lo cacheado antes lleva esos emparejados y esos nombres.
  // v14: cuando el artículo-lista de un premio se queda atrás se remata con la
  // EDICIÓN suelta (el Guldbagge seguía en 2024 con la 61.ª ya publicada), y la
  // dirección de las filas que no la traen sale de TMDB. Lo cacheado antes no
  // tiene esos años ni esos nombres.
  // v15: las tablas se leen en REJILLA, con las celdas que se estiran hacia
  // abajo (`rowspan`) puestas en todas las filas que ocupan. Lo cacheado antes
  // trae las filas que heredaban una celda con las columnas corridas: el país
  // vacío en media Cannes y en media Venecia, y 28 filas —los nominados de
  // Platform, la Concha de 1977, el Óscar de 1955— con el título original en el
  // campo de la dirección. Entran también Seminci y Sitges.
  // v16: las filas que llegan con el id de TMDB puesto (los palmareses
  // empaquetados) también preguntan a TMDB quién dirige cuando su tabla no lo
  // dice. Lo cacheado antes tiene sin un solo nombre a Sundance, a Sitges y al
  // Donatello: sin nombre que leer y sin estrella que pulsar.
  festival: 16,
  // v1: estrenos por región (cines ES/US, plataformas ES) con Σ y proveedores
  // v2: pestañas de plataformas y VOD de ES y US, y el alquiler/compra deja de
  // ser un sí/no para traer los NOMBRES de dónde se alquila (campo `vod`)
  releases: 2,
};

/** Prefijo con versión de una caché: `calendar:v8`, `discover_gaps:v10`… */
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
