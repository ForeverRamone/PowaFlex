// Fragmento EN de la página «¿Qué es PowaFlex?» (About.jsx). La clave es el
// texto castellano exacto que se pasa a t(); los párrafos con markup van por
// segmentos, en el mismo orden en que aparecen en el JSX.
export default {
  // Cabecera
  'Cuenta': 'Account',
  '¿Qué es PowaFlex?': 'What is PowaFlex?',

  // Párrafo de introducción (por segmentos)
  'PowaFlex es tu centro de mando cinéfilo: una aplicación que vive junto a tu servidor Plex, lee tu biblioteca de películas directamente por la API (sin exports ni CSV), la cruza con':
    'PowaFlex is your film-buff command center: an app that lives next to your Plex server, reads your movie library straight from the API (no exports, no CSV), crosses it with',
  '(la base de datos abierta de cine) y con': '(the open movie database) and with',
  '(tu gestor de descargas monitorizadas), y convierte todo eso en dos cosas:':
    '(your monitored-downloads manager), and turns all of that into two things:',
  'conocer a fondo el cine que tienes': 'knowing the cinema you own inside out',
  'y': 'and',
  'cazar el cine que te falta o que está por venir': 'hunting the cinema you\'re missing or that\'s yet to come',
  '. Todo se guarda en local, en tu propia máquina; de tu red solo salen las consultas a los servicios que conectes (TMDB, MDBList, JustWatch, Letterboxd, Wikipedia).':
    '. Everything is stored locally, on your own machine; the only things leaving your network are the queries to the services you connect (TMDB, MDBList, JustWatch, Letterboxd, Wikipedia).',

  // La ruta paso a paso
  'Si acabas de llegar: la ruta, paso a paso': 'Just arrived? The route, step by step',
  'Los cuatro primeros pasos se hacen una vez y dejan la aplicación funcionando. Del quinto en adelante empieza el uso diario. Puedes saltarte cualquiera que no te interese: nada depende de lo que no configures.':
    'The first four steps are done once and leave the app up and running. From the fifth on, daily use begins. Skip any step you don\'t care about: nothing depends on what you leave unconfigured.',
  'opcional': 'optional',

  'Conecta tu Plex': 'Connect your Plex',
  'En Ajustes, pega la dirección del servidor y tu X-Plex-Token (la propia página explica cómo sacarlo) y elige la biblioteca de películas. Lanza la sincronización: la primera tarda unos minutos y trae fichas, reparto, géneros, visionados y datos técnicos.':
    'In Settings, paste the server address and your X-Plex-Token (the page itself explains how to get it) and pick the movie library. Launch the sync: the first one takes a few minutes and brings in movie records, cast, genres, watch history and technical data.',
  'Añade la clave de TMDB': 'Add the TMDB key',
  'Es gratuita y es lo que convierte tu lista de archivos en filmografías: sin ella no hay completismo, ni calendario de estrenos, ni sagas, ni huecos que rellenar. Es el paso que más rendimiento da.':
    'It\'s free and it\'s what turns your list of files into filmographies: without it there\'s no completism, no release calendar, no sagas, no gaps to fill. It\'s the step with the biggest payoff.',
  'Conecta Radarr': 'Connect Radarr',
  'Sin Radarr, PowaFlex te enseña lo que te falta; con Radarr, además lo pide. Necesita la URL y la API key, y le dices con qué perfil de calidad y en qué carpeta debe añadir.':
    'Without Radarr, PowaFlex shows you what you\'re missing; with Radarr, it also requests it. It needs the URL and the API key, and you tell it which quality profile to use and which folder to add into.',
  'Trae tu Letterboxd y las notas': 'Bring in your Letterboxd and the ratings',
  'En Ajustes, importa el zip de tu export para que PowaFlex sepa qué has visto aunque no lo reprodujeras en Plex, y pon tu RSS para que se mantenga solo. Con la clave de MDBList (también en Ajustes) cada película gana las notas de IMDb, Rotten Tomatoes, Metacritic y Letterboxd.':
    'In Settings, import the zip from your export so PowaFlex knows what you\'ve watched even if you didn\'t play it in Plex, and set your RSS so it keeps itself current. With the MDBList key (also in Settings) every movie gains the IMDb, Rotten Tomatoes, Metacritic and Letterboxd ratings.',
  'Mira dónde estás': 'See where you stand',
  'El Dashboard te da la foto general y el Taller la salud técnica. En Visionado ves cuánto llevas visto y qué grandes películas tuyas siguen esperando. Aquí todavía no hay nada que decidir: es tomar medida de la colección.':
    'The Dashboard gives you the big picture and the Workshop the technical health. In Viewing you see how much you\'ve watched and which of your great movies are still waiting. Nothing to decide here yet: it\'s about taking the measure of your collection.',
  'Marca a tu gente': 'Mark your people',
  'Este es el paso que enciende el resto de la aplicación. Sigue a tus directores/as y actores/actrices —de uno en uno, por paquetes o pegando una lista de nombres— indicando por qué faceta los sigues; quien dirige e interpreta puede estar en las dos a la vez. Sus filmografías pasan a ser tu lista de tareas.':
    'This is the step that lights up the rest of the app. Follow your directors and actors — one by one, in packs or by pasting a list of names — saying which facet you follow them for; someone who directs and acts can be in both at once. Their filmographies become your to-do list.',
  'Caza los huecos': 'Hunt the gaps',
  'Descubrir huecos cruza esas filmografías con tu Plex y te dice qué falta, con filtros para dejar fuera el ruido (cortos, documentales, conciertos, TV, cameos). Sagas hace lo mismo con las franquicias a medias, y Listas y retos con los cánones (1001 películas, premios…). Cada película se manda a Radarr desde su propia fila.':
    'Discover gaps crosses those filmographies with your Plex and tells you what\'s missing, with filters to keep the noise out (shorts, documentaries, concerts, TV, cameos). Sagas does the same with half-finished franchises, and Lists & challenges with the canons (1001 movies, awards…). Each movie is sent to Radarr from its own row.',
  'Déjalo corriendo': 'Leave it running',
  'Cine venidero vigila los estrenos de tu gente. Cada noche PowaFlex resincroniza Plex, recalcula huecos y, si lo activas, manda solos a Radarr los estrenos de tus directores/as favoritos/as vivos. A partir de aquí solo tienes que entrar de vez en cuando.':
    'Upcoming cinema watches the releases of your people. Every night PowaFlex resyncs Plex, recalculates gaps and, if you turn it on, sends the releases of your living favorite directors to Radarr on its own. From here on you only need to drop by now and then.',

  // ¿Qué puedo hacer con PowaFlex?
  '¿Qué puedo hacer con PowaFlex?': 'What can I do with PowaFlex?',
  'Conocer tu colección': 'Know your collection',
  'Ver totales: cuántas películas, horas de cine, disco ocupado y % visto.':
    'See totals: how many movies, hours of cinema, disk used and % watched.',
  'Explorar gráficas por década y género, el ritmo al que crece la colección y, en «Calidad y disco», el reparto de resoluciones.':
    'Explore charts by decade and genre, the pace at which the collection grows and, in “Quality & disk”, the resolution breakdown.',
  'Filtrar la biblioteca al estilo Letterboxd (género, país, década, metraje, HDR, notas de IMDb/RT/Letterboxd…) y ordenarla por cualquiera de esas notas. La estrella dorada marca lo que ya has visto.':
    'Filter the library Letterboxd-style (genre, country, decade, length, HDR, IMDb/RT/Letterboxd ratings…) and sort it by any of those ratings. The golden star marks what you\'ve already watched.',
  'Abrir la ficha de cualquier película con reparto, notas de varias webs y datos técnicos, y elegir qué nota sale en cada póster.':
    'Open any movie\'s page with cast, ratings from several sites and technical data, and choose which rating shows on each poster.',
  'Ver rankings de directores/as, actores/actrices y guionistas por presencia, y filtrarlos por género, país, continente o si están vivos.':
    'See rankings of directors, actors and screenwriters by presence, and filter them by gender, country, continent or whether they\'re alive.',
  'Cazar lo que te falta': 'Hunt what you\'re missing',
  'Ver el % de completismo de cada director/a o actor/actriz (solo largometrajes) y lo que te falta de su filmografía.':
    'See each director\'s or actor\'s completism % (features only) and what you\'re missing from their filmography.',
  'Seguir un calendario de estrenos y proyectos anunciados de tus cineastas.':
    'Follow a calendar of releases and announced projects from your filmmakers.',
  'Detectar franquicias empezadas y sin terminar (sagas de TMDB), con las partes que faltan a la vista.':
    'Spot franchises started and left unfinished (TMDB sagas), with the missing parts in plain sight.',
  'Comprobar retos de listas famosas (IMDb Top 250, Cannes, 1001…) con anillos de «tengo» vs «visto».':
    'Check challenges from famous lists (IMDb Top 250, Cannes, 1001…) with “owned” vs “watched” rings.',
  'Recorrer las secciones oficiales y el palmarés de los grandes festivales (Cannes, Venecia, Berlinale…) para cazar sus películas y seguir a sus cineastas.':
    'Browse the official selections and winners of the major festivals (Cannes, Venice, Berlinale…) to hunt their movies and follow their filmmakers.',
  'Encontrar grandes directores/as del canon de They Shoot Pictures ausentes de tu servidor.':
    'Find great directors from the They Shoot Pictures canon missing from your server.',
  'Comprobar en JustWatch si existe una versión de más calidad (HD/4K) en el mercado.':
    'Check on JustWatch whether a higher-quality version (HD/4K) exists on the market.',
  'Actuar con Radarr': 'Act with Radarr',
  'Añadir a Radarr cualquier película que te falte con un clic, con perfil y carpeta configurables.':
    'Add any movie you\'re missing to Radarr in one click, with configurable profile and folder.',
  'Añadir en bloque toda una lista, saga o el cine venidero de un plazo.':
    'Bulk-add a whole list, a saga or the upcoming cinema of a given window.',
  'Automatizar el día a día: lanzar solo cada noche los estrenos de tus directores/as favoritos/as vivos.':
    'Automate the day-to-day: send the releases of your living favorite directors on its own every night.',
  'Ver en el Dashboard qué pedidas han llegado por fin (capturas), y en Calidad cuáles siguen sin aparecer o llegaron por debajo de tu perfil, con re-búsqueda en un clic.':
    'See on the Dashboard which requests have finally arrived (captures), and in Quality which ones still haven\'t shown up or came in below your profile, with one-click re-search.',
  'Pedir upgrades de las películas por debajo de 1080p.':
    'Request upgrades for movies below 1080p.',
  'Tu gusto y tu historial': 'Your taste and your history',
  'Importar tu Letterboxd (zip completo) y su feed RSS para marcar vistas y notas.':
    'Import your Letterboxd (full zip) and its RSS feed to mark watched movies and ratings.',
  'Ver últimas añadidas a Plex, últimas vistas (Plex + Letterboxd) y últimas peticiones a Radarr.':
    'See the latest additions to Plex, the latest watched (Plex + Letterboxd) and the latest Radarr requests.',
  'Comparar tus notas de Letterboxd con las de la crítica y la comunidad (joyas ocultas, discrepancias).':
    'Compare your Letterboxd ratings with the critics\' and the community\'s (hidden gems, discrepancies).',
  'Marcar favoritos (incluidos directores/as que aún no tienes): por paquetes temáticos, pegando una lista de nombres o de uno en uno.':
    'Mark favorites (including directors you don\'t own yet): in themed packs, by pasting a list of names or one by one.',
  'Elegir de qué webs (IMDb, RT, Metacritic, Letterboxd…) quieres ver las notas.':
    'Choose which sites (IMDb, RT, Metacritic, Letterboxd…) you want ratings from.',

  // Cómo funciona
  'Cómo funciona': 'How it works',
  '1. Sincronización con Plex.': '1. Sync with Plex.',
  'Con tu X-Plex-Token, PowaFlex recorre tu biblioteca y descarga de cada película el reparto completo, dirección, guion, géneros, países, colecciones, visionados, y los datos técnicos del archivo (resolución, códec, HDR/Dolby Vision, tamaño). La primera vez tarda unos minutos; después es incremental y se repite sola cada noche.':
    'With your X-Plex-Token, PowaFlex walks your library and downloads, for each movie, the full cast, direction, screenplay, genres, countries, collections, watch history, and the file\'s technical data (resolution, codec, HDR/Dolby Vision, size). The first run takes a few minutes; after that it\'s incremental and repeats on its own every night.',
  '2. Cruce con TMDB.': '2. Crossing with TMDB.',
  'Cada película de Plex trae su identificador TMDB, así que el emparejado es exacto. Con él, PowaFlex consulta filmografías completas, estrenos futuros y sagas, y lo cachea para no repetir llamadas.':
    'Every Plex movie carries its TMDB identifier, so matching is exact. With it, PowaFlex looks up full filmographies, future releases and sagas, and caches it all to avoid repeating calls.',
  '3. Acción con Radarr.': '3. Action with Radarr.',
  'Cualquier película que te falte —de una filmografía, del calendario, de una saga o de tu watchlist— se añade a Radarr con un clic, monitorizada y con búsqueda automática, usando el perfil de calidad y carpeta que elijas en Ajustes.':
    'Any movie you\'re missing — from a filmography, the calendar, a saga or your watchlist — is added to Radarr in one click, monitored and with automatic search, using the quality profile and folder you choose in Settings.',

  // Las secciones, una a una
  'Las secciones, una a una': 'The sections, one by one',
  'Y desde cualquier sitio,': 'And from anywhere,',
  'abre la búsqueda global: películas, personas, sagas, listas, festivales y saltar a cualquier sección, con las flechas y Enter.':
    'opens the global search: movies, people, sagas, lists, festivals and jumping to any section, with the arrow keys and Enter.',

  // Dashboard
  'La foto general: cuántas películas tienes, cuántas horas de cine suman, cuánto disco ocupan, y gráficas por década y por género, además del ritmo al que crece la biblioteca y los directores/as y actores/actrices con más presencia. Arriba, lo vivo: las':
    'The big picture: how many movies you own, how many hours of cinema they add up to, how much disk they take, plus charts by decade and by genre, the pace at which the library grows and the directors and actors with the strongest presence. Up top, the live part: the',
  'novedades': '“What\u2019s new” alerts',
  'que detecta el pase nocturno (una edición de festival recién publicada, una pedida que ya está en digital) y las':
    'the nightly run detects (a festival edition just published, a request that\'s now on digital) and the',
  'capturas': 'captures',
  'de la semana.': 'of the week.',

  // Biblioteca
  'Biblioteca': 'Library',
  'Toda tu colección en una parrilla de pósters (con ★ dorada en las vistas) y filtros al estilo Letterboxd: género, país, década, visto/sin ver, largometraje o corto (menos de 40 minutos), resolución, HDR/Dolby Vision, notas mínimas de IMDb/RT/Letterboxd… y ordenación por fecha añadida, estreno, esas notas, duración, tamaño o aleatorio. La nota que sale en cada póster la eliges tú.':
    'Your whole collection in a grid of posters (with a golden ★ on the watched ones) and Letterboxd-style filters: genre, country, decade, watched/unwatched, feature or short (under 40 minutes), resolution, HDR/Dolby Vision, minimum IMDb/RT/Letterboxd ratings… and sorting by date added, release, those ratings, runtime, size or random. The rating shown on each poster is up to you.',

  // Directores/as y actores/actrices
  'Directores/as y actores/actrices': 'Directors & actors',
  'El ranking de directores/as, actores/actrices y guionistas por presencia en tu Plex, con filtros demográficos (género, vivos/fallecidos, continente, país), la ★ para seguir a cualquiera y el alta en bloque de «los N primeros» con previsualización. La ficha de cada persona cruza su filmografía completa de TMDB con lo que tienes: completismo, lo que te falta (con botón a Radarr), proyectos anunciados y notas, con orden y listón de nota mínima. Quien dirige y actúa tiene una pestaña por faceta.':
    'The ranking of directors, actors and screenwriters by presence in your Plex, with demographic filters (gender, living/deceased, continent, country), the ★ to follow anyone and the bulk sign-up of "the top N" with preview. Each person\'s page crosses their full TMDB filmography with what you own: completism, what you\'re missing (with a Radarr button), announced projects and ratings, with sorting and a minimum-rating bar. Anyone who both directs and acts gets a tab per facet.',

  // Cine venidero
  'Cine venidero': 'Upcoming cinema',
  'Un calendario mensual con los próximos estrenos y proyectos anunciados de los directores/as y actores/actrices más importantes de tu biblioteca (y de los que sigas manualmente). Cada estreno se puede mandar a Radarr para tenerlo monitorizado desde ya.':
    'A monthly calendar with the upcoming releases and announced projects of the most important directors and actors in your library (and of anyone you follow manually). Every release can be sent to Radarr so it\'s monitored from day one.',

  // Favoritos
  'Favoritos': 'Favorites',
  'Tu lista de directores/as y actores/actrices de cabecera, la que alimenta el calendario. Cada persona puede seguirse por una faceta o por las dos (un Eastwood cuenta en directores Y en actores). En «Añadir» está el':
    'Your go-to list of directors and actors, the one that feeds the calendar. Each person can be followed for one facet or both (an Eastwood counts among directors AND among actors). Under "Add" lives the',
  'catálogo de 680 directores en activo': 'catalog of 680 working directors',
  'de Wikidata —importancia, obra y premios, con filtros por región, país y género— para captar favoritos con la ☆, además de los paquetes temáticos y de festival con «añadir todos», volcar cánones enteros y pegar una lista de nombres; también exportar la tuya y el modo podar para limpiar en bloque. Lo que quites con la ✕ no vuelve por los añadidos masivos (solo a mano). Para seguir gente desde el ranking de tu biblioteca, la ★ vive en Directores y actores.':
    'from Wikidata — importance, body of work and awards, with filters by region, country and gender — to scout favorites with the ☆, plus the themed and festival packs with "add all", dumping in whole canons and pasting a list of names; also exporting your own and the prune mode to clean up in bulk. Whatever you remove with the ✕ won\'t come back through bulk additions (only by hand). To follow people from your library\'s ranking, the ★ lives in Directors & actors.',

  // Festivales
  'Festivales': 'Festivals',
  'Las secciones oficiales de los grandes festivales —los seis de la vía directa al Óscar internacional (Cannes, Venecia, Berlinale, Sundance, Toronto y Busan) más San Sebastián y sus Horizontes Latinos—, edición a edición, el palmarés histórico de cada premio, los grandes premios anuales con palmarés y nominadas por año (Goya, César, BAFTA, Cine Europeo, Óscar a la mejor película y Óscar internacional) y el canon':
    'The official selections of the major festivals — the six on the direct route to the international Oscar (Cannes, Venice, Berlinale, Sundance, Toronto and Busan) plus San Sebastián and its Horizontes Latinos —, edition by edition, the all-time winners of each award, the big annual awards with winners and nominees per year (Goya, César, BAFTA, European Film Awards, Best Picture Oscar and international Oscar) and the',
  'de la crítica al completo. Cualquier emparejado con TMDB se corrige a mano desde la propia tarjeta (✎). Todo casado con tu Plex: manda a Radarr lo que falte y sigue a sus directores/as —de una en una o la sección entera— para que sus estrenos entren en el calendario. El pase nocturno vigila las ediciones nuevas y te lo cuenta en el Dashboard en cuanto un festival publica su selección.':
    'critics\' canon in full. Any TMDB match can be fixed by hand from the card itself (✎). Everything matched against your Plex: send what\'s missing to Radarr and follow its directors — one at a time or the whole section — so their releases enter the calendar. The nightly run watches for new editions and tells you on the Dashboard as soon as a festival publishes its selection.',

  // Descubrir huecos
  'Descubrir huecos': 'Discover gaps',
  'El modo completista, en cinco pestañas: lo que te falta de': 'Completist mode, in five tabs: what you\'re missing from',
  'tus favoritos': 'your favorites',
  '; los': '; the',
  'directores/as y actores/actrices top': 'top directors and actors',
  'de tu biblioteca (con filtros demográficos: «mis directoras españolas top»); los':
    'of your library (with demographic filters: "my top Spanish women directors"); the',
  'grandes ausentes': 'great absentees',
  'del canon —They Shoot Pictures, IMDb 501, el «en boga» de TMDB o cualquier lista que pegues— sin una sola película en tu servidor; y tus':
    'from the canon — They Shoot Pictures, IMDb 501, TMDB\'s "trending" or any list you paste — without a single movie on your server; and your',
  'sagas': 'sagas',
  'a medias, detectadas con la colección real de TMDB. Todo con envío a Radarr, descarte reversible, listón de nota y filtros de ruido.':
    'left halfway, detected with the real TMDB collection. All of it with Radarr sending, reversible dismissal, a rating bar and noise filters.',

  // Estrenos
  'Estrenos': 'New releases',
  'Qué acaba de llegar y qué viene: a los': 'What just landed and what\'s coming: to',
  'cines de España': 'Spanish theaters',
  ', a los': ', to',
  'cines de EE UU': 'US theaters',
  'y a las': 'and to',
  'plataformas y VOD de España y de EE UU': 'streaming and VOD in Spain and the US',
  '(fecha de estreno digital de TMDB, con chips de dónde verla en cada país: Netflix, Filmin, Movistar…, y con nombre también cuando solo se alquila). Solo cine largometraje, con ventana de 7/30/90 días más lo próximo, y los filtros de la casa: listón Σ de MDBList para separar el estreno que importa del relleno, Me faltan / Las tengo, tipos, plataforma o VOD concretos, y envío a Radarr suelto o en bloque.':
    '(TMDB digital release date, with chips showing where to watch in each country: Netflix, Filmin, Movistar…, named too when it is rent-only). Feature films only, with a 7/30/90-day window plus what\'s next, and the house filters: an MDBList Σ bar to separate the release that matters from the filler, Missing / Owned, types, a specific platform or VOD service, and Radarr sending one by one or in bulk.',

  // Listas y retos
  'Listas y retos': 'Lists & challenges',
  'Tu': 'Your',
  'watchlist de Letterboxd': 'Letterboxd watchlist',
  '(con Radarr en lo que te falta), tus retos importados de Letterboxd con anillos de «tengo» vs «visto», y las listas de MDBList (1001 películas, palmarés de premios, tops de la comunidad) convertidas en retos de completismo: % conseguido, lo que falta y envío en bloque a Radarr.':
    '(with Radarr on what you\'re missing), your challenges imported from Letterboxd with “owned” vs “watched” rings, and the MDBList lists (1001 movies, award winners, community tops) turned into completism challenges: % achieved, what\'s missing and bulk sending to Radarr.',

  // Visionado
  'Visionado': 'Viewing',
  'El contador de lo que llevas visto (Plex + Letterboxd) y lo visto contra lo pendiente: por década, por género, los directores/as de los que más te queda por ver, joyas y discrepancias frente a tu nota de Letterboxd, las mejor valoradas que aún no has visto, los «must-see» de Metacritic pendientes, la tabla de tus notas contra la comunidad y tu historial reciente.':
    'The counter of what you\'ve watched so far (Plex + Letterboxd) and watched versus pending: by decade, by genre, the directors you have the most left to see, gems and discrepancies against your Letterboxd rating, the best-rated ones you haven\'t watched yet, the pending Metacritic “must-sees”, the table of your ratings against the community\'s and your recent history.',

  // Taller
  'Taller': 'Workshop',
  'El mantenimiento, en dos pestañas.': 'Maintenance, in two tabs.',
  'Calidad y disco': 'Quality & disk',
  ': resoluciones, códecs y HDR, candidatas a upgrade, duplicados, la deuda de Radarr (pedidas que no llegan, por debajo del corte) y los archivos más pesados.':
    ': resolutions, codecs and HDR, upgrade candidates, duplicates, the Radarr backlog (requests that never arrive, below the cutoff) and the heaviest files.',
  'Salud de los datos': 'Data health',
  ': auditorías locales —películas sin ficha TMDB, identidades repetidas, entradas de Letterboxd sin casar, peticiones zombis y emparejados sin demostrar— cada una con su remedio al lado.':
    ': local audits — movies without a TMDB entry, duplicate identities, unmatched Letterboxd entries, zombie requests and unverified matches — each with its remedy right beside it.',

  // Ajustes
  'Ajustes': 'Settings',
  'Las conexiones (Plex, TMDB, Radarr, MDBList y Letterboxd —el zip del export y el RSS se importan aquí—) con guías paso a paso para conseguir cada credencial, el aspecto de la app, qué notas quieres ver, el perfil de calidad y carpeta que usará Radarr, el tamaño del radar del calendario, el control de sincronización manual, el histórico de los últimos 30 días del pase nocturno (paso a paso, con duraciones y errores) y la copia de seguridad: descarga de la base de datos entera y exportación/importación de la configuración para reinstalar sin empezar de cero.':
    'The connections (Plex, TMDB, Radarr, MDBList and Letterboxd — the export zip and the RSS are imported here) with step-by-step guides to get each credential, the app\'s look, which ratings you want to see, the quality profile and folder Radarr will use, the size of the calendar radar, manual sync control, the last 30 days of nightly-run history (step by step, with durations and errors) and the backup: download the whole database and export/import the configuration to reinstall without starting from scratch.',

  // Pie
  'PowaFlex corre en Docker (pensado para un mini-PC junto a Plex y Radarr), guarda sus datos en SQLite en la carpeta':
    'PowaFlex runs in Docker (built for a mini-PC next to Plex and Radarr), stores its data in SQLite in the',
  'y no tiene cuentas ni telemetría. Datos de cine por cortesía de':
    'folder, and has no accounts and no telemetry. Movie data courtesy of',
  '. No expongas la app a internet sin un proxy con autenticación: está diseñada para tu red local. Las credenciales de Plex, TMDB y Radarr se guardan en SQLite; define la variable de entorno':
    '. Don\'t expose the app to the internet without an authenticating proxy: it\'s designed for your local network. The Plex, TMDB and Radarr credentials are stored in SQLite; set the environment variable',
  'para cifrarlas en disco.': 'to encrypt them on disk.',
  'Proyecto de código abierto:': 'Open-source project:',
  '— las novedades de cada versión se publican en la sección Releases.':
    '— each version\'s changes are published in the Releases section.',
};
