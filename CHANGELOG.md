# Changelog

El detalle técnico de cada versión: qué se arregló, por qué fallaba y qué números lo demuestran.
Lo que ve quien usa la app está en `/novedades`, que es otro texto para otro público.

Formato: un titular en negrita, secciones cortas y los hechos con sus cifras. La crónica de cómo
se llegó a cada arreglo vive en el mensaje del commit, no aquí.

## Beta 1.30 (1.0.30-beta) — 2026-08-31

**Siete países más y cinco cánones nuevos de FilmAffinity — y, de camino, la ficha equivocada que llevaba años colada en el Top 1000, en Sight & Sound, en las 1001 y en Cahiers.**

### Cinco cánones nuevos de FilmAffinity

De los 162 rankings de su índice entran los cinco que son un canon y no un cajón:
**Siglo XXI** (1.000), **Documentales** (832), **Cine mudo** (423), **Cine negro** (341) y
**Western** (436). En total **3.032 filas, 2.984 con ficha de TMDB (98%)**; el cine negro y el
western van al 100%. Se sirven como Sight & Sound o las 1001 —dataset fijo, sin salir a
internet— y suman sus avales a las fichas de película.

Fuera quedan a propósito los treinta y tantos rankings de género de mil filas (drama, comedia,
terror…): son la nota media filtrada por etiqueta, se repiten entre ellos y no separan nada. Y
fuera todo lo que no es largometraje.

### Siete países más en Por países

**China, Hong Kong, Canadá, Australia, Chequia, Nueva Zelanda y Portugal**: 605 filas, 592 con
ficha. De 14 países con ranking a 21.

Ojo con el que parece obvio y no lo es: el código de FilmAffinity `ranking_movies_ch` es **China,
no Suiza** —Suiza sigue sin ranking—, y Hong Kong tiene el suyo aparte (comparten cinco títulos
de los veinte primeros). Va con su test.

### La ficha que no era, y por qué estaba en todas partes

«In the Mood for Love» apuntaba a **«@ in the mood for love»**, un mediometraje de 51 minutos del
mismo director y del año siguiente. Pasaba todas las comprobaciones: la dirección casa, y el
título *también* clava, porque al normalizar se cae la arroba. Como el emparejador se quedaba con
el primer candidato que llegara a ese nivel, la película —que TMDB titula «Deseando amar» y
«花樣年華», y solo clava por su título internacional— no se llegaba a mirar nunca.

Ese id se había colado en **cinco paquetes** (el Top 1000, el ranking de Hong Kong, el de
palmareses, el índice de países y el nuevo del siglo XXI) y en la caché de emparejado, y desde ahí
en **Sight & Sound, las 1001 y Cahiers**. Arreglado en la raíz: un candidato con menos de 100 votos
ya no cierra la búsqueda, y si aparece otro que le saca un orden de magnitud (3.350 votos contra
37), gana ese. Corregidos también los cinco paquetes.

### El emparejado de FilmAffinity, tres arreglos

- **La marca de formato se despega del título.** Se buscaba en TMDB «Queen: Days of Our Lives
  (TV)», que no existe. Las marcas de una letra —«(S)» de corto, «(V)», «(C)»— ni se miraban.
- **Rescate por filmografía.** Cuando el título no lleva a ninguna parte se pregunta por quien
  firma: la lista dice «The Downfall: Hitler and the End of the Third Reich» y TMDB «Downfall»;
  dice «To Return» y es «Volver»; «Love» y es «Amour»; «Hell» y es «El infierno». **53 filas
  rescatadas.** Con cuidado en los nombres que TMDB guarda en otro alfabeto (Edward Yang es
  «楊德昌» y su lista de alias no trae el nombre occidental).
- **19 correcciones a mano**, cada una verificada contra TMDB.

Y las tres herramientas de FilmAffinity comparten por fin `fa-comun.mjs`: la regla de «mejor sin
ficha que la ficha de otra» vivía por triplicado.

### El botón que no borraba nada

El ✕ de «Listas y retos» no quitaba el reto. Ni la ruta ni el manejador fallaban: fallaba el
`window.confirm` de por medio, que el navegador puede desactivar para siempre —basta marcar una
vez «impedir que esta página cree más diálogos»— y que a partir de ahí devuelve `false` en
silencio. En una app instalada como PWA pasa de serie.

La confirmación se hace ahora **dentro de la página**, en dos toques, y se desarma sola a los cinco
segundos. Convertidos los **seis** `window.confirm` que quedaban: los dos de Listas, el de
Descubrir y los tres de las reglas de Radarr. Comprobado con `confirm` saboteado a `false`: borra
igual.

### Dashboard en móvil

- Los **seis contadores** hacían tres filas de 112, 112 y **92 px**: solo la mitad lleva apostilla
  y las demás se quedaban con un hueco muerto debajo. Ahora la línea va reservada siempre y las
  tres filas cuadran. De paso, la tarjeta usa las clases de la casa en vez de una copia a mano.
- «Actores/actrices con más películas» no cabe en una línea, y el «Ver todos →» quedaba flotando a
  media altura. Ahora se apoya en la primera línea del titular.

### Y una cosa que decía Wikipedia sin serlo

El enlace de la fuente de cada palmarés ponía «fuente: Wikipedia» pasara lo que pasara. Ya no era
cierto antes —el Óscar viene de Wikidata y Sight & Sound del BFI— y con los cinco cánones nuevos
habrían sido siete listas mintiendo. El nombre sale del propio enlace.

## Beta 1.29 (1.0.29-beta) — 2026-08-31

**Estrenos contesta también QUIÉN: 144 directores con estreno en España en los tres próximos meses, cada uno con su obra anterior y su palmarés.**

### Directores que estrenan en España

Quinta pestaña de Estrenos (`/estrenos?tab=directores-es`), servida por `/api/estrenan`. La misma
cartelera española que ya conocía la casa —discover de TMDB con `region=ES`, tipo 3|2 para sala y
tipo 4 para digital— pero dada la vuelta: en vez de una parrilla de carteles, **una ficha por quien
firma**.

Tres meses en pestañas separadas. Medido hoy: **54 directores en septiembre, 45 en octubre y 45 en
noviembre** sobre 126 películas, 144 nombres distintos.

Cada ficha trae el título que estrena con su fecha y su canal, sus **tres mejores anteriores**, su
**palmarés** (hasta cuatro fuentes, las ganadas delante) y lo que la base ya sabe de esa persona:
si la sigues, cuántas suyas tienes y si es su ópera prima. Diez lo son este trimestre.

Filtros: canal (las dos a la vez o solo una), a quién (todos / solo favoritos / los que no sigues),
**con palmarés** (21 de los 144), buscador por nombre —insensible a tildes: «inarritu» encuentra a
Iñárritu— y cuatro órdenes. La ★ sigue y deja de seguir sin salir de la página.

### Tres decisiones que se tomaron mirando los datos

- **La ventana salta de mes cuando quedan menos de siete días.** Abrir la página el 31 de agosto
  para que la primera pestaña sea «agosto» —un día, cero estrenos— no informa de nada.
- **«Lo mejor» va por nota ponderada y con suelo de 50 votos.** Con la nota pelada, la mejor
  película de casi cualquier director era un corto de doce votos con un 9,5.
- **Una Σ de 0 no es un cero.** `score_average` de MDBList vale 0 cuando aún no la ha puntuado
  nadie, y en una lista de estrenos eso son **81 de 145**. «Σ 0» junto a la película nueva de
  Iñárritu dice lo contrario de lo que significa: sin nota es sin nota.

### Rendimiento

Construcción en frío **4,6 s** (327 peticiones a TMDB), 1 s con las fichas ya cacheadas; caché de
doce horas. Barra de progreso con `{done,total}` real en las tres fases (descubrimiento, fichas,
filmografías).

Lo tuyo **no entra en la caché**: a quién sigues y cuántas suyas tienes se vuelve a mirar en cada
respuesta, con dos consultas a la base. Con el favorito cacheado, darle a la ★ y recargar devolvía
la estrella apagada durante medio día.

Y solo los fallos del descubrimiento marcan la página como parcial: que a un director no se le haya
podido leer la filmografía es un hueco en su ficha, no media lista, y contarlo como parcial obligaba
a reconstruirlo todo cada veinte minutos por una persona.

## Beta 1.28 (1.0.28-beta) — 2026-08-28

**Cinco usuarios adversariales recorriendo la app a la vez. Nueve ediciones de festival que se servían como error, «Nanette» quinta de Australia y la biblioteca entera en un JSON.**

### Nueve ediciones más, servidas como error

Wikipedia alterna «In Competition» y «Main Competition» de un año a otro, y cada festival tenía
declarado solo uno. Se perdían **Cannes 2016, Berlinale 2012, Venecia 1980, 1981 y 1992, y San
Sebastián 2018, 2019, 2020 y 2022**. San Sebastián 2021 servía **Perlak** como Sección Oficial, con
«El poder del perro» de aspirante a la Concha de Oro.

Y la ganadora se marcaba por título normalizado: en la Berlinale de 2025, con dos películas
tituladas «Dreams», coronaba la de Michel Franco en vez del Oso de Oro de Dag Johan Haugerud. Ahora
manda el `tmdb_id`.

### El monólogo grabado entraba entero en Por países

`esConcierto` caza el directo musical, pero un especial de stand-up viene como Comedia a secas, dura
entre 60 y 120 minutos y el público lo puntúa. **«Nanette» de Hannah Gadsby salía quinta de
Australia** y «Glorious» de Eddie Izzard primera de 1997 en Reino Unido. Veintinueve casos.

La firma no es el título sino el **reparto**: exactamente uno haciendo de sí mismo, y tres o menos en
total. Las dos condiciones hacen falta — con «al menos uno» caía un documental coral que es segundo
de Suiza; sin el tope, «Borat» y «Happy Gilmore». Medido sobre 29.592 fichas: 29 aciertos, cero
falsos positivos.

### La API deja de mentir

- `?limit=-1` devolvía **la biblioteca entera**: en SQLite `LIMIT -1` es sin límite.
- Restaurar un `.json` de ajustes **saltaba la validación de URL**: `plex_url: javascript:alert(1)`
  entraba con `{"ok":true}`. Esa puerta decide a dónde sale el token de Plex.
- Un decimal en la URL era un 500 mudo en nueve rutas; un ajuste no-cadena contestaba «ok» sin
  guardar; un id de TMDB decimal se guardaba en la base y rompía el calendario para siempre.

### Reglas de Radarr y ajustes

- `cap: -7` se recortaba a 0, y **0 significa sin tope**: un signo de más dejaba la regla ilimitada.
- Rechazar de la cuarentena un id que ya no está creaba un **veto fantasma** sin título.
- Una regla con umbral y sin clave de MDBList no añade nada nunca. Ahora se dice antes de ejecutarla.

### Interfaz

Etiquetas de canon en castellano con la interfaz en inglés («TSPDT · TOP 250 DE SIEMPRE»), y tres
desbordes horizontales en móvil, uno de ellos en el `<select>` compartido, que medía 383 px en un
viewport de 375. **Test nuevo de cobertura EN**: cruza las 1.496 llamadas `t()` con las 1.736 claves
inglesas — `i18n-shadow` no veía las que faltaban.


## Beta 1.27 (1.0.27-beta) — 2026-08-28

**La Palma cambió el nombre de una columna en Wikipedia y se llevó por delante su palmarés. Y el emparejador dejó de dar por buena la obra derivada.**

### La ganadora que faltaba en Cannes 2025 y 2026

El artículo «Palme d'Or» renombró su cuarta columna de «Director(s)» a «Recipient(s)». Como esa
columna es la que verifica el emparejado, el parser descartaba la tabla entera: de las diez del
artículo sobrevivía **una**. El palmarés pasó de 103 filas a **1**, la de 2018.

Nadie lo vio en meses porque el palmarés empaquetado llega a 2024 y tapaba el hueco. `Recipient` va
declarado solo para Cannes: en BIFA esa misma columna lista al equipo entero desde 2020, y en Un
Certain Regard mezcla dirección con intérpretes.

Barridos los 65 palmareses, había un segundo roto igual: el Premio del Público de Toronto renombró
su sección a «Winners and runners-up» y perdía **48 ganadoras**. Ahora una sección que no aparece se
cae al respaldo de página entera. Y una guarda nueva: si el artículo vivo trae menos de la mitad de
los años ya empaquetados, no es un palmarés y no se mezcla.

### El emparejador ya no se queda con el making-of

`elegirCandidato` decía `directorsMatch(...) && (row.director || tituloBastaSinDirector(c))`. Con
`row.director` puesto el segundo paréntesis es **siempre cierto**: a las filas con dirección no se
les miraba el título. Y lo que comparte dirección con una película y se llama casi igual es la obra
derivada. Medido con los candidatos reales de TMDB, es **la primera que devuelve la búsqueda**:

```
«The Blue Angel» 1930     prueba de cámara, 3 votos   →  «Der blaue Engel», 108 min, 375 votos
«Autumn Sonata» 1978      «The Making of…», 1 voto    →  «Höstsonaten», 99 min, 722 votos
«Wild Strawberries» 1957  «Bakomfilm…», 3 votos       →  «Smultronstället», 91 min, 1.848 votos
```

