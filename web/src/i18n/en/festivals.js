// Traducciones EN de Festivals.jsx (Festivales y premios). Clave = texto castellano.
export default {
  'serie de televisión': 'TV series',
  'Es una serie de televisión: no tiene ficha de película en TMDB':
    'It is a TV series: it has no movie entry on TMDB',
  'Las secciones oficiales de los grandes festivales (los seis de la vía Óscar más San Sebastián), el palmarés y las nominadas de los premios de cada año, y los cánones de la crítica.':
    "The official selections of the major festivals (the six on the Oscar route plus San Sebastián), each year's winners and award nominees, and the critics' canons.",
  'Festivales': 'Festivals',
  'Premios': 'Awards',
  'Cánones': 'Canons',
  'Secciones de debut': 'Debut sections',
  '{n} más…': '{n} more…',
  'Edición anterior': 'Previous edition',
  'Elegir edición': 'Choose edition',
  'Edición siguiente': 'Next edition',
  'Nominadas por año': 'Nominees by year',
  'Sección oficial por año': 'Official selection by year',
  '🏆 Palmarés histórico': '🏆 All-time winners',
  'Canon: ': 'Canon: ',
  'Premio que clasifica: ': 'Qualifying award: ',
  ' · esta sección existe desde {y}': ' · this section has existed since {y}',
  'Leyendo la selección en Wikipedia y casándola con TMDB…': 'Reading the selection on Wikipedia and matching it with TMDB…',
  'todas las ganadoras ({award})': 'all winners ({award})',
  '{n} películas': '{n} movies',
  '{n} sin casar con TMDB': '{n} not matched with TMDB',
  'TMDB cortó el grifo a mitad de comprobación; este resultado no se guarda en caché':
    'TMDB cut us off mid-check; this result is not cached',
  '{n} sin comprobar por fallos de red — recarga en un rato': '{n} unchecked due to network errors — reload in a while',
  'fuente: Wikipedia': 'source: Wikipedia',
  '↻ Recargar': '↻ Reload',
  'Sus estrenos futuros entrarán en el calendario de cine venidero':
    'Their future releases will show up in the upcoming cinema calendar',
  'Añadiendo…': 'Adding…',
  '⭐ Seguir a sus {n} directores/as': '⭐ Follow its {n} directors',
  '➕ Mandar a Radarr las {n} que te faltan': "➕ Send the {n} you’re missing to Radarr",
  'Todas': 'All',
  'Me faltan': 'Missing',
  'Las tengo': 'Owned',
  '✕ Limpiar filtros': '✕ Clear filters',
  '{n} ocultas por tus filtros': '{n} hidden by your filters',
  'Sin películas en esta edición.': 'No films in this edition.',
  'Nada que enseñar con estos filtros.': 'Nothing to show with these filters.',
  '🏆 Ganadora': '🏆 Winner',
  'Sin ficha en TMDB (todavía)': 'No TMDB entry (yet)',
  'Corregir el emparejado con TMDB a mano': 'Fix the TMDB match by hand',
  'Puesto {n} (empate)': 'Rank {n} (tie)',
  'Puesto {n}': 'Rank {n}',
  'Ya en favoritos': 'Already in favorites',
  'Seguir a {name} como director/a': 'Follow {name} as a director',
  'Busca en TMDB y elige la ficha correcta. La corrección se recuerda y manda sobre el emparejado automático.':
    'Search TMDB and pick the right match. The fix is remembered and overrides the automatic matching.',
  '⭐ {name} en favoritos (directores/as)': '⭐ {name} added to favorites (directors)',
  '{name} ya estaba en favoritos': '{name} was already in favorites',
  '⭐ {n} directores/as añadidos a favoritos': '⭐ {n} directors added to favorites',
  ' · {n} sin resolver': ' · {n} unresolved',
  '✓ Emparejado corregido': '✓ Match fixed',
  '✓ Corrección quitada': '✓ Correction removed',

  // Nombres de festivales y premios del registro del servidor. Son una lista
  // fija y conocida, así que se traducen como cualquier otra etiqueta; los
  // nombres propios (Cannes, Berlinale, Sundance…) se quedan igual y por eso
  // no necesitan entrada.
  'Cine Europeo (EFA)': 'European Film Awards',
  'Óscar a la mejor película': 'Best Picture Oscar',
  'Óscar internacional': 'International Oscar',
  'Premios César': 'César Awards',
  'Premios Goya': 'Goya Awards',
  'Venecia': 'Venice',
  'S.S. · Horizontes Latinos': 'S.S. · Latin Horizons',
  'BAFTA a la mejor película': 'BAFTA for Best Film',
  'César a la mejor película': 'César for Best Film',
  'Goya a la mejor película': 'Goya for Best Film',
  'Premio del Cine Europeo a la mejor película': 'European Film Award for Best Film',
  'Óscar a la mejor película (Best Picture)': 'Academy Award for Best Picture',
  'Óscar a la mejor película internacional': 'Academy Award for Best International Feature',
  'Concha de Oro': 'Golden Shell',
  'León de Oro': 'Golden Lion',
  'Oso de Oro': 'Golden Bear',
  'Palma de Oro': "Palme d'Or",
  'Premio Horizontes': 'Horizontes Award',
  'The Greatest Films of All Time (encuesta de la crítica del BFI)':
    'The Greatest Films of All Time (BFI critics’ poll)',
  'Top 10 anual de la crítica de Cahiers du Cinéma': 'Cahiers du Cinéma annual critics’ top 10',
  '1001 películas': '1001 movies',
  "Caméra d'Or: la mejor ópera prima de todo Cannes (oficial, Semana y Quincena)":
    "Caméra d'Or: the best first feature across all of Cannes (Official Selection, Critics’ Week and Directors’ Fortnight)",
  '«1001 Movies You Must See Before You Die» (Steven Jay Schneider, ed.; 15.ª edición, 2021)':
    '“1001 Movies You Must See Before You Die” (Steven Jay Schneider, ed.; 15th edition, 2021)',
  // Etiquetas de sección y notas ℹ️ que manda el SERVIDOR con cada lista
  // (server/src/festivals.js). El cliente las pasa por t(): si el texto exacto
  // no está aquí, se pinta en castellano tal cual (nunca rompe). Las notas con
  // números variables (p. ej. «Las {n} ganadoras de la historia…») no se pueden
  // traducir por clave exacta y quedan en castellano a propósito.
  'Nominadas': 'Nominees',
  'Top 10 del año': 'Top 10 of the year',
  'Las 1001 del libro (15.ª edición, 2021), en su orden cronológico. Cuatro bloques que el libro trata como una sola entrada (Toy Story, El Señor de los Anillos, Iván el Terrible y Olympia) aparecen con su primera película.':
    'The 1001 from the book (15th edition, 2021), in chronological order. Four blocks the book treats as a single entry (Toy Story, The Lord of the Rings, Ivan the Terrible and Olympia) appear under their first film.',
  'La número 1 de cada año para la crítica de Cahiers; en «Top 10 por año» está la lista completa de cada año.':
    'Each year’s number 1 for the Cahiers critics; the full yearly list is under “Top 10 by year”.',
  'La lista extendida de la encuesta de la crítica (264 películas, empates incluidos), ordenada por puesto. Se renueva cada década: la próxima, en 2032.':
    'The extended list of the critics’ poll (264 films, ties included), ordered by rank. It is renewed every decade: next one in 2032.',
  'Edición cancelada por la pandemia: no hubo competición ni premios, solo una «Selección Oficial 2020» simbólica. Esta es esa lista.':
    'Edition cancelled by the pandemic: there was no competition and no awards, only a symbolic “Official Selection 2020”. This is that list.',
};
