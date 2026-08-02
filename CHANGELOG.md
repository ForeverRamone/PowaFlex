# Changelog

## Alpha 0.9.1 (0.9.1-alpha) — 2026-08-02

- **Al volver atrás, la página se queda donde la dejaste.** Bajabas por una lista, entrabas en la
  ficha de un director y al volver aparecías arriba del todo. Ahora se recupera el sitio exacto,
  también cuando la página tarda en cargar. Y al entrar en una ficha se empieza por arriba, en vez
  de heredar el desplazamiento de la lista anterior.
- **Títulos legibles en toda la app.** Las películas sin traducción salían en su alfabeto original
  («志愿军：雄兵出击»). Ahora, cuando un título no está en alfabeto latino, se muestra el
  internacional, el mismo que ves en Letterboxd y en Radarr. Las españolas —y cualquiera con
  traducción— se quedan como están, el título original sigue visible en la ficha y nada de esto
  toca el emparejado con Plex, Radarr o Letterboxd, que va por identificador.
- **En «Descubrir huecos», cada director/a lleva al lado sus dos películas más conocidas**, para
  saber de quién se trata sin abrir su ficha.

## Alpha 0.9 (0.9.0-alpha) — 2026-08-02

### Notas de Letterboxd

- **Se acabaron las notas imposibles**. La nota de la comunidad de Letterboxd salía por encima de
  diez («16.8/10») porque PowaFlex la doblaba cuando ya venía sobre diez. Ahora tu nota y la de la
  comunidad se comparan en la misma escala, en Visionado y en la tabla de Letterboxd.
- El filtro **«Letterboxd mín.»** de la biblioteca tampoco filtraba nada: ofrecía umbrales en
  estrellas (3,5 · 4 · 4,3) contra una nota sobre diez. Ahora son 7+, 8+ y 8,6+.

### Lo que se lee

- **Colores de las gráficas por aspecto.** Los rótulos flotantes eran texto casi blanco sobre el
  papel de Cartelera, y las barras, los ejes y las tartas conservaban la paleta del tema oscuro.
  Todo el color de las gráficas sale ahora del aspecto elegido y cambia al vuelo con él.
- **Las tres tartas de «Calidad y disco» no se dibujaban**: se veía la leyenda y ningún sector.
- Insignias de fallecimiento, etiquetas del calendario, chips de notas de la ficha, iniciales sin
  foto y anillos de completista: todo lo que era tinta oscura sobre tinta oscura vuelve a leerse.
- **El número de versión** va en su propia tarjeta, en vez de flotar sobre el papel.

### Móvil

- Repaso de las trece páginas: **ninguna se sale ya de la pantalla**. La que rompía era «Listas y
  retos».

### Completismo y ruido

- **Favoritos y la ficha de cada persona vuelven a decir lo mismo.** Favoritos contaba todos los
  títulos de Plex (cortos, documentales, telefilmes) y la ficha solo largometrajes: Woody Allen
  aparecía con 52 en un sitio y 50/50 en el otro. El total en bruto sigue estando, en el tooltip.
- Con **cuatro documentales** dirigidos ya cuentas como documentalista (antes hacían falta seis).
- **Nueva categoría «Conciertos»** junto a cortos, documentales, TV, dirección coral y cameos.
  Distingue el concierto del musical, así que *Cabaret* sigue siendo una película como cualquier
  otra. A quien filma conciertos de vez en cuando no se le penaliza por ellos; a quien vive de
  ellos, sí se le cuentan.

### Listas, huecos y Radarr

- En **Listas y retos**, cada película que te falta abre su ficha y tiene su propio botón de
  Radarr, sin tener que mandar la lista entera.
- En la ficha de cada persona, **«Mandar a Radarr las que te faltan»** deja de disfrazarse de
  pestaña: es un botón aparte, visible desde cualquier vista, y avisa de cuántas dejan fuera los
  filtros.
- En **Visionado**, «Consenso crítico que tienes sin ver» y «Mejor valoradas que aún no has visto»
  eran la misma lista dos veces. Ahora es una.