**Exigir el título clavado no era la solución, y está medido**: costaba cinco fichas de 228 filas en
Locarno, Karlovy Vary y Rotterdam, las cinco correctas —«Khamosh Pani» es «Silent Waters» en TMDB,
«Seryozha» es «Серёжа»—. Un título escrito de otra manera es el pan de cada día del cine que no se
distribuye en inglés. Lo que sí las separa: la obra derivada se llama como la película **más algo**.
A/B con caché limpia: 228 filas, 0 pierden ficha, 0 cambian. Sube `film_match` a v9.

Y una ficha vacía de un año viejo deja de ser una ficha: un «Birdman» de 21 minutos, sin fecha, sin
créditos y con cero votos le ganaba a la de Iñárritu en los Globos y en Critics' Choice.

### Por países

- **Fuera lo que no es cine.** Cuatro fichas que ningún filtro de duración ni de género separa: el
  documental promocional de «La Casa de Papel», un monólogo de Franco Escamilla y los «cómo se hizo»
  de «Agárrame esos fantasmas» y del «King Kong» de Jackson — que eran el **número 1 de 1998 y el
  número 2 de 2006** de Nueva Zelanda.
- **La nota que ordena cuenta cuánta gente hay detrás.** Un 7,8 con 300 votos adelantaba a un 7,6
  con 27.000. Se acerca a la media del país mientras faltan votos, con dos decisiones medidas sobre
  los 72 paquetes: se **redondea al décimo**, porque una nota continua nunca empata y se cargaba el
  desempate por canon; y el umbral es una **constante de cien votos**, no un percentil del país,
  porque sacándolo del país se aplanaban las cinematografías pequeñas. Mueve el top-10 en once
  países y el 41 % de las filas de mediana. La nota que se pinta no cambia.
- Una película de episodios firmada por gente de cinco países ya no entra en el ranking de los cinco.

### El 500 de la vista por año, con nombre

Sigue sin reproducirse, pero el guardián de la 1.26 solo envolvía el sembrado. Ahora cada paso dice
el suyo: «No se pudo cargar Armenia al leer la regleta de años: …».

## Beta 1.26 (1.0.26-beta) — 2026-08-27

**Los 72 países vienen hechos. Y MDBList nunca estuvo racionando nada: nos racionábamos solos.**

La página Por países abría diciendo «sin construir» en los setenta y dos, y construir uno son
minutos. Ahora vienen construidos de fábrica: 30.282 películas empaquetadas en
`server/src/data/paises/`, un fichero por país. Medido: España pasa de tres minutos de
construcción a servirse en **172 ms**, sin gastar una sola petición.

### El fallo que estaba detrás de todo

La aplicación llevaba su propia cuenta del cupo diario de MDBList y la llevaba **mal por un factor
de casi sesenta**. En `fetchRatingsBatch` se apuntaba una petición por TÍTULO, con un comentario
que decía «the batch endpoint is billed per title». Es falso: se cobra por petición HTTP, lleve
dentro un título o cien.

Medido contra su propio contador, el mismo día:

```
límite diario:                25.000
gastadas según MDBList:          388
gastadas según PowaFlex:      22.369
```

Comprobado además a mano: un lote de veinte títulos mueve su contador **una** unidad.

La consecuencia no era teórica. La aplicación se declaraba «sin cupo diario» teniendo el 98% del
día libre, y a partir de ahí las notas dejaban de funcionar para todo lo demás: las reglas de
Radarr, Estrenos, los festivales, las listas. Ahora la cuenta la lleva la función que hace la
petición, que es lo único que ellos facturan, y las dos unidades van separadas: peticiones y
títulos no son lo mismo.

De paso, la reserva que se deja sin gastar baja del 20% al 5%. Con el 20%, el margen valía un país
entero al día; con el 5% quedan 1.250 peticiones de colchón sobre una cuenta Supporter, que sigue
siendo holgado para cubrir el desfase entre su contador y el nuestro.

### Lo que ya no se cuela en las listas

- **Los conciertos filmados.** «Pink Floyd: Live at Pompeii» y un directo de BTS abrían el top de
  Reino Unido con 8,8, entre «Lawrence de Arabia» y «Las zapatillas rojas»; «Dua Lipa: Live from
  Mexico» era la número uno de México, por delante de «El laberinto del fauno». El público los
  puntúa como lo que son —un buen concierto— y así se cuelan. La firma es tener género musical y
  ningún otro, o musical y documental; cuando ni eso basta —«Flight of the Conchords: Live in
  London» viene como comedia— lo remata el «Live in / at / from» del título. Los musicales de
  verdad se quedan: ninguno va solo de género musical.
- **Lo que aún no se ha estrenado.** Una película sin estrenar con un 8,8 no tiene una nota: tiene
  la expectación de quien la espera, y un canon histórico no puede incluir lo que todavía no
  existe.

### Construir un país a medias ya no se guarda

La salvaguarda del cupo protegía de RECONSTRUIR un país a medias, pero no de construirlo por
primera vez a medias, que es peor: quedaba incompleto con pinta de completo y así se habría
empaquetado. Ahora corta en los dos casos si falta más de un décimo de las notas.

### Además

- Un país empaquetado se siembra solo la primera vez que se pide, y desde ahí todo funciona igual:
  el cruce con tu Plex, el ✎ y Radarr. Quien quiera rehacer uno sigue teniendo el botón.
- El desplegable dice «viene hecho» leyendo un manifiesto de unos cientos de bytes, en vez de
  cargar los 3,5 MB de datos para pintar una lista.
- Cargar el país que se mira, y solo ese: con las claves puestas Alemania ocupaba 205 KB y en
  tuplas son 133.
- La consulta de un país no puede devolver un 500 mudo: si algo falla al cargarlo, lo dice.
- Cinco pruebas nuevas para los conciertos y los estrenos, incluida la que impide que «Carne
  trémula» —«Live Flesh» en inglés— se caiga de la lista española por su nombre.

## Beta 1.25 (1.0.25-beta) — 2026-08-27

**El Top 1000 de FilmAffinity entra en los cánones. 998 de las mil, con ficha.**

Sexta fuente de la sección Cánones, junto a Sight & Sound, las 1001, el AFI, Criterion y el
registro estadounidense. Es el canon que vota el público en español, y por eso no se parece a los
otros: donde las listas en inglés abren el cine español con «Todo sobre mi madre», esta empieza por
«El verdugo».

Cuenta como aval en toda la aplicación, así que pesa en el desempate de Por países, en Descubrir y
en la ficha de cada película: «El Padrino» pasa a seis avales y «Viridiana» a cuatro.

### Seis fichas eran de otra película

Se emparejaron las mil contra TMDB con la misma verificación que se estrenó en el ranking por
países, y volvió a hacer falta: el emparejador da por buena una ficha cuando el nombre de quien
dirige casa aunque el título no.

- «Wild Strawberries» apuntaba a un making-of de catorce minutos.
- «Autumn Sonata», a «The Making of Autumn Sonata».
- «The Blue Angel», a una prueba de cámara de Marlene Dietrich de cuatro minutos.
- «Crash» y «Perfect Blue», a fichas huérfanas sin fecha ni duración.

Y una que se salvó sola: «A Short Film About Killing» recibía la ficha de «A Short Film About
Love», que ya la tenía en su propio puesto. Se quedó sin cartel antes que robársela.

### Las veinte que faltaban, emparejadas a mano

Ninguna era oscura: casi todas fallaban por el título. FilmAffinity escribe «The Downfall: Hitler
and the End of the Third Reich» donde TMDB dice «Downfall», «Love» donde dice «Amour», «The Cry»
donde dice «Il grido» y «The Tale of Princess Kaguya» sin el segundo artículo. Van escritas en la
herramienta que genera el dataset, con el porqué de cada una, para que sobrevivan a la próxima
regeneración.

Dos se quedan **sin ficha a propósito**: los OVA de Rurouni Kenshin son televisión en TMDB, y su
entrada de película es un duplicado con cero minutos y siete votos. Una serie en un canon no es una
película que buscar, como ya pasaba con las miniseries de Criterion.

### Además

- Herramienta nueva, `npm run snapshot:fa1000`, que convierte el CSV del ranking en el dataset
  empaquetado. Como el de países, no se baja en caliente: el servidor de FilmAffinity contesta 403
  a Node.
- La cabecera de Festivales pasa de sesenta y cinco fuentes a **sesenta y seis**, en los dos
  idiomas.

## Beta 1.24 (1.0.24-beta) — 2026-08-27

**El cine por países: setenta y dos cinematografías, con dos opiniones enfrentadas.**

Página nueva en «La caza», debajo de Estrenos. Lo mejor de cada país, de siempre y año a año, con
dos fuentes que dicen cosas distintas a propósito: la lista de la casa —ordenada por la nota de
Letterboxd— y el ranking de FilmAffinity. El top español de la primera empieza por «Todo sobre mi
madre»; el de la segunda, por «El verdugo».

### Por qué ordena Letterboxd y no la Σ

La nota de TMDB es popular y reciente: ordenando España por ella, «Culpa mía» —4,8 en Letterboxd
con 376.874 votos— sale por delante de «El espíritu de la colmena». La Σ de MDBList es peor
todavía, porque castiga a quien no tiene Metacritic ni Rotten Tomatoes, o sea a casi todo el cine
no anglosajón anterior a los setenta: «Vida en sombras» tiene 7,2 en Letterboxd y una Σ de **16**.
De las cinco fuentes probadas, Letterboxd es la única que puntúa las doce clásicas de la muestra.

La nota llega con un decimal, así que empata a mansalva: en el top-100 de España la nota de corte
es 7,6 y hay **49 películas con exactamente 7,6**. Desempatan los premios y los cánones que ya
indexa la app, no los votos: desempatar por votos sería desempatar por popularidad, que es el sesgo
del que se venía huyendo.

### El país de una película es el de quien la dirige

El país de origen de TMDB falla en las dos direcciones: da «Viridiana» por mexicana y «La batalla
de Chile» por española, cuando España no aparece ni entre sus productoras. Cruzándolo con la
nacionalidad de la dirección salen bien los ocho casos que se midieron antes de escribir la regla.

Con una válvula, que costó una segunda vuelta: que quien dirige haya nacido en otro sitio solo
descarta si **ese país es además uno de los de la propia película**. Sin ella, Alemania se quedaba
sin «M» ni «Metrópolis» —Fritz Lang nació en Viena— y España sin «Tesis» ni «El extraño viaje».
Alemania pasa de 1.218 películas a 1.485 con la válvula puesta.

Se recorre año por año y no un charco global: «Vida en sombras» tiene **doce** votos en TMDB, y
bajar un listón global hasta alcanzarla llena la lista de conciertos y monólogos. En España 1949
hay 49 películas en toda la base, y la buena es la más votada de las 49.

### FilmAffinity viaja empaquetado

Su servidor contesta 403 a Node —distingue por la huella TLS del cliente— y 200 a curl. En vez de
pelearse con eso, la descarga y el emparejado pasan una vez en desarrollo, y al contenedor viaja un
fichero de datos, como los palmareses de Wikipedia. Son **14 países**, los que tienen ranking, con
cien películas cada uno.

Sus códigos no son los ISO: Reino Unido es «uk» e Italia es «italy». Y un ranking inexistente
responde **200 con la página vacía**, así que el código HTTP no sirve para darlo por bueno.

### Once emparejados falsos, cazados uno a uno

El emparejador de la casa acepta una ficha cuando el nombre de quien dirige casa, aunque el título
no. Por ahí entraron **once películas que eran otra**: una prueba de cámara de Marlene Dietrich de
cuatro minutos por «El ángel azul», el making-of de «Sonata de otoño» —206 minutos— por la
película, la Parte II de «Guerra y paz» por la película entera, y un esbozo vacío chino por «El
crack» de Garci. Ahora cada ficha se verifica contra TMDB: fecha, duración, distancia de año y
marcas de obra derivada.

Las marcas de parte se comprueban con límites de palabra sobre el título real, no sobre el
normalizado: buscando «parti» dentro de la cadena sin espacios se rechazaban «Una jornada
particular», «Sin señas particulares» y «Desierto Particular», que eran las correctas.

### Los dos países que TMDB llama de otra manera

«CS» no es Checoslovaquia para TMDB: son **90 películas serbias** de los 2000. Y «DD» devuelve
cero. Los suyos son «XC», con 7.844, y «XG», con 1.144. Sin esto, Checoslovaquia habría servido
cine serbio bajo el rótulo equivocado, que es peor que servir una lista vacía.

### Lo que se dice cuando algo no se puede hacer

- **Reconstruir sin cupo de MDBList ya no borra el país bueno.** El guardado empieza por un borrado,
  así que con el cupo del día gastado el país no salía peor: salía vacío y sin error. Ahora se
  cuentan las notas que faltarían y, si saldría a medias, no se toca nada.
- **Un fallo ya no pisa las cifras de la última construcción buena**: la tabla conservaba 1.230
  películas mientras el letrero decía «0 candidatas».
- **Una nota imposible no es una nota.** MDBList devolvió un 14,6 sobre 10 y el orden lo ponía de
  número uno de la Unión Soviética.
- **La barra late durante el paso que se paga.** Eran minutos en una sola espera, y a los sesenta
  segundos el progreso se daba por muerto mientras el trabajo seguía.

### Correcciones a mano

El ✎ de cada película la saca del país en las dos listas y sobrevive a las reconstrucciones. No es
un remate para casos raros: TMDB da «Los otros» por estadounidense y «As bestas» por francesa, y
esas dos no llegan siquiera a candidatas, porque el recorrido solo puede filtrar por el país de
origen.

### Además

- Tres tablas nuevas con sus columnas aseguradas: una base con la tabla a medias dejaba el servidor
  **sin arrancar**, que en Docker es el contenedor en bucle de reinicio.
