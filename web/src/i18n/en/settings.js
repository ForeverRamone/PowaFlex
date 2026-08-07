// Traducciones EN de la página Ajustes (Settings.jsx). Clave = texto castellano
// byte-idéntico al string pasado a t(). El selector de idioma vive aparte, en
// settings-selector.js.
export default {
  // ── LetterboxdSection ──────────────────────────────────────────────────────
  'No se pudo subir: {msg}': 'Upload failed: {msg}',
  '(opcional: tus vistas, notas y watchlist)': '(optional: your watched movies, ratings and watchlist)',
  'Exporta tus datos en letterboxd.com → Settings → Data → Export y sube aquí ':
    'Export your data at letterboxd.com → Settings → Data → Export and upload here ',
  'el .zip completo': 'the full .zip',
  ' tal cual (sin descomprimir): PowaFlex extrae diario, notas, vistas, watchlist y tus listas. También acepta CSV sueltos y el formato Letterboxd de WebTools-NG. Tus notas vs. la comunidad se ven en ':
    ' as is (no need to unzip): PowaFlex extracts your diary, ratings, watched movies, watchlist and lists. Loose CSV files and the WebTools-NG Letterboxd format also work. Your ratings vs. the community live in ',
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
  'Guarda tu usuario de Letterboxd y PowaFlex irá recogiendo tus últimas películas vistas automáticamente (cada noche, y cuando pulses aquí). Aparecerán en el Dashboard y se emparejan con tu biblioteca.':
    'Save your Letterboxd username and PowaFlex will pick up your latest watched movies automatically (every night, and whenever you press here). They show up on the Dashboard and get matched with your library.',
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
  'Una sola rutina con todo lo que PowaFlex necesita, en orden: biblioteca de Plex, emparejado de Letterboxd, títulos en otros idiomas, notas de MDBList, lo que ya tienes en Radarr, calendario, huecos de tus favoritos y sagas. Es exactamente lo mismo que se ejecuta solo cada noche. Lo que no tengas configurado se salta.':
    'One routine with everything PowaFlex needs, in order: Plex library, Letterboxd matching, titles in other languages, MDBList ratings, what you already have in Radarr, calendar, gaps for your favorites, and sagas. It is exactly what runs on its own every night. Anything you have not configured is skipped.',
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
  'Guarda los ajustes y sincroniza: las películas de bibliotecas desmarcadas se retiran de PowaFlex en la siguiente sincronización (en Plex no se toca nada).':
    'Save settings and sync: movies from unchecked libraries are removed from PowaFlex on the next sync (nothing is touched in Plex).',
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
  'Guarda un listado local de lo que ya tienes en Radarr para que las fichas muestren el recuadro verde «✓ en Radarr» en vez de intentar añadirlo y fallar con «ya existe».':
    'Keeps a local list of what you already have in Radarr so movie cards show the green “✓ in Radarr” box instead of trying to add it and failing with “already exists”.',
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
  'Define cuántas notas se refrescan al día: con cuenta gratuita el llenado inicial se reparte en varios días; con Supporter cabe la biblioteca entera de una tanda.':
    'Sets how many ratings refresh per day: with a free account the initial fill spreads over several days; with Supporter the whole library fits in one batch.',
  'Límite {n}/día': 'Limit {n}/day',
  ' · usadas hoy {n}': ' · used today {n}',
  'Sincronizar notas ahora': 'Sync ratings now',
  'Notas {a} / {b}…': 'Ratings {a} / {b}…',
  '{a} de {b} películas con notas': '{a} of {b} movies with ratings',
  '¿Cómo consigo la API key de MDBList?': 'How do I get the MDBList API key?',
  '1. Cuenta en ': '1. Sign up at ',
  ' (puedes entrar con Trakt).': ' (you can log in with Trakt).',
  ' y copia la key.': ' and copy the key.',
  '3. La cuenta gratuita da 1.000 peticiones/día; las Supporter, bastantes más. PowaFlex respeta el límite y reparte el trabajo.':
    '3. The free account gives 1,000 requests/day; Supporter accounts, quite a few more. PowaFlex respects the limit and spreads the work out.',

  // ── Notas de IMDb ──────────────────────────────────────────────────────────
  'Notas de IMDb': 'IMDb ratings',
  '(opcional: el volcado público, sin API)': '(optional: the public dump, no API)',
  'IMDb publica a diario un fichero con las notas y los votos de todo su catálogo. PowaFlex lo usa para el umbral de ruido de Descubrir sin gastar ni una petición de API.':
    'IMDb publishes a daily file with the ratings and vote counts for its whole catalogue. PowaFlex uses it for the Discover noise threshold without spending a single API request.',
  'Descargando…': 'Downloading…',
  'Descargar ahora': 'Download now',
  '{n} títulos guardados · {date}': '{n} titles stored · {date}',
  'nunca descargadas': 'never downloaded',
  '✓ {n} notas de IMDb descargadas': '✓ {n} IMDb ratings downloaded',
  'La descarga son unos 8 MB comprimidos y tarda un par de minutos. El pase nocturno la repite sola una vez por semana, así que no hace falta que la lances a mano.':
    'The download is about 8 MB compressed and takes a couple of minutes. The nightly run repeats it on its own once a week, so you do not need to trigger it by hand.',


  // ── Aspecto ────────────────────────────────────────────────────────────────
  'Aspecto': 'Appearance',
  'Cambia el lenguaje visual de toda la app. Se aplica al instante y se guarda en el servidor, así que te sigue en cualquier navegador.':
    'Changes the visual language of the whole app. Applies instantly and is saved on the server, so it follows you to any browser.',
  'Cartelera': 'Marquee',
  'Cinemateca': 'Cinematheque',
  'Clásico': 'Classic',
  'Cartel de cine de los setenta: crema, rojo y ocre, palo seco pesado':
    'Seventies movie poster: cream, red and ochre, heavy sans-serif',
  'Carbón neutro, titulares en Bodoni, oro reservado': 'Neutral charcoal, Bodoni headlines, restrained gold',
  'El aspecto anterior al rediseño: carbón azulado y fuente del sistema':
    'The look before the redesign: blue-tinted charcoal and the system font',
  '«Clásico» recupera la paleta y la tipografía anteriores al rediseño. Los iconos y la agrupación del menú son comunes a los dos.':
    '“Classic” brings back the palette and typography from before the redesign. Icons and menu grouping are shared by both.',

  '«Versión original» es el idioma en que se rodó cada película, según TMDB: para el cine japonés vale una pista japonesa, para el francés una francesa.':
    '“Original language” is the language each movie was shot in, according to TMDB: for Japanese cinema a Japanese track works, for French cinema a French one.',

  // ── Notas y puntuaciones ───────────────────────────────────────────────────
  'Notas y puntuaciones que mostrar': 'Ratings and scores to show',
  'Elige de qué webs aparecen las notas en las fichas de película (necesita MDBList para tenerlas). Desmarca las que no te interesen.':
    'Choose which sites show ratings on movie cards (needs MDBList to have them). Untick the ones you do not care about.',
  'Rotten Tomatoes (crítica)': 'Rotten Tomatoes (critics)',
  'Rotten Tomatoes (público)': 'Rotten Tomatoes (audience)',
  'Nota combinada (Σ)': 'Combined rating (Σ)',
  'Nota principal en las portadas (junto al título)': 'Main rating on posters (next to the title)',
  'Nota combinada MDBList (Σ)': 'MDBList combined rating (Σ)',
  'Es la nota que aparece en la vista de portada pequeña. Si una película no tiene esa nota, se usa la primera disponible. Necesita MDBList sincronizado.':
    'This is the rating shown in the small poster view. If a movie lacks that rating, the first available one is used. Needs MDBList synced.',

  // ── Calendario ─────────────────────────────────────────────────────────────
  '5 · Calendario de cine venidero': '5 · Upcoming cinema calendar',
  'El calendario lo mandan ': 'The calendar is driven by ',
  'tus favoritos': 'your favorites',
  ', cada uno en la faceta por la que le sigues: de un director/a se vigila lo que dirige, de un actor/actriz lo que interpreta. Si además quieres vigilar a los más presentes en tu biblioteca aunque no les sigas, sube estos números (0 = solo tus favoritos).':
    ', each in the role you follow them for: a director is watched for what they direct, an actor for what they act in. If you also want to watch the people most present in your library even if you do not follow them, raise these numbers (0 = only your favorites).',
  'Extra: directores/as top de tu biblioteca': 'Extra: top directors from your library',
  'Extra: actores/actrices top de tu biblioteca': 'Extra: top actors from your library',
  'Consultando fechas de nacimiento/fallecimiento en TMDB…': 'Checking birth/death dates on TMDB…',
  '✓ {a} personas actualizadas · {b} fallecidas detectadas': '✓ {a} people updated · {b} deceased detected',
  'Actualizar estado vital (vivos/muertos)': 'Update life status (living/deceased)',
  'Marca quién ha fallecido para no vigilar sus estrenos ni incluirlos en el auto-Radarr. En Favoritos puedes quitar de golpe a los fallecidos.':
    'Marks who has died so their releases are no longer watched or included in auto-Radarr. In Favorites you can remove all deceased people at once.',

  // ── Umbral de ruido ────────────────────────────────────────────────────────
  '6 · Descubrir huecos: umbral de ruido': '6 · Discover gaps: noise threshold',
  'Una película cuenta como hueco si llega al umbral de votos en TMDB ':
    'A movie counts as a gap if it reaches the vote threshold on TMDB ',
  'o': 'or',
  ' en Letterboxd (vía MDBList, donde la haya): en TMDB apenas vota nadie y el listón solo descartaba cine de verdad. Sube el umbral si los huecos te traen demasiada morralla; baja a 0 para el completismo absoluto.':
    ' on Letterboxd (via MDBList, where available): hardly anyone votes on TMDB and the bar was only discarding real cinema. Raise the threshold if gaps bring you too much junk; drop it to 0 for absolute completism.',
  'Votos mínimos · huecos de directores/as': 'Minimum votes · director gaps',
  'Votos mínimos · huecos de actores/actrices': 'Minimum votes · actor gaps',
  'La nota mínima Σ y los filtros de cortos/documentales/TV/cameos se ajustan directamente en la página de Descubrir.':
    'The minimum Σ rating and the shorts/documentaries/TV/cameo filters are set directly on the Discover page.',

  // ── Guardar ────────────────────────────────────────────────────────────────
  'Guardar ajustes': 'Save settings',
  '✓ Guardado': '✓ Saved',

  // ── Sincronización con Plex ────────────────────────────────────────────────
  'Sincronización con Plex': 'Plex sync',
  'La primera sincronización descarga los detalles de cada película (reparto completo, pistas de vídeo, HDR…): con ~12.000 películas puede tardar varios minutos. Después es incremental y además se ejecuta sola cada noche a las 03:30.':
    'The first sync downloads details for every movie (full cast, video tracks, HDR…): with ~12,000 movies it can take several minutes. After that it is incremental, and it also runs on its own every night at 03:30.',
  'Listando biblioteca «{section}»… {n}': 'Listing library “{section}”… {n}',
  'Sincronizar ahora': 'Sync now',
  'Vuelve a descargar los detalles de todas las películas': 'Downloads details for every movie again',
  'Re-sincronización completa': 'Full re-sync',
  'Última: {date}': 'Last: {date}',

  // ── Histórico del pase nocturno ────────────────────────────────────────────
  'Histórico de actualizaciones (30 días)': 'Refresh history (30 days)',
  'Cada pasada del cron nocturno o de «Actualizar todo», con lo que hizo cada paso. Se guarda paso a paso: si el contenedor se reinicia a mitad, aquí queda hasta dónde llegó.':
    'Every run of the nightly cron or “Refresh everything”, with what each step did. Saved step by step: if the container restarts midway, how far it got stays here.',
  'Cargando…': 'Loading…',
  'Aún no hay pasadas registradas.': 'No runs recorded yet.',
  'nocturna': 'nightly',
  'manual': 'manual',
  ' · interrumpida': ' · interrupted',

  // ── Copia de seguridad ─────────────────────────────────────────────────────
  'Copia de seguridad': 'Backup',
  'Para reinstalar el contenedor sin empezar de cero. La base de datos lo incluye todo (biblioteca, notas, favoritos, ajustes…); el fichero de ajustes solo guarda la configuración (claves API, conexiones, umbrales) y se puede importar aquí mismo.':
    'For reinstalling the container without starting from scratch. The database includes everything (library, ratings, favorites, settings…); the settings file only stores configuration (API keys, connections, thresholds) and can be imported right here.',
  '⬇ Descargar base de datos': '⬇ Download database',
  '⬇ Exportar ajustes (.json)': '⬇ Export settings (.json)',
  '⬆ Importar ajustes': '⬆ Import settings',
  'Ambos ficheros contienen tus claves API y token de Plex: guárdalos en un sitio seguro. Para restaurar la base de datos entera, copia el ':
    'Both files contain your API keys and Plex token: keep them somewhere safe. To restore the whole database, copy the ',
  ' como': ' as',
  ' en la carpeta de datos del contenedor (parado) y arráncalo.':
    ' into the container data folder (while stopped) and start it up.',
  'Hacer una copia automática de la base de datos cada noche': 'Back up the database automatically every night',
  'guardando las últimas': 'keeping the last',
  'copias': 'backups',
  'Hacer una copia ahora': 'Back up now',
  'Copiando…': 'Backing up…',
  '✓ Copia hecha: {file} ({mb} MB)': '✓ Backup done: {file} ({mb} MB)',
  'Se hace sola al final del pase nocturno, con la base ya al día, y va rotando: al pasar del número que pongas se borra la más vieja. Guarda ahí solo la base de datos; los ajustes se exportan aparte con el botón de arriba.':
    'It runs on its own at the end of the nightly run, with the database already up to date, and rotates: once past the number you set, the oldest one is deleted. It only stores the database; settings are exported separately with the button above.',

  // lista de vetadas al pase automático
  '🚫 {n} fuera del pase automático': '🚫 {n} skipped by the nightly job',
  'El automático las ignora. Se siguen viendo en Cine venidero y puedes mandarlas a Radarr a mano cuando quieras.':
    'The nightly job ignores them. They stay visible in Upcoming cinema and you can send them to Radarr by hand whenever you want.',
  'quitar el veto': 'undo',
};
