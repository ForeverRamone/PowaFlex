import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHeader } from '../components.jsx';
import { t } from '../i18n.js';

/**
 * QUÉ HA CAMBIADO EN CADA VERSIÓN.
 *
 * OJO, no confundir con las «🔔 Novedades» del Dashboard: aquellas son cosas
 * que el pase nocturno detecta en TU colección (una edición de festival
 * publicada, una pedida que llega a digital). Esto es el historial de la
 * APLICACIÓN: qué trae cada versión y por qué.
 *
 * El histórico vive aquí como dato y no se saca del CHANGELOG.md en tiempo de
 * ejecución a propósito: el changelog es para quien lee el repositorio —lleva
 * detalles de implementación, nombres de fichero y números de test— y esto es
 * para quien usa la app. Son dos textos distintos con dos públicos distintos.
 *
 * REGLA DE MANTENIMIENTO: cada vez que se despliega una versión se añade su
 * entrada AQUÍ ARRIBA, además del CHANGELOG, el README y los tres package.json.
 * Y como todo pasa por t(), el titular y los puntos nuevos necesitan sus claves
 * EN en i18n/en/novedades.js: sin ellas la entrada cae en castellano con la
 * interfaz en inglés.
 */

const VERSIONES = [
  {
    label: 'Beta 1.18',
    fecha: '2026-08-21',
    titular: 'Los nombres que faltaban en los palmareses, y las filmografías al día',
    puntos: [
      'En «Lo mejor del año», Sundance, Sitges y el David di Donatello salían con cartel y con nota pero sin un solo nombre debajo: ni a quién leer ni una estrella que pulsar para seguirle. Sus tablas de Wikipedia no dicen quién dirige, y desde la versión pasada esas películas entraban por un atajo que se saltaba la pregunta a TMDB. Ya la hace.',
      'Si sigues a alguien y TMDB le apunta una película nueva, ahora aparece al día siguiente. Su filmografía se guardaba una semana entera, así que un estreno recién añadido podía tardar todo ese tiempo en salir en su ficha, en Cine venidero y en los huecos. Cada noche se vuelve a leer entera la de toda la gente a la que sigues.',
      'Y si no quieres esperar a la noche, su ficha tiene un botón nuevo: «Actualizar desde TMDB» vuelve a pedirla en ese momento.',
      'Las películas sin nota de Estrenos dejan de quedarse sin nota para siempre. Un estreno se mira el día que se anuncia, cuando todavía no lo ha votado nadie, y esa respuesta vacía se quedaba guardada. Ahora se vuelve a preguntar cada pocos días, y hay un botón «Actualizar notas» para pedirlas todas ya. Arriba te dice cuántas siguen sin Σ.',
      'El Dashboard tiene un cuadro nuevo: qué películas te ha bajado solo el automático en los últimos treinta días, agrupadas por el director o directora por quien entró cada una, y si ya han llegado o siguen esperando. «Últimas peticiones a Radarr» sigue estando debajo, pero ahí se mezcla todo: lo que mandas a mano, lo de las reglas de festivales y lo de este pase.',
      'En Descubrir huecos, dos interruptores nuevos: esconder lo que ya está en Radarr —que ya está decidido y llegará— y esconder a quien, con los filtros que tienes puestos, no ofrece ninguna película. Los dos se recuerdan y se quitan con «Limpiar filtros».',
      'Cine venidero separa por fin lo que dirige tu gente de lo que solo interpreta. Son dos cosas distintas: lo primero es lo que el pase automático puede bajar solo, y lo segundo es para mirar y elegir a mano. Tres botones arriba, con su recuento, y una etiqueta en cada ficha.',
    ],
  },
  {
    label: 'Beta 1.17',
    fecha: '2026-08-11',
    titular: 'Los palmareses viejos vienen dentro de la app: Wikipedia se queda para lo que se mueve',
    puntos: [
      'Los años cerrados ya no se preguntan por ahí: 4.794 películas de 31 palmareses, hasta 2024, vienen guardadas con la aplicación y con su ficha de TMDB ya emparejada. «Lo mejor de 1998» tardaba 13,7 segundos y ahora tarda 2,1; el palmarés de Cannes, 27,5 y ahora 4,2. La temporada en curso se sigue leyendo de Wikipedia, que es lo único que todavía cambia.',
      'Y si Wikipedia se cae, cambia el formato de una tabla o mueve un artículo, lo viejo se sigue viendo igual en vez de dejarte la página con un error.',
      'Dos festivales nuevos: la Seminci de Valladolid (70 Espigas de Oro desde 1958, con su dirección y su país) y Sitges (46 ganadoras desde 1972). Con ellos son cuarenta festivales y premios, y los dos entran también en «Lo mejor del año».',
      'Al meter esas dos tablas salieron a la luz fallos viejos del lector de Wikipedia: el país que faltaba en media Cannes y media Venecia ya aparece, y 28 fichas que llevaban el título original metido en el campo del director están arregladas (la Concha de Oro de 1977, el Óscar de 1955, la Cámara de Oro de 2000 y catorce nominadas de Toronto).',
      'Mirando las 46 fichas de Sitges una a una aparecieron cuatro emparejamientos falsos que ninguna cifra delataba: la ganadora de 2000 apuntaba a una película de 2025 que se llama igual, y el «Ringu» de 1999 a una versión de televisión de 1995. Cuando una fila no dice quién dirige, ahora el año tiene que cuadrar: hasta tres años antes del premio, uno después.',
      'Directores emergentes mira también los palmareses, empezando por la Cámara de Oro de Cannes, que es el premio a la mejor ópera prima y era la mejor pista que teníamos sin usar. Ahora caben hasta cinco películas —antes tres— y salen 47 nombres en vez de 33, con gente que solo llegaba por el Goya o el César. Quien ya ganó la Palma, el León o el Oso deja de contar como promesa.',
      'En el móvil, la tabla de archivos más pesados del Taller se aplastaba hasta pegar el año con la resolución («20041080»); ahora se desliza de lado y se lee. Igual la de tus notas de Letterboxd en Visionado.',
    ],
  },
  {
    label: 'Beta 1.16',
    fecha: '2026-08-11',
    titular: 'Si la lista de un premio se queda atrás, se mira la edición de ese año',
    puntos: [
      'El Guldbagge de 2025 ya está: lo ganó «Eagles of the Republic» en enero. No aparecía porque la lista histórica de Wikipedia seguía terminando en 2024, aunque la edición de ese año llevaba meses con su propia página. Ahora, cuando la lista se queda atrás, se mira la edición suelta —y de paso salen también las nominadas de ese año.',
      'Vale para el Goya, el BAFTA y los Critics’ Choice además del Guldbagge. Los tres tenían su lista al día, así que no cambia nada en ellos: solo se consulta lo que falta, y en cuanto alguien actualice la lista se deja de mirar.',
      'El David di Donatello enseñaba sus 69 ganadoras sin un solo director, porque Wikipedia solo acredita a los productores. Ahora el nombre lo pone TMDB, así que ya se puede ver quién dirigió cada una y seguirle la pista con la estrella.',
    ],
  },
  {
    label: 'Beta 1.15',
    fecha: '2026-08-11',
    titular: 'Tres arreglos del emparejado, vistos en el palmarés recién estrenado',
    puntos: [
      'El Ástor de Oro de 1959 de Mar del Plata apuntaba al making-of de «Fresas salvajes» en vez de a la película de Bergman: los dos son de 1957 y los dos los firma él. Ahora el emparejado compara con los DOS nombres que trae cada fila —el internacional y el original—, que es lo que hacía falta para separarlos. De paso se rescatan otras tres películas que estaban sin cartel.',
      '«Paradise Is Burning» salía dirigida por Nima Yousefi, que es su productor, y «Triangle of Sadness» por Erik Hemmendorff en vez de por Ruben Östlund. Venía mal de Wikipedia, que en el palmarés sueco pone productores en la columna de dirección: ahora, cuando la ficha se reconoce por el equipo, la dirección se toma de TMDB.',
      'El Guldbagge de 2025 sigue sin aparecer, y no es cosa de la app: la lista de Wikipedia que se lee termina en 2024. El premio sí se falló en enero (Eagles of the Republic), pero nadie ha llevado el dato a esa página. Aparecerá solo en cuanto alguien la edite.',
    ],
  },
  {
    label: 'Beta 1.14',
    fecha: '2026-08-11',
    titular: 'Trece premios nuevos y una vista que enseña lo mejor de un año entero',
    puntos: [
      'Festivales y premios pasa de 25 a 38 entradas. Nuevas: los seis premios de la crítica de Estados Unidos (NBR, Nueva York, Los Ángeles, Chicago, Boston y Critics’ Choice), los Globos de Oro —drama y comedia por separado—, el David di Donatello italiano, el Guldbagge sueco, el Lola alemán, el Premio del Público de Toronto y Mar del Plata.',
      'Y una vista nueva: «Lo mejor del año». En vez de ir premio a premio, eliges un año y ves de un vistazo quién ganó en los treinta palmareses, agrupados por festivales, premios y crítica, con el nombre del premio sobre cada cartel. Llega hasta 1927, que es donde empieza el Óscar.',
      'El Premio del Público de Toronto es el premio gordo del festival y el mejor pronóstico del Óscar que hay (Nomadland, Green Book, La La Land, 12 años de esclavitud). Hasta ahora solo estaba el Platform Prize, que es la competición con jurado.',
      'Media lista de nominadas de Critics’ Choice y del Donatello salía marcada como ganadora: sus tablas de Wikipedia van pintadas a rayas y el programa confundía la raya gris con el sombreado que marca a la ganadora. Ya no.',
      'Triangle of Sadness se quedaba sin cartel en el palmarés del Guldbagge porque Wikipedia pone ahí a los productores en vez de a los directores. Ahora, cuando el título coincide exactamente y ningún director casa, se comprueba contra el equipo de producción y guion de esa misma ficha.',
      'Otras seis películas se quedaban sin ficha por un fallo tonto: si TMDB devolvía en la búsqueda una entrada borrada, el programa lo tomaba por un corte de red y abandonaba la película, con la ficha buena esperando en la misma lista.',
      'Y varias cosas más que estaban mal desde antes y no se veían: los Globos de comedia de 1958 a 1962 faltaban enteros, el Goya de 2004 de los críticos de Chicago desaparecía, y algunos títulos arrastraban símbolos («Nomadland ‡») que impedían encontrarlos.',
    ],
  },
  {
    label: 'Beta 1.13',
    fecha: '2026-08-10',
    titular: 'Visionado tardaba nueve segundos por un índice que faltaba',
    puntos: [
      'Visionado abría en 9 segundos y ahora abre en 0,15. La culpa era de una tabla sin índice: cada una de tus películas rebuscaba tu Letterboxd entero, tres veces, para saber qué nota le habías puesto. Se arregla solo al arrancar, sin que tengas que hacer nada.',
      'Favoritos era todavía peor: 25 segundos. Pedía a Wikipedia los habituales de Cannes, Venecia y Berlín nada más entrar, para llenar la pestaña «Añadir», que ni siquiera es la que se abre. Ahora cada pestaña carga lo suyo cuando la abres: la página está lista en un cuarto de segundo.',
      'Toda la app iba cargando el paquete de las gráficas —400 KB— en cada página, incluidas las que no tienen ninguna gráfica: React se había colado dentro de ese paquete. Ahora las gráficas solo se bajan cuando de verdad hay una que pintar, y en Visionado y el Dashboard entran después de que la página ya esté a la vista.',
      'Se acabaron los «Cargando…» a secas: ahora cada espera dice qué está trayendo, cuál de cuántos pasos va y el porcentaje. Cuando solo hay una cosa que traer no te inventamos un porcentaje: te decimos qué es y cuántos segundos llevas esperando.',
      'Descubrir mandaba a tu navegador un montón de datos que solo usa el servidor y que se tiraban sin pintar: fuera. Y la tabla de tus notas de Letterboxd viaja en 26 KB en vez de 102.',
      'Todo esto se midió contra una biblioteca de prueba de 12.400 películas, porque con la de 400 con la que se desarrolla no se notaba ni uno de estos problemas.',
    ],
  },
  {
    label: 'Beta 1.12',
    fecha: '2026-08-10',
    titular: 'Trece agentes de repaso: el menú plegado, las 1001 al galope y los filtros a una sola voz',
    puntos: [
      'El menú de Festivales, premios y cánones arranca plegado en tres categorías y se despliega al clicar: desplegado entero, en móvil eran casi tres pantallas antes de la primera película. La selección activa queda siempre a la vista.',
      'El canon de las 1001 va ligero: la página pinta 120 tarjetas y carga el resto según bajas, el servidor comprime lo que manda (282 → 70 KB) y ya no se para a pedir notas a MDBList en cada visita — las trae en segundo plano. La visita repetida pasa de ~300 ms a ~11 ms.',
      'Las cuatro de las 1001 que seguían sin casar, cerradas: The Killer y El oído (Ucho) llevan su ficha fijada con su porqué, y The Sorrow and the Pity resulta que para TMDB es una serie de televisión, como Lovers Rock — ahora lo dicen en vez de parecer averías.',
      'Los filtros hablan igual en todas las páginas: «Me faltan»/«Las tengo», «Nota combinada Σ», «Ordenar:» y «✕ Limpiar filtros» son los mismos en las diez secciones, y el listón Σ puesto en una página te sigue a las demás.',
      'Móvil de verdad: los botones de la barra se pulsan con el pulgar (medían 18 px, ahora 40), los buscadores ya no disparan el zoom de iOS, y el fondo se queda quieto cuando abres el menú o una ficha.',
      'Borrar un canon propio, quitar un reto o dejar de seguir una lista piden confirmación; y si el servidor falla, la app lo dice en vez de cantar éxito.',
      'La Biblioteca busca mientras tecleas, como Personas: se acabó el Enter secreto.',
      'Esta misma página existe en inglés: el historial completo, traducido.',
      'Trece agentes trabajaron en esta versión: seis auditando (móvil, escritorio, emparejado, rendimiento, filtros y plan de trabajo) y siete arreglando, con todo verificado en navegador. La suite pasa de 253 a 255 tests.',
    ],
  },
  {
    label: 'Beta 1.11',
    fecha: '2026-08-10',
    titular: 'Las 1001 películas, los palmareses que faltaban y la cuarentena sin códigos',
    puntos: [
      'Las 1001 películas del libro (15.ª edición, 2021) entran en Cánones junto a Sight & Sound y Cahiers: 997 de 1001 con su ficha a la primera. De las cuatro sin casar, una está bien así: Lovers Rock es un episodio de Small Axe, no una película.',
      'La Cámara de Oro —la mejor ópera prima de todo Cannes— tiene entrada propia con sus 50 ganadoras desde 1978; y Un Certain Regard y la Semana de la Crítica ganan palmarés histórico. Las reglas de Radarr los ofrecen solos.',
      'El palmarés de Sundance · Competición de EE UU estaba a medias y con fichas rotas: el parser fallaba con las iniciales (A.V. Rockwell), los apellidos con partícula (Beth de Araújo), un «by» que era de la novelista y los empates. Ahora: 47 ganadoras desde 1984 (Blood Simple incluida), todas con ficha.',
      'Al Óscar le faltaba hasta Forrest Gump como ganadora — en Wikidata las nominaciones las tienen los productores, no las películas. Regenerado contra las 98 ceremonias de Wikipedia y verificado contra fuentes: 621 nominadas, 98 ganadoras, las galas recientes completas.',
      'La cuarentena se configura por nombre: escribes «hindi» o «Taiwán» y pulsas el chip — se acabó saberse los códigos ISO. Y la bandeja dice «idioma hindi», no «idioma hi».',
      'Los pesos de las cinco señales del detector de emergentes se editan en Ajustes → Automatismos (vacío = de fábrica).',
      'En la ficha de cualquier película, dirección y reparto son clicables aunque no estén en tu biblioteca; en Cine venidero, igual.',
      '«Actualizar todo» ya no dice «sin configurar» cuando un paso semanal simplemente no toca: dice «al día» y cuándo corrió.',
      'Cuatro agentes repasaron el conjunto (dos probadores en bucle, un revisor adversarial y un verificador de datos): sus once hallazgos están arreglados y fijados con tests. La suite pasa de 234 a 253.',
    ],
  },
  {
    label: 'Beta 1.10',
    fecha: '2026-08-09',
    titular: 'Cuatro agentes repasando el emparejado, ficha a ficha',
    puntos: [
      'Se revisaron todas las secciones de Festivales y premios contra TMDB: 1.240 fichas. El canon de Sight & Sound pasa a tener 263 carteles de 264 (la que falta es Twin Peaks, que es una serie, y ahora lo dice en vez de dejar un hueco).',
      'El fallo de fondo: cuando a una fila de Wikipedia le faltaba una celda, el título original acababa metido en el campo del director, y con el director mal ninguna película podía verificarse. Afectaba a decenas de fichas de los palmareses.',
      'Otro que no se veía: un director acreditado en japonés o cirílico casaba con cualquier nombre, así que podía colarse la ficha de otra película. Cerrado.',
      'Cannes · Un Certain Regard, que es la segunda competición oficial y donde más nombres nuevos aparecen.',
      'Sundance · Competición de EE UU: faltaba medio Sundance. El premio que ganó CODA no estaba en ninguna parte, y de paso se recuperaron tres años del otro palmarés que se perdían en silencio.',
      'Al abrir la edición de un festival, la ganadora de ese año sale la primera y con su 🏆. Antes había que irse al palmarés histórico a mirarlo.',
      'El nombre de cualquier director es clicable en toda la web y lleva a su ficha, aunque no le sigas ni tengas nada suyo.',
    ],
  },
  {
    label: 'Beta 1.09',
    fecha: '2026-08-09',
    titular: 'Buscábamos las películas en el idioma equivocado',
    puntos: [
      'Las fichas de los cánones y los festivales que salían sin cartel no era que TMDB no las tuviera: es que se le preguntaba en español y TMDB no relaciona «The Leopard» con «Il gattopardo». Como esas listas están escritas en inglés, ninguna película con título original en otra lengua podía encontrarse. Ahora se pregunta también en inglés.',
      'Tres fichas más fallaban por cómo se escribe el nombre de quien dirige: «The Wachowskis» frente a «Lana y Lilly Wachowski», «Larissa» frente a «Larisa», «Forough Farokhzad» frente a «Forugh Farrokhzad». Ya se reconocen, sin abrir la mano con los que de verdad son otra persona.',
      'Todo lo que quedó guardado como «sin ficha» se vuelve a intentar solo.',
      'Logotipo nuevo: el símbolo hace de inicial y se lee POWA / FLEX de corrido, en las tres paletas. En el móvil, la versión de una línea.',
    ],
  },
  {
    label: 'Beta 1.08',
    fecha: '2026-08-09',
    titular: 'Quién va a ser un grande dentro de diez años',
    puntos: [
      'Página nueva de directores emergentes: quién está estrenando con éxito de crítica y público hoy y todavía no le sigue nadie. Sale de las tablas de festivales que PowaFlex ya tiene guardadas, no de notas sueltas.',
      'Cinco secciones de debut nuevas —la Semana de la Crítica y la Quincena de Cannes, Orizzonti, Perspectives de la Berlinale y Nuevos Directores de San Sebastián—, que es donde de verdad estrena quien empieza. También están en Festivales y se pueden vigilar con una regla.',
      'Cada ficha explica su puntuación: qué festival, qué nota de la crítica, cuánta gente la ha marcado en Letterboxd y si su segunda película sube respecto a la primera. Un número sin explicación es un oráculo.',
      'Lo que no tiene datos no puntúa cero: sale del reparto. Un debut sin Metacritic no puede quedar por detrás de una película mediana solo porque de la mediana haya más información.',
      'Regla nueva de Radarr: «mándame la ópera prima de todo emergente que llegue a 70».',
      'La cuarentena avisa. Lo que se queda esperando tu visto bueno aparece en las novedades del panel y con un contador en Ajustes, y ya no se decide de una en una: se puede aprobar o vetar todo de golpe.',
      'La bandeja de cuarentena se limpia sola de lo que acabaste teniendo por tu cuenta, y enseña el cartel de cada película para poder decidir.',
    ],
  },
  {
    label: 'Beta 1.07',
    fecha: '2026-08-09',
    titular: 'Reglas automáticas a Radarr, y unos Ajustes que se pueden leer',
    puntos: [
      'Reglas configurables que mandan solas a Radarr lo que pase su filtro: festivales y premios (cada uno por separado, selección oficial o palmarés), estrenos por región, y tus favoritos de cada oficio. Se activan y se afinan una a una.',
      'Cada regla lleva su barrita de nota mínima Σ de 0 a 100. En 0 no filtra: entra todo. Con umbral, lo que aún no tiene nota espera a tenerla en vez de irse a ciegas.',
      'Los estrenos se vigilan durante una quincena antes y después de su fecha: cada noche se vuelve a mirar su nota, y entran el día que cruzan el umbral.',
      'Tope por pasada (20 por defecto) para que un palmarés histórico no te vacíe el disco la primera noche.',
      'El auto-Radarr de siempre se convierte en una regla más, conservando tu configuración exacta.',
      'Cada pasada dice POR QUÉ no entró algo —ya la tienes, bajo el umbral, esperando nota, aplazada por el tope— y el historial de 30 días lleva un 🚫 por película para que ninguna regla la vuelva a mandar.',
      'Ajustes pasa a cinco pestañas —Conexiones, Fuentes y notas, Automatismos, Interfaz y Mantenimiento— en vez de once pantallas de scroll, con la barra de guardar fija abajo. De paso: los ajustes de copia automática ya se pueden guardar (estaban por debajo del único botón de guardar).',
      'Esta misma página, con el histórico de versiones.',
    ],
  },
  {
    label: 'Beta 1.06',
    fecha: '2026-08-07',
    titular: 'Lo que destapó la auditoría de cuatro revisores',
    puntos: [
      'A quien seguías como compositor, montador o director de fotografía no le salía nunca su próxima película en Cine venidero: el calendario solo miraba dirección e interpretación.',
      'El auto-Radarr no filtraba por oficio y podía descargarte lo que un favorito hubiera dirigido alguna vez aunque le siguieras por otra cosa.',
      'El corrector de emparejado de personas se quedó sin botón de deshacer: una corrección equivocada era permanente.',
      'Copias del mismo día ordenadas por la fecha del nombre, no por la del fichero: un rsync o una restauración podían borrar las buenas.',
    ],
  },
  {
    label: 'Beta 1.05',
    fecha: '2026-08-07',
    titular: 'Fuera la auditoría de subtítulos',
    puntos: [
      'Se retira entera la auditoría de subtítulos y audio y la integración con Bazarr, estrenadas el día antes: Bazarr ya se encarga de eso y aquí solo confundía.',
      'Con ella se van la pestaña de Subtítulos del Taller, el criterio de idiomas de Ajustes y más de cien mil filas de dato muerto en la base.',
    ],
  },
  {
    label: 'Beta 1.04',
    fecha: '2026-08-06',
    titular: 'El archivo y los oficios',
    puntos: [
      'Cuatro oficios nuevos que seguir además de dirección e interpretación: guion, fotografía, música y montaje.',
      'Notas y votos de IMDb desde el volcado público, sin gastar API.',
      'Copia de seguridad automática de la base cada noche, con rotación.',
      'El 🚫 para vetar una película al pase automático sin descartarla de todas partes.',
    ],
  },
  {
    label: 'Beta 1.03',
    fecha: '2026-08-06',
    titular: 'Estrenos gana plataformas y VOD de EE UU',
    puntos: [
      'Cuarta pestaña en Estrenos con las plataformas y el VOD de Estados Unidos.',
      'El alquiler y la compra dejan de ser un sí/no: ahora traen los nombres («VOD: Apple TV») y se pueden filtrar.',
    ],
  },
  {
    label: 'Beta 1.02',
    fecha: '2026-08-06',
    titular: 'Arreglo urgente: tres páginas rotas',
    puntos: [
      'Taller, Descubrir huecos y Estrenos morían al abrirlas en los dos idiomas por un fallo de la 1.01. Corregido, con una guarda permanente para que no vuelva a pasar.',
    ],
  },
  {
    label: 'Beta 1.01',
    fecha: '2026-08-06',
    titular: 'PowaFlex habla inglés',
    puntos: [
      'Selector de idioma de la interfaz (español / inglés) en Ajustes, aparte del idioma con el que el servidor pide los datos a TMDB.',
    ],
  },
  {
    label: 'Beta 1.00',
    fecha: '2026-08-06',
    titular: 'La gran reorganización',
    puntos: [
      'Las mismas funciones con la mitad de menú: 13 secciones en tres grupos.',
      'El Taller reúne Calidad y Salud; las sagas pasan a ser una pestaña de Descubrir; Letterboxd se muda a Ajustes.',
      'Estrenos: qué llega y qué acaba de llegar a los cines y a las plataformas de España y EE UU.',
      'Buscador global con ⌘K.',
    ],
  },
  {
    label: 'Alpha 0.9.12 – 0.9.16',
    fecha: '2026-08-05',
    titular: 'Cánones, catálogo de directores y corrección manual',
    puntos: [
      'El top 10 anual de Cahiers du Cinéma y la encuesta de Sight & Sound 2022, en Festivales → Cánones.',
      'Catálogo de 680 directores y directoras en activo, con filtros por región, país, sexo y actividad.',
      'Corrector manual de emparejado con TMDB para personas y películas: para los homónimos que ninguna regla va a acertar.',
      'Filtros demográficos en los «top» de Descubrir huecos.',
    ],
  },
  {
    label: 'Alpha 0.9.5 – 0.9.11',
    fecha: '2026-08-03',
    titular: 'Festivales y premios',
    puntos: [
      'Página nueva: las secciones oficiales de los grandes festivales, edición por edición, desde Wikipedia.',
      'Palmareses históricos y premios (Goya, César, BAFTA, Cine Europeo, Óscar), con vista de nominadas por año.',
      'El emparejado con TMDB se verifica contra la dirección: mejor sin ficha que la ficha de otra película.',
      'Bandeja de novedades en el Dashboard y vigía nocturna de ediciones nuevas.',
    ],
  },
  {
    label: 'Alpha 0.9 – 0.9.4',
    fecha: '2026-08-02',
    titular: 'Letterboxd y el completismo',
    puntos: [
      'Importador del export de Letterboxd: diario, notas, vistas, watchlist y listas.',
      'Descubrir huecos: qué te falta de cada favorito, y los grandes ausentes de tu colección.',
      'Sagas y colecciones incompletas.',
    ],
  },
  {
    label: 'Alpha 0.5 – 0.8.2',
    fecha: '2026-08-01',
    titular: 'Radarr, calendario y aspecto',
    puntos: [
      'Integración con Radarr: pedir lo que falta sin salir de PowaFlex.',
      'Calendario de cine venidero a partir de tus favoritos.',
      '«Actualizar todo» con un botón, y la misma rutina cada noche.',
      'Los tres aspectos elegibles y el rediseño de la interfaz.',
    ],
  },
  {
    label: 'Alpha 0.1 – 0.4',
    fecha: '2026-07-04',
    titular: 'El principio',
    puntos: [
      'Sincronización con Plex: biblioteca, reparto, géneros, visionados y datos técnicos.',
      'Notas de IMDb, Rotten Tomatoes, Metacritic y Letterboxd vía MDBList.',
      'Favoritos, estado vital de las personas y auditoría de calidad de los archivos.',
    ],
  },
];

