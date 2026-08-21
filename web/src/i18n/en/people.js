// Gente: People.jsx (parrilla de directores/actores/guionistas) y
// PersonDetail.jsx (ficha con filmografía). La clave es el texto castellano.
export default {
  // ── People.jsx — pestañas y cabecera
  'Tu gente': 'Your people',
  'Directores/as y actores/actrices': 'Directors & actors',
  'Directores/as': 'Directors',
  'Actores/actrices': 'Actors',
  'Guionistas': 'Screenwriters',
  'Dirección de fotografía': 'Cinematography',
  'Música': 'Music',
  'Montaje': 'Editing',
  'y también': 'and also',
  'Buscar nombre…': 'Search by name…',

  // roles sueltos (se interpolan en plantillas)
  'directores/as': 'directors',
  'actores/actrices': 'actors',
  'director/a': 'director',
  'actor/actriz': 'actor',
  'guionista': 'screenwriter',
  'director/a de fotografía': 'cinematographer',
  'compositor/a': 'composer',
  'montador/a': 'editor',

  // filtros demográficos
  'Género||persona': 'Gender',
  'Mujer': 'Female',
  'Hombre': 'Male',
  'No binario': 'Non-binary',
  'Vivo/fallecido': 'Living/deceased',
  'Vivos': 'Living',
  'Fallecidos': 'Deceased',
  'Continente': 'Continent',
  'País (nacimiento)': 'Country (birth)',
  '✕ Limpiar filtros': '✕ Clear filters',
  'Datos demográficos de {n} personas · amplíalos en Ajustes → «Actualizar estado vital»':
    'Demographic data for {n} people · expand it in Settings → “Update life status”',

  // seguimiento y alta masiva
  'La ★ sigue a esa persona como {role} (Favoritos).': 'The ★ follows that person as {role} (Favorites).',
  'Seguir a los': 'Follow the top',
  'primeros': '',
  'Revisar y añadir': 'Review and add',
  'Vas a seguir a {sel} de {total} como {role}': 'You are about to follow {sel} of {total} as {role}',
  'Confirmar': 'Confirm',
  'Cancelar': 'Cancel',
  '{n} títulos': '{n} titles',
  'Nadie nuevo que añadir con ese criterio': 'No one new to add with that criterion',
  '⭐ {n} añadidos a {role}': '⭐ {n} added to {role}',
  '{name} fuera de {role}': '{name} removed from {role}',
  '⭐ {name} a {role}': '⭐ {name} added to {role}',
  ' · y a directores/as: dirige 4+ películas': ' · and to directors: directs 4+ films',
  ' · y a actores/actrices: tiene 8+ interpretadas': ' · and to actors: 8+ acted films',

  // seguir por nombre: la única vía en los oficios que Plex no acredita
  'Seguir por nombre': 'Follow by name',
  'Plex no guarda estos créditos, así que aquí no hay «top de tu biblioteca»: busca a la persona en TMDB y síguela como {role} con la ★.':
    'Plex does not store these credits, so there is no “top of your library” here: look the person up on TMDB and follow them as {role} with the ★.',
  'Buscar por nombre en TMDB…': 'Search TMDB by name…',
  'Buscando…': 'Searching…',
  'Buscar': 'Search',
  'Nadie con ese nombre en TMDB.': 'Nobody with that name on TMDB.',
  'Quitar de favoritos': 'Remove from favorites',
  'Añadir a favoritos': 'Add to favorites',

  // tooltips de la estrella en las tarjetas
  'Quitar de {role}': 'Remove from {role}',
  'Le sigues como {other}: seguirle TAMBIÉN como {role}':
    'You follow them as {other}: follow them ALSO as {role}',
  'Seguir como {role}': 'Follow as {role}',

  // parrilla
  'No hay resultados.': 'No results.',
  'Cargar más': 'Load more',

  // ── PersonDetail.jsx — carga y errores
  'Consultando TMDB…': 'Querying TMDB…',
  'No se pudo cargar la filmografía: {error}. ¿Está configurada la API key de TMDB en Ajustes?':
    'Could not load the filmography: {error}. Is the TMDB API key set up in Settings?',
  'No se encontró esta persona en TMDB.': 'This person was not found on TMDB.',
  'No hay filmografía que mostrar.': 'No filmography to show.',

  // cabecera de la ficha
  '★ Siguiendo como {role}': '★ Following as {role}',
  '☆ Seguir como {role}': '☆ Follow as {role}',
  'Ya fallecido: no tendrá nuevos estrenos, no hace falta seguirlo':
    'Already deceased: there will be no new releases, no need to follow them',
  'Sigue ESTA faceta: puedes tenerle a la vez en directores y en actores':
    'Follows THIS facet: you can have them in directors and actors at once',
  'Ver en tu biblioteca': 'View in your library',
  '⭐ Añadido también a directores/as: dirige 4+ películas de tu biblioteca':
    '⭐ Also added to directors: directs 4+ films in your library',
  '⭐ Añadido también a actores/actrices: tiene 8+ interpretadas en tu biblioteca':
    '⭐ Also added to actors: 8+ acted films in your library',

  // pestañas de rol y completismo (el icono va aparte, sin traducir)
  'Como {oficio}': 'As {oficio}',
  'Completismo (como {role})': 'Completism (as {role})',
  'Solo largometrajes': 'Feature films only',
  ' (incluye documentales: es documentalista)': ' (includes documentaries: they are a documentarian)',
  ' (incluye conciertos: los filma a menudo)': ' (includes concert films: they shoot them often)',
  ' · {n} fuera del cómputo (cortos, TV, docs, conciertos o dirección coral)':
    ' · {n} outside the count (shorts, TV, docs, concerts or co-directions)',
  '🗓️ {n} proyectos anunciados o por estrenar': '🗓️ {n} projects announced or upcoming',
  '🗓️ 1 proyecto anunciado o por estrenar': '🗓️ 1 project announced or upcoming',

  // vistas, orden y Radarr (mismo vocabulario en primera persona que OwnFilterBar)
  'Todas': 'All',
  'Las tengo': 'Owned',
  'Me faltan': 'Missing',
  'Próximas': 'Upcoming',
  'Añadiendo…': 'Adding…',
  '➕ Mandar a Radarr las {n} que te faltan': '➕ Send the {n} you’re missing to Radarr',
  '{n} más quedan fuera por los filtros de abajo (tipo o nota mínima)':
    '{n} more are left out by the filters below (type or minimum rating)',
  'Ordenar:': 'Sort:',
  'Más recientes': 'Newest first',
  'Más antiguas': 'Oldest first',
  'Nota combinada Σ': 'Combined rating Σ',
  'Nota IMDb': 'IMDb rating',
  'Nota Letterboxd': 'Letterboxd rating',
  'Más votadas': 'Most voted',

  // parrilla de películas
  'Nada que mostrar aquí.': 'Nothing to show here.',
  '¡Filmografía completa! 🏆': 'Filmography complete! 🏆',
  '✓ La tienes': '✓ Owned',
  'Anunciada': 'Announced',

  // corrector de emparejado
  'emparejado a mano': 'matched by hand',
  'corregir emparejado': 'fix matching',
  'Corregir a mano su ficha de TMDB': 'Fix their TMDB page by hand',
  'Elige su ficha de TMDB. Se recuerda para siempre y ningún automatismo vuelve a revisarla: úsalo cuando haya dos personas con el mismo nombre o cuando su obra esté repartida en dos fichas.':
    'Pick their TMDB page. It is remembered forever and no automation ever reviews it again: use it when two people share a name or when their work is split across two pages.',
  'Quitar la corrección y volver al emparejado automático':
    'Remove the correction and go back to automatic matching',
  '✓ {name} emparejado a mano': '✓ {name} matched by hand',
  '✓ Corrección quitada': '✓ Correction removed',

  'Directores, actores y equipo': 'Directors, actors & crew',

  // ── pasos de carga (People.jsx y PersonDetail.jsx)
  'Mirando qué oficios se pueden seguir…': 'Checking which roles you can follow…',
  'Cargando los filtros de país y continente…': 'Loading the country and continent filters…',
  'Ordenando quién manda en tu biblioteca…': 'Ranking who rules your library…',
  'Comprobando a quién ya sigues…': 'Checking who you already follow…',
  'Reuniendo su filmografía en TMDB…': 'Gathering their filmography from TMDB…',
  'Comprobando si ya le sigues…': 'Checking whether you already follow them…',

  // «Actualizar desde TMDB» de una ficha de persona
  '⟳ Actualizar desde TMDB': '⟳ Refresh from TMDB',
  'Vuelve a pedir su filmografía a TMDB ahora mismo, sin esperar a la actualización de esta noche. Cine venidero y los huecos se rehacen en la siguiente visita.':
    'Ask TMDB for their filmography right now, without waiting for tonight’s update. Upcoming cinema and the gaps rebuild on your next visit.',
};
