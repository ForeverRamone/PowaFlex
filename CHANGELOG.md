# Changelog

## Beta 1.11 (1.0.11-beta) — 2026-08-10

**Las 1001 películas, los palmareses que faltaban de Cannes y Sundance, el Óscar completo de verdad, y la cuarentena sin códigos.**

### Las 1001 películas, como canon

El libro de Schneider (15.ª edición, 2021 — la «edición 2024» que circula no existe como libro) entra en Cánones junto a Sight & Sound y Cahiers: 1001 fichas en el orden cronológico del libro, con 997 casadas contra TMDB a la primera. De las cuatro restantes, una está *bien* sin ficha: Lovers Rock es un episodio de Small Axe, no una película.

### Los palmareses de las paralelas de Cannes

La **Cámara de Oro** —la mejor ópera prima de todo Cannes, el radar de debuts por excelencia— tiene entrada propia con sus 50 ganadoras desde 1978. Y Un Certain Regard (29 ganadoras desde 1998) y la Semana de la Crítica (26 del Gran Premio) ganan el botón de palmarés histórico. El motor de reglas los ofrece solo: todo sale del registro, sin listas a mano.

### Sundance EE UU: de 21 fichas con 3 rotas a 47 con ninguna

Lo destapó una captura de producción. El parser de la lista de Sundance fallaba de cuatro maneras distintas: las iniciales («A.V. Rockwell» — el veto casaba la A suelta), las partículas («Beth de Araújo»), un «by» que era parte del título («Precious: Based on the Novel "Push" **by Sapphire**» ponía a la novelista de directora) y el empate del 2000 sin partir en dos. Y encima el palmarés empezaba en 2005 porque copió el corte de la competición internacional, cuando el premio estadounidense es de 1984: Blood Simple, The Brothers McMullen y veintitrés más estaban fuera. La revisión adversarial cazó dos pérdidas más: el «U. S.» con espacio de 2013 borraba a **Fruitvale Station** en silencio, y los empates en dos líneas (Public Access, el debut de Bryan Singer) perdían la segunda ganadora. Resultado: 47 ganadoras desde 1984, las 47 con ficha.

### El Óscar, completo de verdad

El dataset no solo perdía nominadas recientes: le faltaba hasta **Forrest Gump como ganadora**, y La La Land, Top Gun: Maverick, The Holdovers, Killers of the Flower Moon… La causa es fina: en Wikidata, la nominación al Óscar la tienen los *productores*, no las películas. Regenerado contra los artículos de las 98 ceremonias de Wikipedia: 621 filas, 98 ganadoras, las cuatro galas recientes con sus 10 nominadas, y un agente verificándolo después contra fuentes (que además cazó dos años mal y un director espurio, heredados de Wikidata).

### La cuarentena, sin códigos

Los criterios se eligen por **nombre**: escribes «hindi» o «Taiwán», pulsas el chip, y listo — con buscador, sugerencias y los nombres en el idioma de la interfaz (los saca el navegador, sin datasets que mantener). Por debajo se guardan los mismos códigos de siempre: el motor y las copias no se enteran. Y la bandeja de pendientes dice «idioma hindi», no «idioma hi».

### Más emparejado fino

- Para filas sin director (las listas viejas de Sundance), el título es la única prueba y ahora se exige clavado — con tres tolerancias medidas: las erratas de letras dobladas («Angelo azzuro»), los subtítulos de verdad («Personal Velocity: Three Portraits», y un ordinal NO es un subtítulo: Halloween II no cuela), y el título internacional en inglés exacto («Three Seasons», que en TMDB es «Ba mùa»).
- Los apellidos transliterados del francés pliegan sus dígrafos («Chukhrai»/«Tchoukhrai», el del palmarés de BAFTA) — pero solo cuando pliega un lado: Boucher y Butcher siguen siendo dos personas.
- Los espacios finos y los marcadores de idioma de Wikipedia ya no rompen títulos («Veni Vidi Vici»), y los bloques de cortos de Orizzonti 2026 ya no se cuelan como películas.

### Y además

- Los pesos de las cinco señales del detector de emergentes tienen interfaz en Ajustes → Automatismos (vacío = de fábrica).
- En la ficha de cualquier película, todos los nombres de dirección y reparto son clicables aunque no estén en tu biblioteca; en Cine venidero, igual.
- «Actualizar todo» ya no dice «sin configurar» cuando un paso semanal simplemente no toca esta semana: dice «al día» y cuándo fue la última vez.
- Cuatro agentes (dos probadores en bucle, un revisor adversarial y un verificador de datos) repasaron el conjunto: todas las rutas pintan en los dos idiomas, y sus once hallazgos están arreglados y fijados con tests. La suite pasa de 234 a 253.

## Beta 1.10 (1.0.10-beta) — 2026-08-09

**La auditoría de cuatro agentes sobre el emparejado, y los nombres clicables.**

Cuatro agentes recorrieron TODAS las secciones de Festivales y premios contra TMDB real —1.240 fichas entre competiciones, secciones de debut, premios y cánones—. Encontraron un fallo de parseo que llevaba ahí desde el principio y un agujero de verificación. Todos los hallazgos se comprobaron a mano antes de tocar nada.

### El fallo que dejaba fichas sin cartel

Cuando a una fila de Wikipedia le falta una celda, el parser suponía SIEMPRE que la que faltaba era el título original, y corría las columnas. Pero muy a menudo la que falta es el **país**, absorbido por el `rowspan` de la fila de arriba. Resultado: el campo del director acababa conteniendo el título original —`director: "Las palabras de Max"`— y, como el emparejado exige verificar la dirección, la película se descartaba. Invisible salvo por la ficha ausente.

Por número de celdas los dos casos no se distinguen. **Lo decide la cursiva**: en estas tablas los títulos van en `<i>` y las personas no. Con eso quedan a cero los directores corruptos en los cuatro palmareses grandes, y aparecen filas que antes se caían enteras (Berlinale 85 → 88, Cannes 100 → 103). Afectaba a *What Max Said*, *Red Desert*, *Last Year at Marienbad*, *The Tree of Wooden Clogs*, *The Railroad Man* y una docena más.

### Un agujero de verificación

`normName` borra todo lo que no sea `a-z0-9`, así que un nombre en japonés, cirílico, árabe o griego se normalizaba a **cadena vacía** — y «contiene la cadena vacía» es siempre cierto. Cualquier película acreditada a alguien en su alfabeto **casaba con cualquier fila de Wikipedia** y podía colar la ficha de otra. Sin letras que comparar no hay verificación: ahora se dice que no.

### El emparejado, cerrado: 263 de 264 en el canon

Comprobado contra TMDB real por el endpoint, no simulado. Cuatro causas distintas, todas arregladas:

- **El corte de candidatos tiraba el año.** Se pedía «The Leopard» con año 1962 y luego se cortaba la lista a diez **por popularidad**, así que *Il gattopardo* se caía por el corte y nadie llegaba a comprobar su dirección. Ahora se ordena por año y título antes de cortar, y se prueban los años vecinos (el BFI fecha por producción y TMDB por estreno comercial).
- **El nombre de quien dirige.** «Charles Chaplin» contra «Charlie Chaplin» tiraba todas las de Chaplin. También «The Wachowskis», «Larissa/Larisa» y «Forough/Forugh». Y TMDB acredita a Wang Bing como **王兵**: ahora se transcribe con el mismo mecanismo que ya usaba la app para los títulos.
- **Buscar dentro de la filmografía del director**, cuando por título no sale. Así aparecen *L'Intrus* (entre doce «The Intruder») y *Tie Xi Qu*. Se prueban VARIAS personas por nombre: hay cuatro «Wang Bing» en TMDB y el bueno no es el más popular.
- **Lo que NO se acepta:** «la única película suya de ese año». Con esa regla *Twin Peaks: The Return* —que es una serie— se emparejó con *Trial*, otro trabajo de Lynch. Fuera: sigue mandando «mejor sin ficha que la ficha de otra». Las series del canon ahora se marcan como tales en vez de dejar un hueco que parece avería.

### Secciones nuevas

- **Cannes · Un Certain Regard**: la segunda competición oficial, y donde más nombres nuevos con recorrido aparecen. Comprobada contra Wikipedia de 2010 a 2026.
- **Sundance · Competición de EE UU**: faltaba medio Sundance. La entrada anterior seguía solo el World Cinema Dramatic —el que clasifica para el Óscar—, así que el premio que ganó CODA no estaba en ninguna parte. 42 ganadoras de 1984 a 2026.
- De paso, dos fallos del parser de Sundance: **2018, 2019 y 2020 se perdían enteros** (esos años la lista usa dos puntos en vez de guion y las filas se caían en silencio, sin contar siquiera como «sin emparejar»), y el paréntesis del título original se leía como director. El palmarés internacional pasa de 19 a 22 ganadoras.

