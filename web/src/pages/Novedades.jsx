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
    label: 'Beta 1.24',
    fecha: '2026-08-27',
    titular: 'El cine por países, con dos opiniones enfrentadas',
    puntos: [
      'Página nueva en «La caza»: lo mejor de cada país, de siempre y año a año. Setenta y dos cinematografías, con lo que tienes y lo que te falta, y el botón de Radarr en cada hueco.',
      'Dos listas que dicen cosas distintas a propósito. La de la casa ordena por la nota de Letterboxd —la única fuente que puntúa el cine del mundo— y el top español empieza por «Todo sobre mi madre»; la de FilmAffinity va en su orden y empieza por «El verdugo». Catorce países tienen las dos.',
      'El país de una película es el de quien la dirige, no el que le pone TMDB, que da «Viridiana» por mexicana. Con una excepción que costó una segunda vuelta: que quien dirige naciera fuera solo cuenta si ese país es además de la película, porque si no Alemania se quedaba sin «M» ni «Metrópolis».',
      'Cuando dos películas empatan a nota —y empatan mucho, porque la nota trae un decimal— desempatan los premios y los cánones que ya conoce la app.',
      'El ✎ de cada película la saca del país si crees que no es de ahí, y aguanta las reconstrucciones. Hace falta: TMDB da «Los otros» por estadounidense y «As bestas» por francesa.',
    ],
  },
  {
    label: 'Beta 1.23',
    fecha: '2026-08-24',
    titular: 'Los textos de la app, a la mitad',
    puntos: [
      '«¿Qué es PowaFlex?» y esta misma página estaban escritas con frases de quinientos caracteres y paréntesis dentro de paréntesis. Dicen ya lo mismo en la mitad de palabras.',
      'Los textos de ayuda de Ajustes, Salud, Reglas, Descubrir y otras once páginas —74 en total— pierden el «antes/ahora», los detalles de fontanería y las disculpas metodológicas.',
      'No cambia ni una función: solo el texto. El inglés se ha regenerado desde el castellano, así que ninguna traducción se queda descolgada.',
    ],
  },
  {
    label: 'Beta 1.22',
    fecha: '2026-08-21',
    titular: 'Criterion pasa de quince fichas sin casar a ocho, y las esperas dicen cuánto llevan',
    puntos: [
      'TMDB guarda a John Woo como «Wu Yu-Sheng» y su nombre inglés vive solo entre sus alias. Ahora se miran también los alias de quien dirige, sin dejar de exigir el título exacto: entran «The Killer», «Hard Boiled» y «Last Hurrah for Chivalry».',
      'Otras cinco no son películas, sino miniseries que edita Criterion —«Fishing with John», «Tanner ’88»—. Ahora se dice, en vez de dejar un hueco que parece una avería.',
      'Las ocho que quedan son erratas de Wikipedia y un director mal atribuido. Se arreglan con el ✎ de cada ficha.',
      'Toda espera enseña ya rueda y reloj, aunque tenga porcentaje: un porcentaje puede quedarse clavado y parecer colgado. A los doce segundos explica por qué no avanza, y una barra ya no puede enseñar el progreso de otra tarea.',
      'Biblioteca, Listas y Favoritos ya no se repintan enteras con cada cambio: una lista de 5.000 títulos ponía 21.257 elementos en pantalla para enseñar doce filas.',
      'Salud abre con «2 de 5 auditorías tienen algo que revisar» y un atajo a cada una. En el móvil, los botones pequeños suben a 40 píxeles.',
    ],
  },
  {
    label: 'Beta 1.21',
    fecha: '2026-08-21',
    titular: 'La ficha equivocada de «Flow», y las notas racionadas a 900 al día',
    puntos: [
      'El Óscar de animación enseñaba una «Flow» que no era la de Gints Zilbalodis: hay cuatro de 2024 y la buena se titula «Straume» de original.',
      'Cuando la tabla de un premio no dice quién dirige, ahora se miran todos los candidatos y gana el que tiene volumen de votos. Si no hay ganador claro, ninguno: mejor sin ficha que la ficha de otra.',
      'Las notas de MDBList iban limitadas a 900 peticiones al día teniendo 25.000. Ahora se comprueba el límite real una vez al día: 19.915 disponibles.',
      '«Actualizar notas» distingue por fin los tres casos: no queda nada que pedir, MDBList no las tiene, o algo falla.',
    ],
  },
  {
    label: 'Beta 1.20',
    fecha: '2026-08-21',
    titular: 'El pase nocturno se ocupa ya de todo: poda, sagas, listas y páginas lentas',
    puntos: [
      'La caché de TMDB no se limpiaba nunca. Ahora se poda lo caducado y se compacta el fichero cuando cae bastante.',
      'Las cifras de «te faltan N de esta saga» y tus listas de MDBList se refrescan solas, sin esperar a que abras la página.',
      'Estrenos y las parrillas top amanecen hechas, en vez de construirse en la primera visita del día.',
      'Si TMDB se cae a media madrugada, el histórico lo dice en vez de cantar «todo listo». El «Actualizar todo» pasa de 19 a 22 pasos.',
    ],
  },
  {
    label: 'Beta 1.19',
    fecha: '2026-08-21',
    titular: 'Cada película dice en cuántos premios está, y entran veinticinco fuentes nuevas',
    puntos: [
      'La ficha de cualquier película enseña quién la respalda: «Avalada por 8 fuentes · 5 ganados». Antes solo se podía ir del premio a sus películas, no al revés.',
      'En las parrillas, las avaladas por dos fuentes o más llevan su marca; en Descubrir huecos hay un orden nuevo, «Más avalada».',
      'Veinticinco fuentes nuevas, de cuarenta a sesenta y cinco: Locarno, Rotterdam, Karlovy Vary, los segundos premios de Cannes, Venecia y Berlín, nueve academias más y tres categorías del Óscar.',
      'Animación y documental son ya su propia categoría, con Annecy, los Annie y el IDFA.',
      'Tres catálogos nuevos: Criterion (1.176), las 100 del AFI y el National Film Registry (714).',
      '«Lo mejor del año» se queda en sus 32 fuentes: consulta todos los palmareses de golpe y meterle veinticinco más habría multiplicado la espera.',
    ],
  },
  {
    label: 'Beta 1.18',
    fecha: '2026-08-21',
    titular: 'Los nombres que faltaban en los palmareses, y las filmografías al día',
    puntos: [
      'Sundance, Sitges y el David di Donatello salían sin un solo nombre debajo del cartel. Ahora lo pone TMDB cuando la tabla no lo trae.',
      'Si sigues a alguien y TMDB le apunta una película nueva, aparece al día siguiente en vez de tardar una semana. Su ficha tiene además un botón para pedirlo al momento.',
      'Las películas sin nota de Estrenos dejan de quedarse sin nota para siempre: se vuelve a preguntar cada pocos días, y hay un botón para pedirlas todas ya.',
      'El Dashboard estrena un cuadro con lo que ha bajado solo el automático en 30 días, agrupado por quien lo trajo.',
      'Descubrir huecos: dos interruptores para esconder lo que ya está en Radarr y a quien no ofrece nada.',
      'Cine venidero separa lo que dirige tu gente de lo que solo interpreta: lo primero es lo que el automático puede bajar solo.',
    ],
  },
  {
    label: 'Beta 1.17',
    fecha: '2026-08-11',
    titular: 'Los palmareses cerrados viajan dentro de la app',
    puntos: [
      '4.794 películas de 31 palmareses, hasta 2024, vienen guardadas con la aplicación y ya emparejadas. «Lo mejor de 1998» pasa de 13,7 segundos a 2,1; Cannes, de 27,5 a 4,2.',
      'Solo la temporada en curso se lee de Wikipedia. Si se cae o cambia una tabla, lo viejo se sigue viendo igual.',
      'Dos festivales nuevos: la Seminci (70 Espigas de Oro desde 1958) y Sitges (46 ganadoras desde 1972). Con ellos, cuarenta entradas.',
      'Al meterlos salieron fallos viejos del lector de Wikipedia: 28 fichas llevaban el título original en el campo del director, y cuatro apuntaban a otra película.',
      'Directores emergentes mira también los palmareses, empezando por la Cámara de Oro: 47 nombres en vez de 33.',
    ],
  },
  {
    label: 'Beta 1.16',
    fecha: '2026-08-11',
    titular: 'Si la lista de un premio se queda atrás, se mira la edición de ese año',
    puntos: [
      'El Guldbagge de 2025 ya está. La lista histórica de Wikipedia seguía terminando en 2024 aunque esa edición llevaba meses con página propia; ahora se lee también la edición suelta, con sus nominadas.',
      'Vale igual para el Goya, el BAFTA y los Critics’ Choice. Solo se consulta lo que falta.',
      'El David di Donatello enseñaba 69 ganadoras sin un director, porque Wikipedia acredita ahí a los productores. Ahora el nombre lo pone TMDB.',
    ],
  },
  {
    label: 'Beta 1.15',
    fecha: '2026-08-11',
    titular: 'Tres arreglos del emparejado',
    puntos: [
      'El Ástor de Oro de 1959 apuntaba al making-of de «Fresas salvajes» en vez de a la película. El emparejado compara ya con los dos títulos de cada fila, el internacional y el original.',
      '«Triangle of Sadness» salía dirigida por su productor: el palmarés sueco de Wikipedia pone productores en la columna de dirección. Cuando la ficha se reconoce por el equipo, la dirección la pone TMDB.',
      'El Guldbagge de 2025 sigue sin salir, y no es cosa de la app: la lista de Wikipedia termina en 2024.',
    ],
  },
  {
    label: 'Beta 1.14',
    fecha: '2026-08-11',
    titular: 'Trece premios nuevos y una vista con lo mejor de un año entero',
    puntos: [
      'De 25 a 38 entradas: los seis premios de la crítica estadounidense, los Globos —drama y comedia aparte—, el Donatello, el Guldbagge, el Lola, el Premio del Público de Toronto y Mar del Plata.',
      '«Lo mejor del año»: eliges un año y ves quién ganó en los treinta palmareses de una vez, desde 1927.',
      'Media lista de nominadas de Critics’ Choice y del Donatello salía marcada como ganadora: sus tablas van a rayas y el programa confundía la raya con el sombreado.',
      'Otras seis películas se perdían porque una entrada borrada de TMDB se tomaba por un corte de red.',
    ],
  },
  {
    label: 'Beta 1.13',
    fecha: '2026-08-10',
    titular: 'Visionado tardaba nueve segundos por un índice que faltaba',
    puntos: [
      'Visionado abre en 0,15 segundos en vez de 9: cada película rebuscaba tu Letterboxd entero, tres veces. Se arregla solo al arrancar.',
      'Favoritos, de 25 segundos a un cuarto de segundo: pedía a Wikipedia los habituales de Cannes, Venecia y Berlín nada más entrar, para una pestaña que ni se abre.',
      'El paquete de las gráficas —400 KB— se bajaba en todas las páginas, incluidas las que no tienen ninguna. Ahora solo cuando hay una que pintar.',
      'Se acabaron los «Cargando…» a secas: cada espera dice qué trae y por dónde va.',
      'Todo medido contra una biblioteca de 12.400 películas: con la de 400 con la que se desarrolla no se notaba ninguno de estos problemas.',
    ],
  },
  {
    label: 'Beta 1.12',
    fecha: '2026-08-10',
    titular: 'El menú plegado, las 1001 al galope y los filtros a una sola voz',
    puntos: [
      'El menú de Festivales arranca plegado en tres categorías: desplegado eran casi tres pantallas en móvil antes de la primera película.',
      'El canon de las 1001 va ligero: 120 tarjetas y el resto según bajas, con lo que manda el servidor comprimido de 282 a 70 KB.',
      'Los filtros hablan igual en las diez secciones, y el listón Σ puesto en una página te sigue a las demás.',
      'Móvil de verdad: botones de 40 px en vez de 18, sin zoom de iOS al buscar y con el fondo quieto al abrir el menú.',
      'Borrar un canon o dejar de seguir una lista piden confirmación, y un fallo del servidor se dice en vez de cantar éxito.',
    ],
  },
  {
    label: 'Beta 1.11',
    fecha: '2026-08-10',
    titular: 'Las 1001 películas, los palmareses que faltaban y la cuarentena sin códigos',
    puntos: [
      'Las 1001 películas del libro (15.ª edición) entran en Cánones: 997 con ficha a la primera.',
      'La Cámara de Oro tiene entrada propia con sus 50 ganadoras desde 1978; Un Certain Regard y la Semana de la Crítica ganan palmarés histórico.',
      'El palmarés de Sundance estaba a medias: ahora son 47 ganadoras desde 1984, todas con ficha. Y al Óscar le faltaba hasta Forrest Gump.',
      'La cuarentena se configura por nombre: escribes «hindi» o «Taiwán» y pulsas el chip, sin saberte los códigos ISO.',
      'En cualquier ficha, dirección y reparto son clicables aunque no estén en tu biblioteca.',
    ],
  },
  {
    label: 'Beta 1.10',
    fecha: '2026-08-09',
    titular: 'Cuatro agentes repasando el emparejado, ficha a ficha',
    puntos: [
      '1.240 fichas revisadas contra TMDB. Sight & Sound pasa a tener 263 carteles de 264.',
      'El fallo de fondo: cuando a una fila de Wikipedia le faltaba una celda, el título original acababa en el campo del director, y con el director mal no se podía verificar nada.',
      'Un director acreditado en japonés o cirílico casaba con cualquier nombre, así que podía colarse otra película.',
      'Entran Un Certain Regard y la competición estadounidense de Sundance, donde faltaba el premio que ganó CODA.',
      'Al abrir la edición de un festival, la ganadora sale primera y con su 🏆.',
    ],
  },
  {
    label: 'Beta 1.09',
    fecha: '2026-08-09',
    titular: 'Buscábamos las películas en el idioma equivocado',
    puntos: [
      'Las fichas sin cartel no era que TMDB no las tuviera: se le preguntaba en español y no relaciona «The Leopard» con «Il gattopardo». Ahora se pregunta también en inglés.',
      'Tres fichas más fallaban por cómo se escribe el nombre de quien dirige: «The Wachowskis», «Larissa», «Forough Farokhzad».',
      'Todo lo que quedó guardado como «sin ficha» se vuelve a intentar solo.',
      'Logotipo nuevo, con versión de una línea para el móvil.',
    ],
  },
  {
    label: 'Beta 1.08',
    fecha: '2026-08-09',
    titular: 'Quién va a ser un grande dentro de diez años',
    puntos: [
      'Página nueva de directores emergentes: quién estrena hoy con éxito de crítica y público y todavía no le sigue nadie.',
      'Cinco secciones de debut nuevas —Semana de la Crítica y Quincena de Cannes, Orizzonti, Perspectives y Nuevos Directores—, que es donde de verdad estrena quien empieza.',
      'Cada ficha explica su puntuación. Y lo que no tiene datos no puntúa cero: sale del reparto.',
      'Regla nueva: «mándame la ópera prima de todo emergente que llegue a 70».',
      'La cuarentena avisa en el panel y se aprueba o veta en bloque, con el cartel de cada película a la vista.',
    ],
  },
  {
    label: 'Beta 1.07',
    fecha: '2026-08-09',
    titular: 'Reglas automáticas a Radarr, y unos Ajustes que se pueden leer',
    puntos: [
      'Reglas que mandan solas a Radarr lo que pase su filtro: festivales y premios, estrenos por región y tus favoritos de cada oficio.',
      'Cada regla lleva su nota mínima Σ. Lo que aún no tiene nota espera a tenerla en vez de irse a ciegas.',
      'Tope por pasada para que un palmarés histórico no te vacíe el disco la primera noche.',
      'Cada pasada dice por qué no entró algo, y el historial lleva un 🚫 por película.',
      'Ajustes pasa a cinco pestañas en vez de once pantallas de scroll.',
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
        subtitle={t('Qué trae cada versión. Lo que pasa en tu colección está en las novedades del Dashboard.')}
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
        {t('El detalle técnico está en el CHANGELOG del repositorio.')}
      </p>
    </div>
  );
}