### Primeros pasos

- **«¿Qué es PowaFlex?» abre con una ruta de ocho pasos** para recién llegados: qué conectar
  primero, qué es opcional y en qué orden empieza a rendir la aplicación.

## Alpha 0.8.2 (0.8.2-alpha) — 2026-08-01

- **Arreglado el arranque en unRAID** («attempt to write a readonly database»). La 0.8.1 miraba
  quién era el dueño de la carpeta de datos, pero en unRAID esa carpeta pertenece a `nobody:users`
  mientras que `powaflex.db` lo había creado root: PowaFlex daba la situación por buena y luego no
  podía escribir. Ahora **comprueba que puede escribir de verdad** en la carpeta y en la base de
  datos, y corrige los permisos si no es así.
- **Y si aun así no lo consigue, arranca igualmente** (con privilegios, como todas las versiones
  hasta la 0.8) en vez de quedarse sin levantar. Un problema de permisos no debería dejarte sin app.
- El registro dice ahora con qué usuario arranca, para que un fallo así se diagnostique de un
  vistazo.

## Alpha 0.8.1 (0.8.1-alpha) — 2026-08-01

- **Actualizar vuelve a ser solo «pull y arriba»**: PowaFlex ajusta por su cuenta los permisos de su
  carpeta de datos al arrancar y luego sigue corriendo sin privilegios, así que ya no hace falta
  ningún `chown` a mano —ni en unRAID ni con Docker Compose—. Si vienes de la 0.8 y ya lo hiciste,
  no tienes que deshacer nada.
- Respeta el dueño que la carpeta ya tenga (en unRAID, `nobody:users`), y puedes forzarlo con las
  variables **`PUID`/`PGID`** como en el resto de contenedores de unRAID.

## Alpha 0.8 (0.8.0-alpha) — 2026-08-01

### Aspecto

- **Nuevo diseño «Cartelera»**, inspirado en el cartel de cine español de los setenta: papel crema,
  rojo y ocre, titulares en Archivo Black, bordes gruesos con sombra dura y la barra lateral como un
  bloque rojo impreso.
- **Elige el aspecto en Ajustes**: además de Cartelera están **Cinemateca** (carbón neutro con
  titulares en Bodoni) y **Clásico** (la paleta y la tipografía anteriores al rediseño, conservadas
  tal cual). Se cambia al instante y se guarda en el servidor, así que te sigue en cualquier
  navegador.
- Menú lateral agrupado (Tu colección · La caza · Cuenta) con iconos de verdad en lugar de emojis,
  cabeceras de página con la misma estructura, carátulas sin marco de color (lo que está en tu Plex
  se marca con un punto), buscador ⌘K con miniaturas y fichas con fondo desenfocado.

### Candidatas a upgrade

- **«¿Cuáles tienen mejor versión?»**: consulta JustWatch para todas las candidatas de una vez, con
  barra de progreso, y luego permite **filtrar solo las que sí tienen una versión mejor** en el
  mercado (o las que no).
- **Botón para pedirlas todas a Radarr** de una tacada, respetando el filtro activo.

### Correcciones

- **Favoritos y la ficha ya no se contradicen**: la tarjeta de cada favorito contaba todos los
  créditos estrenados (cortos, documentales, telefilmes) mientras que su ficha contaba solo
  largometrajes, así que un director con toda su filmografía aparecía al 95 % en una pantalla y al
  100 % en la otra. Ahora ambas usan exactamente el mismo cálculo.
- **Homónimos**: dos personas distintas con el mismo nombre se fusionaban en una sola, mezclando sus
  filmografías. La identidad pasa a tomarse del identificador estable que da Plex.
- **Letterboxd**: reimportar ya no duplica entradas, y los enlaces a películas borradas de Plex se
  limpian solos.