- El lugar de nacimiento se lee con las anotaciones de TMDB quitadas —«USSR (Russia)», «West
  Germany [now Germany]»— y treinta alias más. Georgia contesta «no se sabe»: es ambigua, y
  «Savannah, Georgia» salía georgiana.
- Los países de una coproducción se leen con coma **y** con espacio. El palmarés escribe «Spain
  France Italy», y partiendo solo por coma «Los lunes al sol» no llegaba a candidata española.
- En Windows, `npm run dev` levanta las dos partes: era sintaxis de shell POSIX y solo arrancaba
  Vite.
- Cincuenta y una pruebas nuevas. La suite pasa de 340 a 390.

## Beta 1.23 (1.0.23-beta) — 2026-08-24

**106 KB de prosa fuera. Ni una línea de código tocada.**

Una sola voz —narrativa, de reportaje— estaba haciendo cuatro trabajos que piden registros
distintos: comentario de código, etiqueta de interfaz, changelog y página de ayuda. De ahí salían
la historia metida en la explicación («Antes… Ahora…»), el ejemplo repetido tres veces, el inciso
anidado (114 paréntesis y 20 pares de rayas en 6.637 palabras de interfaz: uno cada cuarenta
palabras) y la justificación defensiva.

| | antes | ahora | |
|---|---:|---:|---:|
| Novedades (ES + EN) | 99.587 | 57.347 | **−42 %** |
| About (ES + EN) | 48.830 | 27.229 | **−44 %** |
| CHANGELOG | 152.041 | 123.054 | **−19 %** |
| README | 9.764 | 6.979 | **−29 %** |
| Copy del resto de páginas (74 textos) | 12.812 | 8.720 | **−32 %** |

### Qué se hizo

- **Novedades** deja de ser un segundo changelog: las 16 versiones de la 1.07 en adelante pasan a
  entre tres y seis puntos de una o dos frases. El diccionario EN se **regenera desde el
  castellano**, así que las claves no pueden descuadrarse.
- **About** reescrito entero. Las doce secciones y las cuatro listas salen ahora de datos
  (`HACER`, `SECCIONES`) en vez de estar escritas a mano con negritas intercaladas: el mismo texto
  ocupaba cuarenta claves de traducción troceadas por los `<b>`.
- **74 textos de interfaz** reescritos en quince páginas. Fuera el «antes/ahora», los detalles de
  fontanería en copy de usuario y las disculpas metodológicas: la nota de método de Directores/as
  pasa de 349 caracteres a 158 diciendo lo mismo.
- **CHANGELOG**: comprimidas las 23 entradas Beta y las tres Alpha mayores conservando todos los
  hechos, cifras, nombres de fichero y versiones de caché. Lo que se va es la crónica. Cabecera
  nueva que fija el formato.
- **README**: la tabla «Qué hace» tenía celdas de 1.400 caracteres y hablaba de treinta palmareses
  cuando hay sesenta y cinco.

### Lo que se deja

Las 24 entradas Alpha restantes (47 KB), que ya son listas de hechos sin retórica. Los comentarios
de código, por encargo: siguen siendo 60.342 palabras, el 20 % de cada fichero. Y 469 claves EN
huérfanas sin borrar, porque el detector no ve las que se traducen indirectamente —los nombres de
festival que manda el servidor— y borrar una viva rompería el inglés en silencio.

### Verificación

Script nuevo que cruza cada cadena castellana de cada página con los diccionarios EN, incluidas
las que se traducen indirectamente desde un array: **0 sin clave**. Las 15 rutas pintan en los dos
idiomas sin errores de consola, y con la interfaz en inglés no queda ni una línea larga en
castellano. Pruebas 339, sin cambios: aquí no hay comportamiento que probar.

## Beta 1.22 (1.0.22-beta) — 2026-08-21

**Criterion pasa de quince fichas sin casar a ocho, y las esperas dicen cuánto llevan.**

### Emparejado

Tres causas distintas, medidas sobre las 1.176 de Criterion con claves reales:

- **Los alias de quien dirige.** TMDB guarda a John Woo como «Wu Yu-Sheng» —la transcripción mandarina de 吳宇森— y «John Woo» solo vive entre sus alias: son dos nombres de la misma persona, no una variante que se pliegue comparando letras. Cuando todo lo demás falla se miran los `also_known_as` de la ficha candidata (`nombresDeDireccion`), exigiendo igualmente el título clavado. Rescata «The Killer», «Hard Boiled» y «Last Hurrah for Chivalry», y es el pan de cada día del cine asiático.
- **El título clavado puede vivir solo en el internacional**: «The Killer» es «The Killer (El asesino)» en castellano y «喋血雙雄» de original.
- **Cinco de las que fallaban no son películas.** Criterion edita miniseries: «Fishing with John», «Tanner '88», «The Underground Railroad». `esSerieEnTmdb` lo pregunta solo para lo que ya ha fallado —12 de 1.176— y lo cachea 30 días bajo `tv_check:`. Mejora también el registro estadounidense (23 → 20) y el IDFA.

Las ocho restantes son erratas de la propia Wikipedia («Harikari», «The Wages **for** Fear», «Berlin Alexanderplantz») y un crédito falso: «The Flight of the Phoenix» atribuida a Robert Altman, que la dirigió Robert Aldrich. Para eso está el ✎.

Cachés `festival` 17 → **18** y `film_match` v6 → **v7**.

### Rendimiento

- `manualChunks.react` nombraba `react-dom`, pero la app importa `react-dom/client`: nadie reclamaba los 264 KB del motor y caían en el trozo del índice. Índice 444 → 265 KB, react 51 → 233 KB.
- Biblioteca y Favoritos: tarjeta memorizada y manejadores estables. Medido con 780 tarjetas (35 ms por tecla, 80 ms por «Cargar más») y con 600 seguidos (29 ms por casilla).
- Listas: renderizado por tramos. Una lista de 5.000 ponía **21.257 nodos** para enseñar doce filas. El observador va contra la caja de scroll, no contra la ventana.

### Interfaz

- Salud abre con «N de M auditorías tienen algo que revisar» y atajos; las limpias se pliegan a una línea.
- Áreas táctiles bajo `sm`: botones de la casa a 40 px y ★ de seguir con caja mayor sin icono mayor (era 18×28 repetido sesenta veces). Los enlaces de la barra lateral siguen en 34.
- Visionado usa la tipografía de cifras del Dashboard, que es la misma cifra.

### Barras de progreso

- La rueda y el reloj estaban solo en las barras sin porcentaje, pero un porcentaje cierto puede quedarse clavado media espera: las cuatro consultas del Dashboard salen y vuelven a la vez. Ahora están en las dos, a los 12 s se explica por qué no hay porcentaje, y el 100 % dice que sigue en marcha en vez de «Listo».
- `/api/build-progress` tiene **una casilla para doce tareas**: el progreso del pase nocturno se pintaba bajo el rótulo de Cine venidero. `BuildProgress` acepta ahora `job` y, cuando no puede afinar, atribuye el número. El sondeo se comparte entre esperas (`useTareaDelServidor`).

Pruebas 336 → **339**.

## Beta 1.21 (1.0.21-beta) — 2026-08-21

**«Flow» apuntaba a otra película, y las notas de MDBList iban racionadas a 900 al día teniendo 25.000.**

### La fila sin dirección

La tabla del Óscar de animación no dice quién dirige —como la del Donatello, Sitges, el BIFA o el registro estadounidense—, así que la única prueba es el título. En TMDB hay **cuatro** películas de 2024 llamadas «Flow» y la buena es la que NO clava: «Straume» de original y «Flow, un mundo que salvar» en castellano, porque a TMDB se le pregunta en castellano.

El fallo se camuflaba solo: desde la 1.18 la dirección de esas filas se rellena desde TMDB, así que la ficha equivocada salía con su director equivocado y cuadraba por dentro. Comparar la dirección con la que acaba de dar TMDB es compararla consigo misma.

Dos reglas, solo para las filas sin dirección (con director, `directorsMatch` ya desempata):

1. **Se miran todos los candidatos** y decide el volumen de votos: Flow 2.997 contra 25, 0 y 0; «Crash» 3.962 contra 3 y 2; «Heat» 8.579 contra 16 y 3. El título internacional cuenta como prueba de pleno derecho.
2. **Sin ganador claro, no se elige ninguno.**

El título **clavado** y el que solo **contiene** al de la fila son dos niveles distintos: mezclados, «All In: The Story of Auburn's Undefeated 2010 Season» empataba con la «Undefeated» del Óscar y bloqueaba el desempate.

Medido: animación 0 sin ficha, documental 2, BIFA 0, Sitges 3 y Donatello 1 — los mismos de antes. El registro estadounidense pasa de 19 a 23 de 714, y una de las nuevas es «Dracula» de 1931, que existe dos veces ese año (la de Browning y la versión española de Melford): ahí no adivinar es lo correcto.

Cachés `festival` v16 → **v17** y `film_match` v5 → **v6**, que dura un año. El prefijo deja de estar escrito en dos sitios (`CLAVE_MATCH`).

### El cupo de MDBList

`mdblist_detected_limit` solo se escribía al pulsar «Probar» en Ajustes. Sin pulsarlo, el presupuesto se quedaba en el suelo conservador de 900 al día con una cuenta de 25.000, y el barrido nocturno se lo comía entero: el resto del día todo contestaba «agotado el cupo diario». Ahora se pregunta una vez al día, en el primer sitio que vaya a gastar. Medido en la cuenta real: de **817 peticiones disponibles a 19.915**.

### El botón «Actualizar notas»

«Ninguna nota nueva» valía para tres cosas distintas: no queda nada que pedir, se preguntó y MDBList no las tiene, o algo falla. Ahora las distingue.

Pruebas 328 → **336** (`emparejado-sin-direccion.test.js`).

## Beta 1.20 (1.0.20-beta) — 2026-08-21

**Auditoría del pase nocturno: ocho cosas que no mantenía nadie.**

### La caché de TMDB no se podaba nunca

De `tmdb_cache` solo se borraba lo obsoleto por versión y lo invalidado a mano. Lo que simplemente caduca no lo borraba nadie, así que la base crecía sin techo y la copia de cada noche se llevaba el bulto entero.

Paso nuevo justo antes de la copia. Los plazos salen del TTL más largo de la app —el año del emparejado por película; después, los 180 días de una edición pasada—: **400 días para `film_match:` y 200 para el resto**, con semanas de colchón. Se borra lo que ninguna lectura podría aceptar ya.

Y compacta: borrar filas en SQLite deja las páginas libres dentro del fichero, así que sin VACUUM la base no encoge y la copia sigue pesando igual. Solo al caer 2.000 entradas, porque compactar bloquea.

Se podan también los avisos del Dashboard de más de seis meses y el log de reglas, que antes solo se podaba **si había reglas activas**: al apagarlas todas, lo último se quedaba para siempre.

### Tres cosas que no se refrescaban solas

- **Sagas**: el paso llamaba a `scanSagas` pero nunca a `enrichSagaStats`, que es la que rellena «te faltan N de esta saga». Ahora van las dos.
- **Listas de MDBList**: solo había ruta manual, y son justo las que cambian por su cuenta. Se refresca lo parado más de siete días, tres por pasada, porque gastan del mismo cupo diario que las notas.
- **Estrenos y las parrillas top**: se reconstruían en la primera visita del día, y son las páginas más lentas. Ahora amanecen hechas —cuatro pestañas de Estrenos, huecos de dirección y de reparto, y grandes ausentes—, cada tarea con su try/catch y el paso cortado a los ocho minutos.

`releases` no lanza cuando TMDB corta a mitad: devuelve lo que pudo con sus errores dentro. Sin mirarlos, una noche con TMDB caído habría cantado «7 de 7 listas» dejando siete listas cojas cacheadas.

Pruebas 322 → **328** (`mantenimiento.test.js`). El pase pasa de 19 a **22 pasos**; el cron y el botón llaman a la misma rutina, así que no pueden divergir.

## Beta 1.19 (1.0.19-beta) — 2026-08-21

**El índice al revés: cada película dice en cuántos palmareses y cánones está. Y veinticinco fuentes nuevas, de Locarno a Criterion, sin tocar «Lo mejor del año».**

### Los avales: de la película a los premios

PowaFlex sabía ir de un premio a sus películas, no al revés — que es la pregunta del completismo: entre dos huecos con Σ parecida, ¿cuál pesa más? Una nota de 78 la tiene cualquier estreno correcto; estar en Cannes, en el César y en Sight & Sound, no.

Sale gratis: el paquete de la 1.17 son 4.794 filas con el `tmdb_id` ya resuelto de origen.

```
3.434 películas indexadas · 33 fuentes · 6 ms de construcción · 1.000 consultas en 2 ms
```

Se ve en cuatro sitios: los chips de la ficha (🏆 en lo ganado, puesto en los cánones), una marca sobre el cartel en las parrillas a partir de dos avales, el orden «Más avalada» en Descubrir huecos y un resumen en la ficha de persona.

El índice suma tres procedencias y nunca resta: el paquete, los datasets fijos y las filas de cualquier premio ya consultado. Por eso una película puede pasar de 3 a 4 avales —es información nueva, no una corrección— y la interfaz dice hasta qué año llega el paquete, para que «sin avales» no se lea como «no la premió nadie».

