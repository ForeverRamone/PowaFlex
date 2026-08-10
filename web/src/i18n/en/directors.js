// Catálogo de directores en activo (Directors.jsx), embebido en Favoritos → Añadir.
export default {
  // órdenes
  'Importancia': 'Importance',
  'Prestigio (premios y crítica)': 'Prestige (awards and critics)',
  'Impacto (notoriedad y éxito)': 'Impact (notoriety and success)',
  'Más prolíficos': 'Most prolific',
  'Más taquilleros': 'Biggest box office',
  'Más jóvenes': 'Youngest',
  'Más veteranos': 'Oldest',
  'Debut más reciente': 'Most recent debut',
  'Último estreno más reciente': 'Most recent release',
  'Nombre (A-Z)': 'Name (A-Z)',

  // ficha
  'Ya le sigues como director/a': 'You already follow them as a director',
  'Seguir a {nombre} como director/a': 'Follow {nombre} as a director',
  'Índice de importancia (0–100)': 'Importance index (0–100)',
  'Sin largometraje estrenado en los últimos ocho años': 'No feature released in the last eight years',
  'sin estreno reciente': 'no recent release',
  '{n} años': '{n} years old',
  '{n} largos': '{n} features',

  // toasts
  'No se ha podido identificar a {nombre} en TMDB': "Couldn't identify {nombre} on TMDB",
  '⭐ {nombre} en favoritos (directores/as)': '⭐ {nombre} added to favorites (directors)',
  '{nombre} ya estaba en favoritos': '{nombre} was already in favorites',
  '⭐ {n} añadidos a favoritos': '⭐ {n} added to favorites',
  ' · {n} sin identificar en TMDB': ' · {n} not identified on TMDB',

  // página
  'Cargando el catálogo de directores…': 'Loading the director catalog…',
  'La caza': 'The hunt',
  'Directores en activo': 'Working directors',
  '680 directores y directoras con obra reciente, de Wikidata: quiénes son, cuánto han rodado y qué han ganado. Filtra por región, país o género, ordena por lo que te interese y ve marcando con la estrella a quién quieres seguir.':
    "680 directors with recent work, from Wikidata: who they are, how much they've shot and what they've won. Filter by region, country or gender, sort by whatever you care about and star whoever you want to follow.",
  '680 directores y directoras con obra reciente, de Wikidata: quiénes son, cuánto han rodado y qué han ganado. Este catálogo no sale de tu biblioteca — sirve para descubrir a quién seguir con la estrella.':
    "680 directors with recent work, from Wikidata: who they are, how much they've shot and what they've won. This catalog doesn't come from your library — it's for discovering who to follow with the star.",

  // filtros y orden
  'Buscar nombre o país…': 'Search name or country…',
  'Región': 'Region',
  'País': 'Country',
  'Género||persona': 'Gender',
  'Actividad': 'Activity',
  'Mujer': 'Female',
  'Hombre': 'Male',
  'En activo': 'Active',
  'Sin estreno reciente': 'No recent release',
  'Esconde a quien ya sigues como director/a': 'Hides anyone you already follow as a director',
  '☆ Solo los que no sigo': "☆ Only those I don't follow",
  '✕ Limpiar filtros': '✕ Clear filters',
  'de': 'of',
  ' · {n} ya en favoritos': ' · {n} already in favorites',
  'Los busca en TMDB y los añade a tus favoritos como directores/as':
    'Looks them up on TMDB and adds them to your favorites as directors',
  '⭐ Seguir a los {n} que faltan de esta lista': '⭐ Follow the {n} missing from this list',
  'Añadiendo…': 'Adding…',

  // nota metodológica
  'La': 'The',
  'importancia': 'importance',
  'combina prestigio (premios y reconocimiento crítico, 60 %) e impacto (notoriedad, alcance de la obra y taquilla, 40 %). Es una convención operativa, no un juicio de valor: Wikidata no es exhaustiva ni neutral y su cobertura de premios está sesgada hacia Europa y Norteamérica. «En activo» significa al menos un largometraje en los últimos ocho años.':
    "combines prestige (awards and critical recognition, 60%) and impact (notoriety, reach of the work and box office, 40%). It's an operating convention, not a value judgment: Wikidata is neither exhaustive nor neutral and its awards coverage is biased toward Europe and North America. “Active” means at least one feature in the last eight years.",

  // lista y pie
  'Nadie con esos filtros.': 'Nobody matches those filters.',
  'Limpiar': 'Clear',
  'Ver más': 'Show more',
  'Fuente: {fuente}, consulta del {fecha}. Lo que sigas aquí alimenta':
    'Source: {fuente}, queried on {fecha}. Whoever you follow here feeds',
  'Cine venidero': 'Upcoming cinema',
  'y': 'and',
  'Descubrir huecos': 'Discover gaps',
  ', igual que el resto de tus': ', just like the rest of your',
  'favoritos': 'favorites',

  // regiones del catálogo (valores del dataset; solo se traduce la etiqueta pintada)
  'Norteamérica': 'North America',
  'Europa Occidental': 'Western Europe',
  'Europa del Sur': 'Southern Europe',
  'Asia Oriental': 'East Asia',
  'Europa del Norte': 'Northern Europe',
  'Latinoamérica': 'Latin America',
  'Europa del Este': 'Eastern Europe',
  'Oriente Medio y Norte de África': 'Middle East & North Africa',
  'Oceanía': 'Oceania',
  'Sudeste Asiático': 'Southeast Asia',
  'África Subsahariana': 'Sub-Saharan Africa',
  'Asia Meridional': 'South Asia',

  // ── pasos de carga
  'Abriendo el catálogo de directores en activo…': 'Opening the catalogue of working directors…',
  'Buscando en TMDB las caras de {n} directores/as…': 'Looking up {n} directors’ faces on TMDB…',
};
