// Traducciones EN de Paises.jsx (el cine por países, con sus dos fuentes).
// Clave = texto castellano. Lo que ya vive en otro fragmento —«La caza»,
// «Deshacer», «Nada que enseñar con estos filtros.»— no se repite aquí.
export default {
  'Por países': 'By country',
  'País:': 'Country:',
  Histórico: 'All time',
  'Por año': 'By year',
  Todos: 'All',
  'sin construir': 'not built yet',
  Construir: 'Build',
  Reconstruir: 'Rebuild',
  'Construyendo…': 'Building…',
  'Elige un país': 'Pick a country',

  'Lo mejor de cada cinematografía, de siempre y año a año. Ordena la nota de Letterboxd —la única que puntúa el cine del mundo— y desempatan los premios y los cánones. El país de cada película es el de quien la dirige.':
    'The best of each national cinema, all time and year by year. Ranked by the Letterboxd rating — the only one that scores world cinema — with awards and canons breaking the ties. A film belongs to the country its director comes from.',

  // las dos fuentes
  'La lista de la casa: recorre TMDB año a año y ordena la nota de Letterboxd':
    'Our own list: walks TMDB year by year and ranks by the Letterboxd rating',
  'Su ranking, en su orden, emparejado con TMDB': 'Their ranking, in their order, matched against TMDB',

  // por qué entra cada película
  'Entra por la nacionalidad de quien la dirige': "It qualifies through its director's nationality",
  'Entra por el país de origen que le pone TMDB': 'It qualifies through the country of origin TMDB gives it',
  'La metiste tú a mano': 'You added it by hand',
  'Puesto {n} del ranking de FilmAffinity': 'Number {n} in the FilmAffinity ranking',
  '{motivo}. Pulsa para sacarla de este país.': '{motivo}. Click to take it out of this country.',

  // construcción
  'Recorre TMDB año a año, pide las notas a MDBList y comprueba de dónde es cada una.':
    'Walks TMDB year by year, asks MDBList for the ratings and checks where each film is really from.',
  'Carga el ranking que viene con esta versión y lo cruza con tu Plex.':
    'Loads the ranking shipped with this version and crosses it with your Plex.',
  'Construyendo {pais}: recorre cien años y pregunta las notas. Tarda unos minutos.':
    'Building {pais}: it walks a hundred years and asks for the ratings. Takes a few minutes.',
  'Cargando el ranking de FilmAffinity de {pais}…': 'Loading the FilmAffinity ranking for {pais}…',
  'Construyendo {pais}…': 'Building {pais}…',
  'Cargando {pais}…': 'Loading {pais}…',
  '✓ {pais} listo: {n} películas': '✓ {pais} ready: {n} films',
  '⚠️ No se pudo construir: {error}': '⚠️ Could not build it: {error}',
  '{pais} todavía no está construido. Pulsa «Construir»: recorre TMDB año a año desde 1915, pide las notas de Letterboxd y comprueba de dónde es cada película.':
    '{pais} has not been built yet. Hit “Build”: it walks TMDB year by year from 1915, asks Letterboxd for the ratings and checks where each film is really from.',

  // lo que se cuenta del pase
  '{cand} candidatas miradas, {nota} con nota de Letterboxd, {n} son de {pais}.':
    '{cand} candidates looked at, {nota} with a Letterboxd rating, {n} of them from {pais}.',
  '{n} las puso el palmarés y no TMDB.': '{n} came from the awards data, not from TMDB.',
  'Construido el {date}.': 'Built on {date}.',
  'tienes {n}': 'you own {n}',
  '{n} películas': '{n} films',

  // las listas
  'Lo mejor de {pais}': 'The best of {pais}',
  'Lo mejor de {pais} en {year}': 'The best of {pais} in {year}',

  'FilmAffinity no tiene ranking de {pais}. Solo lo tienen catorce países; para los demás queda la lista de Letterboxd.':
    'FilmAffinity has no ranking for {pais}. Only fourteen countries have one; for the rest there is the Letterboxd list.',
  'El ranking de FilmAffinity de {pais} está listo para cargar. Pulsa «Construir».':
    'The FilmAffinity ranking for {pais} is ready to load. Hit “Build”.',
  'Las {cand} de su ranking, {n} emparejadas con TMDB.': 'The {cand} in their ranking, {n} matched against TMDB.',

  // el ✎
  'Tus correcciones en {pais}': 'Your corrections in {pais}',
  'Retirar esta corrección': 'Undo this correction',
  '✎ «{title}» fuera de {pais}, en las dos listas': '✎ “{title}” taken out of {pais}, from both lists',
  'Retirar la corrección': 'Undo the correction',
  'Corrección retirada: vuelve al reconstruir el país':
    'Correction removed: it comes back when you rebuild the country',

  // los vacíos, que tienen que explicarse
  'Este país está construido pero no tiene ninguna película que enseñar.':
    'This country has been built but there is no film to show.',
  'Se enseñan las mejores; arriba está cuántas hay en total.':
    'These are the best ones; the total is right above.',

  // mensajes FIJOS del servidor de países (los que llevan datos dentro caen en
  // castellano a propósito, como el resto de server.js)
  'El año tiene que ser un número': 'The year has to be a number',
  'Ese país no está en el catálogo': 'That country is not in the catalogue',
  'Hay una actualización general en marcha: espera a que termine':
    'A full refresh is running: wait for it to finish',
};