export default function Novedades() {
  const [version, setVersion] = useState(null);
  useEffect(() => { api('/version').then((v) => !v.error && setVersion(v)); }, []);
  // la primera entrada es la de la versión que se está ejecutando
  const actual = version?.label || VERSIONES[0].label;

  return (
    <div>
      <PageHeader
        eyebrow={t('Cuenta')}
        title={t('Últimas novedades')}
        subtitle={t('Qué trae cada versión de PowaFlex. (Lo que pasa en tu colección —una edición de festival publicada, una pedida que llega a digital— está en las novedades del Dashboard.)')}
      />
      <div className="space-y-4">
        {VERSIONES.map((v) => {
          const esActual = v.label === actual;
          return (
            <section key={v.label} className={esActual ? 'card-raised p-5 border-l-4 !border-l-gold-400' : 'card p-5'}>
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className={`font-semibold ${esActual ? 'text-gold-400' : 'text-zinc-100'}`}>{v.label}</h2>
                {esActual && <span className="badge-quiet">{t('la que tienes')}</span>}
                <span className="text-xs text-zinc-500 ml-auto shrink-0">{v.fecha}</span>
              </div>
              <p className="text-sm text-zinc-300 mt-1">{t(v.titular)}</p>
              <ul className="mt-3 space-y-1.5">
                {v.puntos.map((p, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex gap-2">
                    <span className="text-gold-400 shrink-0">·</span>
                    <span>{t(p)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-600 mt-6">
        {t('El detalle técnico de cada versión, con nombres de fichero y motivos de cada arreglo, está en el CHANGELOG del repositorio.')}
      </p>
    </div>
  );
}