Implementación: el mapa de emparejados se lee con **una sola consulta** (fila a fila serían ~6.000 lecturas puntuales); las correcciones manuales mandan, y una corregida a «ninguna» retira el aval; estar en un canon no cuenta como premio ganado; y `avales.js` se engancha en la ruta, no desde `tmdb.js`, que haría ciclo.

### El índice se rellena solo

Las fuentes no empaquetadas solo aportan cuando sus filas están emparejadas, y eso pasa al abrir su palmarés. Paso nuevo del pase nocturno con dos frenos —seis fuentes y 900 películas por noche—, así que converge en unas pocas noches sin encadenar veinte reconstrucciones. Los catálogos gordos van al final de la cola: Criterion son 1.176 películas y por ese precio se encienden seis premios enteros. Una fuente que se intenta y sigue sin aportar no se reintenta hasta la semana siguiente. El paso se salta solo cuando no queda nada frío.

### Veinticinco fuentes nuevas: de 40 a 65

Verificadas con el parser de la casa antes de escribir una entrada, y comprobadas después por el camino real de la aplicación: 22 de 22 sirven palmarés, 1.463 ganadoras nuevas.

- **Festivales**: Locarno (94 Leopardos desde 1946), Rotterdam (75 Tigres) y Karlovy Vary (59 Globos de Cristal).
- **Los segundos premios de los tres grandes**, donde está media historia del cine europeo que nunca se llevó el gordo: Grand Prix de Cannes (67), Gran Premio del Jurado de Venecia (72) y de Berlín (69), más la Queer Palm (17). Cuelgan de su festival en el menú (campo `parent`).
- **Academias y crítica**: NSFC, Independent Spirit, BIFA, Lumière —que se falla un mes antes que el César—, Ariel, Cóndor de Plata, Golden Horse, Blue Dragon y Kinema Junpo, el canon japonés desde 1926.
- **Tres categorías más del Óscar**: dirección, animación y documental.
- **Animación y documental** como grupos aparte, con Annecy, los Annie y el IDFA: quien completa animación internacional no se guía por el Óscar.

Nada de esto entra en **«Lo mejor del año»**, que sigue con sus 32 fuentes: esa vista consulta todos sus palmareses al abrir un año sin cachear. Hay una prueba que fija el número.

### Tres catálogos que no van por año

Criterion, el AFI y el registro estadounidense van por puesto o por ingreso, no por año de premio, y de ahí el parser de palmareses no sacaba ni una fila. `parseListaTabulada` lee por cabecera, con las columnas declaradas en el registro:

- **Criterion**: 1.176 películas por número de espina, todas con dirección. Es un catálogo, no un canon crítico, y por eso vale: lo que Criterion restaura y edita es la señal más fiable de «búscala en condiciones».
- **AFI · 100**: las 100 de 2007, con filtro para las 23 que se cayeron de la lista de 1998.
- **National Film Registry**: 714 largometrajes y documentales, lo último admitido primero. El filtro descarta cortos, noticiarios y películas caseras: sin él eran 925, con más de doscientas que TMDB no puede casar.

Los tres no se empaquetan: no tienen año que cortar, y congelar un catálogo que crece cada mes sería mentir.

Dos arreglos del lector de Wikipedia: `awardSection: null` para los artículos con las tablas en la entradilla (el Cóndor), y el asterisco **final** de un título se quita —Criterion marca así lo descatalogado— pero el de dentro se respeta, o «M*A*S*H» se queda sin nombre.

### La trampa del generador

El paquete se generaba con `anuarioKeys()`. Con las veintidós entradas nuevas marcadas «fuera del anuario», `npm run snapshot` las habría dejado fuera justo a ellas. Ahora hay `empaquetables()` (53 claves) separado de `anuarioKeys()` (32), con una prueba que cruza las dos listas.

### Lo que no se hizo

No hay refactor de `Festival → Edición → Sección → Premio`: no existe un esquema de premios que ampliar —el registro es configuración y lo demás JSON cacheado— y lo útil de esa idea es el campo `parent`, que sí está. TSPDT-1000 y el Sight & Sound histórico se quedan fuera hasta que haya fuente: sus artículos no tienen tablas.

Pruebas 319 → **322** (`avales.test.js`, `listas-tabuladas.test.js`). Registro 40 → **65** entradas. «Lo mejor del año»: 32.

## Beta 1.18 (1.0.18-beta) — 2026-08-21

**Media «Lo mejor del año» estaba sin un nombre a quien seguir, y las filmografías podían ir una semana viejas.**

### El palmarés empaquetado llegaba sin dirección

Sundance, Sundance · EE UU, Sitges y el David di Donatello salían con cartel y con nota y sin una sola persona a la que seguir. Ninguno de los cuatro tiene columna de dirección (Sundance va en viñetas, Sitges pone cuatro premios en columnas, el Donatello acredita productores), y para eso la 1.15 y la 1.16 ya habían puesto que el nombre lo diera TMDB — pero desde la 1.17 esas filas llegan con el `tmdb_id` ya resuelto, y esa rama de `resolveFilms`, la más corta, era la única de las cuatro que no rellenaba la dirección. El relleno estaba escrito dos veces y el tercer camino se quedó fuera.

No cuesta una petición de más: la ficha con créditos se pide primero y `movieSummary` reaprovecha ese mismo superset. Si falla por red, la página no se cachea sin nombres.

Caché `festival` v15 → **v16**.

### Las filmografías de tus favoritos, releídas cada noche

`personCredits` cachea siete días, y ese plazo solo se adelantaba para quien apareciera en el feed global de cambios de TMDB, que no siempre recoge «le han añadido una película». Ahora el paso nocturno tira la filmografía de **todos tus favoritos vivos** sin mirar el feed: son decenas o cientos de personas, una petición por cabeza, dentro de pasos que ya recorren esa lista. Al resto de la biblioteca —miles— no se le toca. La ficha personal no se invalida: el paso de estado vital acaba de refrescarla.

Y la ficha de persona estrena **«⟳ Actualizar desde TMDB»** (`POST /api/people/by-tmdb/:tmdbId/refresh`), que invalida también el calendario y los huecos armados con esa filmografía.

### Estrenos: las Σ que faltan se vuelven a pedir

Un estreno se mira el día que se anuncia, cuando todavía no lo ha votado nadie, y `enrichWithScores` le deja la fila vacía. Como solo pide lo que no tiene fila, esa película se quedaba sin Σ para siempre — en la página donde la Σ es el filtro principal, y con las más nuevas, que son las que estrenan nota semanas después.

Ahora cada carga repasa lo que falta (`ponerNotas`, sobre `refrescarNotasDeReglas`): se reintenta lo parado tres días, así que se paga una vez cada tres días y no en cada visita. La lista cacheada no se reescribe, porque renovarle el plazo de doce horas impediría que se reconstruyera nunca. Botón **«Actualizar notas»** para forzarlo, contador de «N aún sin nota Σ», y `refrescarNotasDeReglas` devuelve cuántas **volvieron**: sin ese dato, una clave caducada y cuatro películas que MDBList no conoce daban el mismo «0 notas nuevas».

### El Dashboard dice qué ha bajado el robot, y por quién

Cuadro nuevo con los últimos 30 días agrupados por la persona a cuenta de la que entró cada película, con ✓ si ya tiene archivo y ⏳ si sigue pedida. Solo el pase de favoritos: «Últimas peticiones a Radarr», justo debajo, es la lista de Radarr entera y lo mezcla todo.

Columna nueva `radarr_rule_log.person`, con su migración; las filas anteriores se agrupan como «Sin persona apuntada».

### Descubrir huecos: dos interruptores

**«Ocultar las que ya están en Radarr»** —distinto del ✕, que es «esta no me interesa» y es para siempre— y **«Ocultar a quien no ofrece nada»** en la vista por persona, con el recuento debajo para que la página corta no parezca que se ha comido a alguien. Los dos se recuerdan y vuelven con «✕ Limpiar filtros».

### Cine venidero separa dirección de reparto

Lo que dirige tu gente es lo que el automático puede bajar solo; lo que sale de un actor o una actriz es exploración, y se elige a mano. Tres botones con su recuento, etiqueta en cada ficha y añadido en bloque respetando el filtro.

Esto **no se puede deducir de los créditos**: la lista de personas de cada estreno lleva siempre al director real, así que una película que entra por su actriz decía «Dirige Fulano» y se clasificaba como cosa de su dirección. El dato lo pone el servidor (`porDireccion`). Caché `calendar` v7 → **v8**.

Pruebas 296 → **303** (`lote-118.test.js`).

## Beta 1.17 (1.0.17-beta) — 2026-08-11

**Los palmareses cerrados vienen empaquetados con la app: Wikipedia se queda para lo que se mueve. Y entran Seminci y Sitges.**

### El palmarés, guardado hecho

Los años cerrados no cambian, y lo caro no era Wikipedia sino las **cuatro mil búsquedas contra TMDB** con su verificación de dirección.

`server/tools/snapshot-palmares.mjs` (`npm run snapshot`) corre los parsers y el emparejado de siempre y escribe `server/src/data/palmares-2026.js` con el `tmdb_id` ya resuelto: **4.794 filas de 31 palmareses hasta 2024, 98,5 % con ficha**. Cada premio dice hasta qué año está cerrado; de ahí en adelante manda la fuente viva.

| | antes | ahora |
|---|---|---|
| «Lo mejor de 1998» | 13,7 s · 126 peticiones | **2,1 s · 42** |
| Palmarés de Cannes | 27,5 s · 432 peticiones | **4,2 s · 111** |

Si Wikipedia falla, cambia el molde de una tabla o mueve un artículo, lo empaquetado se sigue sirviendo. Las correcciones manuales se aplican después, así que siguen mandando.

**Un fallo empaquetado se queda hasta que se regenere**, y lo que alguien arregle en Wikipedia sobre un año viejo no llega solo: `npm run snapshot` en cada temporada de premios. Verificado antes de publicar: el paquete dice exactamente lo mismo que la fuente viva en los 31 premios, fila a fila.

### Seminci y Sitges (38 → 40 entradas)

**Seminci**: 70 Espigas de Oro de 1958 a 2025, con dirección y país. Su tabla buena está en la Wikipedia española —la inglesa se conforma con una viñeta por año desde 1999—, así que `wikiParse` acepta idioma (`awardLang`), que viaja hasta la clave de caché y el enlace de la fuente.

**Sitges**: 46 ganadoras de 1972 a 2025. Su artículo pone cuatro premios en columnas de la misma tabla, donde «Best Director» no es quien dirige a la ganadora sino otro premio de otra película: dejarlo a la adivinanza habría dado *The Cremator* firmada por Robert Mulligan sin que nada chirriara. Sus columnas van declaradas (`awardColumns`).

### Cuatro fallos del parser que solo se ven metiendo tablas nuevas

- **La rejilla**: se expandía el `colspan` dentro de una fila pero no se arrastraba nada ENTRE filas, así que un `rowspan` dejaba hueco y las columnas de detrás se leían corridas. Silencioso y catastrófico en Sitges (1973 abre una celda vacía con `rowspan="5"`). Al arreglarlo aparece **el país que faltaba en media Cannes y media Venecia** y se enderezan **28 filas** que traían el título original en el campo de la dirección: la Concha de 1977, el Óscar de 1955, la Cámara de Oro de 2000 y catorce nominadas de Platform.
- **El espacio de ancho cero**: la Wikipedia española deja un `&#8203;` detrás de cada celda y `\s` no lo toca, así que «1958» dejaba de parecer un año y la tabla se leía corrida. Se van solo los invisibles sin significado: el ZWNJ persa es letra y se queda.
- **El empate escrito con «&»**: dos títulos en cursiva en la misma celda. Parte el ex aequo de Sitges de 1994 y desdobla la trilogía de Kieślowski en la EFA de 1994.
- Una película heredada por `rowspan` ya no se apunta dos veces (los Globos de 1961).

### El emparejado sin dirección, con el año puesto

Mirar las 46 fichas de Sitges una a una destapó **cuatro emparejados falsos con cero «sin ficha»**: «In the Light of the Moon» apuntaba a una película de 2025 homónima, el «Ringu» de 1999 a la versión de televisión de 1995, «The Cremator» a un documental nepalí sin fecha y «The Invitation» a un corto sin fecha.

Dos agujeros, los dos solo alcanzables en filas sin dirección: una ficha **sin fecha** entraba en la ventana de año y encima ordenaba por delante de las fechadas, así que el homónimo fantasma ganaba siempre; y la segunda vuelta **sin ventana de año** aceptaba cualquier título clavado a cualquier distancia. Ahora la ventana es asimétrica —hasta tres años atrás, uno hacia delante—, que es lo que un palmarés puede sostener.

Caché `film_match` v4 → v5: dura un año y no la barre el bump de `festival`.

### Directores emergentes: los palmareses también son radar

El detector solo miraba selecciones. Ahora mira también **diez palmareses** que alcanzan primeras películas, empezando por la **Cámara de Oro**, el premio a la mejor ópera prima de Cannes: entran también EFA, Mar del Plata, Óscar internacional, Goya, César, Seminci, Lola, Sitges y BAFTA.

Fuera quedan a propósito los que coronan carreras hechas, y el Guldbagge y el Donatello por una razón concreta: su columna «Director(s)» lista productores, y metidos en el radar el detector fichaba a un productor como promesa de la dirección sueca.

El límite de obra sube de tres largos a **cinco**, y ahí apareció lo que no se veía: quien tiene cuatro o cinco casi nunca las ha hecho en ocho años, así que el filtro de la obra no llegaba a aplicarse porque le echaba antes la fecha del debut. Separadas las dos ventanas —ocho años de ediciones, hasta doce de carrera—, con la guarda evidente: quien ya ganó la Palma, el León o el Oso dejó de ser una promesa ese mismo día.

