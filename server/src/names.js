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
  return String(s || '').replace(/[łØøĐđÐðıİŦŧĦħÞþÆæŒœß]/g, (c) => PLIEGUES[c.toLowerCase()] ?? c);
}

/** Nombre comparable: sin acentos, sin letras raras, sin puntuación ni espacios. */
export function normName(s) {
  return foldName(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