### La ganadora, marcada y la primera

Al abrir una edición de un festival, su ganadora sale arriba del todo con su 🏆, como ya pasaba con las nominadas de los premios. Antes había que irse al palmarés histórico a mirar quién ganó ese año. Sale de las filas del premio, que ya están cacheadas; las secciones sin palmarés propio —Busan, Horizontes, las de debut— no marcan a nadie.

### El nombre de cualquier director, clicable

Da igual que esté en tus favoritos, en tu biblioteca o en ninguna parte: el nombre de quien dirige una película de Cannes lleva a su ficha, con su filmografía y su botón de seguir. La ruta admite el id local, el de TMDB o **solo el nombre**, que es todo lo que dan las tablas de Wikipedia, y se resuelve AL PULSAR: enlazar los doscientos nombres de un canon no cuesta ni una petición hasta que se usa uno.

Tests 230 → 234.

## Beta 1.09 (1.0.9-beta) — 2026-08-09

**El logotipo entero, y la razón de fondo por la que faltaban carteles.**

### El emparejado buscaba en el idioma equivocado

Ramón mandó una captura del canon de Sight & Sound con ocho fichas sin cartel. El diagnóstico partió el fallo en dos, y ninguna de las dos mitades era lo que parecía.

- **Cinco fallaban por el IDIOMA DE LA BÚSQUEDA, y esto afectaba a todo, no solo al canon.** `tmdbGet` manda `language` en todas las llamadas, y TMDB compara la consulta contra el título original y contra el traducido al idioma que pidas, **pero no contra el inglés**. Con la interfaz en español, buscar «The Leopard» devolvía «El hombre leopardo», «The Leopard Lady» y «The Leopard Son» —las que de verdad se llaman así en español— y nunca «Il gattopardo». Como todos los cánones y todas las tablas de Wikipedia están escritos en inglés, **ninguna película con título original en otra lengua podía encontrarse jamás**. Ahora hay una vuelta extra en inglés: en festivales y cánones entra cuando la lista se queda corta (allí la verificación de dirección sigue filtrando), y en la resolución de Letterboxd solo cuando no se ha encontrado nada, porque ahí no hay verificación detrás y lo único que puede hacer es sumar.
- **Tres fallaban por el NOMBRE DE QUIEN DIRIGE.** «The Wachowskis» contra «Lana / Lilly Wachowski», «Larissa» contra «Larisa», «Forough Farokhzad» contra «Forugh Farrokhzad». La comparación tolera ahora el artículo suelto, el plural de un colectivo, las letras dobles que cada fuente transcribe a su manera desde el ruso o el persa, y como último recurso una letra de diferencia en palabras largas. No relaja la regla de «mejor sin ficha que la ficha de otra»: esa comparación no elige película, solo confirma una que ya coincidió en título y año.
- Al reescribir la comparación hice la abreviatura bidireccional y **«Carla Theron» empezó a colar como «Carl Th. Dreyer»**. Lo cazó su propio test. Solo el token largo puede empezar por el corto («Theodor» por «Th.»), nunca al revés.

Cachés `movie_cands2` → `movie_cands3` y `festival` v7 → v8, para que se reintente todo lo que quedó guardado como «sin ficha en TMDB».

### El logotipo

Se cambia el nombre suelto por el logotipo del pliego de marca: el símbolo hace de inicial y el texto no repite la P ni la F, así que se lee **POWA / FLEX**. En la barra lateral va la versión apilada y en la de móvil la de una línea, que es para lo que existe.

- No es una imagen sino tres piezas montadas —el monograma, el texto y una **X de película en SVG**, dos tiras perforadas cruzadas—, así que queda nítido a cualquier tamaño.
- La tipografía va **fijada a Archivo Black** y no usa la clase `font-display`, porque esa variable cambia con el aspecto: en Cinemateca es una Bodoni con serifas, y el logotipo tiene que ser el mismo dibujo en los tres. Lo único que cambia es la tinta.
- El símbolo usa una copia de `icon.png` **recortada a sangre**. El icono lleva un 16,6 % de aire transparente a los lados —lo necesita como favicon— y dentro del logotipo ese aire abría un hueco entre la P y «OWA» que rompía la palabra.
- El logotipo es de una sola tinta, como manda el pliego: se va el «Flex» en dorado.

Tests 226 → 228.

## Beta 1.08 (1.0.8-beta) — 2026-08-09

**Detector de directores emergentes, y la cuarentena pre-Radarr terminada.**

### Directores emergentes

Quién puede ser un grande dentro de diez años. La ventaja injusta es que PowaFlex ya tiene parseadas y cacheadas las tablas de selección oficial de los festivales: ahí es donde aparecen los grandes antes de serlo, así que el detector se apoya en eso y no en notas agregadas.

- **Cinco secciones de DEBUT nuevas en el registro** (`festivals.js`), que es el mayor salto de calidad de la señal: Semana de la Crítica y Quincena de Cannes, Orizzonti de Venecia, Perspectives/Encounters de la Berlinale y Nuevos Directores de San Sebastián. Hasta ahora solo se parseaba la competición principal, que es justo donde los emergentes **todavía no están**. Los nombres de sección se comprobaron uno a uno contra los artículos de 2010 a 2026: la Berlinale cambió Encounters por Perspectives en 2025 y Venecia titula la suya «Horizons (Orizzonti)» en los artículos viejos. Salen también en la página de Festivales, en su propia fila, y como fuente de regla.
- **Módulo `emergentes.js`** con cinco señales: consagración institucional (la que más pesa; la **segunda** selección vale más que la primera y ganar dobla la plaza), consenso crítico, tracción real de Letterboxd con los votos de IMDb como umbral de ruido, aceleración (¿la segunda película sube en nota, volumen y nivel de festival?) y afinidad con lo que tú puntúas alto según la procedencia del director.
- **«Sin dato no es cero».** La señal que no tiene datos sale del reparto y las demás se reparten su peso, para que un debut sin Metacritic no quede por detrás de una película mediana solo porque de la mediana haya más datos. Sin esto el detector premiaría lo más documentado, que es lo anglosajón.
- **La ficha enseña el desglose**: cuántos puntos pone cada señal y con qué datos («Cannes · Semana de la Crítica 2025 🏆 · Busan 2021», «Metacritic 79 de media», «Letterboxd 3,9 con 18.400 marcas»). Sin desglose es un oráculo y de un oráculo no te fías. El servidor manda las piezas y las frases se componen en el cliente, así que la página se lee igual de bien en inglés.
- **Página `/emergentes`** con parrilla, ★ de seguir (por id de TMDB ya verificado, no por nombre: resolverlo otra vez sería arriesgarse al homónimo), ✕ con deshacer, filtros de continente, país y sexo, y cuatro ordenaciones.
- **Elegibilidad**: de uno a tres largometrajes estrenados, primer largo en los últimos ocho años, vivo, y ni seguido ni descartado. Los cortos, telefilmes y documentales no propios se descuentan con `enrichRuntimes`, que es lo que impide que un debutante parezca prolífico.
- **Paso nocturno semanal** detrás de la vigía de festivales, que es cuando las ediciones ya están en caché. Tope de 90 personas resueltas contra TMDB por pasada, y **lo que el tope deja fuera se dice en el informe**: un tope silencioso se lee como «no había nadie más».
- **Tipo de regla `emergentes`** en el motor de Radarr: «mándame la ópera prima de todo emergente con 70 o más». Su umbral es el del detector —la persona— y no la Σ de la película, y la interfaz lo dice para que no se confundan.
- Las dos tablas (`emerging_directors`, `emerging_signals`) son **reconstruibles enteras**; la ✕ vive aparte, en `emerging_dismissed`, para que una reconstrucción no resucite a quien ya dijiste que no.

### Cuarentena pre-Radarr, terminada

- **El aviso.** Lo que cae en cuarentena se anuncia en las novedades del Dashboard y pone un contador ámbar en Ajustes. Una bandeja metida en una pestaña de Ajustes que nadie mira no sirve de nada.
- **El recuento sale en el pase nocturno**: una noche que aparta diez películas ya no se lee igual que una noche sin novedad.
- **Cartel, y el motivo traducible.** El motivo viaja partido (`idioma` + `hi`) en vez de como frase hecha en castellano, así que la bandeja se lee en inglés. Y decidir «esta sí, esta no» sobre un título que no conoces necesita ver el cartel.
- **Aprobar y vetar en bloque**, porque una regla sobre un país entero deja veinte esperando en una noche y de una en una la bandeja se abandona. Aprobar en bloque no se detiene en el primer fallo, y lo que Radarr rechazó se queda en la bandeja y se dice cuántas.
- **La bandeja se purga sola** de lo que acabaste teniendo en Plex o en Radarr por tu cuenta y de lo que vetaste o descartaste en otra pantalla. Pedirte permiso para bajar algo que ya bajaste se lee como una avería.
- Las casillas de criterios devuelven **lo que escribiste** («IN»), no la lista normalizada («in»).

