// Traducciones EN del Taller: Quality.jsx, Salud.jsx y Taller.jsx. Clave = texto castellano.
export default {
  // ---- Taller.jsx (pestañas y cabecera) ----
  'Tu colección': 'Your collection',
  'Taller': 'Workshop',
  'El mantenimiento de la colección: calidad de los archivos, disco, deuda de Radarr y auditorías de los datos.':
    'Collection maintenance: file quality, disk space, Radarr backlog and data audits.',
  'Calidad y disco': 'Quality & disk',
  'Salud de los datos': 'Data health',

  // ---- Quality.jsx ----
  'Colección': 'Collection',
  // pasos de carga
  'Midiendo la calidad de tus archivos…': 'Measuring the quality of your files…',
  'Buscando las que pedirían una copia mejor…': 'Looking for the ones that would want a better copy…',
  'Buscando duplicados en el disco…': 'Looking for duplicates on disk…',
  'Preguntando a Radarr qué le debe a tu colección…': 'Asking Radarr what it owes your collection…',
  '🔍 Radarr vuelve a buscar «{title}»': '🔍 Radarr is searching for “{title}” again',
  '{n} a': '{n} y',
  '{n} m': '{n} mo',
  '{n} d': '{n} d',
  'Ya existe copia digital: debería poder conseguirse': 'A digital copy exists: it should be obtainable',
  'Aún no ha salido en digital': 'Not out on digital yet',
  'en digital': 'on digital',
  'Estrenada en salas, sin fecha digital anunciada: normal que no aparezca todavía':
    'Released in theaters with no digital date announced: normal that it has not shown up yet',
  'solo cines': 'theaters only',
  'Sin fechas de estreno en TMDB': 'No release dates on TMDB',
  'sin fecha': 'no date',
  '{a} de {b} tienen mejor versión disponible': '{a} of {b} have a better version available',
  'Resolución': 'Resolution',
  'Códecs de vídeo': 'Video codecs',
  '{n} pelis · {size}': '{n} movies · {size}',
  '{n} películas': '{n} movies',
  'clic para filtrar': 'click to filter',
  'Espacio en disco por década': 'Disk space by decade',
  'Candidatas a upgrade (bien valoradas, por debajo de 1080p)': 'Upgrade candidates (well rated, below 1080p)',
  'Todo está al menos en 1080p.': 'Everything is at least 1080p.',
  'Consultando… {done}/{total}': 'Checking… {done}/{total}',
  '¿Cuáles tienen mejor versión?': 'Which ones have a better version?',
  '{a} de {b} con mejor versión en el mercado': '{a} of {b} with a better version out there',
  'Todas ({n})': 'All ({n})',
  'Con mejor versión ({n})': 'Better version available ({n})',
  'Sin mejor versión ({n})': 'No better version ({n})',
  'Pidiendo…': 'Requesting…',
  'Pedir {n} a Radarr': 'Request {n} from Radarr',
  ' (todas las visibles)': ' (all visible)',
  'Pedidas a Radarr que siguen sin aparecer ({n})': 'Requested from Radarr and still missing ({n})',
  'Monitorizadas sin archivo, las más antiguas primero: son las que piden una decisión (volver a buscar, esperar al estreno digital o quitar de Radarr).':
    'Monitored with no file, oldest first: these are the ones that call for a decision (search again, wait for the digital release, or remove from Radarr).',
  '¿?': '?',
  'Tiempo en Radarr sin conseguirse': 'Time in Radarr without being grabbed',
  'hace {t}': '{t} ago',
  '🔍 Buscar de nuevo': '🔍 Search again',
  'Por debajo del corte de tu perfil de Radarr ({n})': 'Below your Radarr profile cutoff ({n})',
  'Tienen archivo, pero de menos calidad de la que pide tu perfil: Radarr las mejorará si aparece algo mejor, y puedes forzar la búsqueda ya.':
    'They have a file, but of lower quality than your profile asks for: Radarr will upgrade them if something better shows up, and you can force the search now.',
  '🔍 Buscar mejor': '🔍 Search for better',
  'Duplicados y versiones múltiples': 'Duplicates and multiple versions',
  'Con varias versiones/archivos ({n})': 'With several versions/files ({n})',
  '{n} versiones · {size}': '{n} versions · {size}',
  'Ninguna.': 'None.',
  'Mismo TMDB ID repetido ({n})': 'Same TMDB ID repeated ({n})',
  '({n} entradas)': '({n} entries)',
  'Ninguno.': 'None.',
  'Los 30 archivos más pesados': 'The 30 largest files',
  'Título': 'Title',
  'Año': 'Year',
  'Códec': 'Codec',
  'Tamaño': 'Size',

  // ---- Salud.jsx ----
  '✓ {n} identidades demostradas': '✓ {n} identities verified',
  ' · {n} sin demostrar': ' · {n} unverified',
  '✓ {n} entradas emparejadas': '✓ {n} entries matched',
  'Auditando la base de datos…': 'Auditing the database…',
  'Mirando si quedó una comprobación a medias…': 'Checking whether a verification was left half-done…',
  'Auditorías locales de la base de datos: huérfanos, homónimos y peticiones zombis, cada uno con su remedio al lado.':
    'Local database audits: orphans, namesakes and zombie requests, each with its fix right next to it.',
  'Películas sin ficha de TMDB': 'Movies without a TMDB entry',
  'Toda la biblioteca tiene su ficha: notas, sagas, festivales y huecos las ven todas.':
    'Every film in the library has its record: ratings, sagas, festivals and gaps see them all.',
  'Sin TMDB id quedan fuera de notas, sagas, festivales y huecos. El pase nocturno intenta resolverlas solas (por IMDb id y por título); las que persisten suelen ser rarezas o títulos mal escritos en Plex.':
    'Without a TMDB id they stay out of ratings, sagas, festivals and gaps. The nightly run tries to resolve them on its own (by IMDb id and by title); the ones that persist are usually oddities or titles misspelled in Plex.',
  'Mismo TMDB id en varias entradas de Plex': 'Same TMDB id across several Plex entries',
  'Ninguna identidad repetida.': 'No repeated identities.',
  'O son ediciones legítimas duplicadas (véase también «Duplicados» en Calidad y disco), o el agente de Plex emparejó dos películas distintas a la misma ficha: merece un vistazo en Plex.':
    'Either they are legitimate duplicate editions (see also “Duplicates” under Quality & disk), or the Plex agent matched two different films to the same record: worth a look in Plex.',
  'Entradas de Letterboxd sin emparejar': 'Unmatched Letterboxd entries',
  'Todo tu Letterboxd está casado con la biblioteca o con TMDB.': 'Your whole Letterboxd is matched to the library or to TMDB.',
  'Visionados o notas tuyas que no casan con nada: no cuentan en Visionado ni en el completismo.':
    'Watches or ratings of yours that match nothing: they count neither in Viewing nor in completism.',
  'Resolviendo…': 'Resolving…',
  '🔎 Intentar resolverlas contra TMDB': '🔎 Try to resolve them against TMDB',
  'Ir a Ajustes → Letterboxd': 'Go to Settings → Letterboxd',
  'Peticiones zombis en Radarr (6+ meses sin aparecer)': 'Zombie requests in Radarr (6+ months missing)',
  'Nada pedido lleva más de seis meses atascado.': 'Nothing requested has been stuck for more than six months.',
  'Monitorizadas desde hace más de medio año sin archivo. En «Calidad y disco» tienen su fase de estreno y la re-búsqueda; las que no existan en digital quizá merezcan salir de Radarr.':
    'Monitored for over half a year with no file. Under “Quality & disk” they have their release phase and the re-search; the ones that do not exist on digital may deserve to leave Radarr.',
  'Verlas en Calidad y disco →': 'See them under Quality & disk →',
  'desde {date}': 'since {date}',
  'Personas con emparejado sin demostrar': 'People with an unverified match',
  'Todas las personas con ficha TMDB demostraron su identidad con tus propias películas.':
    'Everyone with a TMDB entry proved their identity with your own films.',
  'Casi todas están simplemente SIN MIRAR: añadir a alguien a favoritos o volcar un canon le pone su ficha de TMDB, pero la identidad solo se comprueba cuando algo necesita su filmografía. Con el botón se comprueban todas de una vez.':
    'Almost all of them are simply UNCHECKED: adding someone to favorites or importing a canon gives them their TMDB entry, but the identity is only checked when something needs their filmography. The button checks them all in one go.',
  'Su búsqueda en TMDB no encontró a nadie con al menos una de tus películas en su filmografía: puede ser un homónimo. Se reintenta solo cada semana; entrar en su ficha también fuerza el reintento.':
    'Their TMDB search found nobody with at least one of your films in their filmography: it may be a namesake. It retries on its own every week; opening their page also forces the retry.',
  ' se comprobaron y ninguna ficha de TMDB compartía película con las tuyas (ahí sí puede haber un homónimo) · ':
    ' were checked and no TMDB entry shared a movie with yours (there a namesake really is possible) · ',
  ' aún sin mirar.': ' still unchecked.',
  'Comprobando…': 'Checking…',
  '🔎 Comprobar ahora contra TMDB': '🔎 Check against TMDB now',
  '{done} de {total} · {n} demostradas': '{done} of {total} · {n} verified',
  '✓ {n} demostradas · {m} siguen sin poder demostrarse': '✓ {n} verified · {m} still cannot be verified',
  'Se buscó y ninguna ficha compartía película con las tuyas': 'Searched, and no record shared a film with yours',
  'comprobada': 'checked',
  '{n} películas tuyas': '{n} of your films',
  'Cobertura de notas de MDBList': 'MDBList ratings coverage',
  ' de ': ' of ',
  ' películas con notas': ' films with ratings',
  ' · el resto se descarga solo cada noche dentro del cupo diario (te quedan {n} peticiones hoy)':
    ' · the rest downloads on its own each night within the daily quota (you have {n} requests left today)',
  'Ajustes →': 'Settings →',

  // resumen de la salud de los datos (Beta 1.22)
  '✓ Las {n} auditorías salen limpias: no hay nada que revisar.':
    '✓ All {n} audits come back clean: there is nothing to review.',
  '{n} de {total} auditorías tienen algo que revisar:':
    '{n} of {total} audits have something to review:',
  'Sin ficha de TMDB': 'No TMDB entry',
  'Identidades repetidas': 'Duplicate identities',
  'Letterboxd sin emparejar': 'Unmatched Letterboxd entries',
  'Peticiones zombis': 'Zombie requests',
  'Emparejados sin demostrar': 'Unproven matches',
};