Medido contra TMDB real: de 33 emergentes a **47**, 18 con señal de palmarés.

### Móvil y otros

- La tabla de los 30 archivos más pesados del Taller se aplastaba en vez de desbordar: el año pegado a la resolución («20041080»). Ancho mínimo y a deslizar; igual la de notas de Letterboxd de Visionado.
- El botón «Pedir N a Radarr» llevaba `ml-auto`, que en móvil lo dejaba sangrado a media línea.
- El detector traduce el nombre de sus fuentes, con un test que cruza la lista de la interfaz con el radar del servidor: es la clase de lista escrita a mano que en la 1.08 dejó una regla sin pintar.

Tests 277 → **296**. Caché `festival` v14 → v16.

## Beta 1.16 (1.0.16-beta) — 2026-08-11

**Cuando la lista de un premio se queda atrás, se mira la edición suelta. Y la dirección de las filas que no la traen sale de TMDB.**

### Manda la lista, pero la edición remata

El artículo-lista del Guldbagge terminaba en 2024 mientras la 61.ª edición —*Eagles of the Republic*, enero de 2026— llevaba meses con su propio artículo. Donde la gente escribe primero es en la edición.

Ahora, cuando la lista no llega al año que debería, se consulta el artículo de la edición de los años que faltan (hasta dos). La llave es general y no depende del idioma ni del orden: esos artículos van con el mismo molde —una rejilla de categorías, cada rótulo **enlazando al artículo del premio**— y ese enlace es el `awardPage` que ya está en el registro. Dentro, una viñeta por película con la ganadora en negrita, así que se rescatan también las nominadas del año.

Si el artículo no sigue el molde no se devuelve nada y el año se queda como estaba: es un respaldo, no una fuente. Y solo se consulta lo que la lista no tiene, así que en cuanto alguien la actualice estas peticiones dejan de hacerse solas.

Activado en los cuatro premios comprobados: **Guldbagge, Goya, BAFTA y Critics' Choice**. El Guldbagge pasa de 63 a 64 ganadoras y «Lo mejor de 2025» se queda sin ningún premio pendiente. Los otros tres tenían su lista al día y no añaden nada, que es justo lo que debe pasar.

### La dirección, de TMDB, cuando la fila no la trae

El David di Donatello acredita productores, así que sus 69 ganadoras salían **sin un solo nombre** ni estrella que pulsar. Ahora, cuando la fila no trae dirección y la ficha ya está emparejada, el nombre lo pone TMDB: 68 de las 69. La ficha ya estaba pedida por el emparejado, así que no cuesta una petición más, y el nombre se guarda en la caché por película.

Caché `festival` v13 → v14. 277 tests.

## Beta 1.15 (1.0.15-beta) — 2026-08-11

**Tres arreglos del emparejado salidos de mirar el palmarés recién estrenado.**

### El emparejado compara con los DOS títulos de la fila

Cada fila de Wikipedia nombra la película dos veces —internacional y original— y solo se comparaba con el primero. Eso dejaba fuera al candidato que TMDB guarda por el original (el Ástor de 1959 es *Smultronstället*, y TMDB lo tiene como *Fresas salvajes*) y abría la puerta a un parecido: ese año acabó emparejado con ***Bakomfilm Smultronstället*, el making-of**, también de 1957 y también de Bergman.

Ahora los dos nombres cuentan como prueba, que es lo que son, y la verificación de dirección sigue intacta. **De 13 películas sin casar a 9** en los 32 palmareses (2.000 fichas): se rescata también *King of Ping Pong*.

### La dirección de las fichas rescatadas por el equipo sale de TMDB

La 1.14 estrenó la vuelta que rescata fichas verificando contra producción y guion, pero la ficha se quedaba con el nombre de la celda: ***Paradise Is Burning* aparecía dirigida por Nima Yousefi**, que es su productor, y *Triangle of Sadness* por Erik Hemmendorff en vez de por Ruben Östlund. Cuando el rescate es por el equipo ya se sabe que esa celda no traía dirección: la buena es la de TMDB, y viaja también en la caché por película.

### Cachés

`festival` v12 → v13 y **`film_match` v3 → v4**: esa dura un año y no la barre el bump de `festival`, así que sin subirla los aciertos viejos —el making-of incluido— habrían sobrevivido.

### Lo que no se puede arreglar desde aquí

El **Guldbagge de 2025** falta porque la lista de Wikipedia termina en 2024. La 61.ª sí se falló —enero de 2026, *Eagles of the Republic*— y tiene su propio artículo, pero nadie ha llevado el dato a la lista. Sale como «sin fallar todavía», que es la verdad que la fuente sostiene.

275 tests.

## Beta 1.14 (1.0.14-beta) — 2026-08-11

**Trece premios nuevos, la vista «Lo mejor del año» y seis fallos del parser de Wikipedia que solo se veían al meter tablas nuevas.**

### Trece entradas nuevas (25 → 38)

Partiendo del resumen anual de FilmAffinity, se comprobó uno a uno qué tiene detrás un artículo con la forma que sabe leer `server/src/festivals.js`:

- **Asociaciones de críticos** (grupo nuevo dentro de Premios): NBR, Nueva York, Los Ángeles, Chicago, Boston y Critics' Choice. Es el bloque que faltaba: hasta ahora solo había academias de la industria, y estos fallan primero y marcan la temporada.
- **Premios nacionales**: Globos de Oro (drama y comedia/musical como dos entradas), David di Donatello, Guldbagge y Lola.
- **Festivales**: el **Premio del Público de Toronto** —el premio gordo del TIFF y el mejor pronóstico del Óscar que existe; la entrada `tiff` seguía el Platform Prize, que es la competición con jurado— y Mar del Plata.

Sitges y Seminci se descartan de momento: necesitan parser propio.

### «Lo mejor del año»

El cuarto rótulo de arriba cambia de modo y enseña **la ganadora de los treinta palmareses en un mismo año**, agrupada en Festivales / Debut / Premios / Crítica / Cánones, de 1927 a 2027.

Sale de lo que ya había: reaprovecha el palmarés cacheado de cada premio y, si no lo hay, trae del artículo solo las filas (cacheadas un día). Un premio que falle no tumba el año —se queda fuera con su motivo— y los que aún no se han fallado salen por su nombre, que en el año en curso es información y no un hueco.

**El César es el único cuya tabla va por año de gala**: su fila «2026 (51.ª)» premia el cine francés de 2025. En el anuario se lee con el desfase puesto y el rótulo lo dice. Se comprobó una por una que ninguna otra entrada lo necesita.

### Seis fallos del parser

1. **«Tiene fondo, luego ganó» era falso.** El sombreado de la ganadora no es un color fijo, así que valía cualquier `background`. Pero Critics' Choice y el Donatello pintan sus filas **a rayas con un gris**, y media lista de nominadas salía marcada como ganadora. Ahora un gris neutro (r≈g≈b) es decoración y solo un color con tono es la marca (`esGrisNeutro`).
2. **La fila de año exigía la tabla completa.** El Lola omite la columna del trofeo en casi todas sus filas: «1955» dejaba de reconocerse como año, pasaba a ser el título de la película de 1954 y el original acababa en el campo del director. El discriminador es la cursiva: una celda de título va en `<i>` o enlazada, una de año nunca. Así «1917» de nominada sigue siendo una película.
3. **Los colspan descolocaban las columnas**: una celda con `colspan` ocupa varias y se contaba como una. Ahora se coloca en todas las que ocupa (`expandirColspan`). Sin esto, los Globos de 1959 sacaban el musical con el nombre de su director de título.
4. **Un empate en una sola celda se perdía entero.** Boston 2008 mete *Slumdog Millionaire* y *WALL-E* partidos por `<br>`. Se desdobla por el salto de línea, que no cabe dentro de un título (la coma sí), salvo en la celda de dirección con un solo título, que es una codirección: la Palma de 1946 y la de 1956.
5. **Dos premios en columnas gemelas**: los Globos de 1958-1962, cuando comedia y musical eran premios distintos, ponen dos pares (película, dirección) en la misma fila. **De 69 películas a 79.**
6. **El año sin nominadas desaparecía**: si trae una sola película no va sombreado, y Chicago 2004 se caía del palmarés sin rastro. Y el rango «1971–1995 · Festival Cancelled» con el que Mar del Plata tapa los inviernos que no se celebró entraba como si fuera una película.

### Y tres del emparejado contra TMDB

- **Un 404 abortaba la resolución entera.** La búsqueda de TMDB devuelve fichas fantasma —entradas borradas que su índice todavía sirve— y pedir sus créditos da 404. Como cualquier error se leía como corte de red, se abandonaba la película **con la candidata buena esperando detrás**: así se quedaron sin ficha *Der bewegte Mann* y *Die Artisten in der Zirkuskuppel*. De propina, esas páginas repetían la ráfaga en cada visita porque no se cacheaban.
- **La columna «Director(s)» del Guldbagge trae productores** en los años recientes. Vuelta nueva: con el título **clavado** y ningún director que verifique, se comprueba contra producción y guion de esa ficha (`movieCrewNames`). Siguen siendo dos pruebas.
- **Los diminutivos ingleses**: Wikipedia acredita «Thomas McCarthy» y «Rick Kaplan»; TMDB, «Tom» y «Richard». Lista en `names.js`, solo corto ↔ largo.
- Y lo que ganó un premio de cine y no es cine se marca como serie: *Small Axe*, premio de los críticos de Los Ángeles de 2020, es una antología de la BBC.

**Medido:** 1.999 películas en los 32 palmareses con ficha, **13 sin casar (0,65 %)**, y 11 son entradas viejas que esta versión no toca. Los trece premios nuevos suman 806 películas con 2 sin casar.

Verificación: el parser anterior y el nuevo sobre el mismo HTML de los trece premios que ya existían dan salida idéntica byte a byte, salvo ocho títulos del Óscar internacional que pierden un «‡» de leyenda que no debían llevar. 275 tests (14 nuevos), caché de festivales a v12.

## Beta 1.13 (1.0.13-beta) — 2026-08-10

**Los nueve segundos de Visionado eran un índice que faltaba. Y de paso: React vivía dentro del paquete de las gráficas y Favoritos pedía a Wikipedia una pestaña que no estabas mirando.**

### Primero, poder medir

La demo con la que se desarrolla tiene 423 películas y ahí **no se reproduce ningún problema de rendimiento**: todo respondía por debajo de 30 ms mientras en una biblioteca de verdad había esperas de segundos. Esta versión empieza fabricando una base sintética del tamaño real —12.400 películas, 15.114 personas, 160.610 créditos, 8.117 entradas de Letterboxd— y midiendo contra ella. Queda como `powaflex-grande` en `.claude/launch.json`.

### Los 9 segundos de Visionado: `idx_lb_movie`

`/api/mdblist/insights` tardaba **9,09 s y no cacheaba nunca**. Sus cinco consultas calculan «tu nota» con una subconsulta correlacionada sobre `lb_entries` —hasta tres veces por fila— y esa tabla solo tenía índice por `list`: cada una de las 12.400 películas recorría las 8.117 entradas enteras, tres veces. Con `CREATE INDEX idx_lb_movie ON lb_entries(movie_id)`, de **9,09 s a 0,031 s: 293×**. La página entera pasa de 9,1 s a 0,15 s.

El índice se crea al arrancar (`IF NOT EXISTS` en el bloque de esquema): no hay migración que lanzar.

No se ha partido en subpestañas —estaba en el encargo— porque con el índice resuelto ninguna pestaña ahorraría espera y solo añadiría clics para ver lo mismo.

### Favoritos: 25,7 segundos por una pestaña que no mirabas

`/api/people/festival-packs` baja ~30 tablas de Wikipedia y tarda **25.765 ms en frío**, y se pedía al montar la página para alimentar «Añadir», que no es la que se abre. Partida con el nuevo `<Subpestanas>`: **25.765 ms → 114 ms** al entrar. La espera de Wikipedia, cuando de verdad la pides, dice por qué tarda.

### React vivía dentro del paquete de recharts

`manualChunks: { recharts: ['recharts'] }` parecía aislar las gráficas, pero React es su dependencia y ese era el primer grupo que la reclamaba: **las 415 KB las descargaba y ejecutaba toda la app**, incluidas las páginas sin una sola gráfica. Declarando `react` aparte, cada uno va a lo suyo. Y las gráficas de Visionado y del Dashboard salen a módulos diferidos (`web/src/pages/charts/`): en Visionado el JavaScript de la página está listo a los 38 ms y recharts ni se pide hasta los 147, con la página ya pintada.

### Toda espera dice qué hace y por dónde va

Los 28 `<Spinner>` mudos pasan a `<Progreso>`: el paso con nombre, «2 de 4» y el porcentaje, que es **peticiones terminadas sobre el total** y nunca una animación que finge avanzar. Con una sola petición no hay porcentaje honesto: nombre de lo que se trae, barra indeterminada y, pasados cuatro segundos, «Llevamos N s».

Donde el servidor publica su avance real —el calendario y los huecos, vía `/api/build-progress`— se respeta la barra que ya había. Aviso anotado: `/api/festivals/:clave/:año` y `/palmares` no publican ahí, así que una barra en Festivales enseñaría el avance de OTRA tarea.

### Lo que pesaba de más