### De paso

- **Una fila-cabecera dentro de una tabla de Wikipedia ya no se cuela como película fantasma.** Las secciones paralelas de Cannes parten su tabla con filas de una sola celda («In Competition», «Feature films») y esas se estaban buscando en TMDB como si fueran títulos.
- Los continentes (`Europa`, `Sudamérica`, `África`) ya se traducen: afecta también a los filtros de Personas, que comparten diccionario.

Tests 187 → 222.

## Beta 1.07 (1.0.7-beta) — 2026-08-09

**Reglas automáticas a Radarr.** El pase automático dejaba de ser un interruptor único —«los estrenos de mis directores favoritos»— y pasa a ser un motor de reglas: cada una vigila una cosa, se activa y se afina por separado, y se pueden tener todas las que se quieran.

- **Tres clases de regla.** *Festivales, premios y cánones*: los 16 del registro, cada uno con las vistas que de verdad tiene (Busan y Horizontes Latinos no ofrecen palmarés porque no lo tienen; Sight & Sound no ofrece edición por año; los premios ofrecen nominadas por año y ganadoras). *Estrenos*: las cuatro pestañas de cines y plataformas de España y EE UU. *Mis favoritos*: los seis oficios por separado, así que se puede seguir lo que dirige uno y lo que compone otro sin mezclarlos.
- **Un umbral Σ de 0 a 100 por regla, con barrita.** En 0 no filtra: entra todo, tenga nota o no —hay a quien le interesa el palmarés entero y punto—. Con umbral, lo que aún no tiene nota **espera** a la siguiente pasada en vez de irse a ciegas, y hay una casilla para quien prefiera lo contrario.
- **Los estrenos se vigilan una quincena antes y después de su fecha** (configurable). Mientras dura esa ventana, cada noche se vuelve a mirar su nota: entran el día que cruzan el umbral, no el día que se anuncian.
- **Tope por pasada**, 20 por defecto. Un palmarés histórico son cientos de películas: sin tope, la primera noche te llena el disco.
- **El auto-Radarr de siempre se migra a una regla** conservando tu horizonte, tu retrovisor y tus documentales, sin umbral y sin tope, que es como estaba. Si lo tenías apagado, nace apagada.
- **Cada pasada explica lo que NO hizo**: ya la tienes, vetada, descartada, corto, documental, telefilme, papel testimonial, fuera de la ventana, esperando nota, bajo el umbral, aplazada por el tope. Un «0 añadidas» a secas es indistinguible de una avería.
- **Historial de 30 días con un 🚫 por película.** Como las reglas se reevalúan cada noche, borrar algo de Radarr a mano no basta: volvería. El 🚫 del historial es lo que hace que no vuelva por ninguna regla.

**Ajustes, por pestañas.** La página había llegado a quince bloques y once pantallas de scroll, con la numeración «1 · Plex … 6 · Descubrir huecos» rota por en medio y el botón de guardar enterrado a dos tercios. Ahora son cinco pestañas —Conexiones, Fuentes y notas, Automatismos, Interfaz y Mantenimiento— con «Actualizar todo» fuera de ellas y la barra de guardar fija abajo, que dice si hay cambios pendientes. Ninguna pestaña pasa de tres pantallas salvo Automatismos.

- **Arreglado de paso: los ajustes de la copia automática no se podían guardar.** Vivían por debajo del único botón de guardar de la página, así que marcabas la casilla de la copia nocturna y no pasaba nada.
- Los enlaces de otras páginas aterrizan en su pestaña: el ⌘K y la vieja ruta `/letterboxd` van a Fuentes, los pasos de puesta en marcha de «¿Qué es PowaFlex?» a Conexiones, y «Últimas peticiones a Radarr» del Dashboard a Automatismos.

**Últimas novedades.** Página nueva en el menú (y detrás de la placa de versión de abajo a la derecha) con lo que trae cada versión, en cristiano. No confundir con las «🔔 Novedades» del Dashboard, que son cosas que pasan en tu colección.

**Lo que encontró la revisión adversarial.** Antes de dar el lote por bueno, dos rondas de agentes atacando el código con cinco ángulos distintos y dos escépticos verificando cada hallazgo. De los 40 confirmados, los que importaban:

- **El 🚫 no existía donde hacía falta.** El veto solo se podía poner desde Cine venidero, así que una película que entraba por una regla de festival volvía cada noche para siempre — y el propio aviso de la interfaz decía lo contrario. Ahora está en el historial de reglas.
- **La reevaluación nocturna del umbral era una promesa falsa.** Las notas solo se pedían de lo que no tenía fila en la caché, y eso incluye la caché negativa: una película vista sin Σ la primera noche se quedaba sin nota para siempre. Ahora se vuelven a pedir las que siguen sin Σ y llevan más de tres días sin comprobarse, y si no se puede —sin clave de MDBList, cupo agotado— se dice en vez de callar.
- **Vaciar «Tope por pasada» dejaba la regla sin tope.** La cadena vacía se convertía en 0, y 0 significa ilimitado: borrar la casilla para reteclearla te dejaba una regla capaz de vaciarte el disco.
- **El guardado de las tarjetas perdía cambios**: tocar dos ajustes seguidos guardaba solo el segundo, y salir de Ajustes en el medio segundo siguiente tiraba el cambio. Ahora se acumulan y se vuelcan al salir.
- **En las reglas de festival los filtros de tipo eran decorativos.** Las fichas de Wikipedia no traen duración ni géneros, así que «Incluir documentales» no hacía nada y entraban cortos y telefilmes.
- **Con Radarr a medias** (URL y clave pero sin perfil de calidad) las reglas corrían enteras cada noche sin añadir nada y el resumen decía «0 añadidas de 20 candidatas». Ahora se comprueba antes de gastar la pasada.
- **Una pasada que reventaba se registraba como paso nocturno correcto.** Y si fallaban todas las altas, el error de la vez anterior se borraba.
- **La pasada ya no se sirve dentro de la petición HTTP**: un palmarés entero se comía el tiempo de espera de cualquier proxy inverso con un 504 mientras Radarr seguía recibiendo altas.
- **Seguir a un actor te descargaba sus cameos**, incluido cada documental donde sale tres segundos.
- **La migración se quemaba en el primer arranque** aunque no hubiera nada que migrar, así que restaurar después una copia de ajustes con el auto-Radarr encendido ya no la aplicaba nunca.
- Una regla de «Mis favoritos» con umbral no habría añadido nada jamás: la película salía de candidatas justo el día en que podía tener nota.

Tests 153 → 177.

## Beta 1.06 (1.0.6-beta) — 2026-08-07

**Lo que destapó la auditoría.** Cuatro revisores independientes repasaron la 1.05 entera —código,
interfaz en los dos idiomas y la actualización sobre una base reconstruida con 13.000 películas—
y encontraron 37 cosas. Esto arregla las que importan.

- **Cine venidero ya vigila los seis oficios.** Solo miraba dirección e interpretación: si seguías
  a una compositora o a un director de fotografía, su próxima película **no aparecía nunca** — y
  encima costaba una consulta a TMDB cada noche para tirar el resultado.
- **El auto-Radarr ya no se cuela por los oficios nuevos.** Su consulta no filtraba por faceta, y
  su rama de «favoritos sin títulos en tu biblioteca» es justo la única forma de seguir a un DoP o
  a un montador: si esa persona había dirigido algo, el pase nocturno **te lo descargaba** sin que
  hubieras seguido a nadie como director.
- **El corrector de emparejado de personas ya se puede deshacer.** La ficha perdía por el camino
  el dato de «corregido a mano», así que el botón para volver al emparejado automático no se
  pintaba nunca: una corrección equivocada era permanente.
- **Quitar a alguien de favoritos con un oficio inválido ya no lo borra entero.** Antes caía en
  «la persona entera» y además la metía en la lista de vetados; ahora responde con un error.
- El **sector «resolución desconocida»** del donut de Calidad llevaba a una biblioteca vacía.
- Los **nombres de festivales y premios** ya se traducen: la página en inglés mostraba «PREMIOS
  GOYA» y «ÓSCAR A LA MEJOR PELÍCULA» entre texto inglés.
- **Seguir a alguien que solo existe en TMDB** lo metía en Actores en vez de en Directores.
- El **alta masiva de guionistas** daba de alta a gente que la parrilla no enseñaba (los que
  también dirigen).
- **Índice nuevo** para las consultas que filtran por oficio: recorrían la tabla de créditos
  entera, que en una biblioteca grande son cientos de miles de filas.
- Una **sincronización ya no puede arrancar en mitad de «Actualizar todo»**, donde los dos
  reescribían los títulos a la vez.
