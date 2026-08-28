// Traducciones EN de la página Ajustes (Settings.jsx). Clave = texto castellano
// byte-idéntico al string pasado a t(). El selector de idioma vive aparte, en
// settings-selector.js.
export default {
  // ── esperas (ninguna llega a un cuarto de segundo, pero dicen qué hacen) ───
  'Leyendo tu configuración…': 'Reading your settings…',
  'Leyendo tus datos de Letterboxd…': 'Reading your Letterboxd data…',

  // ── LetterboxdSection ──────────────────────────────────────────────────────
  'No se pudo subir: {msg}': 'Upload failed: {msg}',
  '(opcional: tus vistas, notas y watchlist)': '(optional: your watched movies, ratings and watchlist)',
  'Exporta tus datos en letterboxd.com → Settings → Data → Export y sube aquí ':
    'Export your data at letterboxd.com → Settings → Data → Export and upload here ',
  'el .zip completo': 'the full .zip',
  ' tal cual, sin descomprimir. También acepta CSV sueltos y el formato de WebTools-NG. Tus notas frente a la comunidad se ven en ':
    ' as it is, no unzipping. It also takes loose CSVs and the WebTools-NG format. Your ratings against the community are in ',
  'Visionado': 'Viewing',
  '; la watchlist, en ': '; the watchlist, in ',
  'Listas y retos': 'Lists & challenges',
  'Arrastra aquí el .zip de Letterboxd (o CSV sueltos), o haz clic para elegir':
    'Drag the Letterboxd .zip here (or loose CSV files), or click to choose',
  'Acepta el export completo sin descomprimir · también CSV en formato WebTools-NG':
    'Takes the full export without unzipping · also CSV in WebTools-NG format',
  'Vaciar datos importados': 'Clear imported data',
  '{n} importadas ({m} emparejadas con tu biblioteca) como «{list}»':
    '{n} imported ({m} matched with your library) as “{list}”',
  '+ {n} listas importadas como retos (míralas en «Listas y retos»).':
    '+ {n} lists imported as challenges (see them in “Lists & challenges”).',
  'Feed RSS de tu perfil': 'Your profile RSS feed',
  'Con tu usuario de Letterboxd, tus últimas vistas se recogen solas cada noche y aparecen en el Dashboard.':
    'With your Letterboxd username, your latest watches are collected every night and show up on the Dashboard.',
  'tu-usuario': 'your-username',
  'Sincronizando…': 'Syncing…',
  'Guardar y sincronizar': 'Save & sync',
  'Deja de recoger tus vistas cada noche': 'Stops collecting your watched movies every night',
  'Dejar de sincronizar': 'Stop syncing',
  '✓ Sincronización detenida': '✓ Sync stopped',
  '✓ {n} nuevas ({m} en tu biblioteca) de {s} del feed': '✓ {n} new ({m} in your library) out of {s} in the feed',
  '{n} emparejadas con Plex': '{n} matched with Plex',

  // ── TestBadge y toasts generales ───────────────────────────────────────────
  '✓ Conectado': '✓ Connected',
  '⚠️ No se ha podido guardar: {error}': '⚠️ Could not save: {error}',
  '⚠️ El fichero no es un JSON válido': '⚠️ The file is not valid JSON',
  '✓ {n} ajustes importados': '✓ {n} settings imported',
  ' · {n} ignorados': ' · {n} ignored',

  // ── Cabecera y «Actualizar todo» ───────────────────────────────────────────
  'Cuenta': 'Account',
  'Ajustes': 'Settings',
  'Actualizar todo': 'Refresh everything',
  'Una sola rutina, en orden: Plex, Letterboxd, títulos, notas, Radarr, calendario, huecos y sagas. Es lo mismo que corre cada noche, y se salta lo que no tengas configurado.':
    'One single routine, in order: Plex, Letterboxd, titles, scores, Radarr, calendar, gaps and sagas. It is the same thing that runs every night, and it skips whatever you have not configured.',
  'Actualizando…': 'Updating…',
  '↻ Actualizar todo': '↻ Refresh everything',
  'Listando «{section}»… {n}': 'Listing “{section}”… {n}',
  'Detalles {a} / {b}': 'Details {a} / {b}',
  'Limpiando eliminadas…': 'Cleaning up removed movies…',
  'Terminada con avisos: {error}': 'Finished with warnings: {error}',
  '✓ Todo actualizado · {date}': '✓ Everything up to date · {date}',
  'Última actualización completa: {date}': 'Last full refresh: {date}',

  // ── Plex ───────────────────────────────────────────────────────────────────
  'URL del servidor (con puerto)': 'Server URL (with port)',
  'Pega aquí tu token': 'Paste your token here',
  'Probar conexión': 'Test connection',
  'Bibliotecas de películas a sincronizar': 'Movie libraries to sync',
  '(las de series no aparecen: PowaFlex solo gestiona cine)':
    '(TV libraries are not listed: PowaFlex only handles movies)',
  'Al sincronizar, lo de las bibliotecas desmarcadas se retira de PowaFlex. En Plex no se toca nada.':
    'On the next sync, anything from unticked libraries is dropped from PowaFlex. Nothing is touched in Plex.',
  '¿Cómo consigo mi X-Plex-Token?': 'How do I get my X-Plex-Token?',
  '1. Abre ': '1. Open ',
  ' en el navegador y entra en tu servidor.': ' in your browser and go into your server.',
  '2. Abre cualquier película y pulsa en ': '2. Open any movie and press ',
  '⋯ → Obtener información → Ver XML': '⋯ → Get info → View XML',
  '3. Se abre una pestaña con XML: mira la URL, al final verás ':
    '3. A tab opens with XML: look at the URL, at the end you will see ',
  '. Copia ese valor.': '. Copy that value.',
  '4. La URL del servidor es la IP local de tu N100 con el puerto 32400, p. ej. ':
    '4. The server URL is the local IP of your N100 with port 32400, e.g. ',

  // ── TMDB ───────────────────────────────────────────────────────────────────
  'API key (v3) o token de lectura (v4)': 'API key (v3) or read access token (v4)',
  'Pega aquí tu API key de TMDB': 'Paste your TMDB API key here',
  '¿Cómo consigo una API key de TMDB (gratis)?': 'How do I get a TMDB API key (free)?',
  '1. Crea cuenta en ': '1. Create an account at ',
  ' (gratuita).': ' (free).',
  '2. Ve a ': '2. Go to ',
  'Ajustes → API → Crear → Developer': 'Settings → API → Create → Developer',
  '3. Rellena el formulario (uso personal) y copia la ': '3. Fill in the form (personal use) and copy the ',
  ' o el ': ' or the ',
  'Token de acceso de lectura (v4)': 'Read access token (v4)',
  '. Ambos valen.': '. Either works.',

  // ── Radarr ─────────────────────────────────────────────────────────────────
  'URL de Radarr': 'Radarr URL',
  'Etiqueta para lo añadido desde PowaFlex': 'Tag for what PowaFlex adds',
  'Se crea en Radarr si no existe y se aplica a cada película añadida. Déjalo vacío para no etiquetar.':
    'Created in Radarr if it does not exist and applied to every movie added. Leave it empty to skip tagging.',
  'Probar y cargar perfiles': 'Test & load profiles',
  'Perfil de calidad al añadir': 'Quality profile when adding',
  '— elige —': '— choose —',
  'Carpeta raíz': 'Root folder',
  'Sincronizar lo ya añadido a Radarr': 'Sync what is already in Radarr',
  '{n} películas en Radarr': '{n} movies in Radarr',
  'Guarda lo que ya tienes en Radarr para que las fichas digan «✓ en Radarr» en vez de fallar con «ya existe».':
    'Stores what you already have in Radarr so entries say “✓ in Radarr” instead of failing with “already exists”.',
  'Lanzar a Radarr automáticamente cada noche los estrenos de mis directores/as favoritos/as vivos':
    'Automatically send to Radarr every night the upcoming releases of my living favorite directors',
  'de los próximos': 'within the next',
  'meses, mirando también': 'months, also looking',
  'días hacia atrás': 'days back',
  'TMDB a veces pone fecha a las películas pequeñas después del estreno; con 0 esas se pierden':
    'TMDB sometimes dates small movies after their release; with 0 those get missed',
  'Previsualizar': 'Preview',
  'Ejecutar ahora': 'Run now',
  'Incluir documentales (por defecto, cortos, documentales y películas de TV se descartan)':
    'Include documentaries (by default, shorts, documentaries and TV movies are discarded)',
  '{n} estrenos entrarían en Radarr': '{n} releases would go into Radarr',
  '✓ {a} añadidas de {c} candidatas': '✓ {a} added out of {c} candidates',
  'ver detalle': 'see details',
  'Solo directores/as ': 'Only ',
  'vivos': 'living',
  ' marcados como favoritos. Los fallecidos se ignoran (no tendrán estrenos).':
    ' directors marked as favorites. Deceased ones are ignored (they will not have new releases).',
  '¿Dónde está la API key de Radarr?': 'Where is the Radarr API key?',
  'En Radarr: ': 'In Radarr: ',
  '. La URL es la misma con la que abres Radarr en el navegador, típicamente el puerto ':
    '. The URL is the same one you open Radarr with in your browser, typically port ',
  'Tras probar la conexión, elige el ': 'After testing the connection, choose the ',
  'perfil de calidad': 'quality profile',
  ' y la ': ' and the ',
  'carpeta raíz': 'root folder',
  ' que usará PowaFlex al añadir películas.': ' PowaFlex will use when adding movies.',

  // ── MDBList ────────────────────────────────────────────────────────────────
  '(opcional: notas multi-plataforma y listas)': '(optional: multi-site ratings and lists)',
  'Tipo de cuenta': 'Account type',
  'Detectar automáticamente': 'Detect automatically',
  'Gratuita (1.000 peticiones/día)': 'Free (1,000 requests/day)',
  'Supporter (25.000/día)': 'Supporter (25,000/day)',
  'Cuántas notas se refrescan al día. Con cuenta gratuita el llenado inicial se reparte en varios días; con Supporter cabe entera.':
    'How many scores are refreshed per day. On a free account the initial fill spreads over several days; on Supporter it fits in one go.',
  'Límite {n}/día': 'Limit {n}/day',
  ' · usadas hoy {n}': ' · used today {n}',
  'Sincronizar notas ahora': 'Sync ratings now',
  'Notas {a} / {b}…': 'Ratings {a} / {b}…',
  '{a} de {b} películas con notas': '{a} of {b} movies with ratings',
  '¿Cómo consigo la API key de MDBList?': 'How do I get the MDBList API key?',
  '1. Cuenta en ': '1. Sign up at ',
  ' (puedes entrar con Trakt).': ' (you can log in with Trakt).',
  ' y copia la key.': ' and copy the key.',
  '3. La gratuita da 1.000 peticiones al día y las Supporter bastantes más. PowaFlex reparte el trabajo dentro del límite.':
    '3. The free account gives 1,000 requests a day and Supporter accounts far more. PowaFlex spreads the work within the limit.',

  // ── Notas de IMDb ──────────────────────────────────────────────────────────
  'Notas de IMDb': 'IMDb ratings',
  '(opcional: el volcado público, sin API)': '(optional: the public dump, no API)',
  'IMDb publica a diario las notas y los votos de todo su catálogo. Sirve para el umbral de ruido de Descubrir sin gastar API.':
    'IMDb publishes the scores and vote counts for its whole catalogue daily. It feeds the noise threshold in Find gaps without spending any API calls.',
  'Descargando…': 'Downloading…',
  'Descargar ahora': 'Download now',
  '{n} títulos guardados · {date}': '{n} titles stored · {date}',
  'nunca descargadas': 'never downloaded',
  '✓ {n} notas de IMDb descargadas': '✓ {n} IMDb ratings downloaded',
  'Son unos 8 MB y un par de minutos. El pase nocturno la repite solo una vez por semana.':
    'It is about 8 MB and a couple of minutes. The nightly job repeats it once a week on its own.',


  // ── Aspecto ────────────────────────────────────────────────────────────────
  'Aspecto': 'Appearance',
  'Cambia el aspecto de toda la app. Se guarda en el servidor, así que te sigue en cualquier navegador.':
    'Changes the look of the whole app. It is stored on the server, so it follows you to any browser.',
  'Cartelera': 'Marquee',
  'Cinemateca': 'Cinematheque',
  'Clásico': 'Classic',
  'Cartel de cine de los setenta: crema, rojo y ocre, palo seco pesado':
    'Seventies movie poster: cream, red and ochre, heavy sans-serif',
  'Carbón neutro, titulares en Bodoni, oro reservado': 'Neutral charcoal, Bodoni headlines, restrained gold',
  'El aspecto anterior al rediseño: carbón azulado y fuente del sistema':
    'The look before the redesign: blue-tinted charcoal and the system font',
  '«Clásico» recupera la paleta y la tipografía anteriores al rediseño.':
    '“Classic” brings back the palette and typography from before the redesign.',


  // ── Notas y puntuaciones ───────────────────────────────────────────────────
  'Notas y puntuaciones que mostrar': 'Ratings and scores to show',
  'De qué webs aparecen las notas en cada ficha. Necesita MDBList.':
    'Which sites’ scores appear on each film. Requires MDBList.',
  'Rotten Tomatoes (crítica)': 'Rotten Tomatoes (critics)',
  'Rotten Tomatoes (público)': 'Rotten Tomatoes (audience)',
  'Nota combinada (Σ)': 'Combined rating (Σ)',
  'Nota principal en las portadas (junto al título)': 'Main rating on posters (next to the title)',
  'Nota combinada MDBList (Σ)': 'MDBList combined rating (Σ)',
  'La nota que sale en el póster. Si falta, se usa la primera disponible.':
    'The score shown on the poster. If it is missing, the first available one is used.',

  // ── Calendario ─────────────────────────────────────────────────────────────
  'Calendario de cine venidero': 'Upcoming cinema calendar',
  'El calendario lo mandan ': 'The calendar is driven by ',
  'tus favoritos': 'your favorites',
  ', cada uno en la faceta por la que le sigues. Para vigilar además a los más presentes en tu biblioteca, sube estos números (0 = solo tus favoritos).':
    ', each in the role you follow them for. To also watch the most present names in your library, raise these numbers (0 = your favorites only).',
  'Extra: directores/as top de tu biblioteca': 'Extra: top directors from your library',
  'Extra: actores/actrices top de tu biblioteca': 'Extra: top actors from your library',
  'Consultando fechas de nacimiento/fallecimiento en TMDB…': 'Checking birth/death dates on TMDB…',
  '✓ {a} personas actualizadas · {b} fallecidas detectadas': '✓ {a} people updated · {b} deceased detected',
  'Actualizar estado vital (vivos/muertos)': 'Update life status (living/deceased)',
  'Marca quién ha fallecido para no vigilar sus estrenos. En Favoritos se les puede quitar de golpe.':
    'Flags who has died so their releases are not watched. In Favorites you can remove them in bulk.',

  // ── Umbral de ruido ────────────────────────────────────────────────────────
  'Descubrir huecos: umbral de ruido': 'Discover gaps: noise threshold',
  'Una película cuenta como hueco si llega al umbral de votos en TMDB ':
    'A movie counts as a gap if it reaches the vote threshold on TMDB ',
  'o': 'or',
  ' en Letterboxd, donde la haya. Sube el umbral si los huecos traen demasiada morralla; 0 para el completismo absoluto.':
    ' on Letterboxd, where there is one. Raise it if the gaps bring too much filler; 0 for absolute completeness.',
  'Votos mínimos · huecos de directores/as': 'Minimum votes · director gaps',
  'Votos mínimos · huecos de actores/actrices': 'Minimum votes · actor gaps',
  'La nota mínima Σ y los filtros de ruido se ajustan en la propia página de Descubrir.':
    'The minimum Σ and the noise filters are set on the Find gaps page itself.',

  // ── Pestañas y barra de guardar ────────────────────────────────────────────
  'Conexiones': 'Connections',
  'Fuentes y notas': 'Sources & ratings',
  'Automatismos': 'Automation',
  'Interfaz': 'Interface',
  'Mantenimiento': 'Maintenance',
  'Plex y TMDB son imprescindibles. Radarr es lo que convierte «me falta» en «pedida».':
    'Plex and TMDB are essential. Radarr is what turns “missing” into “requested”.',
  'De dónde salen las notas y qué has visto. Opcional, pero sin ello no hay con qué ordenar ni cómo saber lo que ves fuera de Plex.':
    'Where the scores come from and what you have watched. Optional, but without it there is nothing to sort by and no way to know what you watch outside Plex.',
  'Lo que PowaFlex hace solo cada noche: qué manda a Radarr, a quién vigila el calendario y qué cuenta como hueco.':
    'What PowaFlex does on its own every night: what it sends to Radarr, who the calendar watches and what counts as a gap.',
  'Las reglas de qué se manda solo a Radarr están en Automatismos →':
    'The rules for what gets sent to Radarr on its own live in Automation →',
  '¿Radarr sin configurar? Ve a Conexiones →': 'Radarr not set up? Go to Connections →',
  'Guardar ajustes': 'Save settings',
  '✓ Guardado': '✓ Saved',
  'Hay cambios sin guardar': 'Unsaved changes',
  'Todo guardado': 'All saved',

  // ── Sincronización con Plex ────────────────────────────────────────────────
  'Sincronización con Plex': 'Plex sync',
  'La primera descarga los detalles de cada película: con ~12.000 puede tardar varios minutos. Después es incremental y se repite sola a las 03:30.':
    'The first one downloads every film’s details: with ~12,000 it can take several minutes. After that it is incremental and repeats itself at 03:30.',
  'Listando biblioteca «{section}»… {n}': 'Listing library “{section}”… {n}',
  'Sincronizar ahora': 'Sync now',
  'Vuelve a descargar los detalles de todas las películas': 'Downloads details for every movie again',
  'Re-sincronización completa': 'Full re-sync',
  'Última: {date}': 'Last: {date}',

  // ── Histórico del pase nocturno ────────────────────────────────────────────
  'Histórico de actualizaciones (30 días)': 'Refresh history (30 days)',
  'Cada pasada del pase nocturno o de «Actualizar todo», paso a paso. Si el contenedor se reinicia a mitad, aquí queda hasta dónde llegó.':
    'Every run of the nightly job or “Update everything”, step by step. If the container restarts mid-run, how far it got stays here.',
  'Cargando…': 'Loading…',
  'Aún no hay pasadas registradas.': 'No runs recorded yet.',
  'nocturna': 'nightly',
  'manual': 'manual',
  ' · interrumpida': ' · interrupted',

  // ── Copia de seguridad ─────────────────────────────────────────────────────
  'Copia de seguridad': 'Backup',
  'Para reinstalar sin empezar de cero. La base lo incluye todo; el .json solo lleva conexiones y preferencias, no las reglas de Radarr ni lo que espera en cuarentena.':
    'For reinstalling without starting from scratch. The database holds everything; the .json only carries connections and preferences, not your Radarr rules or what is waiting in quarantine.',
  '⬇ Descargar base de datos': '⬇ Download database',
  '⬇ Exportar ajustes (.json)': '⬇ Export settings (.json)',
  '⬆ Importar ajustes': '⬆ Import settings',
  'Los dos llevan tus claves API y tu token de Plex: guárdalos a buen recaudo. Para restaurar la base entera, copia el ':
    'Both files carry your API keys and Plex token: keep them somewhere safe. To restore the whole database, copy the ',
  ' como': ' as',
  ' en la carpeta de datos del contenedor (parado) y arráncalo.':
    ' into the container data folder (while stopped) and start it up.',
  'Hacer una copia automática de la base de datos cada noche': 'Back up the database automatically every night',
  'guardando las últimas': 'keeping the last',
  'copias': 'backups',
  'Hacer una copia ahora': 'Back up now',
  'Copiando…': 'Backing up…',
  '✓ Copia hecha: {file} ({mb} MB)': '✓ Backup done: {file} ({mb} MB)',
  'Se hace sola al final del pase nocturno y va rotando: al pasar del número que pongas se borra la más vieja. Solo la base; los ajustes se exportan con el botón de arriba.':
    'It runs itself at the end of the nightly job and rotates: past the number you set, the oldest is deleted. Database only; settings are exported with the button above.',

  // lista de vetadas al pase automático
  '🚫 {n} fuera del pase automático': '🚫 {n} skipped by the nightly job',
  'El automático las ignora. Se siguen viendo en Cine venidero y se mandan a mano cuando quieras.':
    'The automation ignores them. They still show in Upcoming cinema and can be sent by hand whenever you like.',
  'quitar el veto': 'undo',

  // pesos del detector de emergentes (Ajustes → Automatismos)
  'Detector de directores emergentes': 'Emerging-directors detector',
  'Cuánto pesa cada señal en la puntuación de emergente. La que no tiene datos sale del reparto en vez de puntuar cero. Vacío = peso de fábrica.':
    'How much each signal weighs in the emerging score. A signal with no data drops out of the average instead of scoring zero. Empty = factory weight.',
  'Consagración institucional': 'Institutional standing',
  'Consenso crítico': 'Critical consensus',
  'Tracción real': 'Real traction',
  'Aceleración': 'Acceleration',
  'Afinidad contigo': 'Affinity with you',
  'Los pesos suman 100.': 'The weights add up to 100.',
  'Los pesos suman {n} (no pasa nada: son relativos, pero 100 es la escala pensada).':
    'The weights add up to {n} (that’s fine: they are relative, but 100 is the intended scale).',
  'El detector se rehace una vez por semana; los pesos nuevos se notan en la siguiente detección, o al forzarla desde Emergentes.':
    'The detector is rebuilt once a week; new weights take effect on the next run, or when you force one from Emerging.',
};
