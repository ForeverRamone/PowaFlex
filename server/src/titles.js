/**
 * Títulos que se puedan leer.
 *
 * TMDB devuelve el título en el idioma que le pidas (es-ES), pero cuando no hay
 * traducción cae al original: por eso en Descubrir aparecían fichas como
 * «志愿军：雄兵出击». Letterboxd y Radarr resuelven eso mostrando el título
 * internacional, y eso es lo que hace PowaFlex.
 *
 * La regla es una sola y cubre los dos casos que pidió Ramón: **si el título no
 * está en alfabeto latino, se sustituye por el inglés**. Una película española
 * (o francesa, o cualquiera con traducción al español) ya llega en latino y no
 * se toca; una china o japonesa sin traducción pasa a su título internacional.
 * El original nunca se pierde: sigue en `original_title` y se ve en la ficha.
 *
 * Nada de esto afecta al emparejado: Plex, Radarr y Letterboxd van por id.
 */

// Cualquier letra que no sea latina, por su escritura Unicode y no por rangos
// a mano: la lista de rangos se dejaba el jemer, el birmano, el amhárico, el
// lao, el tibetano, el mongol, el thaana y los ideogramas fuera del plano
// básico. Deliberadamente NO entran ni el latín acentuado (é, ñ, ø) ni la
// puntuación y los símbolos comunes (—, «», …, ½), que son latinos de toda la
// vida y no hay que tocar. Las formas de ancho completo y la puntuación CJK sí
// cuentan, como hasta ahora.
const NON_LATIN = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]|[\u3000-\u303F\uFF00-\uFFEF]/u;

/** ¿Este título hay que cambiarlo por su versión internacional? */
export const needsLatin = (title) => !!title && NON_LATIN.test(String(title));

/**
 * Elige el título que se muestra. Devuelve el que ya venía salvo que no se
 * pueda leer y tengamos una alternativa en latino.
 */
export function readableTitle(title, ...fallbacks) {
  if (!needsLatin(title)) return title;
  for (const alt of fallbacks) {
    if (alt && !needsLatin(alt)) return alt;
  }
  return title;
}