- La **copia de seguridad** ordenaba mal dos copias del mismo día y podía borrar la más fresca.
- La **importación de IMDb** ya no bloquea la petición (daba 504 con un proxy delante) ni registra
  un falso «0 títulos» cuando ya había una en marcha.
- El cortafuegos contra peticiones de otras webs ya no acepta cualquier elemento de la cabecera
  `X-Forwarded-Host`, solo el primero.

Tests 148 → 153, con red nueva para la migración destructiva de la 1.05, para el calendario y
para el auto-Radarr.

## Beta 1.05 (1.0.5-beta) — 2026-08-07

**Fuera los subtítulos.** La auditoría de subtítulos que estrenó la 1.04 se retira entera: Bazarr
ya hace ese trabajo y tener dos sitios diciendo cosas parecidas confundía más que ayudaba.

- Desaparecen la **pestaña Subtítulos** del Taller, el criterio de idiomas de Ajustes, la
  auditoría de audio en versión original y la integración con **Bazarr** (que solo existía para
  pedirle búsquedas de subtítulos).
- El sync **vuelve a leer solo la pista de vídeo**, como antes de la 1.04: nada de guardar las de
  audio y subtítulo. Al arrancar se borra la tabla `movie_streams` —en una biblioteca grande eran
  más de cien mil filas de dato muerto— y se limpian los ajustes que quedaban huérfanos,
  **incluida la API key de Bazarr**, que si no se quedaría guardada sin dueño ni forma de borrarla.
- Se retira también el paso nocturno que resolvía el idioma original de cada película, que solo
  servía para el criterio «versión original».
- Un marcador viejo a `/taller?tab=subs` no se rompe: cae en «Calidad y disco».

Todo lo demás de la 1.04 sigue igual: los cuatro oficios nuevos, las notas de IMDb, la copia de
seguridad automática, el veto al auto-Radarr y los mensajes del servidor en inglés.

## Beta 1.04 (1.0.4-beta) — 2026-08-06

**El archivo y los oficios.** La versión más grande desde la reorganización: PowaFlex ya sabe si
puedes ver de verdad lo que tienes, sigue a más gente que a directores y actores, y se hace su
propia copia de seguridad.

- **Subtítulos y audio, con criterio tuyo.** El sync ya descargaba las pistas de cada fichero y
  las tiraba: ahora se guardan. En Ajustes eliges qué subtítulos te valen —**versión original,
  español, inglés, en cualquier combinación**— y el Taller estrena tercera pestaña con lo que no
  llega a ese listón, filtrable y con el botón para que **Bazarr** los busque, suelto o en bloque.
  De regalo, la auditoría hermana: películas sin pista de audio en su idioma original.
  Ojo: las pistas solo llegan al sincronizar el detalle, así que hace falta una
  **re-sincronización completa** para analizar lo que ya tenías. La página lo avisa y no cuenta
  como «sin subtítulos» lo que aún no ha mirado.
- **Cuatro oficios nuevos**: guion, dirección de fotografía, música y montaje, con seguir, huecos
  y completismo, y su faceta propia en Favoritos y en Descubrir. La **dirección conserva el lugar
  central**: abre por defecto y mantiene su tratamiento; los demás van agrupados detrás. Los tres
  que Plex no registra no tienen ranking «top de tu biblioteca» —no habría de dónde sacarlo— y
  ofrecen búsqueda por nombre en TMDB.
- **Notas de IMDb en local**: un volcado semanal de 8 MB que se suma a TMDB y Letterboxd como
  tercera fuente del umbral de ruido de Descubrir, sin gastar ni una petición de API.
- **Copia de seguridad automática** al final del pase nocturno, con rotación de las últimas N.
  Viene apagada; enciéndela en Ajustes.
- **Veto al auto-Radarr por película**: un 🚫 en cada ficha de Cine venidero para que el pase
  automático no la coja. Y los descartes (✕ «no me interesa») **también** lo bloquean ahora: antes
  podías descartar una película y encontrártela descargada esa misma noche.
- Los **mensajes del servidor** (errores, validaciones) ya se traducen al inglés.
- La ventana del pase nocturno se amplía a las 06:00: si a las 03:00 había una sincronización en
  marcha, antes se saltaba el día entero sin reintentarlo.

## Beta 1.03 (1.0.3-beta) — 2026-08-06

**Estrenos: plataformas y VOD, ahora también de EE UU.** La pestaña de plataformas pasa a
llamarse «Plataformas y VOD» y deja de ser solo un nombre: el alquiler y la compra ya se ven y se
filtran. Y hay una cuarta pestaña con lo mismo para Estados Unidos.

- **Nueva pestaña «Plataformas y VOD · EE UU»**: estrenos digitales de la región US con su propio
  «dónde verla» (Max, Hulu, Peacock, Criterion Channel…). No cuesta ni una llamada más a TMDB: la
  caché de proveedores es por película y ya guardaba todas las regiones.
- **El VOD deja de ser un sí/no.** Antes, una película que solo se alquilaba ponía
  «alquiler/compra» sin decir dónde, y no aparecía en el desplegable de plataforma. Ahora se
  recogen los **nombres** de dónde se alquila o compra, la ficha los muestra («VOD: Apple TV», en
  tinta más apagada para distinguir lo que se paga por título de lo que ya tienes con tu
  suscripción) y el filtro —ahora «Plataforma o VOD»— busca en ambas.
- La caché de estrenos sube a v2: al actualizar, cada pestaña se reconstruye una vez para traer
  los datos nuevos.

## Beta 1.02 (1.0.2-beta) — 2026-08-06

**Arreglo urgente de la 1.01: tres páginas rotas.** Taller, Descubrir huecos y Estrenos morían
al abrirlas («This page has broken · e is not a function»), en los dos idiomas.

- Las tres pintaban sus pestañas con `TABS.map(([t, label, Icon]) => … t(label) …)`: la clave de
  la pestaña se llamaba igual que la función de traducción `t()` introducida en la 1.01, así que
  al pintar se intentaba llamar a una cadena de texto. Renombrada la variable en las tres.
- **Prueba de regresión nueva** (`server/test/i18n-shadow.test.js`): recorre `web/src` y falla si
  alguna variable local llamada `t` tapa la función de traducción dentro de un ámbito donde se
  llama a `t(...)`. Verificada reintroduciendo el fallo. Suite 125 → 126.

## Beta 1.01 (1.0.1-beta) — 2026-08-06

**PowaFlex habla inglés.** Nuevo selector de idioma de la interfaz (ES/EN) en Ajustes, separado
del idioma de datos de TMDB: solo cambia los textos de la app, no las sinopsis ni los títulos.
Además, la publicación de la imagen Docker se moderniza.

- **Selector de idioma ES/EN** en Ajustes (junto al tema visual). El ajuste `ui_language` vive en
  el servidor —te sigue en todos tus dispositivos y entra en el export/import de ajustes— y se
  espeja en el navegador para pintar en el idioma correcto desde el primer frame. Cambiarlo
  recarga la página y toda la interfaz cambia de golpe.
- **Traducción completa de la interfaz al inglés**: las 13 secciones, la paleta ⌘K, los avisos,
  tooltips, filtros y los textos largos de ayuda (~1.100 cadenas). Las fechas y números se
  formatean según el idioma (es-ES / en-GB). El castellano sigue siendo el idioma por defecto y
  no cambia ni una coma.
- Lo que genera el **servidor** (mensajes de error, avisos de tareas, textos de Novedades) sigue
  en castellano de momento; es candidato para una próxima versión.
- **CI**: las GitHub Actions del workflow de Docker suben a sus versiones sobre Node 24
  (`checkout@v7`, `setup-qemu@v4`, `setup-buildx@v4`, `login@v4`, `metadata@v6`,
  `build-push@v7`) — desaparece el aviso de deprecación de Node 20 en los runners.

## Beta 1.00 (1.0.0-beta) — 2026-08-06

**La gran reorganización.** Mismas funciones, la mitad de menú: la app se agrupa en 13 secciones
(5 + 6 + 2), juntando lo que compartía dominio, estrenando la sección Estrenos y llevando los
filtros a donde faltaban. Los marcadores viejos siguen funcionando: `/calidad`, `/salud`,
`/colecciones`, `/directores` y `/letterboxd` redirigen a su nuevo hogar.

- **Filtros demográficos en «Directores/as top» y «Actores/actrices top»** (Descubrir huecos):
  los mismos selectores que la página Personas —género, vivos/fallecidos, continente y país de
  nacimiento— acotan el ranking de los más presentes en tu biblioteca, aplicados en el servidor
  («Ver más» recorre el ranking ya filtrado). Sirven para cazar huecos de «mis directores top
  españoles», «mujeres directoras» o «cineastas asiáticos» sin salir de la pestaña.

