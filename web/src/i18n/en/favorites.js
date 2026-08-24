// Favoritos (Favorites.jsx): pestañas Mis/Añadir, tarjetas, poda, packs y cánones.
export default {
  // facetas (roleLabel / roleVerb). Las etiquetas llegan de GET /roles y se
  // pintan con t(): el castellano que devuelve el servidor es la clave.
  'Directores/as': 'Directors',
  'Actores/actrices': 'Actors',
  'Guionistas': 'Screenwriters',
  'Dirección de fotografía': 'Cinematography',
  'Música': 'Music',
  'Montaje': 'Editing',
  'y también': 'and also',
  'dirigidas': 'movies directed',
  'interpretadas': 'movies acted in',
  'películas': 'movies',
  'director/a': 'director',
  'actor/actriz': 'actor',
  'guionista': 'screenwriter',
  'director/a de fotografía': 'cinematographer',
  'compositor/a': 'composer',
  'montador/a': 'editor',
  'directores/as': 'directors',
  'actores/actrices': 'actors',

  // SuggestionCard
  'Dirección': 'Directing',
  'Interpretación': 'Acting',
  'Quitar de favoritos': 'Remove from favorites',
  'Añadir a favoritos': 'Add to favorites',

  // FavoriteCard
  'Solo largometrajes. En tu Plex hay {n} títulos suyos contando cortos, documentales, TV y conciertos.':
    'Feature films only. Your Plex has {n} of their titles counting shorts, documentaries, TV and concerts.',
  'en tu Plex': 'in your Plex',
  'por venir': 'upcoming',
  '{pct}% de su filmografía': '{pct}% of their filmography',
  '✓ completa': '✓ complete',
  'te faltan {n}': '{n} missing',
  'Sin ficha de TMDB fiable · no se puede calcular su completismo ·':
    "No reliable TMDB page · their completism can't be computed ·",
  'Abre su ficha para elegir a mano la persona correcta en TMDB':
    'Open their page to hand-pick the right person on TMDB',
  '✎ corregir': '✎ fix',
  'Huecos sin calcular ·': 'Gaps not computed ·',
  'Descubrir': 'Discover',
  'Quitar de {faceta}': 'Remove from {faceta}',
  'También le sigues como {faceta}': 'You also follow them as {faceta}',
  'Seguirle TAMBIÉN como {faceta} (sin dejar esta faceta)':
    'ALSO follow them as {faceta} (without leaving this facet)',

  // CanonPacks
  '⭐ {n} añadidos de «{canon}»': '⭐ {n} added from “{canon}”',
  ' · {n} ya estaban o los habías quitado': ' · {n} were already in or you had removed them',
  ' · {n} sin ficha en TMDB': ' · {n} with no TMDB page',
  'Listas y cánones': 'Lists and canons',
  'Las mismas listas de': 'The same lists as in',
  'Grandes ausentes': 'Great absentees',
  ', para volcarlas de golpe a tus favoritos. A quien hayas quitado con la ✕ no vuelve a entrar.':
    ", ready to pour into your favorites in one go. Anyone you removed with the ✕ won't come back in.",
  'Añadiendo «{canon}»…': 'Adding “{canon}”…',
  'de': 'of',
  '{n} nombres': '{n} names',
  'se actualiza sola con TMDB': 'updates itself from TMDB',
  'Añadir a tus {faceta}': 'Add to your {faceta}',
  'Añadir': 'Add',

  // cabecera y pestañas
  'La caza': 'The hunt',
  'Favoritos': 'Favorites',
  'La gente que sigues,': 'The people you follow,',
  'separada por faceta': 'split by facet',
  ': cada uno cuenta solo por la faceta que sigues. Todos entran en':
    ': each one counts only for the role you follow. All of them feed',
  'Cine venidero': 'Upcoming cinema',
  'y en': 'and',
  'Descubrir huecos': 'Discover gaps',
  'Cada faceta se gestiona por separado': 'Each facet is managed separately',
  'Mis {faceta}': 'My {faceta}',
  'Añadir {faceta}': 'Add {faceta}',

  // cifras de cabecera
  '{faceta} que sigues': '{faceta} you follow',
  '{verbo} suyas en tu Plex': '{verbo} by them in your Plex',
  'huecos por rellenar': 'gaps to fill',
  'filmografías completas': 'complete filmographies',

  // lista, filtros y poda
  'Aún no sigues a nadie como {faceta}. Usa': "You don't follow anyone as {faceta} yet. Use",
  'Filtrar {faceta}…': 'Filter {faceta}…',
  'Más {verbo} en tu Plex': 'Most {verbo} in your Plex',
  'Más huecos': 'Most gaps',
  'Menos completos': 'Least complete',
  'Menos aporte': 'Least contribution',
  'Nombre (A-Z)': 'Name (A-Z)',
  'Podar': 'Prune',
  '† Quitar fallecidos/as': '† Remove deceased',
  '¿Seguro? Vaciar {n}': 'Sure? Empty {n}',
  'Vaciar': 'Empty',
  '✕ Limpiar filtros': '✕ Clear filters',
  'Un nombre por línea, listo para pegarlo en «añadir por nombres» de otra instalación':
    'One name per line, ready to paste into “add by names” on another install',
  '⬇ Exportar .txt': '⬇ Export .txt',
  'Poda rápida:': 'Quick prune:',
  'Fallecidos/as con filmografía completa': 'Deceased with complete filmography',
  'Sin huecos ni proyectos': 'No gaps and nothing upcoming',
  'Quitar seleccionados': 'Remove selected',
  'Los huecos y el completismo se calculan al visitar': 'Gaps and completism are computed when you visit',
  ', o con «Actualizar todo» en': ', or with “Refresh everything” in',
  'Ajustes': 'Settings',
  '¿Buscas el ranking de {faceta} por títulos en tu Plex? Está en Personas.':
    'Looking for the {faceta} ranking by titles in your Plex? It lives in People.',
  'Ir a Personas': 'Go to People',

  // toasts y errores
  '⬇ {n} nombres exportados': '⬇ {n} names exported',
  'No se han podido cargar tus favoritos': 'Your favorites could not be loaded',
  '⭐ {nombre} añadido como {faceta}': '⭐ {nombre} added as {faceta}',
  '{nombre} fuera de {faceta}': '{nombre} removed from {faceta}',
  '⭐ {n} añadidos a {faceta}': '⭐ {n} added to {faceta}',
  '⭐ {n} de «{pack}» añadidos': '⭐ {n} from “{pack}” added',
  '⭐ {nombre} también en {faceta}': '⭐ {nombre} also in {faceta}',
  'Quitados {n} favoritos de los que se ven ahora': 'Removed {n} favorites from those shown now',
  'Quitados {n} favoritos de {faceta}': 'Removed {n} favorites from {faceta}',
  '✝ {n} fallecidos/as retirados/as': '✝ {n} deceased removed',
  '✂️ {n} favoritos quitados': '✂️ {n} favorites removed',

  // pestaña Añadir
  'Lo que añadas aquí se sigue como': 'Whatever you add here is followed as',
  '. Cambia la faceta arriba si quieres seguir a alguien por la otra.':
    '. Switch the facet above if you want to follow someone for the other one.',
  'Añadir directores en activo · el catálogo': 'Add working directors · the catalog',
  '680 directores y directoras con obra reciente, de Wikidata. Filtra por región, país o género y ordena por importancia, premios, largometrajes o taquilla. La ☆ los sigue.':
    '680 directors with recent work, from Wikidata. Filter by region, country or gender and sort by importance, awards, features or box office. The ☆ follows them.',
  'Plegar ▴': 'Collapse ▴',
  'Explorar ▾': 'Explore ▾',
  'Añadir una lista de nombres': 'Add a list of names',
  'Pega nombres': 'Paste names',
  'separados por comas o uno por línea': 'separated by commas or one per line',
  '. PowaFlex los busca en TMDB y los añade a': '. PowaFlex looks them up on TMDB and adds them to',
  'Añadiendo…': 'Adding…',
  'Añadir a {faceta}': 'Add to {faceta}',
  '✓ {n} añadidos de {total}.': '✓ {n} of {total} added.',
  'No encontrados en TMDB: {lista}.': 'Not found on TMDB: {lista}.',
  'Buscar por nombre en TMDB…': 'Search TMDB by name…',
  'Buscando…': 'Searching…',
  'Buscar': 'Search',
  'Nadie con ese nombre en TMDB.': 'Nobody with that name on TMDB.',
  'Añade los {n} que aún no sigues': "Adds the {n} you don't follow yet",
  'Ya los sigues a todos': 'You already follow them all',
  'Añadir todos': 'Add all',
  '✓ Todos añadidos': '✓ All added',

  // ── pasos de carga: los de la pestaña «Mis favoritos» y los de «Añadir»
  'Mirando qué oficios se pueden seguir…': 'Checking which roles you can follow…',
  'Repasando a quién sigues y qué le falta…': 'Going over who you follow and what they are missing…',
  'Buscando los cánones disponibles…': 'Looking up the available canons…',
  'Comprobando si hay un alta en marcha…': 'Checking whether a bulk add is already running…',
  'Buscando a quién más podrías seguir…': 'Looking for who else you could follow…',
  'Bajando de Wikipedia los habituales de Cannes, Venecia y Berlín…':
    'Fetching the Cannes, Venice and Berlin regulars from Wikipedia…',
};