- La página «¿Qué es PowaFlex?» dejó de cargar durante el rediseño; arreglada.
- La barra de progreso de la sincronización ya no se queda clavada a mitad.
- JustWatch ya no recuerda sus propios errores durante tres días como «sin oferta digital», y
  MDBList avisa cuando alcanza su límite de peticiones en vez de fingir que todo fue bien.
- Buscar personas ya no lanza una petición por tecla, y subir un CSV que falla ya no deja el
  indicador girando para siempre. El feed RSS de Letterboxd se puede desactivar desde la interfaz.

### Instalación

- **Imagen Docker más segura y reproducible**: se construye con el lockfile, corre como usuario sin
  privilegios y trae healthcheck.
- **Contraseña opcional** para todo el panel con la variable `POWAFLEX_AUTH="usuario:contraseña"`.
  Sin ella, todo funciona exactamente igual que antes.

## Alpha 0.7 (0.7.0-alpha) — 2026-08-01

- **Actualizar todo, con un botón**: nueva sección en Ajustes que lanza la rutina completa —biblioteca de
  Plex, emparejado de Letterboxd, títulos en otros idiomas, estado vital de tus favoritos, notas de
  MDBList, lo que ya tienes en Radarr, calendario, huecos y sagas— mostrando cada paso en vivo con su
  resultado. Lo que no tengas configurado se salta, y un paso que falle **no corta el resto**. El pase
  nocturno ejecuta ahora exactamente esta misma rutina, y sus fallos quedan registrados en vez de
  desaparecer en silencio.
- **Directores y actores, separados de verdad**: PowaFlex ya no adivina la faceta contando películas;
  ahora guarda **con qué rol sigues a cada persona**. Un director/a favorito/a solo cuenta y solo
  sugiere lo que dirige, aunque también haya actuado. Puedes cambiar la faceta de cualquiera con el
  botón ⇄. Tus favoritos actuales se migran automáticamente.
- **Cine venidero solo con quien sigues**: el calendario lo mandan tus favoritos, cada uno en su
  faceta. El «top automático» de tu biblioteca pasa a ser opcional (0 por defecto) en vez de colarse
  siempre. Al actualizar se descartan los calendarios construidos con las reglas antiguas, que era lo
  que dejaba estrenos de gente que ya no sigues.
- **Favoritos, rehecha**: un selector de faceta gobierna toda la página, sin mezclar nunca los números
  de director y actor. Cada favorito es una tarjeta con su foto, cuántas suyas tienes en tu Plex, barra
  de completismo y cuántas te faltan. Con buscador, cinco ordenaciones, poda en lote y cuatro
  indicadores de cabecera por faceta.
- **Descubrir huecos, rehecha**: además de la vista por persona (ahora ordenable por huecos, películas
  en tu Plex, completismo o alfabéticamente), llega la vista de **todas las películas juntas** en
  cuadrícula, ordenable por nota media Σ, votos, año o título, con envío del lote entero a Radarr. En
  las pestañas top puedes seguir bajando por el ranking hasta los primeros 500.
- **Arreglado «consenso crítico que tienes sin ver»**: solo miraba las reproducciones de Plex, así que
  las películas vistas (y hasta valoradas) en Letterboxd aparecían como pendientes. Ahora usa el mismo
  criterio de «vista» que el resto de la aplicación.

## Alpha 0.6 (0.6.0-alpha) — 2026-08-01

- **Títulos en cualquier idioma**: cada película de la biblioteca gana el título en inglés de TMDB y
  un TMDB id garantizado (vía IMDb id), así que las listas y vistas de Letterboxd con título inglés
  («Parasite», «Come and See») ya emparejan con tu Plex en español. El botón de Visionado desglosa
  el porqué de cada no-emparejada, y el emparejado corre solo tras cada importación.
- **Búsqueda TMDB más fiable**: prefiere el título exacto dentro de ±1 año en vez del primer
  resultado a ciegas, y los fallos ya no se cachean 30 días. Arreglado además el año corrupto al
  importar listas de Letterboxd por URL.
- **Arreglado buscar + filtrar a la vez**: combinar búsqueda con género, país, saga o persona
  devolvía siempre vacío por un cruce de parámetros SQL.
