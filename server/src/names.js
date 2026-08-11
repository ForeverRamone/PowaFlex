/**
 * Comparar nombres de persona entre fuentes que los escriben distinto.
 *
 * Wikidata escribe «Małgorzata Szumowska», «Paweł Pawlikowski» o «Mia
 * Hansen-Løve»; TMDB guarda los mismos nombres sin esas letras («Malgorzata»,
 * «Pawel», «Hansen-Love»). El truco habitual —normalizar a NFD y tirar los
 * signos combinables— NO sirve aquí: la ł polaca, la ø nórdica o la ı turca no
 * son una letra más un acento, son letras propias que NFD deja intactas. Al
 * limpiar después todo lo que no fuera a-z, esas letras DESAPARECÍAN
 * («małgorzata» → «magorzata») y el nombre dejaba de casar con el de TMDB para
 * siempre: en el catálogo salía como no seguida aunque estuviera en favoritos,
 * y en Festivales su película se quedaba sin ficha.
 *
 * Aquí se pliegan a su equivalente ASCII antes de comparar.
 */
const PLIEGUES = {
  ł: 'l', ø: 'o', đ: 'd', ð: 'd', ı: 'i', İ: 'i', ŧ: 't', ħ: 'h',
  þ: 'th', æ: 'ae', œ: 'oe', ß: 'ss',
};

/** Las letras que NFD no sabe descomponer, cambiadas por su equivalente. */
export function foldName(s) {
  return String(s || '').replace(/[ŁłØøĐđÐðıİŦŧĦħÞþÆæŒœß]/g, (c) => PLIEGUES[c.toLowerCase()] ?? c);
}

/** Nombre comparable: sin acentos, sin letras raras, sin puntuación ni espacios. */
export function normName(s) {
  return foldName(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Los nombres de pila que cada fuente escribe en corto o en largo.
 *
 * Wikipedia acredita «Thomas McCarthy» y TMDB «Tom McCarthy»; Wikipedia «Rick
 * Kaplan» y TMDB «Richard Kaplan». No es una transliteración ni una errata —son
 * dos formas del mismo nombre— y ninguna regla de parecido las junta: «tom» no
 * es prefijo de «thomas» ni está a una letra. Hace falta la lista.
 *
 * Va aquí, con el resto de reglas de nombre, y solo con formas cortas que se
 * usan como nombre artístico completo. Es corta a propósito: cada entrada
 * afloja la verificación de dirección, que es lo único que impide emparejar
 * con otra película del mismo título y año.
 */
export const DIMINUTIVOS = {
  tom: 'thomas', tommy: 'thomas', rick: 'richard', ricky: 'richard', dick: 'richard',
  bob: 'robert', bobby: 'robert', rob: 'robert', bill: 'william', billy: 'william', will: 'william',
  mike: 'michael', jim: 'james', jimmy: 'james', joe: 'joseph', tony: 'anthony', dave: 'david',
  steve: 'steven', chris: 'christopher', nick: 'nicholas', dan: 'daniel', danny: 'daniel',
  ben: 'benjamin', alex: 'alexander', sam: 'samuel', matt: 'matthew', andy: 'andrew',
  tim: 'timothy', greg: 'gregory', ron: 'ronald', jeff: 'jeffrey', ken: 'kenneth',
  larry: 'lawrence', phil: 'philip', ray: 'raymond', fred: 'frederick', charlie: 'charles',
  ed: 'edward', eddie: 'edward', ted: 'edward', tobe: 'tobias', pete: 'peter', doug: 'douglas',
  gus: 'gustavo', paco: 'francisco', pepe: 'jose', pili: 'pilar', lolo: 'manuel',
};

/**
 * ¿Son estos dos nombres de pila el mismo, uno en corto y otro en largo?
 * Solo corto ↔ largo: dos diminutivos del MISMO nombre («Rick» y «Dick») no se
 * dan por iguales, porque a esas alturas ya no se sabe si es la misma persona.
 */
export function mismoDiminutivo(a, b) {
  return !!a && !!b && (DIMINUTIVOS[a] === b || DIMINUTIVOS[b] === a);
}