- **Taller** (nuevo): Calidad y disco + Salud de los datos, juntas bajo un techo con pestañas.
  Compartían dominio (Radarr, duplicados, ficheros) y hasta bloques duplicados.
- **Directores y actores** gana la ★ de seguir en cada tarjeta y el alta en bloque de «los N
  primeros» con previsualización (que vivían en el ranking de Favoritos, ahora retirado por
  duplicado — allí queda un puente).
- El catálogo de **Directores en activo** se muda a **Favoritos → Añadir**, desplegable bajo
  «Añadir directores en activo»: es una herramienta de captación de favoritos, no un listado de
  tu biblioteca.
- **Descubrir huecos** absorbe **Sagas** como quinta pestaña, y sus pestañas van ahora en la URL
  (se puede enlazar `/descubrir?tab=sagas`).
- **La página Letterboxd se disuelve**: el importador (zip + RSS) es configuración y se muda a
  Ajustes; «tus notas vs. la comunidad» se muda a Visionado; y la watchlist se muda a Listas y
  retos — donde por fin gana botón de Radarr en lo que te falta (era la única lista de faltantes
  sin él).
- **Estrenos** (sección nueva en La caza, bajo Festivales): qué acaba de llegar y qué viene a los
  **cines de España**, a los **cines de EE UU** y a las **plataformas españolas**. La lista sale
  del discover de TMDB por región y tipo de estreno (la fuente consistente de fechas por país); la
  pestaña de plataformas usa la fecha de estreno digital y enseña **dónde verla** con los watch
  providers de TMDB (datos de JustWatch licenciados), con filtro por plataforma concreta. Solo
  cine largometraje: fuera series, cortos, telefilmes y vídeos. Ventana de 7/30/90 días más los
  próximos 60, y todos los filtros de la casa: **listón Σ de MDBList** (lo aún sin nota no se
  oculta), tipos, Me faltan / Las tengo, orden por Σ/popularidad/fecha/votos, descarte ✕
  compartido con Descubrir, y Radarr suelto o en bloque sobre lo visible.
- **⌘K busca de todo**: además de películas y personas, ahora sagas, listas seguidas, festivales y
  premios, y saltar a cualquier sección — con navegación por teclado (↑/↓/Enter) y búsqueda
  insensible a acentos.
- **Biblioteca**: filtro por **colección de Plex** (el servidor lo sabía desde siempre y ninguna
  página lo enseñaba), **rango de años** (desde/hasta), y el chip del filtro de persona ya dice
  «Persona: Agnès Varda (dirige)» en vez de un id numérico crudo (y al quitarlo limpia también el
  rol).
- **Festivales**: filtros de contenido nuevos —Todas / Me faltan / Las tengo y el listón de nota
  mínima Σ— y los botones masivos («mandar a Radarr», «seguir a sus directores») cuentan solo lo
  visible, como en Descubrir. El corrector de emparejado ✎ ahora es el diálogo compartido de toda
  la app (busca solo al abrirse, con el año de la edición).
- **Homogeneización**: el listón «Nota mínima Σ» y el desplegable de filtros son ahora componentes
  únicos compartidos (vivían copiados en Descubrir, la ficha de persona y varios selects crudos);
  código muerto retirado del Dashboard.
- About reescrito a la nueva taxonomía, con la ruta de primeros pasos actualizada.

## Alpha 0.9.16 (0.9.16-alpha) — 2026-08-05

- **«Personas con emparejado sin demostrar» ya no alarma de más.** Ese número juntaba dos cosas
  muy distintas: las que se comprobaron y no se pudo demostrar quiénes son (ahí sí puede haber un
  homónimo) y las que **nadie ha mirado todavía**, que son casi todas. Añadir a alguien a
  favoritos, o volcar un canon entero, le pone su ficha de TMDB pero no comprueba nada: la
  identidad solo se verifica cuando algo necesita su filmografía. Por eso salían nombres tan poco
  ambiguos como Angelina Jolie o Ian McKellen. Ahora Salud de los datos enseña las dos cifras por
  separado y marca cuáles se comprobaron de verdad.
- **Botón «Comprobar ahora contra TMDB»** en ese mismo panel: busca y verifica de una tacada todas
  las que están pendientes, empezando por las que más películas tuyas tienen, con barra de
  progreso y sin bloquear la app. Al terminar, la auditoría se recalcula sola.
- **Menos fichas de director sin foto.** La comprobación por fecha de nacimiento que estrenó la
  0.9.15 exigía que TMDB tuviera esa fecha, y no la tiene de muchísimos cineastas fuera del
  circuito anglosajón: a esos los descartaba aunque no hubiera ningún homónimo que se los
  disputara. Ahora la fecha sirve para **descartar a quien la contradice**, no como requisito, así
  que Wang Bing, Pedro Costa o Carla Simón vuelven a salir con su cara. El homónimo famoso sigue
  fuera, porque ese sí tiene fecha y no cuadra.

## Alpha 0.9.15 (0.9.15-alpha) — 2026-08-05

Dos arreglos de identidad en el catálogo de directores, los dos reportados desde la 0.9.14.

- **Ya no se cuela el homónimo famoso.** A Steve McQueen (el director de *12 años de esclavitud*)
  se le ponía la cara del actor de *Bullitt*, muerto en 1980 — y, peor, seguirle metía al ACTOR en
  tus favoritos, en Cine venidero y en Descubrir huecos. La culpa era de resolver por popularidad:
  el actor gana por goleada. Ahora, cuando se empareja un director del catálogo con su ficha de
  TMDB, **se comprueba que el año de nacimiento cuadre** con el que trae el catálogo; quien no
  cuadre queda descartado por popular que sea, y si nadie cuadra no se pone foto, que es mejor que
  poner la cara de otra persona. También se descarta a quien murió antes de su última película.
- **Los nombres con ł, ø, ı o İ vuelven a casar.** Wikidata escribe «Małgorzata Szumowska» y TMDB
  guarda «Malgorzata Szumowska»; esas letras no son una letra con acento sino letras propias, y al
  limpiar el nombre **desaparecían** en vez de convertirse en su equivalente. Resultado:
  Szumowska, Paweł Pawlikowski, Mia Hansen-Løve e İlker Çatak salían como no seguidos aunque
  estuvieran en favoritos, y al pulsar su estrella se decía que no tenían ficha en TMDB. Afectaba
  también al emparejado de sus películas en Festivales, que se quedaban sin ficha.
- De paso, el aviso al seguir a alguien deja de mentir: cuando ya estaba en favoritos lo dice, en
  vez de dar a entender que no se encontró en TMDB.

## Alpha 0.9.14 (0.9.14-alpha) — 2026-08-05

- **Directores en activo: una página nueva con 680 nombres.** Directores y directoras con obra
  reciente, sacados de Wikidata, con su país, su edad, cuántos largometrajes llevan, en qué años
  ha ido su carrera y qué han ganado. Filtra por región, país, sexo/género y actividad —el
  desplegable de país se acota solo a la región elegida y lleva el recuento— y ordena por
  importancia, prestigio, impacto, número de largometrajes, taquilla, edad, debut más reciente o
  alfabéticamente. La estrella de cada ficha lo manda a tus favoritos, y hay un botón para añadir
  de golpe todos los que deje el filtro.
  - Un conmutador **«solo los que no sigo»** para no repasar a quien ya tienes.
  - Cada ficha lleva la **foto de TMDB**, que se busca solo de lo que estás viendo (y se recuerda
    treinta días): abrir la página no cuesta ni una llamada de más.
  - La **importancia** es 60 % prestigio y 40 % impacto, y la página lo explica donde se lee, con
    sus limitaciones: es una convención operativa, no un juicio de valor.
- **Los cuatro paquetes de directores escritos a mano** («españoles», «premiados en festivales»,
  «emergentes», «taquilleros») **desaparecen**: eran veinte nombres fijos cada uno y las cuatro
  ideas salen ahora del catálogo con un filtro y un orden, sobre datos de verdad. Siguen «en boga»
  (que cambia día a día), los habituales de Cannes/Venecia/Berlín y los cánones.
- **Corrector manual de emparejado para personas y películas.** Cuando PowaFlex confunde a alguien
  con su homónimo —o Plex identifica una película con la ficha de otra— ahora lo arreglas tú: un
  ✎ en la ficha de persona, en el aviso de Favoritos y en la ficha de cualquier película de tu
  biblioteca. Lo que elijas se recuerda y **ningún automatismo vuelve a tocarlo**: ni la
  re-verificación semanal de personas ni la sincronización nocturna de Plex, que hasta ahora
  reescribía el emparejado de cada película en cada pasada.
