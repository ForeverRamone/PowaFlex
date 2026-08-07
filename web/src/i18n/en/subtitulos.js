// Traducciones EN de la pestaña Subtítulos del Taller (Subtitulos.jsx). Clave =
// texto castellano. No se repiten aquí «Tu colección», «¿?» ni « · ⚠️ {n}
// fallaron»: ya los traducen taller.js, dashboard.js y misc.js, y una segunda
// copia solo puede acabar divergiendo.
export default {
  // ---- Cabecera y pestaña ----
  'Subtítulos': 'Subtitles',
  'Para una colección de cine no anglosajón, una película sin subtítulos es una película que no tienes: aquí están las que no llegan al criterio que elegiste en Ajustes, y el botón para que Bazarr las busque.':
    'For a collection of non-anglophone cinema, a film without subtitles is a film you do not have: here are the ones that fall short of the criterion you chose in Settings, plus the button to have Bazarr look for them.',
  'Auditando los subtítulos…': 'Auditing subtitles…',

  // ---- Criterio (las etiquetas las manda el servidor, SUB_LANG_OPTIONS) ----
  'Versión original': 'Original language',
  'Español': 'Spanish',
  'Inglés': 'English',

  // ---- Aviso de pistas sin leer ----
  '⚠️ {n} películas aún no tienen sus pistas leídas': '⚠️ {n} films do not have their tracks read yet',
  'Los subtítulos y el audio solo llegan al sincronizar el detalle de cada película, así que estas quedan fuera del recuento hasta que hagas una re-sincronización completa. ':
    'Subtitles and audio only arrive when each film’s detail is synced, so these stay out of the count until you run a full re-sync. ',
  'Ir a Ajustes → Re-sincronización completa': 'Go to Settings → Full re-sync',

  // ---- Auditoría apagada ----
  'Todavía no has dicho qué subtítulos te valen, así que no hay nada que auditar. ':
    'You have not said yet which subtitles work for you, so there is nothing to audit. ',
  'Elige tu criterio en Ajustes →': 'Choose your criterion in Settings →',

  // ---- Tarjetas de resumen ----
  'Películas analizadas': 'Films analysed',
  'con sus pistas ya leídas': 'with their tracks already read',
  'Sin cubrir según tu criterio': 'Not covered by your criterion',
  'te valen: {langs}': 'works for you: {langs}',
  'Sin ningún subtítulo': 'With no subtitles at all',
  'ni siquiera una pista': 'not even one track',

  // ---- Lista de las que incumplen ----
  '⚠️ Se quedan sin subtítulos que te sirvan ({n})': '⚠️ Left without subtitles you can use ({n})',
  '✓ Todas cumplen tu criterio': '✓ They all meet your criterion',
  'Toda la biblioteca tiene subtítulos que te valen. Nada que hacer aquí.':
    'The whole library has subtitles that work for you. Nothing to do here.',
  'Buscar por título…': 'Search by title…',
  'Las más desnudas primero': 'Barest ones first',
  'Por año, las recientes primero': 'By year, recent first',
  'Por título': 'By title',
  'se enseñan las {n} primeras': 'showing the first {n}',
  'Ninguna de las que faltan lleva ese título.': 'None of the missing ones has that title.',
  'ninguno': 'none',
  'Idioma en que se rodó': 'Language it was shot in',
  'rodada en {lang}': 'shot in {lang}',

  // ---- Bazarr ----
  'Con Bazarr configurado en Ajustes, cada línea tendría aquí su botón para encargarle la búsqueda.':
    'With Bazarr set up in Settings, every line would have its button here to send it the search.',
  'Bazarr identifica las películas por su id de Radarr': 'Bazarr identifies films by their Radarr id',
  'sincroniza Radarr para poder pedirla': 'sync Radarr to be able to request it',
  'Buscar en Bazarr': 'Search on Bazarr',
  'Encargando…': 'Sending…',
  '✓ encargada': '✓ sent',
  '🔎 Buscar las {n} visibles en Bazarr': '🔎 Search the {n} visible ones on Bazarr',
  'Encargando… {done}/{total}': 'Sending… {done}/{total}',
  '🔎 Bazarr busca los subtítulos de «{title}»': '🔎 Bazarr is looking for subtitles for “{title}”',
  '✓ {n} búsquedas encargadas a Bazarr': '✓ {n} searches sent to Bazarr',

  // ---- Auditoría de audio ----
  'Doblaje colado: las que no tienen audio en su idioma original':
    'Dubbing that slipped in: the ones with no audio in their original language',
  'Películas cuya única pista de audio está en otro idioma que aquel en el que se rodaron. No se acusa a las que no tienen ni idioma original ni pistas leídas.':
    'Films whose only audio track is in a language other than the one they were shot in. Nothing is held against those with no original language or no tracks read.',
  'Repasando las pistas de audio…': 'Going over the audio tracks…',
  'Ninguna: todas se oyen en su idioma.': 'None: they all play in their own language.',
  '{n} de {total} películas': '{n} of {total} films',
};
