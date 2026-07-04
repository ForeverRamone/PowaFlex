import { Link } from 'react-router-dom';

function Block({ icon, title, to, children }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold text-slate-100 mb-2">
        <span className="mr-2">{icon}</span>
        {to ? <Link to={to} className="hover:text-gold-400">{title} →</Link> : title}
      </h2>
      <div className="text-sm text-slate-400 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function About() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-100 mb-2">¿Qué es PowaFlex?</h1>
      <p className="text-slate-300 leading-relaxed mb-6">
        PowaFlex es tu centro de mando cinéfilo: una aplicación que vive junto a tu servidor Plex, lee tu
        biblioteca de películas directamente por la API (sin exports ni CSV), la cruza con{' '}
        <b className="text-slate-100">TMDB</b> (la base de datos abierta de cine) y con{' '}
        <b className="text-slate-100">Radarr</b> (tu gestor de descargas monitorizadas), y convierte todo eso en
        dos cosas: <b className="text-gold-400">conocer a fondo el cine que tienes</b> y{' '}
        <b className="text-gold-400">cazar el cine que te falta o que está por venir</b>. Todo se guarda en local,
        en tu propia máquina; nada sale de tu red salvo las consultas a TMDB.
      </p>

      <h2 className="text-lg font-semibold text-slate-100 mb-3">Cómo funciona</h2>
      <div className="card p-5 mb-6 text-sm text-slate-400 leading-relaxed space-y-2">
        <p>
          <b className="text-slate-200">1. Sincronización con Plex.</b> Con tu X-Plex-Token, PowaFlex recorre tu
          biblioteca y descarga de cada película el reparto completo, dirección, guion, géneros, países,
          colecciones, tu nota, visionados, y los datos técnicos del archivo (resolución, códec, HDR/Dolby
          Vision, tamaño). La primera vez tarda unos minutos; después es incremental y se repite sola cada noche.
        </p>
        <p>
          <b className="text-slate-200">2. Cruce con TMDB.</b> Cada película de Plex trae su identificador TMDB,
          así que el emparejado es exacto. Con él, PowaFlex consulta filmografías completas, estrenos futuros y
          sagas, y lo cachea para no repetir llamadas.
        </p>
        <p>
          <b className="text-slate-200">3. Acción con Radarr.</b> Cualquier película que te falte —de una
          filmografía, del calendario, de una saga o de tu watchlist— se añade a Radarr con un clic, monitorizada
          y con búsqueda automática, usando el perfil de calidad y carpeta que elijas en Ajustes.
        </p>
      </div>

      <h2 className="text-lg font-semibold text-slate-100 mb-3">Las secciones, una a una</h2>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Block icon="📊" title="Dashboard" to="/">
          <p>
            La foto general: cuántas películas tienes, cuántas horas de cine suman, cuánto disco ocupan, y
            gráficas por década, género, país y resolución, además del ritmo al que crece la biblioteca y los
            directores y actores con más presencia.
          </p>
        </Block>
        <Block icon="🎞️" title="Biblioteca" to="/biblioteca">
          <p>
            Toda tu colección en una parrilla de pósters con filtros al estilo Letterboxd: género, país, década,
            visto/sin ver, largometraje o corto (menos de 40 minutos), resolución, HDR/Dolby Vision, nota mínima…
            y ordenación por fecha añadida, estreno, nota, duración, tamaño o aleatorio para las noches indecisas.
          </p>
        </Block>
        <Block icon="🎭" title="Directores y actores" to="/personas">
          <p>
            Ranking de directores, actores y guionistas por presencia en tu biblioteca. La ficha de cada persona
            cruza su filmografía completa de TMDB con lo que tienes: porcentaje de completismo, lo que te falta
            (con botón directo a Radarr) y sus proyectos anunciados. Con «☆ Seguir» la fijas en el calendario.
          </p>
        </Block>
        <Block icon="🗓️" title="Cine venidero" to="/calendario">
          <p>
            Un calendario mensual con los próximos estrenos y proyectos anunciados de los directores y actores más
            importantes de tu biblioteca (y de los que sigas manualmente). Cada estreno se puede mandar a Radarr
            para tenerlo monitorizado desde ya.
          </p>
        </Block>
        <Block icon="⭐" title="Favoritos" to="/favoritos">
          <p>
            Tu lista de directores y actores de cabecera, la que alimenta el calendario. Incluye un ranking por
            número de títulos en tu servidor con el que puedes añadir «los X primeros» de golpe, y quitar o añadir
            individualmente cuando quieras.
          </p>
        </Block>
        <Block icon="🧭" title="Descubrir huecos" to="/descubrir">
          <p>
            El modo completista: agrega lo que te falta de las filmografías de tus directores y actores top, y
            además comprueba un canon de ~100 grandes directores del cine mundial para detectar los que no tienen
            ni una sola película en tu servidor, con sus obras esenciales listas para añadir.
          </p>
        </Block>
        <Block icon="🏆" title="Listas y retos" to="/listas">
          <p>
            Sigue listas de MDBList (1001 películas, palmarés de premios, tops de la comunidad) y conviértelas en
            retos de completismo: % conseguido, lo que falta y envío en bloque a Radarr. Con MDBList además toda
            la app gana notas de IMDb, Rotten Tomatoes, Metacritic y Letterboxd.
          </p>
        </Block>
        <Block icon="📚" title="Sagas" to="/colecciones">
          <p>
            Detecta tus franquicias cruzando cada película con su colección real de TMDB (no con etiquetas de
            Plex) y te dice, saga a saga, qué partes te faltan o están por estrenar, con envío a Radarr.
          </p>
        </Block>
        <Block icon="👁️" title="Visionado" to="/visionado">
          <p>
            Lo visto contra lo pendiente: por década, por género, los directores de los que más te queda por ver,
            las mejor valoradas que aún no has visto y tu historial reciente.
          </p>
        </Block>
        <Block icon="💾" title="Calidad y disco" to="/calidad">
          <p>
            La salud técnica de la colección: distribución de resoluciones, códecs y HDR, las películas bien
            valoradas que siguen por debajo de 1080p (candidatas a upgrade), duplicados, los archivos más pesados
            y cuánto disco consume cada década.
          </p>
        </Block>
        <Block icon="🟠" title="Letterboxd" to="/letterboxd">
          <p>
            Importa tu export de Letterboxd (diario, notas, watchlist, vistas) y lo cruza con Plex: qué parte de
            tu watchlist ya tienes en casa, cuál te falta, y cómo casan tus notas de Letterboxd con las de Plex.
          </p>
        </Block>
        <Block icon="⚙️" title="Ajustes" to="/ajustes">
          <p>
            Las tres conexiones (Plex, TMDB, Radarr) con guías paso a paso para conseguir cada credencial, el
            perfil de calidad y carpeta que usará Radarr, el tamaño del radar del calendario y el control de
            sincronización manual.
          </p>
        </Block>
      </div>

      <div className="card p-5 text-xs text-slate-500 leading-relaxed">
        <p>
          PowaFlex corre en Docker (pensado para un mini-PC junto a Plex y Radarr), guarda sus datos en SQLite en
          la carpeta <code className="text-slate-300">data/</code> y no tiene cuentas ni telemetría. Datos de cine
          por cortesía de{' '}
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="text-gold-400 hover:underline">
            TMDB
          </a>
          . No expongas la app a internet sin un proxy con autenticación: está diseñada para tu red local.
          Las credenciales de Plex, TMDB y Radarr se guardan en SQLite; define la variable de entorno{' '}
          <code className="text-slate-300">POWAFLEX_SECRET</code> para cifrarlas en disco.
        </p>
        <p className="mt-2">
          Proyecto de código abierto:{' '}
          <a href="https://github.com/ForeverRamone/PowaFlex" target="_blank" rel="noreferrer" className="text-gold-400 hover:underline">
            github.com/ForeverRamone/PowaFlex
          </a>{' '}
          — las novedades de cada versión se publican en la sección Releases.
        </p>
      </div>
    </div>
  );
}
