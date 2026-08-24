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
  'Monitorizadas sin archivo, las más antiguas primero: piden una decisión —volver a buscar, esperar al digital o quitarlas de Radarr.':
    'Monitored with no file, oldest first: these need a decision — search again, wait for digital, or drop them from Radarr.',
  '¿?': '?',
  'Tiempo en Radarr sin conseguirse': 'Time in Radarr without being grabbed',
  'hace {t}': '{t} ago',
  '🔍 Buscar de nuevo': '🔍 Search again',
  'Por debajo del corte de tu perfil de Radarr ({n})': 'Below your Radarr profile cutoff ({n})',
  'Tienen archivo, pero por debajo de tu perfil. Radarr las mejorará si aparece algo mejor, y puedes forzar la búsqueda ya.':
    'They have a file, but below your profile. Radarr will upgrade them if something better shows up, and you can force the search now.',
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
  'Auditorías locales: huérfanos, homónimos y peticiones zombis, cada una con su remedio al lado.':
    'Local audits: orphans, namesakes and zombie requests, each with its remedy beside it.',
  'Películas sin ficha de TMDB': 'Movies without a TMDB entry',
  'Toda la biblioteca tiene su ficha: notas, sagas, festivales y huecos las ven todas.':
    'Every film in the library has its record: ratings, sagas, festivals and gaps see them all.',
  'Sin id de TMDB quedan fuera de notas, sagas, festivales y huecos. El pase nocturno lo intenta solo; las que persisten suelen ser rarezas o títulos mal escritos en Plex.':
    'With no TMDB id they fall outside scores, sagas, festivals and gaps. The nightly job tries on its own; the ones that persist are usually oddities or titles misspelled in Plex.',
  'Mismo TMDB id en varias entradas de Plex': 'Same TMDB id across several Plex entries',
  'Ninguna identidad repetida.': 'No repeated identities.',
  'O son ediciones duplicadas, o el agente de Plex emparejó dos películas distintas a la misma ficha. Merece un vistazo en Plex.':
    'Either they are duplicate editions, or Plex’s agent matched two different films to the same entry. Worth a look in Plex.',
  'Entradas de Letterboxd sin emparejar': 'Unmatched Letterboxd entries',
  'Todo tu Letterboxd está casado con la biblioteca o con TMDB.': 'Your whole Letterboxd is matched to the library or to TMDB.',
  'Visionados o notas tuyas que no casan con nada: no cuentan en Visionado ni en el completismo.':
    'Watches or ratings of yours that match nothing: they count neither in Viewing nor in completism.',
  'Resolviendo…': 'Resolving…',
  '🔎 Intentar resolverlas contra TMDB': '🔎 Try to resolve them against TMDB',
  'Ir a Ajustes → Letterboxd': 'Go to Settings → Letterboxd',
  'Peticiones zombis en Radarr (6+ meses sin aparecer)': 'Zombie requests in Radarr (6+ months missing)',
  'Nada pedido lleva más de seis meses atascado.': 'Nothing requested has been stuck for more than six months.',
  'Monitorizadas más de medio año sin archivo. Las que no existan en digital quizá merezcan salir de Radarr.':
    'Monitored for over six months with no file. The ones that do not exist digitally may deserve to leave Radarr.',
  'Verlas en Calidad y disco →': 'See them under Quality & disk →',
  'desde {date}': 'since {date}',
  'Personas con emparejado sin demostrar': 'People with an unverified match',
  'Todas las personas con ficha TMDB demostraron su identidad con tus propias películas.':
    'Everyone with a TMDB entry proved their identity with your own films.',
  'Casi todas están simplemente sin mirar: la identidad solo se comprueba cuando algo necesita su filmografía. El botón las comprueba todas de una vez.':
    'Almost all of them are simply unchecked: identity is only verified when something needs their filmography. The button checks them all at once.',
  'TMDB no encontró a nadie con al menos una de tus películas en su filmografía: puede ser un homónimo. Se reintenta solo cada semana.':
    'TMDB found nobody with at least one of your films in their filmography: it may be a namesake. It retries on its own every week.',
  ' se comprobaron y ninguna ficha compartía película con las tuyas: ahí sí puede haber un homónimo · ':
    ' were checked and no entry shared a film with yours: those may well be namesakes · ',
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