- Las parrillas de Descubrir mandaban campos que el servidor usa por dentro y el navegador tira: podados antes de cachear, ~650 → 484 KB.
- `/api/letterboxd/summary` mandaba todas las notas del diario y la tabla pinta 200: `LIMIT 200` en origen, **102 → 26 KB**.
- Los recorridos largos ceden el turno al bucle de eventos (`cedeElHilo` en `pool.js`) para que el servidor no se quede mudo durante una pasada.

Tests 255 → **261** (`server/test/rendimiento.test.js`). Cachés de Descubrir subidas de versión.

## Beta 1.12 (1.0.12-beta) — 2026-08-10

**Seis agentes auditando y siete arreglando: el menú de Festivales plegado, las 1001 al galope, los filtros a una sola voz y el móvil pulsable.**

### El menú de Festivales, plegado

Desplegado eran ~24 botones y en móvil casi tres pantallas antes de la primera película. Ahora arranca plegado en Festivales / Premios / Cánones, con las secciones de debut como subgrupo rotulado dentro de Festivales, y la selección activa queda a la vista como chip dorado aunque su categoría esté plegada.

### Las 1001 (y todos los palmareses gordos), rápidas

- **Sin compresión HTTP**: el palmarés eran 282 KB de JSON en claro. `@fastify/compress` global los deja en ~70 KB, y beneficia a toda la API.
- **`decorateLive` bloqueaba cada visita** con una llamada viva a MDBList: ~300-400 ms por petición cacheada y 50 peticiones del presupuesto diario. Ahora sirve con lo que hay en `mdb_ratings` y pide lo que falte en `setImmediate`: **300 ms → 11 ms** en caliente. `watchedIndex()` y el set de biblioteca se memoizan 60 s.
- **La reconstrucción mensual eran ~1.001 GETs a TMDB**: `film_match` (v2→v3) solo guardaba `{id}` y el cartel venía de una caché de siete días ya caducada. Ahora la entrada guarda `poster_path` y `date` (TTL 365 días). El pool de `resolveFilms` sube de 5 a 10.
- **La parrilla pintaba las 1001 tarjetas de golpe**: 15.176 nodos y cada clic re-renderizaba todo. Ahora pinta 120 y carga por tramos con `IntersectionObserver`, con la tarjeta en `React.memo` y props primitivas: **2.111 nodos** en el primer pintado.

### Las cuatro de las 1001 sin casar, cerradas

- `festivalWinners` **tiraba el `tmdb_id`** de las listas fijas antes de llegar a `resolveFilms`, que ya sabía respetarlo. **The Killer** (Woo, 1989) y **The Ear** (Ucho, 1970; TMDB la fecha en 1990 por la prohibición, fuera de la ventana de ±1 año) llevan su ficha fijada en el dataset con su porqué.
- **The Sorrow and the Pity no existe como película en TMDB**, solo como entrada de televisión: `tv: true`, como **Lovers Rock**, que es un episodio de Small Axe. Las filas `tv` ni se buscan ni cuentan como fallo — el hueco explicado deja de parecer avería.
- De propina: tres codirectores fantasma heredados de Wikidata fuera del dataset del Óscar; la **Ł mayúscula** entra en el plegado de `names.js` («Łoziński» normalizaba a «ozinski»); los años vecinos con `year` nulo ya no lanzan búsquedas con `primary_release_year=1`; y las filas sin director pueden casar fuera de la ventana de año con título clavado. Caché `festival` v10 → v11.

### Los filtros, a una sola voz

El mismo concepto tenía hasta cinco nombres. En `components.jsx` viven ahora `OwnFilterBar` (Todas/Me faltan/Las tengo), `typeCounts` (las siete claves siempre contadas: se acabaron los chips fantasma sin recuento en Calendario, Descubrir y la ficha de persona), `SortSelect` y `useMinScore` — el listón Σ pasa a una clave compartida, así que puesto en Estrenos te sigue a Festivales. La nota de MDBList se llama «Nota combinada Σ» en todas partes (había cuatro nombres), y los demográficos de Personas y Descubrir comparten persistencia.

### Móvil pulsable, escritorio que avisa

- Los tres controles de la barra móvil medían 18-20 px: ahora ~40 px de área táctil sin mover el dibujo, igual que la X de la Ficha y el ✎ de corregir emparejado. Los campos suben a 16 px en móvil, así que iOS deja de hacer zoom al enfocar. El cajón usa `h-dvh` y bloquea el fondo.
- Borrar un canon propio, quitar un reto o dejar de seguir una lista piden confirmación con su nombre; Favoritos, la ficha de persona y Listas comprueban `r.error` antes de cantar éxito (con el servidor caído la estrella mentía).
- La Biblioteca busca al teclear con debounce y guardia de carrera (antes exigía Enter sin decirlo y una respuesta lenta pisaba a la nueva); la paleta ⌘K desplaza la fila activa con ↑/↓.

### /novedades, en inglés

`i18n/en/novedades.js` traduce los 88 textos del historial. Regla anotada en el propio fichero: cada versión exige sus claves EN.

Tests 253 → **255**. Verificado en navegador en ES y EN, a 375 px y en escritorio.

## Beta 1.11 (1.0.11-beta) — 2026-08-10

**Las 1001 películas, los palmareses que faltaban de Cannes y Sundance, el Óscar completo de verdad, y la cuarentena sin códigos.**

### Las 1001 películas, como canon

El libro de Schneider (15.ª edición, 2021 — la «edición 2024» que circula no existe como libro) entra en Cánones junto a Sight & Sound y Cahiers: 1001 fichas en el orden cronológico del libro, 997 casadas a la primera. De las cuatro restantes, una está bien sin ficha: Lovers Rock es un episodio de Small Axe.

### Los palmareses de las paralelas de Cannes

La **Cámara de Oro** —la mejor ópera prima de todo Cannes, el radar de debuts por excelencia— tiene entrada propia con sus 50 ganadoras desde 1978. Un Certain Regard (29 desde 1998) y la Semana de la Crítica (26 del Gran Premio) ganan palmarés histórico. El motor de reglas los ofrece solo: todo sale del registro, sin listas a mano.

### Sundance EE UU: de 21 fichas con 3 rotas a 47 sin ninguna

El parser fallaba de cuatro maneras: las iniciales («A.V. Rockwell»), las partículas («Beth de Araújo»), un «by» que era parte del título («Precious: Based on the Novel "Push" **by Sapphire**» ponía a la novelista de directora) y el empate del 2000 sin partir en dos. Y el palmarés empezaba en 2005 porque copió el corte de la competición internacional, cuando el premio estadounidense es de 1984: Blood Simple, The Brothers McMullen y veintitrés más quedaban fuera. La revisión adversarial cazó dos pérdidas más: el «U. S.» con espacio de 2013 borraba a **Fruitvale Station** en silencio, y los empates en dos líneas perdían la segunda ganadora.

### El Óscar, completo de verdad

Al dataset le faltaba hasta **Forrest Gump como ganadora**, y La La Land, Top Gun: Maverick, The Holdovers… La causa es fina: en Wikidata la nominación al Óscar la tienen los *productores*, no las películas. Regenerado contra los artículos de las 98 ceremonias: 621 filas, 98 ganadoras, las cuatro galas recientes con sus 10 nominadas, y un agente verificándolo después contra fuentes (que cazó dos años mal y un director espurio).

### La cuarentena, sin códigos

Los criterios se eligen por **nombre**: escribes «hindi» o «Taiwán» y pulsas el chip, con buscador y sugerencias en el idioma de la interfaz (los saca el navegador, sin datasets que mantener). Por debajo se guardan los mismos códigos de siempre: el motor y las copias no se enteran.

### Más emparejado fino

- Para filas sin director el título es la única prueba y ahora se exige clavado, con tres tolerancias medidas: las erratas de letras dobladas («Angelo azzuro»), los subtítulos de verdad («Personal Velocity: Three Portraits» — un ordinal NO es un subtítulo, Halloween II no cuela) y el título internacional exacto («Three Seasons», que en TMDB es «Ba mùa»).
- Los apellidos transliterados del francés pliegan sus dígrafos («Chukhrai»/«Tchoukhrai»), pero solo cuando pliega un lado: Boucher y Butcher siguen siendo dos personas.
- Los espacios finos y los marcadores de idioma de Wikipedia ya no rompen títulos («Veni Vidi Vici»), y los bloques de cortos de Orizzonti 2026 no se cuelan como películas.

### Y además

- Los pesos de las cinco señales del detector de emergentes tienen interfaz en Ajustes → Automatismos (vacío = de fábrica).
- Dirección y reparto son clicables en cualquier ficha aunque no estén en tu biblioteca; en Cine venidero, igual.
- «Actualizar todo» ya no dice «sin configurar» cuando un paso semanal simplemente no toca: dice «al día» y cuándo fue la última vez.
- Cuatro agentes (dos probadores en bucle, un revisor adversarial y un verificador de datos) repasaron el conjunto: sus once hallazgos están arreglados y fijados con tests. Suite 234 → **253**.

## Beta 1.10 (1.0.10-beta) — 2026-08-09

**La auditoría de cuatro agentes sobre el emparejado, y los nombres clicables.**

Cuatro agentes recorrieron todas las secciones de Festivales y premios contra TMDB real —1.240 fichas—. Todos los hallazgos se comprobaron a mano antes de tocar nada.

### El fallo que dejaba fichas sin cartel

Cuando a una fila de Wikipedia le falta una celda, el parser suponía SIEMPRE que la que faltaba era el título original, y corría las columnas. Pero muy a menudo la que falta es el **país**, absorbido por el `rowspan` de la fila de arriba: el campo del director acababa conteniendo el título original —`director: "Las palabras de Max"`— y, como el emparejado exige verificar la dirección, la película se descartaba. Invisible salvo por la ficha ausente.

Por número de celdas los dos casos no se distinguen. **Lo decide la cursiva**: en estas tablas los títulos van en `<i>` y las personas no. Quedan a cero los directores corruptos en los cuatro palmareses grandes y aparecen filas que se caían enteras (Berlinale 85 → 88, Cannes 100 → 103).

### Un agujero de verificación

`normName` borra todo lo que no sea `a-z0-9`, así que un nombre en japonés, cirílico, árabe o griego se normalizaba a **cadena vacía** — y «contiene la cadena vacía» es siempre cierto. Cualquier película acreditada a alguien en su alfabeto casaba con cualquier fila de Wikipedia y podía colar la ficha de otra. Sin letras que comparar no hay verificación: ahora se dice que no.

### El emparejado, cerrado: 263 de 264 en el canon

Comprobado contra TMDB real por el endpoint, no simulado:

- **El corte de candidatos tiraba el año.** Se pedía «The Leopard» con año 1962 y luego se cortaba la lista a diez **por popularidad**, así que *Il gattopardo* se caía antes de que nadie comprobara su dirección. Ahora se ordena por año y título antes de cortar, y se prueban los años vecinos (el BFI fecha por producción y TMDB por estreno comercial).
- **El nombre de quien dirige**: «Charles» contra «Charlie» Chaplin tiraba todas las suyas. También «The Wachowskis», «Larissa/Larisa» y «Forough/Forugh». Y TMDB acredita a Wang Bing como **王兵**: ahora se transcribe con el mismo mecanismo que ya usaba la app para los títulos.
- **Buscar dentro de la filmografía del director** cuando por título no sale: así aparecen *L'Intrus* (entre doce «The Intruder») y *Tie Xi Qu*. Se prueban varias personas por nombre: hay cuatro «Wang Bing» en TMDB y el bueno no es el más popular.
- **Lo que NO se acepta**: «la única película suya de ese año». Con esa regla *Twin Peaks: The Return* —que es una serie— se emparejó con *Trial*, otro trabajo de Lynch. Sigue mandando «mejor sin ficha que la ficha de otra», y las series del canon se marcan como tales en vez de dejar un hueco que parece avería.

### Secciones nuevas

**Cannes · Un Certain Regard**, la segunda competición oficial, comprobada de 2010 a 2026. Y **Sundance · Competición de EE UU**: faltaba medio Sundance, porque la entrada anterior seguía solo el World Cinema Dramatic y el premio que ganó CODA no estaba en ninguna parte. 42 ganadoras de 1984 a 2026.

De paso, dos fallos del parser de Sundance: **2018, 2019 y 2020 se perdían enteros** —esos años la lista usa dos puntos en vez de guion y las filas se caían en silencio, sin contar siquiera como «sin emparejar»— y el paréntesis del título original se leía como director. El palmarés internacional pasa de 19 a 22 ganadoras.

### La ganadora, marcada y la primera

Al abrir la edición de un festival, su ganadora sale arriba del todo con su 🏆. Sale de las filas del premio, que ya están cacheadas; las secciones sin palmarés propio no marcan a nadie.

### El nombre de cualquier director, clicable

Esté en tus favoritos, en tu biblioteca o en ninguna parte. La ruta admite el id local, el de TMDB o **solo el nombre**, que es todo lo que dan las tablas de Wikipedia, y se resuelve al pulsar: enlazar los doscientos nombres de un canon no cuesta ni una petición hasta que se usa uno.

Tests 230 → 234.

## Beta 1.09 (1.0.9-beta) — 2026-08-09

**El logotipo entero, y la razón de fondo por la que faltaban carteles.**

### El emparejado buscaba en el idioma equivocado

Ocho fichas sin cartel en el canon de Sight & Sound, por dos causas distintas:

- **Cinco fallaban por el IDIOMA DE LA BÚSQUEDA**, y eso afectaba a todo, no solo al canon. `tmdbGet` manda `language` en todas las llamadas, y TMDB compara la consulta contra el título original y contra el traducido al idioma que pidas, **pero no contra el inglés**. Con la interfaz en español, «The Leopard» devolvía «El hombre leopardo», «The Leopard Lady» y «The Leopard Son» —las que de verdad se llaman así en español— y nunca «Il gattopardo». Como los cánones y las tablas de Wikipedia están escritos en inglés, **ninguna película con título original en otra lengua podía encontrarse**. Ahora hay una vuelta extra en inglés: en festivales y cánones cuando la lista se queda corta (allí la verificación de dirección sigue filtrando), y en Letterboxd solo cuando no se ha encontrado nada, porque ahí no hay verificación detrás.
- **Tres fallaban por el NOMBRE de quien dirige**: «The Wachowskis» contra «Lana / Lilly Wachowski», «Larissa» contra «Larisa», «Forough Farokhzad» contra «Forugh Farrokhzad». La comparación tolera ahora el artículo suelto, el plural de un colectivo, las letras dobles que cada fuente transcribe a su manera y, como último recurso, una letra de diferencia en palabras largas. No relaja la regla de la casa: esa comparación no elige película, solo confirma una que ya coincidió en título y año.
- Al reescribirla, la abreviatura bidireccional hizo que **«Carla Theron» colara como «Carl Th. Dreyer»**. Lo cazó su propio test: solo el token largo puede empezar por el corto («Theodor» por «Th.»), nunca al revés.

Cachés `movie_cands2` → `movie_cands3` y `festival` v7 → v8, para reintentar todo lo guardado como «sin ficha en TMDB».

### El logotipo

El símbolo hace de inicial y el texto no repite la P ni la F, así que se lee **POWA / FLEX**. Apilado en la barra lateral, de una línea en la de móvil.

- No es una imagen sino tres piezas montadas —el monograma, el texto y una **X de película en SVG**, dos tiras perforadas cruzadas—, así que queda nítido a cualquier tamaño.
- La tipografía va fijada a Archivo Black y no usa la clase `font-display`, porque esa variable cambia con el aspecto: en Cinemateca es una Bodoni con serifas. El logotipo es el mismo dibujo en los tres aspectos; lo único que cambia es la tinta.
- El símbolo usa una copia de `icon.png` **recortada a sangre**: el icono lleva un 16,6 % de aire transparente que necesita como favicon, y dentro del logotipo abría un hueco entre la P y «OWA» que rompía la palabra.
- De una sola tinta, como manda el pliego: se va el «Flex» en dorado.

Tests 226 → 228.

## Beta 1.08 (1.0.8-beta) — 2026-08-09

**Detector de directores emergentes, y la cuarentena pre-Radarr terminada.**

### Directores emergentes

Quién puede ser un grande dentro de diez años. La ventaja injusta es que PowaFlex ya tiene parseadas y cacheadas las tablas de selección oficial: ahí aparecen los grandes antes de serlo, así que el detector se apoya en eso y no en notas agregadas.

- **Cinco secciones de DEBUT nuevas** en el registro, que es el mayor salto de calidad de la señal: Semana de la Crítica y Quincena de Cannes, Orizzonti, Perspectives/Encounters de la Berlinale y Nuevos Directores de San Sebastián. Hasta ahora solo se parseaba la competición principal, que es justo donde los emergentes **todavía no están**. Los nombres se comprobaron uno a uno de 2010 a 2026: la Berlinale cambió Encounters por Perspectives en 2025 y Venecia titula la suya «Horizons (Orizzonti)» en los artículos viejos.
- **`emergentes.js`** con cinco señales: consagración institucional (la que más pesa; la **segunda** selección vale más que la primera y ganar dobla la plaza), consenso crítico, tracción real de Letterboxd con los votos de IMDb como umbral de ruido, aceleración (¿la segunda película sube en nota, volumen y nivel de festival?) y afinidad con lo que tú puntúas alto.
- **«Sin dato no es cero»**: la señal sin datos sale del reparto y las demás se reparten su peso, para que un debut sin Metacritic no quede por detrás de una película mediana solo porque de la mediana haya más datos. Sin esto el detector premiaría lo más documentado, que es lo anglosajón.
- **La ficha enseña el desglose**: cuántos puntos pone cada señal y con qué datos («Cannes · Semana de la Crítica 2025 🏆 · Busan 2021», «Metacritic 79 de media»). Sin desglose es un oráculo, y de un oráculo no te fías. El servidor manda las piezas y las frases se componen en el cliente, así que se lee igual en inglés.
- **Página `/emergentes`** con parrilla, ★ de seguir por id de TMDB ya verificado —resolverlo otra vez sería arriesgarse al homónimo—, ✕ con deshacer, filtros de continente, país y sexo, y cuatro ordenaciones.
- **Elegibilidad**: de uno a tres largometrajes estrenados, primer largo en los últimos ocho años, vivo, ni seguido ni descartado. Cortos, telefilmes y documentales ajenos se descuentan con `enrichRuntimes`, que es lo que impide que un debutante parezca prolífico.
- **Paso nocturno semanal** detrás de la vigía de festivales, cuando las ediciones ya están en caché. Tope de 90 personas resueltas por pasada, y **lo que el tope deja fuera se dice en el informe**: un tope silencioso se lee como «no había nadie más».
- **Tipo de regla `emergentes`**: «mándame la ópera prima de todo emergente con 70 o más». Su umbral es el del detector —la persona—, no la Σ de la película, y la interfaz lo dice.
- Las dos tablas son reconstruibles enteras; la ✕ vive aparte, en `emerging_dismissed`, para que una reconstrucción no resucite a quien ya dijiste que no.

### Cuarentena pre-Radarr, terminada

- **El aviso**: lo que cae en cuarentena sale en las novedades del Dashboard y pone un contador ámbar en Ajustes. Una bandeja metida en una pestaña que nadie mira no sirve de nada. El recuento sale también en el pase nocturno.
- **Cartel, y el motivo traducible**: el motivo viaja partido (`idioma` + `hi`) en vez de como frase hecha en castellano, así que la bandeja se lee en inglés. Y decidir «esta sí, esta no» sobre un título que no conoces necesita ver el cartel.
- **Aprobar y vetar en bloque**: una regla sobre un país entero deja veinte esperando en una noche y de una en una la bandeja se abandona. Aprobar en bloque no se detiene en el primer fallo, y lo que Radarr rechazó se queda en la bandeja y se dice cuántas.
- **La bandeja se purga sola** de lo que acabaste teniendo en Plex o en Radarr por tu cuenta: pedirte permiso para bajar algo que ya bajaste se lee como una avería.
- Las casillas de criterios devuelven lo que escribiste («IN»), no la lista normalizada.

### De paso

- **Una fila-cabecera dentro de una tabla de Wikipedia ya no se cuela como película fantasma**: las paralelas de Cannes parten su tabla con filas de una sola celda («In Competition», «Feature films») que se estaban buscando en TMDB como si fueran títulos.
- Los continentes se traducen, lo que afecta también a los filtros de Personas, que comparten diccionario.

Tests 187 → **222**.

## Beta 1.07 (1.0.7-beta) — 2026-08-09

**Reglas automáticas a Radarr.** El pase automático deja de ser un interruptor único —«los estrenos de mis directores favoritos»— y pasa a ser un motor de reglas: cada una vigila una cosa, se activa y se afina por separado, y se pueden tener todas las que se quieran.

- **Tres clases de regla.** *Festivales, premios y cánones*: los 16 del registro, cada uno con las vistas que de verdad tiene (Busan y Horizontes Latinos no ofrecen palmarés porque no lo tienen; Sight & Sound no ofrece edición por año). *Estrenos*: las cuatro pestañas de cines y plataformas de España y EE UU. *Mis favoritos*: los seis oficios por separado, así que se puede seguir lo que dirige uno y lo que compone otro sin mezclarlos.
- **Umbral Σ de 0 a 100 por regla, con barrita.** En 0 no filtra: entra todo, tenga nota o no. Con umbral, lo que aún no tiene nota **espera** a la siguiente pasada en vez de irse a ciegas, y hay una casilla para quien prefiera lo contrario.
- **Los estrenos se vigilan una quincena antes y después de su fecha** (configurable): cada noche se vuelve a mirar su nota, y entran el día que cruzan el umbral, no el día que se anuncian.
- **Tope por pasada**, 20 por defecto: un palmarés histórico son cientos de películas y sin tope la primera noche te llena el disco.
- **El auto-Radarr de siempre se migra a una regla** conservando tu horizonte, tu retrovisor y tus documentales. Si lo tenías apagado, nace apagada.
- **Cada pasada explica lo que NO hizo**: ya la tienes, vetada, descartada, corto, documental, telefilme, papel testimonial, fuera de la ventana, esperando nota, bajo el umbral, aplazada por el tope. Un «0 añadidas» a secas es indistinguible de una avería.
- **Historial de 30 días con un 🚫 por película**: como las reglas se reevalúan cada noche, borrar algo de Radarr a mano no basta, volvería. El 🚫 es lo que hace que no vuelva por ninguna regla.

**Ajustes, por pestañas.** La página había llegado a quince bloques y once pantallas de scroll, con la numeración «1 · Plex … 6 · Descubrir huecos» rota por en medio y el botón de guardar enterrado a dos tercios. Ahora son cinco pestañas —Conexiones, Fuentes y notas, Automatismos, Interfaz y Mantenimiento— con «Actualizar todo» fuera de ellas y la barra de guardar fija abajo. Los enlaces de otras páginas aterrizan en su pestaña.

De paso: **los ajustes de la copia automática no se podían guardar**, porque vivían por debajo del único botón de guardar de la página.

**Últimas novedades**: página nueva con lo que trae cada versión, en cristiano. No confundir con las «🔔 Novedades» del Dashboard, que son cosas que pasan en tu colección.

**Lo que encontró la revisión adversarial** — dos rondas de agentes con cinco ángulos distintos y dos escépticos verificando cada hallazgo. De los 40 confirmados, los que importaban:

- **El 🚫 no existía donde hacía falta**: solo se podía vetar desde Cine venidero, así que una película que entraba por una regla de festival volvía cada noche para siempre — y el propio aviso de la interfaz decía lo contrario.
- **La reevaluación nocturna del umbral era una promesa falsa**: las notas solo se pedían de lo que no tenía fila en la caché, y eso incluye la caché negativa. Ahora se vuelven a pedir las que siguen sin Σ y llevan más de tres días sin comprobarse, y si no se puede —sin clave, cupo agotado— se dice en vez de callar.
- **Vaciar «Tope por pasada» dejaba la regla sin tope**: la cadena vacía se convertía en 0, y 0 significa ilimitado.
- **El guardado de las tarjetas perdía cambios**: tocar dos ajustes seguidos guardaba solo el segundo, y salir de Ajustes en el medio segundo siguiente tiraba el cambio. Ahora se acumulan y se vuelcan al salir.
- **En las reglas de festival los filtros de tipo eran decorativos**: las fichas de Wikipedia no traen duración ni géneros, así que «Incluir documentales» no hacía nada y entraban cortos y telefilmes.
- **Con Radarr a medias** —URL y clave pero sin perfil de calidad— las reglas corrían enteras cada noche sin añadir nada. Ahora se comprueba antes de gastar la pasada.
- **Una pasada que reventaba se registraba como paso nocturno correcto**, y si fallaban todas las altas se borraba el error de la vez anterior.
- **La pasada ya no se sirve dentro de la petición HTTP**: un palmarés entero se comía el tiempo de espera de cualquier proxy inverso con un 504 mientras Radarr seguía recibiendo altas.
- **Seguir a un actor te descargaba sus cameos**, incluido cada documental donde sale tres segundos.
- **La migración se quemaba en el primer arranque** aunque no hubiera nada que migrar, así que restaurar después una copia de ajustes con el auto-Radarr encendido ya no la aplicaba nunca.
- Una regla de «Mis favoritos» con umbral no habría añadido nada jamás: la película salía de candidatas justo el día en que podía tener nota.

Tests 153 → **177**.

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

**El archivo y los oficios.** La versión más grande desde la reorganización: PowaFlex ya sabe si puedes ver de verdad lo que tienes, sigue a más gente que a directores y actores, y se hace su propia copia de seguridad.

- **Subtítulos y audio, con criterio tuyo.** El sync ya descargaba las pistas de cada fichero y las tiraba: ahora se guardan. En Ajustes eliges qué subtítulos te valen —versión original, español, inglés o cualquier combinación— y el Taller estrena pestaña con lo que no llega a ese listón, con el botón para que **Bazarr** los busque, suelto o en bloque. Las pistas solo llegan al sincronizar el detalle, así que hace falta una **re-sincronización completa**; la página lo avisa y no cuenta como «sin subtítulos» lo que aún no ha mirado.
- **Cuatro oficios nuevos**: guion, dirección de fotografía, música y montaje, con seguir, huecos y completismo, y faceta propia en Favoritos y en Descubrir. La dirección conserva el lugar central. Los tres que Plex no registra no tienen ranking «top de tu biblioteca» —no habría de dónde sacarlo— y ofrecen búsqueda por nombre en TMDB.
- **Notas de IMDb en local**: un volcado semanal de 8 MB que se suma a TMDB y Letterboxd como tercera fuente del umbral de ruido de Descubrir, sin gastar ni una petición de API.
- **Copia de seguridad automática** al final del pase nocturno, con rotación de las últimas N. Viene apagada.
- **Veto al auto-Radarr por película**: un 🚫 en cada ficha de Cine venidero. Y los descartes (✕ «no me interesa») también lo bloquean: antes podías descartar una película y encontrártela descargada esa misma noche.
- Los mensajes del servidor ya se traducen al inglés.
- La ventana del pase nocturno se amplía a las 06:00: si a las 03:00 había una sincronización en marcha, antes se saltaba el día entero sin reintentarlo.

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

