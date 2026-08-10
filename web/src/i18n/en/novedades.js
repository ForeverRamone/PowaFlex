// Fragmento EN del historial de versiones (Novedades.jsx). La clave es el
// texto castellano exacto del array VERSIONES: cada titular y cada punto, en
// el mismo orden en que aparecen en el JSX. La cabecera de la página («Últimas
// novedades», el subtítulo, «la que tienes», el pie del CHANGELOG) vive en
// en/app.js, y el titular «Festivales y premios» de la Alpha 0.9.5 ya existe
// como nombre de página en en/app.js: aquí no se repiten.
export default {
  // ── Beta 1.12 ──────────────────────────────────────────────────────────────
  'Trece agentes de repaso: el menú plegado, las 1001 al galope y los filtros a una sola voz':
    'Thirteen review agents: the menu folded, the 1001 at full speed and the filters speaking with one voice',
  'El menú de Festivales, premios y cánones arranca plegado en tres categorías y se despliega al clicar: desplegado entero, en móvil eran casi tres pantallas antes de la primera película. La selección activa queda siempre a la vista.':
    'The Festivals, awards and canons menu starts folded into three categories and opens on click: fully expanded, on mobile it took almost three screens before the first movie. The active selection always stays in sight.',
  'El canon de las 1001 va ligero: la página pinta 120 tarjetas y carga el resto según bajas, el servidor comprime lo que manda (282 → 70 KB) y ya no se para a pedir notas a MDBList en cada visita — las trae en segundo plano. La visita repetida pasa de ~300 ms a ~11 ms.':
    'The 1001 canon is light on its feet: the page renders 120 cards and loads the rest as you scroll, the server compresses what it sends (282 → 70 KB) and no longer stops to ask MDBList for ratings on every visit — it fetches them in the background. Repeat visits go from ~300 ms to ~11 ms.',
  'Las cuatro de las 1001 que seguían sin casar, cerradas: The Killer y El oído (Ucho) llevan su ficha fijada con su porqué, y The Sorrow and the Pity resulta que para TMDB es una serie de televisión, como Lovers Rock — ahora lo dicen en vez de parecer averías.':
    'The four 1001 entries still unmatched, closed: The Killer and The Ear (Ucho) get their entry pinned with the reason why, and The Sorrow and the Pity turns out to be a TV series as far as TMDB is concerned, like Lovers Rock — now they say so instead of looking broken.',
  'Los filtros hablan igual en todas las páginas: «Me faltan»/«Las tengo», «Nota combinada Σ», «Ordenar:» y «✕ Limpiar filtros» son los mismos en las diez secciones, y el listón Σ puesto en una página te sigue a las demás.':
    'Filters speak the same language on every page: “Missing”/“Owned”, “Combined rating Σ”, “Sort:” and “✕ Clear filters” are the same across all ten sections, and the Σ threshold set on one page follows you to the rest.',
  'Móvil de verdad: los botones de la barra se pulsan con el pulgar (medían 18 px, ahora 40), los buscadores ya no disparan el zoom de iOS, y el fondo se queda quieto cuando abres el menú o una ficha.':
    'Mobile for real: the top-bar buttons are thumb-sized now (they measured 18 px, now 40), search boxes no longer trigger iOS zoom, and the background stays put when you open the menu or a movie\'s page.',
  'Borrar un canon propio, quitar un reto o dejar de seguir una lista piden confirmación; y si el servidor falla, la app lo dice en vez de cantar éxito.':
    'Deleting a canon of your own, removing a challenge or unfollowing a list now asks for confirmation; and if the server fails, the app says so instead of declaring success.',
  'La Biblioteca busca mientras tecleas, como Personas: se acabó el Enter secreto.':
    'The Library searches as you type, like People: no more secret Enter key.',
  'Esta misma página existe en inglés: el historial completo, traducido.':
    'This very page exists in English: the full history, translated.',
  'Trece agentes trabajaron en esta versión: seis auditando (móvil, escritorio, emparejado, rendimiento, filtros y plan de trabajo) y siete arreglando, con todo verificado en navegador. La suite pasa de 253 a 255 tests.':
    'Thirteen agents worked on this version: six auditing (mobile, desktop, matching, performance, filters and the work plan) and seven fixing, with everything verified in the browser. The test suite goes from 253 to 255.',

  // ── Beta 1.11 ──────────────────────────────────────────────────────────────
  'Las 1001 películas, los palmareses que faltaban y la cuarentena sin códigos':
    'The 1001 movies, the missing winners lists and a quarantine without codes',
  'Las 1001 películas del libro (15.ª edición, 2021) entran en Cánones junto a Sight & Sound y Cahiers: 997 de 1001 con su ficha a la primera. De las cuatro sin casar, una está bien así: Lovers Rock es un episodio de Small Axe, no una película.':
    'The 1001 movies from the book (15th edition, 2021) join Sight & Sound and Cahiers in Canons: 997 of 1001 matched on the first pass. Of the four left unmatched, one is right as it is: Lovers Rock is an episode of Small Axe, not a movie.',
  'La Cámara de Oro —la mejor ópera prima de todo Cannes— tiene entrada propia con sus 50 ganadoras desde 1978; y Un Certain Regard y la Semana de la Crítica ganan palmarés histórico. Las reglas de Radarr los ofrecen solos.':
    'The Caméra d\'Or — the best first feature across all of Cannes — gets its own entry with its 50 winners since 1978; and Un Certain Regard and Critics\' Week gain all-time winners lists. The Radarr rules offer them out of the box.',
  'El palmarés de Sundance · Competición de EE UU estaba a medias y con fichas rotas: el parser fallaba con las iniciales (A.V. Rockwell), los apellidos con partícula (Beth de Araújo), un «by» que era de la novelista y los empates. Ahora: 47 ganadoras desde 1984 (Blood Simple incluida), todas con ficha.':
    'The Sundance · U.S. Competition winners list was half-done and full of broken entries: the parser tripped over initials (A.V. Rockwell), surnames with particles (Beth de Araújo), a “by” that belonged to the novelist, and ties. Now: 47 winners since 1984 (Blood Simple included), every one matched.',
  'Al Óscar le faltaba hasta Forrest Gump como ganadora — en Wikidata las nominaciones las tienen los productores, no las películas. Regenerado contra las 98 ceremonias de Wikipedia y verificado contra fuentes: 621 nominadas, 98 ganadoras, las galas recientes completas.':
    'The Oscar was missing even Forrest Gump as a winner — on Wikidata the nominations belong to the producers, not the movies. Rebuilt against Wikipedia\'s 98 ceremonies and verified against sources: 621 nominees, 98 winners, the recent ceremonies complete.',
  'La cuarentena se configura por nombre: escribes «hindi» o «Taiwán» y pulsas el chip — se acabó saberse los códigos ISO. Y la bandeja dice «idioma hindi», no «idioma hi».':
    'Quarantine is now set up by name: type “Hindi” or “Taiwan” and click the chip — no more memorizing ISO codes. And the tray says “language Hindi”, not “language hi”.',
  'Los pesos de las cinco señales del detector de emergentes se editan en Ajustes → Automatismos (vacío = de fábrica).':
    'The weights of the emerging-directors detector\'s five signals can be edited in Settings → Automation (empty = factory default).',
  'En la ficha de cualquier película, dirección y reparto son clicables aunque no estén en tu biblioteca; en Cine venidero, igual.':
    'On any movie\'s page, direction and cast are clickable even when they\'re not in your library; same in Upcoming cinema.',
  '«Actualizar todo» ya no dice «sin configurar» cuando un paso semanal simplemente no toca: dice «al día» y cuándo corrió.':
    '“Refresh everything” no longer says “not set up” when a weekly step simply isn\'t due: it says “up to date” and when it last ran.',
  'Cuatro agentes repasaron el conjunto (dos probadores en bucle, un revisor adversarial y un verificador de datos): sus once hallazgos están arreglados y fijados con tests. La suite pasa de 234 a 253.':
    'Four agents went over the whole thing (two testers in a loop, an adversarial reviewer and a data verifier): their eleven findings are fixed and pinned down with tests. The suite goes from 234 to 253.',

  // ── Beta 1.10 ──────────────────────────────────────────────────────────────
  'Cuatro agentes repasando el emparejado, ficha a ficha':
    'Four agents going over the matching, entry by entry',
  'Se revisaron todas las secciones de Festivales y premios contra TMDB: 1.240 fichas. El canon de Sight & Sound pasa a tener 263 carteles de 264 (la que falta es Twin Peaks, que es una serie, y ahora lo dice en vez de dejar un hueco).':
    'Every section of Festivals & awards was checked against TMDB: 1,240 entries. The Sight & Sound canon now has 263 posters out of 264 (the missing one is Twin Peaks, which is a series, and now it says so instead of leaving a gap).',
  'El fallo de fondo: cuando a una fila de Wikipedia le faltaba una celda, el título original acababa metido en el campo del director, y con el director mal ninguna película podía verificarse. Afectaba a decenas de fichas de los palmareses.':
    'The underlying bug: when a Wikipedia row was missing a cell, the original title ended up in the director field, and with the director wrong no movie could be verified. It affected dozens of winners-list entries.',
  'Otro que no se veía: un director acreditado en japonés o cirílico casaba con cualquier nombre, así que podía colarse la ficha de otra película. Cerrado.':
    'Another one nobody could see: a director credited in Japanese or Cyrillic matched any name at all, so another movie\'s entry could slip in. Closed.',
  'Cannes · Un Certain Regard, que es la segunda competición oficial y donde más nombres nuevos aparecen.':
    'Cannes · Un Certain Regard, which is the second official competition and where the most new names show up.',
  'Sundance · Competición de EE UU: faltaba medio Sundance. El premio que ganó CODA no estaba en ninguna parte, y de paso se recuperaron tres años del otro palmarés que se perdían en silencio.':
    'Sundance · U.S. Competition: half of Sundance was missing. The award CODA won was nowhere to be found, and along the way three years of the other winners list that were silently lost were recovered.',
  'Al abrir la edición de un festival, la ganadora de ese año sale la primera y con su 🏆. Antes había que irse al palmarés histórico a mirarlo.':
    'When you open a festival edition, that year\'s winner now comes first, with its 🏆. It used to mean a trip to the all-time winners list.',
  'El nombre de cualquier director es clicable en toda la web y lleva a su ficha, aunque no le sigas ni tengas nada suyo.':
    'Any director\'s name is clickable across the whole app and leads to their page, even if you don\'t follow them or own anything of theirs.',

  // ── Beta 1.09 ──────────────────────────────────────────────────────────────
  'Buscábamos las películas en el idioma equivocado':
    'We were looking up the movies in the wrong language',
  'Las fichas de los cánones y los festivales que salían sin cartel no era que TMDB no las tuviera: es que se le preguntaba en español y TMDB no relaciona «The Leopard» con «Il gattopardo». Como esas listas están escritas en inglés, ninguna película con título original en otra lengua podía encontrarse. Ahora se pregunta también en inglés.':
    'The canon and festival entries showing up without a poster weren\'t missing from TMDB: it was being asked in Spanish, and TMDB doesn\'t link “The Leopard” to “Il gattopardo”. Since those lists are written in English, no movie with an original title in another language could be found. Now it\'s asked in English too.',
  'Tres fichas más fallaban por cómo se escribe el nombre de quien dirige: «The Wachowskis» frente a «Lana y Lilly Wachowski», «Larissa» frente a «Larisa», «Forough Farokhzad» frente a «Forugh Farrokhzad». Ya se reconocen, sin abrir la mano con los que de verdad son otra persona.':
    'Three more entries failed over how the director\'s name is written: “The Wachowskis” versus “Lana y Lilly Wachowski”, “Larissa” versus “Larisa”, “Forough Farokhzad” versus “Forugh Farrokhzad”. They\'re recognized now, without loosening the rules for people who really are someone else.',
  'Todo lo que quedó guardado como «sin ficha» se vuelve a intentar solo.':
    'Everything that was stored as “no entry” is retried on its own.',
  'Logotipo nuevo: el símbolo hace de inicial y se lee POWA / FLEX de corrido, en las tres paletas. En el móvil, la versión de una línea.':
    'New logo: the symbol doubles as the initial and reads POWA / FLEX straight through, in all three palettes. On mobile, the one-line version.',

  // ── Beta 1.08 ──────────────────────────────────────────────────────────────
  'Quién va a ser un grande dentro de diez años':
    'Who\'s going to be one of the greats ten years from now',
  'Página nueva de directores emergentes: quién está estrenando con éxito de crítica y público hoy y todavía no le sigue nadie. Sale de las tablas de festivales que PowaFlex ya tiene guardadas, no de notas sueltas.':
    'New emerging-directors page: who\'s premiering to critical and audience acclaim today with nobody following them yet. It comes from the festival tables PowaFlex already has stored, not from loose notes.',
  'Cinco secciones de debut nuevas —la Semana de la Crítica y la Quincena de Cannes, Orizzonti, Perspectives de la Berlinale y Nuevos Directores de San Sebastián—, que es donde de verdad estrena quien empieza. También están en Festivales y se pueden vigilar con una regla.':
    'Five new debut sections — Cannes\' Critics\' Week and Directors\' Fortnight, Orizzonti, the Berlinale\'s Perspectives and San Sebastián\'s New Directors — which is where people actually premiere when they\'re starting out. They\'re also in Festivals and can be watched with a rule.',
  'Cada ficha explica su puntuación: qué festival, qué nota de la crítica, cuánta gente la ha marcado en Letterboxd y si su segunda película sube respecto a la primera. Un número sin explicación es un oráculo.':
    'Every card explains its score: which festival, what the critics\' rating was, how many people marked it on Letterboxd and whether the second feature improves on the first. A number without an explanation is an oracle.',
  'Lo que no tiene datos no puntúa cero: sale del reparto. Un debut sin Metacritic no puede quedar por detrás de una película mediana solo porque de la mediana haya más información.':
    'What has no data doesn\'t score zero: it drops out of the split. A debut without a Metacritic score can\'t end up behind a mediocre movie just because the mediocre one is better documented.',
  'Regla nueva de Radarr: «mándame la ópera prima de todo emergente que llegue a 70».':
    'New Radarr rule: “send me the first feature of every emerging director who reaches 70”.',
  'La cuarentena avisa. Lo que se queda esperando tu visto bueno aparece en las novedades del panel y con un contador en Ajustes, y ya no se decide de una en una: se puede aprobar o vetar todo de golpe.':
    'Quarantine now speaks up. Whatever sits waiting for your go-ahead shows up in the Dashboard alerts and as a counter in Settings, and it\'s no longer decided one at a time: you can approve or veto the lot in one go.',
  'La bandeja de cuarentena se limpia sola de lo que acabaste teniendo por tu cuenta, y enseña el cartel de cada película para poder decidir.':
    'The quarantine tray clears itself of whatever you ended up owning on your own, and shows each movie\'s poster so you can decide.',

  // ── Beta 1.07 ──────────────────────────────────────────────────────────────
  'Reglas automáticas a Radarr, y unos Ajustes que se pueden leer':
    'Automatic rules to Radarr, and a Settings page you can actually read',
  'Reglas configurables que mandan solas a Radarr lo que pase su filtro: festivales y premios (cada uno por separado, selección oficial o palmarés), estrenos por región, y tus favoritos de cada oficio. Se activan y se afinan una a una.':
    'Configurable rules that send whatever clears their filter to Radarr on their own: festivals and awards (each one separately, official selection or winners list), new releases by region, and your favorites in each craft. They\'re switched on and tuned one by one.',
  'Cada regla lleva su barrita de nota mínima Σ de 0 a 100. En 0 no filtra: entra todo. Con umbral, lo que aún no tiene nota espera a tenerla en vez de irse a ciegas.':
    'Each rule carries its own minimum Σ rating bar from 0 to 100. At 0 it doesn\'t filter: everything gets in. With a threshold, whatever has no rating yet waits for one instead of going in blind.',
  'Los estrenos se vigilan durante una quincena antes y después de su fecha: cada noche se vuelve a mirar su nota, y entran el día que cruzan el umbral.':
    'New releases are watched for a fortnight before and after their date: their rating is re-checked every night, and they get in the day they cross the threshold.',
  'Tope por pasada (20 por defecto) para que un palmarés histórico no te vacíe el disco la primera noche.':
    'A per-run cap (20 by default) so an all-time winners list doesn\'t empty your disk on the first night.',
  'El auto-Radarr de siempre se convierte en una regla más, conservando tu configuración exacta.':
    'The auto-Radarr of old becomes just another rule, keeping your exact configuration.',
  'Cada pasada dice POR QUÉ no entró algo —ya la tienes, bajo el umbral, esperando nota, aplazada por el tope— y el historial de 30 días lleva un 🚫 por película para que ninguna regla la vuelva a mandar.':
    'Every run says WHY something didn\'t get in — you already own it, below the threshold, waiting for a rating, postponed by the cap — and the 30-day history carries a 🚫 per movie so no rule ever sends it again.',
  'Ajustes pasa a cinco pestañas —Conexiones, Fuentes y notas, Automatismos, Interfaz y Mantenimiento— en vez de once pantallas de scroll, con la barra de guardar fija abajo. De paso: los ajustes de copia automática ya se pueden guardar (estaban por debajo del único botón de guardar).':
    'Settings moves to five tabs — Connections, Sources & ratings, Automation, Interface and Maintenance — instead of eleven screens of scrolling, with the save bar pinned at the bottom. While at it: the automatic-backup settings can finally be saved (they sat below the only save button).',
  'Esta misma página, con el histórico de versiones.':
    'This very page, with the version history.',

  // ── Beta 1.06 ──────────────────────────────────────────────────────────────
  'Lo que destapó la auditoría de cuatro revisores':
    'What the four-reviewer audit uncovered',
  'A quien seguías como compositor, montador o director de fotografía no le salía nunca su próxima película en Cine venidero: el calendario solo miraba dirección e interpretación.':
    'Anyone you followed as a composer, editor or cinematographer never had their next movie show up in Upcoming cinema: the calendar only looked at directing and acting.',
  'El auto-Radarr no filtraba por oficio y podía descargarte lo que un favorito hubiera dirigido alguna vez aunque le siguieras por otra cosa.':
    'Auto-Radarr didn\'t filter by craft and could download whatever a favorite had ever directed even if you followed them for something else.',
  'El corrector de emparejado de personas se quedó sin botón de deshacer: una corrección equivocada era permanente.':
    'The people match fixer had lost its undo button: a wrong correction was permanent.',
  'Copias del mismo día ordenadas por la fecha del nombre, no por la del fichero: un rsync o una restauración podían borrar las buenas.':
    'Same-day backups were sorted by the date in the name, not the file\'s: an rsync or a restore could delete the good ones.',

  // ── Beta 1.05 ──────────────────────────────────────────────────────────────
  'Fuera la auditoría de subtítulos':
    'Out goes the subtitle audit',
  'Se retira entera la auditoría de subtítulos y audio y la integración con Bazarr, estrenadas el día antes: Bazarr ya se encarga de eso y aquí solo confundía.':
    'The subtitle-and-audio audit and the Bazarr integration, released the day before, are removed entirely: Bazarr already takes care of that, and here it only muddied things.',
  'Con ella se van la pestaña de Subtítulos del Taller, el criterio de idiomas de Ajustes y más de cien mil filas de dato muerto en la base.':
    'With it go the Workshop\'s Subtitles tab, the language criterion in Settings and over a hundred thousand rows of dead data in the database.',

  // ── Beta 1.04 ──────────────────────────────────────────────────────────────
  'El archivo y los oficios':
    'The archive and the crafts',
  'Cuatro oficios nuevos que seguir además de dirección e interpretación: guion, fotografía, música y montaje.':
    'Four new crafts to follow besides directing and acting: screenwriting, cinematography, music and editing.',
  'Notas y votos de IMDb desde el volcado público, sin gastar API.':
    'IMDb ratings and votes from the public dump, without spending API calls.',
  'Copia de seguridad automática de la base cada noche, con rotación.':
    'Automatic backup of the database every night, with rotation.',
  'El 🚫 para vetar una película al pase automático sin descartarla de todas partes.':
    'The 🚫 to veto a movie from the automatic run without dismissing it everywhere.',

  // ── Beta 1.03 ──────────────────────────────────────────────────────────────
  'Estrenos gana plataformas y VOD de EE UU':
    'New releases gains US streaming and VOD',
  'Cuarta pestaña en Estrenos con las plataformas y el VOD de Estados Unidos.':
    'A fourth tab in New releases with United States streaming platforms and VOD.',
  'El alquiler y la compra dejan de ser un sí/no: ahora traen los nombres («VOD: Apple TV») y se pueden filtrar.':
    'Rental and purchase stop being a yes/no: they now carry the names (“VOD: Apple TV”) and can be filtered.',

  // ── Beta 1.02 ──────────────────────────────────────────────────────────────
  'Arreglo urgente: tres páginas rotas':
    'Urgent fix: three broken pages',
  'Taller, Descubrir huecos y Estrenos morían al abrirlas en los dos idiomas por un fallo de la 1.01. Corregido, con una guarda permanente para que no vuelva a pasar.':
    'Workshop, Discover gaps and New releases died on opening in both languages because of a 1.01 bug. Fixed, with a permanent guard so it never happens again.',

  // ── Beta 1.01 ──────────────────────────────────────────────────────────────
  'PowaFlex habla inglés':
    'PowaFlex speaks English',
  'Selector de idioma de la interfaz (español / inglés) en Ajustes, aparte del idioma con el que el servidor pide los datos a TMDB.':
    'Interface language selector (Spanish / English) in Settings, separate from the language the server uses to ask TMDB for data.',

  // ── Beta 1.00 ──────────────────────────────────────────────────────────────
  'La gran reorganización':
    'The great reorganization',
  'Las mismas funciones con la mitad de menú: 13 secciones en tres grupos.':
    'The same features with half the menu: 13 sections in three groups.',
  'El Taller reúne Calidad y Salud; las sagas pasan a ser una pestaña de Descubrir; Letterboxd se muda a Ajustes.':
    'The Workshop brings Quality and Health together; sagas become a Discover tab; Letterboxd moves to Settings.',
  'Estrenos: qué llega y qué acaba de llegar a los cines y a las plataformas de España y EE UU.':
    'New releases: what\'s coming and what just landed in theaters and on platforms in Spain and the US.',
  'Buscador global con ⌘K.':
    'Global search with ⌘K.',

  // ── Alpha 0.9.12 – 0.9.16 ──────────────────────────────────────────────────
  'Cánones, catálogo de directores y corrección manual':
    'Canons, the directors catalog and manual correction',
  'El top 10 anual de Cahiers du Cinéma y la encuesta de Sight & Sound 2022, en Festivales → Cánones.':
    'Cahiers du Cinéma\'s annual top 10 and the Sight & Sound 2022 poll, in Festivals → Canons.',
  'Catálogo de 680 directores y directoras en activo, con filtros por región, país, sexo y actividad.':
    'A catalog of 680 working directors, with filters by region, country, gender and activity.',
  'Corrector manual de emparejado con TMDB para personas y películas: para los homónimos que ninguna regla va a acertar.':
    'A manual TMDB match fixer for people and movies: for the namesakes no rule is ever going to get right.',
  'Filtros demográficos en los «top» de Descubrir huecos.':
    'Demographic filters on the “top” lists of Discover gaps.',

  // ── Alpha 0.9.5 – 0.9.11 (el titular «Festivales y premios» está en app.js) ─
  'Página nueva: las secciones oficiales de los grandes festivales, edición por edición, desde Wikipedia.':
    'New page: the official selections of the major festivals, edition by edition, from Wikipedia.',
  'Palmareses históricos y premios (Goya, César, BAFTA, Cine Europeo, Óscar), con vista de nominadas por año.':
    'All-time winners lists and awards (Goya, César, BAFTA, European Film Awards, Oscar), with a nominees-by-year view.',
  'El emparejado con TMDB se verifica contra la dirección: mejor sin ficha que la ficha de otra película.':
    'TMDB matching is verified against the director: better no entry than another movie\'s entry.',
  'Bandeja de novedades en el Dashboard y vigía nocturna de ediciones nuevas.':
    'The what\'s-new tray on the Dashboard and the nightly watch for new editions.',

  // ── Alpha 0.9 – 0.9.4 ──────────────────────────────────────────────────────
  'Letterboxd y el completismo':
    'Letterboxd and completism',
  'Importador del export de Letterboxd: diario, notas, vistas, watchlist y listas.':
    'Importer for the Letterboxd export: diary, ratings, watched, watchlist and lists.',
  'Descubrir huecos: qué te falta de cada favorito, y los grandes ausentes de tu colección.':
    'Discover gaps: what you\'re missing from each favorite, and the great absentees from your collection.',
  'Sagas y colecciones incompletas.':
    'Unfinished sagas and collections.',

  // ── Alpha 0.5 – 0.8.2 ──────────────────────────────────────────────────────
  'Radarr, calendario y aspecto':
    'Radarr, the calendar and the look',
  'Integración con Radarr: pedir lo que falta sin salir de PowaFlex.':
    'Radarr integration: request what\'s missing without leaving PowaFlex.',
  'Calendario de cine venidero a partir de tus favoritos.':
    'Upcoming-cinema calendar built from your favorites.',
  '«Actualizar todo» con un botón, y la misma rutina cada noche.':
    '“Refresh everything” with one button, and the same routine every night.',
  'Los tres aspectos elegibles y el rediseño de la interfaz.':
    'The three selectable looks and the interface redesign.',

  // ── Alpha 0.1 – 0.4 ────────────────────────────────────────────────────────
  'El principio':
    'The beginning',
  'Sincronización con Plex: biblioteca, reparto, géneros, visionados y datos técnicos.':
    'Plex sync: library, cast, genres, watch history and technical data.',
  'Notas de IMDb, Rotten Tomatoes, Metacritic y Letterboxd vía MDBList.':
    'IMDb, Rotten Tomatoes, Metacritic and Letterboxd ratings via MDBList.',
  'Favoritos, estado vital de las personas y auditoría de calidad de los archivos.':
    'Favorites, people\'s living status and the file-quality audit.',
};