- **Auto-Radarr más listo**: incluye a favoritos aún sin películas en tu Plex (los directores
  emergentes de los packs), descarta cortos, documentales y películas de TV (con opción de incluir
  documentales), y una ventana configurable de días hacia atrás caza los estrenos que TMDB fecha
  tarde.
- **Añadido masivo por todas partes**: «➕ Añadir las N visibles a Radarr» por persona en Descubrir,
  en Grandes ausentes y en la ficha de persona («Te faltan»), respetando los filtros activos y con
  progreso visible en los lotes grandes.
- **Menos ruido en los huecos**: el filtrado de cortos/docs/TV ocurre ahora en el servidor antes del
  recorte (los largometrajes rellenan el cupo), los cameos de actores se detectan y ocultan por
  defecto, el umbral de votos es configurable en Ajustes y hay nota mínima Σ en Descubrir.
  «✕ No me interesa» descarta una película para siempre. Si tus filtros ocultan todo lo de una
  persona, lo dice en una fila compacta en vez de desaparecer.
- **Poda de favoritos**: la lista muestra por favorito sus huecos, próximos proyectos y
  «✓ completo · sin aporte»; con buscador, orden por aporte, avatares y un modo Podar con selección
  múltiple y atajos («fallecidos completos», «sin aporte»). «Vaciar todos» pide confirmación en dos
  pasos y el «añadir los N primeros» previsualiza los candidatos antes de confirmar.
- **Favoritos al día**: las cachés de huecos se invalidan al añadir o quitar favoritos (antes
  tardaban hasta 6 h en reflejarlo), la ✕ ya no se puede saltar desde los packs, y el estado
  vivo/fallecido se refresca cada noche para el auto-Radarr.
- **Otros arreglos**: las vistas del RSS sin valorar ya no cuentan como «nota 0»; la clave de
  MDBList se enmascara y se cifra como las demás; los filtros de tipo son una sola preferencia
  compartida entre Descubrir, fichas y Calendario; fuera las rutas muertas de colecciones, la
  pestaña de Guionistas (sin soporte real) y el buscador duplicado de Descubrir.

## Alpha 0.5 (0.5.0-alpha) — 2026-07-05

- **Fuera las notas de Plex**: se retiran de toda la app la nota de audiencia (★) y tu nota personal
  de Plex. Tu «nota» pasa a ser la de **Letterboxd**, que es la que usan los insights de Visionado.
- **Nota de portada configurable**: elige en Ajustes qué nota aparece en cada póster pequeño (IMDb,
  Letterboxd o la combinada de MDBList, por defecto). El «LB» pasa a ser el minilogo de Letterboxd.
- **Sistema visual de estado**: código de color consistente en las tarjetas — 🟢 en Plex, borde neutro
  te falta, ★ dorada vista (Plex o Letterboxd), con leyenda.
- **Visionado**: contador de lo que llevas visto (Plex + Letterboxd, con lo que aún no cuadra con tu
  biblioteca) y botón para **reemparejar por TMDB** las vistas/listas que fallan por idioma del título.
- **Últimas vistas**: las de solo-Letterboxd (aún no en tu servidor) muestran carátula de TMDB.
- **Completismo de dirección**: cuenta solo largometrajes (fuera cortos, TV y documentales salvo
  documentalistas), con filtro nuevo de **dirección coral** (3+ directores). Quien dirige y actúa
  muestra **dos barras** (director/a y actor/actriz) y se puede cambiar entre ellas.
- **Favoritos**: paquetes temáticos de directores/as con **«añadir todos»**, **pegar una lista** de
  nombres (por comas o líneas), ranking paginado (sin tope de 200) con filtro de fallecidos y
  actualización de estado vital. Lo que quitas con la ✕ ya no vuelve por añadidos masivos (solo a
  mano). Las pestañas Directores/as y Actores/actrices ya no mezclan roles. Guionistas lista solo a
  quienes no dirigen.
