// Idioma de la interfaz. El castellano es el idioma fuente Y la clave del
// diccionario: t('Guardar ajustes') devuelve la traducción inglesa si la
// interfaz está en EN, o el propio texto si está en ES. Así no hay claves
// abstractas que mantener y cualquier texto sin traducir cae en castellano a
// la vista (nunca rompe). Separado del ajuste `language`, que gobierna en qué
// idioma pide el SERVIDOR los datos a TMDB.
//
// Los diccionarios viven en fragmentos (web/src/i18n/en/*.js, uno por zona de
// la app) para que se puedan escribir en paralelo sin pisarse; aquí se funden.
const fragments = import.meta.glob('./i18n/en/*.js', { eager: true });
const EN = {};
for (const mod of Object.values(fragments)) Object.assign(EN, mod.default || {});

// Leído una vez al cargar el módulo: cambiar de idioma recarga la página
// (setLang), así que todo render ve siempre el mismo valor.
let lang = localStorage.getItem('ui_language') === 'en' ? 'en' : 'es';

export const getLang = () => lang;

export const setLang = (next) => {
  lang = next === 'en' ? 'en' : 'es';
  localStorage.setItem('ui_language', lang);
};

// Locale para fechas y números (toLocaleString/toLocaleDateString). en-GB y no
// en-US: mantiene el orden día/mes al que está acostumbrado quien viene del
// castellano.
export const locale = () => (lang === 'en' ? 'en-GB' : 'es-ES');

export function t(text, vars) {
  // Homógrafos: la misma palabra castellana puede necesitar dos traducciones
  // («Género» = Genre en Biblioteca, Gender en demografía). La clave admite un
  // contexto tras «||» — t('Género||persona') — que nunca se pinta: en ES se
  // recorta, en EN se busca la clave completa.
  const base = text.includes('||') ? text.slice(0, text.indexOf('||')) : text;
  let out = lang === 'en' ? (EN[text] ?? base) : base;
  if (vars) {
    // reemplazo con función: un valor con «$&» o «$$» (un título raro, un
    // mensaje de error) no debe activar los patrones de sustitución de JS
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, () => String(v));
  }
  return out;
}
