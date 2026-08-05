import { Link } from 'react-router-dom';
import { PageHeader } from '../components.jsx';

function Block({ icon, title, to, children }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold text-zinc-100 mb-2">
        <span className="mr-2">{icon}</span>
        {to ? <Link to={to} className="hover:text-gold-400">{title} →</Link> : title}
      </h2>
      <div className="text-sm text-zinc-400 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

// El recorrido que resuelve la pregunta «vale, ¿y ahora qué hago?»: primero
// dejar la aplicación funcionando, después el bucle de uso diario.
const FIRST_STEPS = [
  {
    title: 'Conecta tu Plex',
    to: '/ajustes',
    body: 'En Ajustes, pega la dirección del servidor y tu X-Plex-Token (la propia página explica cómo sacarlo) y elige la biblioteca de películas. Lanza la sincronización: la primera tarda unos minutos y trae fichas, reparto, géneros, visionados y datos técnicos.',
  },
  {
    title: 'Añade la clave de TMDB',
    to: '/ajustes',
    body: 'Es gratuita y es lo que convierte tu lista de archivos en filmografías: sin ella no hay completismo, ni calendario de estrenos, ni sagas, ni huecos que rellenar. Es el paso que más rendimiento da.',
  },
  {
    title: 'Conecta Radarr',
    to: '/ajustes',
    optional: true,
    body: 'Sin Radarr, PowaFlex te enseña lo que te falta; con Radarr, además lo pide. Necesita la URL y la API key, y le dices con qué perfil de calidad y en qué carpeta debe añadir.',
  },
  {
    title: 'Trae tu Letterboxd y las notas',
    to: '/ajustes',
    optional: true,
    body: 'En Ajustes, importa el zip de tu export para que PowaFlex sepa qué has visto aunque no lo reprodujeras en Plex, y pon tu RSS para que se mantenga solo. Con la clave de MDBList (también en Ajustes) cada película gana las notas de IMDb, Rotten Tomatoes, Metacritic y Letterboxd.',
  },
  {
    title: 'Mira dónde estás',
    to: '/',
    body: 'El Dashboard te da la foto general y el Taller la salud técnica. En Visionado ves cuánto llevas visto y qué grandes películas tuyas siguen esperando. Aquí todavía no hay nada que decidir: es tomar medida de la colección.',
  },
  {
    title: 'Marca a tu gente',
    to: '/favoritos',
    body: 'Este es el paso que enciende el resto de la aplicación. Sigue a tus directores/as y actores/actrices —de uno en uno, por paquetes o pegando una lista de nombres— indicando por qué faceta los sigues; quien dirige e interpreta puede estar en las dos a la vez. Sus filmografías pasan a ser tu lista de tareas.',
  },
  {
    title: 'Caza los huecos',
    to: '/descubrir',
    body: 'Descubrir huecos cruza esas filmografías con tu Plex y te dice qué falta, con filtros para dejar fuera el ruido (cortos, documentales, conciertos, TV, cameos). Sagas hace lo mismo con las franquicias a medias, y Listas y retos con los cánones (1001 películas, premios…). Cada película se manda a Radarr desde su propia fila.',
  },
  {
    title: 'Déjalo corriendo',
    to: '/calendario',
    body: 'Cine venidero vigila los estrenos de tu gente. Cada noche PowaFlex resincroniza Plex, recalcula huecos y, si lo activas, manda solos a Radarr los estrenos de tus directores/as favoritos/as vivos. A partir de aquí solo tienes que entrar de vez en cuando.',
  },
];

export default function About() {
  return (
    <div>
      <PageHeader eyebrow="Cuenta" title="¿Qué es PowaFlex?" />
      <p className="text-zinc-300 leading-relaxed mb-6 max-w-5xl">
        PowaFlex es tu centro de mando cinéfilo: una aplicación que vive junto a tu servidor Plex, lee tu
        biblioteca de películas directamente por la API (sin exports ni CSV), la cruza con{' '}
        <b className="text-zinc-100">TMDB</b> (la base de datos abierta de cine) y con{' '}
        <b className="text-zinc-100">Radarr</b> (tu gestor de descargas monitorizadas), y convierte todo eso en
        dos cosas: <b className="text-gold-400">conocer a fondo el cine que tienes</b> y{' '}
        <b className="text-gold-400">cazar el cine que te falta o que está por venir</b>. Todo se guarda en local,
        en tu propia máquina; de tu red solo salen las consultas a los servicios que conectes (TMDB, MDBList,
        JustWatch, Letterboxd, Wikipedia).
      </p>

      <h2 className="text-lg font-semibold text-zinc-100 mb-3">Si acabas de llegar: la ruta, paso a paso</h2>
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        Los cuatro primeros pasos se hacen una vez y dejan la aplicación funcionando. Del quinto en adelante
        empieza el uso diario. Puedes saltarte cualquiera que no te interese: nada depende de lo que no configures.
      </p>
      <ol className="grid md:grid-cols-2 gap-3 mb-6">
        {FIRST_STEPS.map((s, i) => (
          <li key={s.title} className="card p-4 flex gap-3">
            <span className="font-display text-2xl text-gold-400 leading-none shrink-0 w-8 tabular">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-100">
                {s.to ? <Link to={s.to} className="hover:text-gold-400">{s.title} →</Link> : s.title}
                {s.optional && <span className="badge-quiet ml-2 align-middle">opcional</span>}
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed mt-1">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="text-lg font-semibold text-zinc-100 mb-3">¿Qué puedo hacer con PowaFlex?</h2>
      <div className="card p-5 mb-6 text-sm text-zinc-400 leading-relaxed">
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <div className="text-zinc-200 font-medium mb-1">Conocer tu colección</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Ver totales: cuántas películas, horas de cine, disco ocupado y % visto.</li>
              <li>Explorar gráficas por década y género, el ritmo al que crece la colección y, en «Calidad y disco», el reparto de resoluciones.</li>
              <li>Filtrar la biblioteca al estilo Letterboxd (género, país, década, metraje, HDR, notas de IMDb/RT/Letterboxd…) y ordenarla por cualquiera de esas notas. La estrella dorada marca lo que ya has visto.</li>
              <li>Abrir la ficha de cualquier película con reparto, notas de varias webs y datos técnicos, y elegir qué nota sale en cada póster.</li>
              <li>Ver rankings de directores/as, actores/actrices y guionistas por presencia, y filtrarlos por género, país, continente o si están vivos.</li>
            </ul>
          </div>
          <div>
            <div className="text-zinc-200 font-medium mb-1">Cazar lo que te falta</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Ver el % de completismo de cada director/a o actor/actriz (solo largometrajes) y lo que te falta de su filmografía.</li>
              <li>Seguir un calendario de estrenos y proyectos anunciados de tus cineastas.</li>
              <li>Detectar franquicias empezadas y sin terminar (sagas de TMDB), con las partes que faltan a la vista.</li>
              <li>Comprobar retos de listas famosas (IMDb Top 250, Cannes, 1001…) con anillos de «tengo» vs «visto».</li>
              <li>Recorrer las secciones oficiales y el palmarés de los grandes festivales (Cannes, Venecia, Berlinale…) para cazar sus películas y seguir a sus cineastas.</li>
              <li>Encontrar grandes directores/as del canon de They Shoot Pictures ausentes de tu servidor.</li>
              <li>Comprobar en JustWatch si existe una versión de más calidad (HD/4K) en el mercado.</li>
            </ul>
          </div>
          <div>
            <div className="text-zinc-200 font-medium mb-1">Actuar con Radarr</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Añadir a Radarr cualquier película que te falte con un clic, con perfil y carpeta configurables.</li>
              <li>Añadir en bloque toda una lista, saga o el cine venidero de un plazo.</li>
              <li>Automatizar el día a día: lanzar solo cada noche los estrenos de tus directores/as favoritos/as vivos.</li>
              <li>Ver en el Dashboard qué pedidas han llegado por fin (capturas), y en Calidad cuáles siguen sin aparecer o llegaron por debajo de tu perfil, con re-búsqueda en un clic.</li>
              <li>Pedir upgrades de las películas por debajo de 1080p.</li>
            </ul>
          </div>
          <div>
            <div className="text-zinc-200 font-medium mb-1">Tu gusto y tu historial</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Importar tu Letterboxd (zip completo) y su feed RSS para marcar vistas y notas.</li>
              <li>Ver últimas añadidas a Plex, últimas vistas (Plex + Letterboxd) y últimas peticiones a Radarr.</li>
              <li>Comparar tus notas de Letterboxd con las de la crítica y la comunidad (joyas ocultas, discrepancias).</li>
              <li>Marcar favoritos (incluidos directores/as que aún no tienes): por paquetes temáticos, pegando una lista de nombres o de uno en uno.</li>
              <li>Elegir de qué webs (IMDb, RT, Metacritic, Letterboxd…) quieres ver las notas.</li>
            </ul>
          </div>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-zinc-100 mb-3">Cómo funciona</h2>
      <div className="card p-5 mb-6 text-sm text-zinc-400 leading-relaxed space-y-2">
        <p>
          <b className="text-zinc-200">1. Sincronización con Plex.</b> Con tu X-Plex-Token, PowaFlex recorre tu
          biblioteca y descarga de cada película el reparto completo, dirección, guion, géneros, países,
          colecciones, visionados, y los datos técnicos del archivo (resolución, códec, HDR/Dolby
          Vision, tamaño). La primera vez tarda unos minutos; después es incremental y se repite sola cada noche.
        </p>
        <p>
          <b className="text-zinc-200">2. Cruce con TMDB.</b> Cada película de Plex trae su identificador TMDB,
          así que el emparejado es exacto. Con él, PowaFlex consulta filmografías completas, estrenos futuros y
          sagas, y lo cachea para no repetir llamadas.
        </p>
        <p>
          <b className="text-zinc-200">3. Acción con Radarr.</b> Cualquier película que te falte —de una
          filmografía, del calendario, de una saga o de tu watchlist— se añade a Radarr con un clic, monitorizada
          y con búsqueda automática, usando el perfil de calidad y carpeta que elijas en Ajustes.
        </p>
      </div>

      <h2 className="text-lg font-semibold text-zinc-100 mb-3">Las secciones, una a una</h2>
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        Y desde cualquier sitio, <b className="text-zinc-300">Ctrl/⌘ + K</b> abre la búsqueda global: películas,
        personas, sagas, listas, festivales y saltar a cualquier sección, con las flechas y Enter.
      </p>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Block icon="📊" title="Dashboard" to="/">
          <p>
            La foto general: cuántas películas tienes, cuántas horas de cine suman, cuánto disco ocupan, y
            gráficas por década y por género, además del ritmo al que crece la biblioteca y los
            directores/as y actores/actrices con más presencia. Arriba, lo vivo: las <b>novedades</b> que
            detecta el pase nocturno (una edición de festival recién publicada, una pedida que ya está en
            digital) y las <b>capturas</b> de la semana.
          </p>
        </Block>
        <Block icon="🎞️" title="Biblioteca" to="/biblioteca">
          <p>
            Toda tu colección en una parrilla de pósters (con ★ dorada en las vistas) y filtros al
            estilo Letterboxd: género, país, década, visto/sin ver, largometraje o corto (menos de 40 minutos),
            resolución, HDR/Dolby Vision, notas mínimas de IMDb/RT/Letterboxd… y ordenación por fecha añadida,
            estreno, esas notas, duración, tamaño o aleatorio. La nota que sale en cada póster la eliges tú.
          </p>
        </Block>
        <Block icon="🎭" title="Directores/as y actores/actrices" to="/personas">
          <p>
            Dos pestañas. <b>Tu biblioteca</b>: el ranking de directores/as, actores/actrices y guionistas por
            presencia en tu Plex, con filtros demográficos (género, vivos/fallecidos, continente, país), la ★
            para seguir a cualquiera y el alta en bloque de «los N primeros» con previsualización.{' '}
            <b>Directores en activo</b>: el catálogo de 680 nombres de Wikidata con su importancia, obra y
            premios, para descubrir a quién seguir. La ficha de cada persona cruza su filmografía completa de
            TMDB con lo que tienes: completismo, lo que te falta (con botón a Radarr), proyectos anunciados y
            notas, con orden y listón de nota mínima. Quien dirige y actúa tiene una pestaña por faceta.
          </p>
        </Block>
        <Block icon="🗓️" title="Cine venidero" to="/calendario">
          <p>
            Un calendario mensual con los próximos estrenos y proyectos anunciados de los directores/as y
            actores/actrices más importantes de tu biblioteca (y de los que sigas manualmente). Cada estreno se
            puede mandar a Radarr para tenerlo monitorizado desde ya.
          </p>
        </Block>
        <Block icon="⭐" title="Favoritos" to="/favoritos">
          <p>
            Tu lista de directores/as y actores/actrices de cabecera, la que alimenta el calendario. Cada persona
            puede seguirse por una faceta o por las dos (un Eastwood cuenta en directores Y en actores). Incluye
            paquetes temáticos y de festival con «añadir todos», volcar cánones enteros, pegar una lista de
            nombres, exportar la tuya, y el modo podar para limpiar en bloque. Lo que quites con la ✕ no vuelve
            por los añadidos masivos (solo a mano). Para seguir gente desde el ranking de tu biblioteca, la ★
            vive en Directores y actores.
          </p>
        </Block>
        <Block icon="🎪" title="Festivales" to="/festivales">
          <p>
            Las secciones oficiales de los grandes festivales —los seis de la vía directa al Óscar internacional
            (Cannes, Venecia, Berlinale, Sundance, Toronto y Busan) más San Sebastián y sus Horizontes Latinos—,
            edición a edición, el palmarés histórico de cada premio, los grandes premios anuales con palmarés y
            nominadas por año (Goya, César, BAFTA, Cine Europeo, Óscar a la mejor película y Óscar
            internacional) y el canon <b>Sight &amp; Sound 2022</b> de la crítica al completo. Cualquier
            emparejado con TMDB se corrige a mano desde la propia tarjeta (✎). Todo casado con tu Plex: manda a Radarr lo que falte y sigue a sus directores/as
            —de una en una o la sección entera— para que sus estrenos entren en el calendario. El pase nocturno
            vigila las ediciones nuevas y te lo cuenta en el Dashboard en cuanto un festival publica su selección.
          </p>
        </Block>
        <Block icon="🧭" title="Descubrir huecos" to="/descubrir">
          <p>
            El modo completista, en cinco pestañas: lo que te falta de <b>tus favoritos</b>; los{' '}
            <b>directores/as y actores/actrices top</b> de tu biblioteca (con filtros demográficos: «mis
            directoras españolas top»); los <b>grandes ausentes</b> del canon —They Shoot Pictures, IMDb 501, el
            «en boga» de TMDB o cualquier lista que pegues— sin una sola película en tu servidor; y tus{' '}
            <b>sagas</b> a medias, detectadas con la colección real de TMDB. Todo con envío a Radarr, descarte
            reversible, listón de nota y filtros de ruido.
          </p>
        </Block>
        <Block icon="🏆" title="Listas y retos" to="/listas">
          <p>
            Tu <b>watchlist de Letterboxd</b> (con Radarr en lo que te falta), tus retos importados de Letterboxd
            con anillos de «tengo» vs «visto», y las listas de MDBList (1001 películas, palmarés de premios, tops
            de la comunidad) convertidas en retos de completismo: % conseguido, lo que falta y envío en bloque a
            Radarr.
          </p>
        </Block>
        <Block icon="👁️" title="Visionado" to="/visionado">
          <p>
            El contador de lo que llevas visto (Plex + Letterboxd) y lo visto contra lo pendiente: por década, por
            género, los directores/as de los que más te queda por ver, joyas y discrepancias frente a tu nota de
            Letterboxd, las mejor valoradas que aún no has visto, los «must-see» de Metacritic pendientes, la
            tabla de tus notas contra la comunidad y tu historial reciente.
          </p>
        </Block>
        <Block icon="🔧" title="Taller" to="/taller">
          <p>
            El mantenimiento, en dos pestañas. <b>Calidad y disco</b>: resoluciones, códecs y HDR, candidatas a
            upgrade, duplicados, la deuda de Radarr (pedidas que no llegan, por debajo del corte) y los archivos
            más pesados. <b>Salud de los datos</b>: auditorías locales —películas sin ficha TMDB, identidades
            repetidas, entradas de Letterboxd sin casar, peticiones zombis y emparejados sin demostrar— cada una
            con su remedio al lado.
          </p>
        </Block>
        <Block icon="⚙️" title="Ajustes" to="/ajustes">
          <p>
            Las conexiones (Plex, TMDB, Radarr, MDBList y Letterboxd —el zip del export y el RSS se importan
            aquí—) con guías paso a paso para conseguir cada credencial, el aspecto de la app, qué notas quieres
            ver, el perfil de calidad y carpeta que usará Radarr, el tamaño del radar del calendario, el control
            de sincronización manual, el histórico de los últimos 30 días del pase nocturno (paso a paso, con
            duraciones y errores) y la copia de seguridad: descarga de la base de datos entera y
            exportación/importación de la configuración para reinstalar sin empezar de cero.
          </p>
        </Block>
      </div>

      <div className="card p-5 text-xs text-zinc-500 leading-relaxed">
        <p>
          PowaFlex corre en Docker (pensado para un mini-PC junto a Plex y Radarr), guarda sus datos en SQLite en
          la carpeta <code className="text-zinc-300">data/</code> y no tiene cuentas ni telemetría. Datos de cine
          por cortesía de{' '}
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="text-gold-400 hover:underline">
            TMDB
          </a>
          . No expongas la app a internet sin un proxy con autenticación: está diseñada para tu red local.
          Las credenciales de Plex, TMDB y Radarr se guardan en SQLite; define la variable de entorno{' '}
          <code className="text-zinc-300">POWAFLEX_SECRET</code> para cifrarlas en disco.
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