- **Descubrir huecos**: el canon de «grandes ausentes» pasa a los de **They Shoot Pictures, Don't
  They?** — Top 250 de siempre y Top 100 del siglo XXI (conmutables) — y detecta la posesión por las
  películas (TMDB id / título+año), no por el nombre.
- **Sagas**: muestran cuántas y cuáles partes te faltan sin abrir cada una.
- **Lenguaje inclusivo** en las etiquetas de la interfaz (directores/as, actores/actrices).

## Alpha 0.4 (0.4.0-alpha) — 2026-07-04

- **Vistas combinadas**: el recuento de «vistas» (Dashboard y Visionado) suma Plex + Letterboxd
  (importación y RSS). También el filtro Vista/Sin ver de la biblioteca.
- **Fichas de película en toda la web**: cualquier póster (biblioteca, calendario, descubrir, sagas…)
  abre una ficha unificada con reparto y dirección clicables, notas enlazadas a su web (IMDb, RT,
  Metacritic, Letterboxd) y botón de Radarr. Upgrade a Radarr desde la ficha si está por debajo de 1080p.
- **JustWatch**: comprueba si existe una versión de más calidad (HD/4K) en el mercado antes de pedir
  un upgrade, y en qué plataformas. API no oficial, best-effort.
- **Descubrir huecos** rehecho: pestaña de tus favoritos, botón de actualizar, buscador de personas y
  filtros de cortos/documentales/TV siempre visibles. Arreglado el falso «no lo tienes» (matching por
  título/año además de por id de TMDB).
- **Anillos de completista** de Letterboxd con doble anillo concéntrico: **tengo** (Plex) vs **visto**
  (Plex o Letterboxd), seleccionable; ocultar retos que no interesen y mandar lo que falta a Radarr.
- **Directores y actores**: filtros por género, vivo/fallecido, continente y país.
- **Favoritos**: separa directores y actores.
- **Dashboard**: la tarta de resoluciones es clicable (filtra la biblioteca); en «últimas vistas» Plex
  prioriza sobre Letterboxd y las vistas fuera de Plex traen carátula de TMDB.
- Barra de progreso real al construir el calendario o descubrir huecos desde TMDB.
- Arreglado el filtro HDR/SDR de la biblioteca (ahora con opción «Solo SDR»).
- Barra lateral: «+X» en verde con las películas nuevas de la última sincronización.
- Sagas: analiza todas las pendientes de una (antes por lotes de 800).
- Ajustes: elegir de qué webs se muestran las notas.
- **Favoritos**: sugerencias de directores (españoles y del candelero de TMDB), añadir a cualquiera
  tecleando, tope de añadido en bloque hasta 1000 y pestañas «Mis favoritos» / «Descubrir a quién seguir».
- **Buscador global** (Ctrl/⌘ + K) de películas y personas.
- **Interfaz**: barra lateral responsive (menú hamburguesa en móvil), ficha de película unificada,
  toasts de acciones, filtros de biblioteca plegables con chips y memoria, subida de archivos por
  arrastrar-y-soltar, cerrar fichas con Esc, y Ajustes/«¿Qué es PowaFlex?» a ancho completo.
- «Listas y retos» con pestañas MDBList/Letterboxd; «¿Qué es PowaFlex?» con listado de capacidades.

## Alpha 0.3 (0.3.0-alpha) — 2026-07-04

- **Vivos y muertos**: PowaFlex cachea fecha de fallecimiento de las personas; los fallecidos se
  marcan con ✝, se pueden retirar en bloque de Favoritos y quedan fuera del auto-Radarr.
- **Letterboxd**: importación directa del **.zip** completo del export (diario, notas, vistas,
  watchlist y listas), matching mucho mejor (normaliza acentos, artículos y título original) y
  **feed RSS** de tu usuario que recoge tus últimas vistas cada noche.
- **Auto-Radarr diario**: opción para lanzar automáticamente a Radarr los estrenos de los próximos
  N meses de tus directores favoritos vivos.