- **Arreglo importante para quien use un proxy inverso** (nginx, Traefik, el de Synology): el
  cortafuegos anti-CSRF de la 0.9.13 comparaba con el nombre del contenedor y no con el que
  escribes en el navegador, así que detrás de un proxy no se podía sincronizar ni guardar nada.
  Ahora se respeta `X-Forwarded-Host`. Lo mismo rompía el entorno de desarrollo.

## Alpha 0.9.13 (0.9.13-alpha) — 2026-08-05

Versión de mantenimiento salida de una auditoría a fondo (seguridad, uso de APIs y limpieza).
**Nada cambia de aspecto ni de funcionamiento**: lo que cambia es que gasta menos red, se
defiende mejor y tiene 19 pruebas nuevas donde antes no había ninguna.

**Seguridad**

- **Actualizado el componente que sirve la web** (`@fastify/static`), que tenía un fallo conocido
  por el que se podían leer ficheros fuera de su sitio saltándose incluso la contraseña opcional.
  También al día `fast-uri` y `brace-expansion`.
- **Las peticiones que cambian algo ya no se pueden disparar desde otra web.** Un formulario en
  una página cualquiera podía hacer que tu PowaFlex sincronizara, se actualizara entero o lanzara
  altas en Radarr sin que tú tocaras nada.
- **La copia de seguridad de los ajustes guarda las credenciales de verdad**, no el texto cifrado:
  restaurarla en otra instalación dejaba tokens inservibles sin avisar.
- **Si no se pueden descifrar las credenciales** (perdiste `POWAFLEX_SECRET` o cambió), ahora se
  dice claramente en el arranque y los campos salen como vacíos, en vez de mandar el criptograma a
  Plex y recibir un «401» incomprensible.
- La dirección de Plex y la de Radarr se validan al guardarlas, y el proxy de carátulas comprueba
  que lo que llega es una imagen.

**Menos llamadas a las APIs**

- **La ficha de cada película se pedía dos veces a TMDB** (una con reparto y otra sin), aunque la
  primera ya lo traía todo. En un palmarés eran ~78 llamadas de más; con 30 directores en
  favoritos, del orden de 700 por ciclo.
- **El emparejado ya verificado de festivales dura ahora un año** en vez de caducar cada mes junto
  a la página: al mes se repetía la comprobación completa de cada película en ráfaga, que es justo
  lo que hacía que TMDB cortara el grifo.
- **Los artículos de premios de Wikipedia se descargan una vez al día**, no en cada consulta:
  pasear diez años de los Goya eran diez descargas del mismo texto, y la vigía nocturna repetía
  esas descargas todas las noches para años aún sin publicar.
- **Lo que MDBList no conoce deja de pedirse una y otra vez**: se recuerda que no lo tiene (y se
  reintenta en el barrido semanal), así que abrir un canon antiguo ya no se come 50 peticiones de
  tu cupo diario cada vez.
- Si JustWatch falla, se espera un cuarto de hora antes de reintentar en vez de repetir cientos de
  consultas fallidas; y el scraping de listas de Letterboxd respira entre páginas.
- **Cine venidero podía no añadir NADA a Radarr** si tenías más de 300 películas pendientes: el
  servidor rechazaba la tanda entera por pasarse del tope. Ahora manda las primeras 300, como el
  resto de páginas.
- Radarr: si la orden de volver a buscar una película recién salida en digital fallaba, esa
  película se quedaba sin buscar para siempre. Ahora se reintenta a la noche siguiente.

**Por dentro**

- El mismo patrón de «repartir trabajo entre varios hilos» estaba copiado a mano 23 veces, el
  bloque de «mandar a Radarr» en 6 páginas (ya con textos distintos), y el «qué día es hoy» en 7
  módulos (el pase nocturno usaba encima otro huso). Ahora hay una sola versión de cada cosa.
- **La decisión más delicada de la app** —cuál de los resultados de TMDB es la película de un
  festival— se ha separado del código de red y tiene por fin pruebas: las cuatro rondas de fallos
  que fuiste reportando (*In the Mood for Love* contra su making-of, *La infiltrada*, los cortes de
  TMDB a media comprobación…) quedan fijadas para que no vuelvan.
- Prueba también para el CSV de WebTools, cuya nota va de 0 a 10 y hay que dividir entre dos.
- Cambiar de año rápido en Festivales ya no puede dejar la parrilla mostrando otra edición, el
  corrector ✎ atrapa el foco como los demás diálogos, y Ajustes deja de preguntar dos veces por lo
  mismo mientras actualiza.

## Alpha 0.9.12 (0.9.12-alpha) — 2026-08-05

- **El top 10 anual de Cahiers du Cinéma**, año por año, en Festivales → Cánones: la lista
  ordenada de cada año (1951–hoy, empates marcados) y un palmarés histórico con la número 1 de
  cada año (66 películas). Sale de Wikipedia con un parser propio que entiende sus tablas por
  década; los años sin lista (1952–53, 1969–1980, 2003) lo explican en vez de dar error.
- **Una estrella de seguir por cada director/a**: cuando la celda trae varios nombres («Javier
  Calvo and Javier Ambrossi», «Joel and Ethan Coen»), cada persona tiene su propia ☆ y se sigue
  su perfil individual — antes la cadena entera no resolvía a nadie. El «seguir a todos» de cada
  edición también cuenta personas, apellidos compartidos incluidos.
- **Cuadros de habituales de festival** en Favoritos → Añadir directores/as: los directores/as
  con más películas en la competición de Cannes 🌴, Venecia 🦁 y Berlín 🐻 en la última década,
  con su presencia («4 en competición (2018–2026)») y botón de seguir, individual o en bloque.
  El recuento sale de Wikipedia sin gastar cuota de TMDB y se cachea una semana.
- **Repaso del móvil, página a página**: la descripción de «Actualizar todo» ya no se estruja en
  una columna de una palabra, las pestañas de Favoritos y los conmutadores de Festivales envuelven
  como botones enteros en vez de partirse en tres líneas, los buscadores de Biblioteca y Personas
  ocupan todo el ancho, las tarjetas de upgrade de Calidad no se comprimen, y la placa de versión
  flotante se oculta en pantallas pequeñas (tapaba contenido en todas las páginas).

## Alpha 0.9.11 (0.9.11-alpha) — 2026-08-03

- **La página pasa a llamarse «Festivales y premios»**, con los premios ganando su segunda vista:
  además del palmarés, las **nominadas de cada año** con la ganadora marcada (🏆) — incluidos los
  ex aequo, como el doble Goya de 2024.
- **El Óscar a la mejor película, completo**: las 600 nominadas de la historia (1927–2025) con sus
  97 ganadoras. Wikipedia retiró las tablas de ese artículo en 2026, así que viaja como dataset de
  Wikidata empaquetado con la app — con los TMDB id resueltos de origen: cero emparejado, cero
  fallos posibles.
- **Corrección manual de emparejados**: el ✎ de cada tarjeta abre un buscador de TMDB con
  carteles; eliges la ficha correcta y la corrección se recuerda para siempre (y manda sobre el
  automático). Para ese caso raro que ninguna regla cazará nunca.
- **Los «(ex-æquo)» de las tablas viejas de BAFTA ya no rompen la búsqueda**: los empates y los
  títulos originales pegados entre paréntesis en la misma celda se limpian antes de buscar
  (Ballad of a Soldier, The Hustler…).
- **Exportar favoritos a .txt** desde Favoritos: un nombre por línea, listo para pegarlo en
  «añadir por nombres» de otra instalación de PowaFlex.
- Sobre las fichas blancas en cadena que reportaste (Amour, The Artist, Cold War→otra…): eran los
  bucles de reintento y los agujeros de los sin-créditos ya corregidos en la 0.9.9 y la 0.9.10 —
  esta versión añade además una guarda para que un año roto en la tabla nunca deje como únicos
  candidatos a la morralla sin fecha.

## Alpha 0.9.10 (0.9.10-alpha) — 2026-08-03

- **Las fichas de TMDB sin equipo cargado solo valen como último recurso.** Una «Undercover»
  ajena y sin créditos se colaba por delante de *La infiltrada* de Arantxa Echevarría solo por el
  orden de búsqueda: la aceptación por título clavado de las películas recién anunciadas (sin
  equipo aún en TMDB) ahora espera a que TODOS los candidatos con créditos hayan declarado — y
  solo si ninguno demuestra su director/a entra en juego. Las ediciones y palmarés guardados se
  recalculan solos al actualizar.

## Alpha 0.9.9 (0.9.9-alpha) — 2026-08-03