**La gran reorganización.** Mismas funciones, la mitad de menú: 13 secciones (5 + 6 + 2), la sección Estrenos nueva y los filtros donde faltaban. Los marcadores viejos siguen funcionando: `/calidad`, `/salud`, `/colecciones`, `/directores` y `/letterboxd` redirigen a su nuevo hogar.

- **Taller** (nuevo): Calidad y disco + Salud de los datos, juntas bajo un techo con pestañas. Compartían dominio —Radarr, duplicados, ficheros— y hasta bloques duplicados.
- **Estrenos** (sección nueva en La caza): qué acaba de llegar y qué viene a los **cines de España**, a los **cines de EE UU** y a las **plataformas españolas**. La lista sale del discover de TMDB por región y tipo de estreno, que es la fuente consistente de fechas por país; la pestaña de plataformas usa la fecha de estreno digital y enseña dónde verla con los watch providers de TMDB (datos de JustWatch licenciados). Solo cine largometraje. Ventana de 7/30/90 días más los próximos 60, con todos los filtros de la casa.
- **Filtros demográficos en «Directores/as top» y «Actores/actrices top»**: los mismos selectores de Personas, aplicados en el servidor, así que «Ver más» recorre el ranking ya filtrado. Sirven para cazar huecos de «mis directores top españoles» o «mujeres directoras» sin salir de la pestaña.
- **Directores y actores** gana la ★ de seguir en cada tarjeta y el alta en bloque de «los N primeros» con previsualización, que vivían en el ranking de Favoritos.
- El catálogo de **Directores en activo** se muda a **Favoritos → Añadir**: es una herramienta de captación, no un listado de tu biblioteca.
- **Descubrir huecos** absorbe **Sagas** como quinta pestaña, con las pestañas en la URL (`/descubrir?tab=sagas`).
- **La página Letterboxd se disuelve**: el importador (zip + RSS) es configuración y se muda a Ajustes; «tus notas vs. la comunidad» a Visionado; y la watchlist a Listas y retos, donde por fin gana botón de Radarr en lo que te falta.
- **⌘K busca de todo**: películas, personas, sagas, listas seguidas, festivales y premios, y saltar a cualquier sección, con teclado e insensible a acentos.
- **Biblioteca**: filtro por colección de Plex —el servidor lo sabía desde siempre y ninguna página lo enseñaba—, rango de años, y el chip de persona dice «Persona: Agnès Varda (dirige)» en vez de un id numérico crudo.
- **Festivales**: Todas / Me faltan / Las tengo y listón Σ, con los botones masivos contando solo lo visible. El ✎ es ya el diálogo compartido de toda la app.
- **Homogeneización**: el listón Σ y el desplegable de filtros pasan a componentes únicos (vivían copiados en tres sitios); código muerto retirado del Dashboard.

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

Auditoría a fondo (seguridad, uso de APIs y limpieza). **Nada cambia de aspecto ni de funcionamiento**: gasta menos red, se defiende mejor y estrena 19 pruebas donde no había ninguna.

**Seguridad**

- **Actualizado `@fastify/static`**, que tenía un fallo conocido por el que se podían leer ficheros fuera de su sitio saltándose incluso la contraseña opcional. También `fast-uri` y `brace-expansion`.
- **Las peticiones que cambian algo ya no se pueden disparar desde otra web**: un formulario en una página cualquiera podía hacer que tu PowaFlex sincronizara, se actualizara entero o lanzara altas en Radarr.
- **La copia de los ajustes guarda las credenciales de verdad**, no el texto cifrado: restaurarla en otra instalación dejaba tokens inservibles sin avisar.
- **Si no se pueden descifrar las credenciales** —perdiste `POWAFLEX_SECRET` o cambió— se dice en el arranque y los campos salen vacíos, en vez de mandar el criptograma a Plex y recibir un «401» incomprensible.
- La dirección de Plex y la de Radarr se validan al guardarlas, y el proxy de carátulas comprueba que lo que llega es una imagen.

**Menos llamadas a las APIs**

- **La ficha de cada película se pedía dos veces a TMDB** —una con reparto y otra sin— aunque la primera ya lo traía todo: ~78 llamadas de más en un palmarés, y del orden de 700 por ciclo con 30 directores en favoritos.
- **El emparejado ya verificado de festivales dura un año** en vez de caducar cada mes junto a la página: al mes se repetía la comprobación completa en ráfaga, que es justo lo que hacía que TMDB cortara el grifo.
- **Los artículos de premios se descargan una vez al día**: pasear diez años de los Goya eran diez descargas del mismo texto, y la vigía nocturna las repetía cada noche para años aún sin publicar.
- **Lo que MDBList no conoce deja de pedirse una y otra vez**: se recuerda y se reintenta en el barrido semanal, así que abrir un canon antiguo ya no se come 50 peticiones del cupo diario.
- Si JustWatch falla se espera un cuarto de hora antes de reintentar, y el scraping de listas de Letterboxd respira entre páginas.
- **Cine venidero podía no añadir NADA a Radarr** con más de 300 pendientes: el servidor rechazaba la tanda entera por pasarse del tope. Ahora manda las primeras 300.
- Radarr: si la orden de volver a buscar una película recién salida en digital fallaba, esa película se quedaba sin buscar para siempre. Ahora se reintenta a la noche siguiente.

**Por dentro**

- El patrón de «repartir trabajo entre varios hilos» estaba copiado a mano 23 veces, el bloque de «mandar a Radarr» en 6 páginas —ya con textos distintos— y el «qué día es hoy» en 7 módulos, con el pase nocturno usando encima otro huso. Ahora hay una sola versión de cada cosa.
- **La decisión más delicada de la app** —cuál de los resultados de TMDB es la película de un festival— se separa del código de red y tiene por fin pruebas: las cuatro rondas de fallos reportados (*In the Mood for Love* contra su making-of, *La infiltrada*, los cortes de TMDB a media comprobación) quedan fijadas.
- Cambiar de año rápido en Festivales ya no deja la parrilla mostrando otra edición, el ✎ atrapa el foco como los demás diálogos, y Ajustes deja de preguntar dos veces por lo mismo mientras actualiza.

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

- **Novedades en el Dashboard**: el pase nocturno deja rastro de lo que detecta y el Dashboard lo cuenta arriba del todo, cada aviso una sola vez y con enlace directo.
- **Vigía de festivales**: en cuanto un festival publica la sección de su edición nueva en Wikipedia aparece la novedad, con enlace a esa edición, donde ya esperan los botones de «seguir a toda su dirección» y «mandar a Radarr las que faltan».
- **Fases de estreno en las pedidas**: cada una dice POR QUÉ no aparece —💿 ya en digital, 💿 digital con fecha, 🎬 solo en cines o sin fecha—, con la API oficial de TMDB. Y cuando una pasa a digital, PowaFlex lo avisa y reordena su búsqueda en Radarr él solo, solo con estrenos digitales recientes.
- **El canon Sight & Sound 2022 completo**: las 264 películas de la lista extendida con su puesto, casadas con tu Plex, con Radarr y «seguir al director/a» en cada una. Dataset empaquetado con la app: no depende de nadie y no cambia hasta 2032.
- **«Must-see» de Metacritic en Visionado**: lo que tienes sin ver con metascore ≥ 81 y volumen de votos de aval, sin gastar ni una petición.
- **Los grandes premios anuales**: palmarés completo de los **Goya** (con sus ex aequo), los **César**, los **BAFTA**, el **Premio del Cine Europeo** y el **Óscar internacional** desde 1947, con el mismo motor y verificado contra la dirección.
- **Página nueva: Salud de los datos.** Con 12.000 películas los emparejados malos son estadísticamente seguros y solo se descubrían por casualidad: auditorías locales de películas sin ficha, identidades repetidas, Letterboxd sin casar, peticiones zombis y personas sin demostrar, cada hallazgo con su remedio. Cero red.
- **El pase nocturno ya no puede morir en silencio**: se guarda paso a paso, ningún paso pasa de 20 minutos, Ajustes enseña el histórico de 30 días con duraciones y errores, y la barra lateral avisa con un punto rojo si la última pasada falló o lleva más de 26 horas sin correr.
- **Las filmografías solo se re-piden cuando cambian.** La partida más cara de TMDB era pedirlas todas cada noche; ahora el feed de cambios dice quién cambió, con re-pasada completa cada 7 días como red de seguridad.
- **El emparejado, más fino** (con ejemplos de producción como tests): los nombres casan aunque Wikipedia use el orden japonés («Imamura Shōhei» ≡ «Shohei Imamura», el caso de *The Eel*), las recién anunciadas sin equipo en TMDB entran por título clavado, y un corte de TMDB a mitad ya no se cachea como «sin ficha».

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

Versión de repaso a fondo: cuatro revisiones del código encontraron una lista larga de cosas que fallaban en silencio.

### Lo que se ve

- **Media hoja de estilos no se estaba aplicando**: cualquier color puesto sobre una tarjeta o un botón se descartaba. La caja de avisos —justo la que dice «falta la API key de TMDB»— era casi invisible, los seis chips de notas salían del mismo color, lo seleccionado apenas se distinguía de lo no seleccionado y el botón «Vaciar» no se veía rojo.
- **Todas las barras de progreso se leían al revés**: la parte vacía era negra y la llena roja, así que un 12 % de completismo parecía una barra casi llena.
- Las cápsulas sobre las carátulas (**4K, HDR, ★**) se veían como manchas grises: iban con tinta oscura sobre un velo negro.
- Las leyendas de las gráficas tomaban el color de su propia barra y desaparecían sobre el papel; «Calidad y disco» ya no se descuadra al girar el móvil; y los avisos de error se leen en los tres aspectos.
- Si actualizas el contenedor con una pestaña abierta, PowaFlex lo detecta y te dice que recargues.

### Lo que contaba mal

- **«Próximos estrenos» de cada favorito decía siempre 0**, con toda la seguridad, aunque tuvieras estrenos en el calendario.
- **Un actor con muchos cameos ya no los cuenta como huecos**: Descubrir los descartaba y las otras dos pantallas no — tres sitios, dos respuestas.
- **Una lista de actores pegada podía envenenar el canon de directores** durante un mes: la búsqueda de personas se guardaba sin distinguir el oficio.
- El recuento de «ocultas por tus filtros» se calculaba antes de saber cuáles eran cortos: decía tres y aparecían ocho.
- Las sagas contaban archivos en vez de películas: con dos ediciones de la misma salía «4 de 3».

### Lo nuevo

- **«Directores/as que más has visto»** en Visionado, contando Plex y Letterboxd.
- En **Grandes ausentes**, el nombre de cada director/a abre su ficha y hay botón para añadirlo a favoritos sin salir de la página.
- En **Favoritos → Añadir**, bloque nuevo de **«Listas y cánones»**: vuelca de golpe los 250 de They Shoot Pictures, los 501 del libro o cualquier lista tuya. A quien quitaste con la ✕ no vuelve a entrar.

### Lo que se rompía sin avisar

- **Añadir listas de Letterboxd por dirección vuelve a funcionar**: renombraron las etiquetas de su página y cualquier lista daba «no se pudieron leer películas». Ahora entiende el formato nuevo y el viejo.
- **Si TMDB corta el grifo, la aplicación ya no se queda colgada**: reintentaba sin fin, el refresco se quedaba a medias y el trabajo nocturno no volvía a arrancar hasta reiniciar.
- **Una biblioteca de Plex que responde vacía ya no borra tu colección** —pasa mientras Plex reescanea o si se le cae el disco—: se omite la limpieza y se avisa.
- Un corte de MDBList ya no tira las notas ya pagadas del cupo del día; una página construida a medias ya no se guarda como completa durante doce horas; y los umbrales de Descubrir se notan al momento, no al cabo de medio día.

### Cuando algo va mal, se nota

Un error del servidor ya no se disfraza de «aún no hay películas sincronizadas» ni de «¡lista completa!»; descartar una película se puede deshacer desde el propio aviso; guardar ajustes o seguir a alguien solo se dan por hechos si el servidor lo confirma; y si no responde, se dice, en vez de girar el spinner para siempre.

### Seguridad

- **Los ajustes solo aceptan las claves que existen.** Antes se podía cambiar la dirección de Plex por otra cualquiera y pedirle a la app que «probara la conexión», con lo que mandaba tu token a esa dirección.
- **Un zip preparado ya no puede tumbar el contenedor**: se rechaza antes de descomprimirlo, no después.
- La contraseña de `POWAFLEX_AUTH` ya no revela su longitud y aguanta la fuerza bruta. Sin contraseña puesta, el registro lo dice al arrancar. Las claves y tokens se escriben en campos ocultos.

### Por dentro

- **Pruebas de extremo a extremo**: arrancan el servidor de verdad y comprueban que las páginas responden, que la autenticación protege y que no falta ninguna ruta que la aplicación llame. Con eso se cazaron dos fallos de esta misma versión.
- Los nombres en otros alfabetos se normalizan también en fichas y buscadores; el menú móvil cerrado ya no atrapa el tabulador; y las fichas y el buscador se comportan como diálogos de verdad.

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