- **Radarr**: snapshot local de lo ya añadido (botón «Sincronizar» en Ajustes) para mostrar el
  recuadro verde «✓ en Radarr» y no reintentar añadidos que dan «ya existe».
- **Fichas de persona y Descubrir huecos**: filtros para ocultar cortos, documentales y películas
  de TV (ocultos por defecto).
- **Dashboard**: últimas añadidas a Plex, últimas vistas (Plex + RSS de Letterboxd) y últimas
  peticiones a Radarr.
- **Sagas**: rehecho a partir de la colección real de TMDB de cada película (no de las etiquetas de
  Plex), con escaneo resumible y detección de franquicias incompletas.
- **Listas y retos**: anillos de completista con las listas de tu export de Letterboxd y opción de
  pegar cualquier lista pública de Letterboxd.
- Arreglo del diseño de pósters en «Candidatas a upgrade» y «Consenso crítico», con botón de Radarr
  bajo cada candidata. Gráficas más legibles (tipografías que ya no se solapan, géneros completos).
- Calendario: la minificha muestra siempre «Dirige» (el director real, aunque no sea favorito) y
  luego «Actúa» (el favorito mejor situado en el reparto); recuento de añadido masivo corregido.

## Alpha 0.2 (0.2.0-alpha) — 2026-07-04

- **Integración MDBList**: notas de IMDb, Rotten Tomatoes (crítica y público), Metacritic,
  Letterboxd y Trakt para toda la biblioteca, con sync por lotes que respeta el límite diario
  según el tipo de cuenta (gratuita/Supporter/auto). Nuevos filtros y ordenaciones en Biblioteca,
  chips de notas en la ficha, secciones de joyas/discrepancias en Visionado, priorización por
  nota combinada en Descubrir/upgrades y página **Listas y retos** (seguir listas de MDBList con
  % completado y envío en bloque a Radarr).
- Cine venidero: filtros estilo Letterboxd (cortos, documentales, TV), etiqueta configurable de
  Radarr, añadido masivo por horizonte temporal.
- Ajustes: selección de bibliotecas de Plex a sincronizar.
- Icono propio de la app (favicon, Docker/UNRAID, README).

## Alpha 0.1 (0.1.0-alpha) — 2026-07-04

Primera versión pública.

- **Sincronización directa con Plex** por API (X-Plex-Token): biblioteca completa con reparto,
  equipo, géneros, países, colecciones, visionados, notas y datos técnicos (resolución, códec,
  HDR/Dolby Vision, tamaño). Incremental + re-sync nocturna automática (03:30).
- **Dashboard** con totales y gráficas (década, género, país, resolución, crecimiento mensual).
- **Biblioteca** con filtros estilo Letterboxd (género, país, década, visto/sin ver,
  largo/corto, resolución, HDR, nota mínima) y 11 ordenaciones.
- **Directores y actores**: ranking, ficha con filmografía TMDB, % de completismo, lo que falta
  y lo anunciado, con envío a Radarr.
- **Cine venidero**: calendario mensual de estrenos y anuncios de tus personas top + favoritos.
- **Favoritos**: ranking por títulos con añadido en bloque («los X primeros») y edición
  individual; alimenta el calendario.
- **Descubrir huecos**: agregado de ausencias de tus filmografías top + canon de ~110 grandes
  directores del cine mundial ausentes del servidor con sus obras esenciales.
- **Sagas**: completismo de colecciones cruzado con TMDB.
- **Visionado**: visto vs. pendiente por década/género, directores con obra pendiente.
- **Calidad y disco**: resoluciones, códecs, HDR, candidatas a upgrade, duplicados, archivos
  más pesados.
- **Letterboxd**: importación del export oficial (y del formato letterboxd de WebTools-NG) con
  cruce de watchlist y notas.
- **Integración Radarr**: añadir monitorizado con búsqueda automática, perfil y carpeta
  configurables.
- Empaquetado Docker (amd64/arm64) publicado en GHCR desde GitHub Actions.