- **Cuarta ronda del emparejado de festivales y cánones, con tus capturas de producción como
  guía.** Tres causas distintas: (1) *In the Mood for Love* acababa siendo su propio making-of de
  50 minutos —que también dirige Wong Kar Wai— cuando un corte de TMDB se saltaba al candidato
  bueno: ahora un fallo de red ABORTA la resolución de esa película (nadie gana por incomparecencia
  del rival) y, a igualdad de título, gana el año exacto y **lo que ya está en tu Plex** (que
  también desempata el Fanny y Alexander de cine frente al de TV). (2) *Carl Th. Dreyer* no casaba
  con «Carl Theodor Dreyer»: el comparador entiende ahora las abreviaturas. (3) Las fichas cojas
  («Sin fecha», sin cartel) eran carteles perdidos en un 429 que no contaba como error y se
  cacheaban 30 días: ya cuentan y se reintentan.
- **Cada emparejado verificado se guarda por película** (30 días): antes, un palmarés grande con
  un solo fallo de red no se cacheaba entero y cada visita relanzaba la ráfaga completa contra
  TMDB, que volvía a cortar — el pez que se muerde la cola. Ahora los reintentos solo tocan lo que
  falló y la página converge en un par de cargas.
- **El selector de año de Festivales es un desplegable**: el centro se pulsa y eliges el año
  directamente, sin las flechitas de arriba/abajo (ya están ← →), y al cambiar a un festival más
  joven el año se recoloca solo dentro de su rango.
- **Clicar un canon o un premio desde cualquier vista ya no da error**: se clique desde donde se
  clique, va derecho a su palmarés.

## Alpha 0.9.8 (0.9.8-alpha) — 2026-08-03

- **Arreglado el paso «Detectar filmografías cambiadas en TMDB»**, que en la 0.9.7 moría con
  «setSetting is not defined»: al módulo le faltaba un import. No saltó en las pruebas porque la
  clave TMDB del entorno de pruebas hacía fallar el paso antes de llegar a esa línea. Sin este
  paso, las filmografías de tus favoritos tardaban hasta 7 días en refrescarse en vez de detectar
  los cambios a diario. De paso, un barrido por toda la aplicación confirmó que no había más
  imports olvidados de esta clase.


## Alpha 0.9.7 (0.9.7-alpha) — 2026-08-03

- **Novedades en el Dashboard.** El pase nocturno ahora deja rastro de lo que detecta, y el
  Dashboard lo cuenta arriba del todo: cada aviso llega una sola vez, con enlace directo.
- **Vigía de festivales**: en cuanto un festival publica la sección de su edición nueva en
  Wikipedia, aparece la novedad con deep-link a esa edición, donde ya esperan los botones de
  «seguir a toda su dirección» y «mandar a Radarr las que faltan». Se acabó enterarse por la
  prensa.
- **Fases de estreno en las pedidas.** Cada película de «pedidas que siguen sin aparecer» dice
  ahora POR QUÉ no aparece: 💿 ya en digital (debería caer), 💿 digital con fecha, 🎬 solo en
  cines o sin fecha — con la API oficial de TMDB. Y cuando una pedida pasa a digital, PowaFlex
  lo avisa como novedad y reordena su búsqueda en Radarr él solo (solo estrenos digitales
  recientes: nada de machacar indexers con lo que lleva años sin aparecer).
- **El canon Sight & Sound 2022 completo** en Festivales: las 264 películas de la lista extendida
  de la encuesta de la crítica (empates incluidos), con su puesto, casadas con tu Plex y con
  Radarr y «seguir al director/a» en cada una. Dataset empaquetado con la app: no depende de
  nadie y no cambia hasta 2032.
- **«Must-see» de Metacritic en Visionado**: lo que tienes sin ver con metascore ≥ 81 y volumen
  de votos de aval — el listón de consenso crítico más exigente, sin gastar ni una petición.
- **Los grandes premios anuales en Festivales**: el palmarés completo de los **Goya** (con sus ex
  aequo), los **César**, los **BAFTA**, el **Premio del Cine Europeo** y el **Óscar a la mejor
  película internacional** desde 1947 — todo con el mismo motor, verificado contra el director/a,
  y con el selector de la página agrupado en Festivales · Premios · Cánones.
- **Página nueva: Salud de los datos** (en «Tu colección»). Con 12.000 películas los emparejados
  malos son estadísticamente seguros y solo se descubrían por casualidad: auditorías locales de
  películas sin ficha TMDB, identidades repetidas, entradas de Letterboxd sin casar, peticiones
  zombis de Radarr (6+ meses) y personas cuyo emparejado no se pudo demostrar — cada hallazgo con
  su remedio al lado. Cero red: todo sale de tu propia base de datos.
- **El pase nocturno ya no puede morir en silencio.** Cada pasada se guarda paso a paso (un
  reinicio a mitad deja rastro de hasta dónde llegó), ningún paso puede colgarse más de 20
  minutos, Ajustes enseña el histórico de 30 días con duraciones y errores por paso, y la barra
  lateral avisa con un punto rojo si la última pasada falló o lleva más de 26 horas sin correr.
- **Las filmografías solo se re-piden cuando cambian.** La partida más cara de TMDB era volver a
  pedir TODAS las filmografías de tus favoritos cada noche; ahora el feed de cambios de TMDB dice
  quién cambió y solo se refrescan esas (con re-pasada completa cada 7 días como red de
  seguridad).
- **El emparejado de festivales, más fino todavía** (con tus ejemplos de producción como tests):
  los nombres ya casan aunque Wikipedia use el orden japonés («Imamura Shōhei» ≡ «Shohei
  Imamura» — el caso de *The Eel*), las películas recién anunciadas sin equipo en TMDB entran
  por título clavado (Hamaguchi, Zvyagintsev, Fukada…), y un corte de TMDB a mitad de
  comprobación ya no se cachea como «sin ficha»: la página avisa y se cura sola al recargar.
  Las «Σ 0» sin sentido de las películas sin estrenar ya no se pintan.

## Alpha 0.9.6 (0.9.6-alpha) — 2026-08-03

- **Arreglado el emparejado de Festivales.** Con títulos genéricos («Bunker», «Company», «The
  Class», «Happening»… y hasta Parasite) la búsqueda por título y año enganchaba OTRA película del
  mismo año, con su cartel y su ficha equivocados. Ahora cada candidato de TMDB tiene que
  **demostrar su director/a** contra el que dice Wikipedia (con manga ancha para guiones y acentos:
  Kore-eda ≡ Koreeda); si ninguno lo demuestra, la película queda sin ficha, que siempre es mejor
  que la ficha de otra. Las ediciones ya guardadas se recalculan solas al actualizar.
- **Capturas: por fin sabes qué llegó.** El Dashboard estrena «Capturadas esta semana»: cada vez
  que una película pedida a Radarr pasa de «sin archivo» a «con archivo», queda apuntada con su
  calidad y si ya está sincronizada en Plex. Antes la app pedía de maravilla y luego se quedaba
  muda.
- **La deuda de Radarr, a la vista.** Dos secciones nuevas en «Calidad y disco»: las pedidas que
  siguen sin aparecer (las más antiguas primero, que son las que piden decisión) y las que llegaron
  por debajo del corte de tu perfil de calidad, ambas con «buscar de nuevo» en un clic.
- **San Sebastián en Festivales**, con su sección oficial, sus **Horizontes Latinos** (lo mejor
  iberoamericano del año, ya filtrado) y el palmarés histórico de la Concha de Oro. Es el festival
  del que más cine acaba llegando a distribución española.
- **El palmarés de Sundance ya funciona**: sale de la lista global de premiados de Wikipedia
  (viñetas por año, con tres épocas de formato distintas) quedándose solo con el World Cinema
  Grand Jury Prize, el premio de la vía Óscar.
- **Las ediciones que no se celebraron ya no parecen un fallo**: Cannes 2020 enseña su «Selección
  Oficial» simbólica completa con una nota que explica la cancelación, TIFF 2020 dice por qué no
  hubo Platform, y pedir un año sin edición distingue entre «aún no hay programa» (futuro) y
  «ese año no se celebró» (pasado).
- **En la ficha de un/a documentalista, sus documentales llegan visibles** aunque el filtro global
  de tipos los tenga ocultos (y lo mismo con los conciertos de quien los filma). El chip los
  conmuta solo en esa ficha, sin tocar el filtro del resto de páginas.

## Alpha 0.9.5 (0.9.5-alpha) — 2026-08-03

- **Página nueva: Festivales** (en «La caza»). Las secciones oficiales de los seis festivales cuyo
  gran premio clasifica directamente para el Óscar internacional según las reglas nuevas de la
  Academia —Cannes (Palma de Oro), Venecia (León de Oro), Berlinale (Oso de Oro), Sundance (World
  Cinema Grand Jury Prize), Toronto (Platform Prize) y Busan (Busan Award)—, edición a edición y
  con el **palmarés histórico** de cada premio. Los datos salen de Wikipedia y se casan con TMDB y
  con tu Plex: cada película dice si la tienes o te falta, con su nota y su botón de Radarr (suelto
  o «las N que te faltan» en bloque), y cada director/a se puede mandar a favoritos —de uno en uno
  o **la sección entera de un clic**, pensado para seguir a toda la competición de una edición
  nueva en cuanto se anuncie.
- **Un favorito puede estar en directores Y en actores a la vez.** Antes cada persona solo cabía
  en una lista, así que Eastwood acababa solo en actores. Ahora las facetas son independientes: la
  ✕ y las podas quitan solo la faceta de la lista que miras, cada tarjeta ofrece «seguirle también
  como…», y al añadir a alguien se completa sola la otra faceta cuando su obra lo pide (dirige 4+
  películas de tu biblioteca, o tiene 8+ interpretadas). Tus favoritos actuales se reparan solos al
  actualizar.
- **Las fichas de personas enseñan las notas** (media Σ de MDBList e IMDb bajo cada carátula) y
  ganan orden por calificación, año o votos más un listón de «nota mínima Σ», para ir directo a lo
  mejor de cada filmografía.
- **El umbral de ruido de Descubrir ya no descarta cine de verdad**: una película cuenta como
  hueco si llega a los votos mínimos en TMDB **o en Letterboxd** (vía MDBList). En TMDB apenas
  vota nadie y el listón se tragaba películas importantes del cine de autor.
- **Los filtros se quedan puestos** en todas las páginas —Biblioteca, Personas, Favoritos,
  Descubrir, Calendario y fichas— aunque navegues adelante y atrás, hasta que pulses el botón
  nuevo «✕ Limpiar filtros».
- **Copia de seguridad en Ajustes**: descarga la base de datos entera (copia coherente, aunque
  haya escrituras en marcha) y exporta o importa la configuración en un JSON, para reinstalar el
  contenedor sin empezar de cero.
- Arreglado de paso: la página de Ajustes reventaba en vez de avisar si fallaba un guardado (le
  faltaba un import), y los textos de «¿Qué es PowaFlex?» y del README se han puesto al día
  (llevaban versiones desactualizadas de qué sale de tu red y de la autenticación).

## Alpha 0.9.4 (0.9.4-alpha) — 2026-08-02

- **Arreglado «out is not defined» en Grandes ausentes.** Se coló en la 0.9.3: la pantalla no
  cargaba ningún canon aunque tuvieras la clave de TMDB puesta. Era un descuido mío al tocar el
  guardado en caché; ahora hay una prueba que recorre las páginas que dependen de TMDB y falla si
  alguna revienta con un error de programación en vez de con un aviso normal.
- **«Actualizar todo» va arriba del todo en Ajustes**, con color propio para distinguirlo de las
  conexiones.

## Alpha 0.9.3 (0.9.3-alpha) — 2026-08-02

Versión de repaso a fondo: cuatro revisiones del código encontraron una lista larga de cosas
que fallaban en silencio, y esto las arregla. Lo que más se nota:

### Lo que se ve

- **Media hoja de estilos no se estaba aplicando.** Cualquier color puesto sobre una tarjeta o un
  botón se descartaba sin más, así que: la caja de avisos —justo la que dice «falta la API key de
  TMDB»— era casi invisible, los seis chips de notas de la ficha salían todos del mismo color, las
  etiquetas del calendario también, lo seleccionado apenas se distinguía de lo no seleccionado, el
  botón «Vaciar» no se veía rojo y los paquetes de directores habían perdido su franja de color.
- **Todas las barras de progreso se leían al revés**: la parte vacía era negra y la llena roja, así
  que un 12 % de completismo parecía una barra casi llena.
- «Calidad y disco» **ya no se descuadra al girar el móvil**.
- Los avisos de error se leen en los tres aspectos, no solo sobre papel.
- Las cápsulas sobre las carátulas (**4K, HDR, ★**) se veían como manchas grises: iban con tinta
  oscura sobre un velo negro. Ahora son blancas, como debían.
- Las leyendas de las gráficas tomaban el color de su propia barra y desaparecían sobre el papel.
- Si actualizas el contenedor con una pestaña abierta, PowaFlex lo detecta y te dice que recargues,
  en vez de soltarte un error incomprensible.

### Lo que contaba mal

- **«Próximos estrenos» de cada favorito decía siempre 0**, con toda la seguridad, aunque tuvieras
  estrenos en el calendario.
- **Un actor con muchos cameos ya no los cuenta como huecos** en su ficha ni en Favoritos. Antes
  Descubrir los descartaba y las otras dos pantallas no: tres sitios, dos respuestas.
- **Una lista de actores pegada podía envenenar el canon de directores** durante un mes: la búsqueda
  de personas se guardaba sin distinguir si buscabas a alguien como director o como actor.
- El recuento de «ocultas por tus filtros» se calculaba antes de saber cuáles eran cortos, así que
  decía tres y aparecían ocho.
- Las sagas contaban archivos en vez de películas: con dos ediciones de la misma salía «4 de 3».
- **«Directores/as que más has visto»**, una sección nueva en Visionado con quién te has visto más,
  contando Plex y Letterboxd.
- En **«Grandes ausentes»**, el nombre de cada director/a abre su ficha y hay un botón para
  **añadirlo a favoritos** sin salir de la página.
- Y en **Favoritos → Añadir**, un bloque nuevo de **«Listas y cánones»**: vuelca de golpe los 250 de
  They Shoot Pictures, los 501 del libro, los que están en boga o cualquier lista tuya. A quien
  hayas quitado con la ✕ no vuelve a entrar.

### Lo que se rompía sin avisar

- **Añadir listas de Letterboxd por dirección volvía a funcionar.** Letterboxd renombró las
  etiquetas de su página y PowaFlex dejó de reconocer las películas: cualquier lista daba «no se
  pudieron leer películas». Ahora entiende el formato nuevo y el viejo, coge el nombre real de la
  lista y explica qué mirar cuando de verdad falla.
- **Si TMDB corta el grifo, la aplicación ya no se queda colgada.** Reintentaba sin fin: el refresco
  se quedaba a medias «en marcha» y el trabajo nocturno no volvía a arrancar hasta reiniciar.
- **Una biblioteca de Plex que responde vacía ya no borra tu colección.** Pasa mientras Plex
  reescanea o si se le cae el disco; ahora se omite la limpieza y se avisa. Para vaciarla de verdad,
  «Sincronización completa».
- Un corte de MDBList ya no tira las notas que ya se habían descargado y pagado del cupo del día.
- Si algo falla a mitad de construir una página, ya no se guarda como si estuviera completa durante
  doce horas: se guarda marcada y se rehace a los veinte minutos.
- Cambiar los umbrales de Descubrir o el tamaño del calendario **se nota al momento**, no al cabo de
  medio día.

### Cuando algo va mal, se nota

- Un error del servidor ya no se disfraza de «aún no hay películas sincronizadas» ni de «¡lista
  completa!». Y si algo se rompe de verdad, sale un aviso con botón de reintentar en vez de una
  página en blanco.
- Descartar una película de Descubrir **se puede deshacer** desde el propio aviso.
- Guardar ajustes, seguir a alguien o descartar una película solo se dan por hechos si el servidor
  lo confirma.
- Si el servidor no responde, se dice; antes el spinner giraba para siempre.

### Seguridad

- **Los ajustes solo aceptan las claves que existen.** Antes se podía cambiar la dirección de Plex
  por otra cualquiera y pedirle a la app que «probara la conexión», con lo que mandaba tu token a
  esa dirección.
- **Un zip preparado ya no puede tumbar el contenedor**: se rechaza antes de descomprimirlo, no
  después.
- La contraseña de `POWAFLEX_AUTH` ya no revela su longitud y aguanta la fuerza bruta, sin dejar
  fuera a quien sí la sabe.
- Sin contraseña puesta, el registro lo dice claramente al arrancar.
- Las claves y tokens se escriben en campos ocultos.

### Por dentro

- **Pruebas de extremo a extremo**: arrancan el servidor de verdad y comprueban que las páginas
  responden, que la interfaz se sirve, que la autenticación protege y que no falta ninguna ruta que
  la aplicación llame. Con eso se cazaron dos fallos de esta misma versión.
- Los nombres de personas en otros alfabetos se normalizan también en las fichas y buscadores.
- El menú móvil cerrado ya no atrapa el tabulador; la zona para soltar el zip de Letterboxd se puede
  usar con teclado; las fichas y el buscador se comportan como diálogos de verdad.

## Alpha 0.9.2 (0.9.2-alpha) — 2026-08-02

- **Las dos películas más conocidas de cada director/a aparecen también en Favoritos**, no solo en
  «Directores/as top», y terminan en puntos suspensivos —*(Annie Hall, Manhattan…)*— para dejar
  claro que detrás hay más obra.
- Si venías de la 0.9.1 y en «Tus favoritos» no salían, era porque esa pestaña seguía leyendo los
  huecos calculados antes de la actualización. Ya se recalculan solos.

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
