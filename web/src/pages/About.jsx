import { Link } from 'react-router-dom';
import { PageHeader } from '../components.jsx';
import { t } from '../i18n.js';

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
    title: t('Conecta tu Plex'),
    to: '/ajustes?tab=conexiones',
    body: t('Pega la dirección del servidor y tu X-Plex-Token en Ajustes y elige la biblioteca de películas. La primera sincronización tarda unos minutos.'),
  },
  {
    title: t('Añade la clave de TMDB'),
    to: '/ajustes?tab=conexiones',
    body: t('Es gratuita y es lo que convierte tu lista de archivos en filmografías: sin ella no hay completismo, ni calendario, ni sagas, ni huecos.'),
  },
  {
    title: t('Conecta Radarr'),
    to: '/ajustes?tab=conexiones',
    optional: true,
    body: t('Sin Radarr ves lo que te falta; con Radarr, además lo pides. Necesita la URL, la API key, un perfil de calidad y una carpeta.'),
  },
  {
    title: t('Trae tu Letterboxd y las notas'),
    to: '/ajustes?tab=fuentes',
    optional: true,
    body: t('Importa el zip de tu export y pon tu RSS para que se mantenga solo. Con la clave de MDBList cada película gana las notas de IMDb, Rotten Tomatoes, Metacritic y Letterboxd.'),
  },
  {
    title: t('Mira dónde estás'),
    to: '/',
    body: t('El Dashboard da la foto general y Visionado dice cuánto llevas visto. Aquí todavía no hay nada que decidir.'),
  },
  {
    title: t('Marca a tu gente'),
    to: '/favoritos',
    body: t('El paso que enciende el resto: sigue a tus directores/as y actores/actrices indicando por qué faceta. Sus filmografías pasan a ser tu lista de tareas.'),
  },
  {
    title: t('Caza los huecos'),
    to: '/descubrir',
    body: t('Descubrir huecos cruza esas filmografías con tu Plex y te dice qué falta. Sagas hace lo mismo con las franquicias, y Listas con los cánones.'),
  },
  {
    title: t('Déjalo corriendo'),
    to: '/calendario',
    body: t('Cada noche PowaFlex resincroniza Plex, recalcula huecos y, si lo activas, manda a Radarr los estrenos de tus favoritos vivos.'),
  },
];

const HACER = [
  ['Conocer tu colección', [
    'Totales: películas, horas de cine, disco ocupado y % visto.',
    'Gráficas por década y por género, y el reparto de resoluciones en «Calidad y disco».',
    'Filtrar la biblioteca al estilo Letterboxd y ordenarla por cualquiera de sus notas.',
    'Abrir la ficha de cualquier película, con reparto, notas y datos técnicos.',
    'Rankings de dirección, interpretación y guion por presencia, con filtros demográficos.',
  ]],
  ['Cazar lo que te falta', [
    'El completismo de cada persona y lo que te falta de su filmografía.',
    'Un calendario con los estrenos y proyectos anunciados de tus cineastas.',
    'Franquicias empezadas y sin terminar, con las partes que faltan a la vista.',
    'Retos de listas famosas (IMDb Top 250, Cannes, 1001…) con anillos de «tengo» y «visto».',
    'Las secciones oficiales y los palmareses de los grandes festivales.',
    'Grandes directores/as del canon ausentes de tu servidor.',
    'Si existe una versión de más calidad (HD/4K) en el mercado.',
  ]],
  ['Actuar con Radarr', [
    'Añadir con un clic cualquier película que te falte.',
    'Añadir en bloque una lista, una saga o el cine venidero de un plazo.',
    'Mandar solos cada noche los estrenos de tus favoritos vivos.',
    'Ver qué pedidas han llegado y cuáles siguen sin aparecer, con re-búsqueda.',
    'Pedir upgrades de lo que está por debajo de 1080p.',
  ]],
  ['Tu gusto y tu historial', [
    'Importar tu Letterboxd (zip y RSS) para marcar vistas y notas.',
    'Ver últimas añadidas, últimas vistas y últimas peticiones a Radarr.',
    'Comparar tus notas con las de la crítica: joyas ocultas y discrepancias.',
    'Marcar favoritos por paquetes, pegando una lista o de uno en uno.',
    'Elegir de qué webs quieres ver las notas.',
  ]],
];

const SECCIONES = [
  ['📊', 'Dashboard', '/', 'La foto general —películas, horas, disco, gráficas por década y por género— y arriba lo vivo: las novedades que detecta el pase nocturno y las capturas de la semana.'],
  ['🎞️', 'Biblioteca', '/biblioteca', 'Tu colección en una parrilla de pósters, con filtros al estilo Letterboxd: género, país, década, metraje, resolución, HDR y notas mínimas. La nota que sale en cada póster la eliges tú.'],
  ['🎭', 'Directores/as y actores/actrices', '/personas', 'El ranking por presencia en tu Plex, con filtros demográficos y la ★ para seguir a cualquiera. La ficha de cada persona cruza su filmografía de TMDB con lo que tienes: completismo, huecos y proyectos anunciados.'],
  ['🗓️', 'Cine venidero', '/calendario', 'Un calendario mensual con los estrenos y los proyectos anunciados de tu gente. Cada uno se manda a Radarr desde ahí.'],
  ['⭐', 'Favoritos', '/favoritos', 'Tu gente de cabecera, la que alimenta el calendario, seguida por una faceta o por las dos. En «Añadir», el catálogo de 680 directores en activo de Wikidata, los paquetes temáticos, los cánones enteros y una caja para pegar nombres.'],
  ['🎪', 'Festivales', '/festivales', 'Las secciones oficiales de los grandes festivales edición a edición, el palmarés histórico de sesenta y cinco premios y cánones, y «Lo mejor del año». Todo casado con tu Plex, y con el ✎ para corregir a mano cualquier ficha.'],
  ['🧭', 'Descubrir huecos', '/descubrir', 'El modo completista en cinco pestañas: tus favoritos, los top de tu biblioteca, los grandes ausentes del canon y tus sagas a medias. Con envío a Radarr, listón de nota y filtros de ruido.'],
  ['🎟️', 'Estrenos', '/estrenos', 'Qué acaba de llegar y qué viene, a los cines y a las plataformas de España y de EE UU, con chips de dónde verla. Solo largometraje, con ventana de 7, 30 o 90 días.'],
  ['🏆', 'Listas y retos', '/listas', 'Tu watchlist de Letterboxd, tus retos importados y las listas de MDBList convertidas en retos de completismo, con envío en bloque a Radarr.'],
  ['👁️', 'Visionado', '/visionado', 'Cuánto llevas visto contra lo pendiente: por década, por género, de quién te queda más por ver, y las joyas y discrepancias frente a tu nota de Letterboxd.'],
  ['🔧', 'Taller', '/taller', 'Calidad y disco: resoluciones, candidatas a upgrade, duplicados, la deuda de Radarr y los archivos más pesados. Salud de los datos: auditorías locales, cada una con su remedio al lado.'],
  ['⚙️', 'Ajustes', '/ajustes', 'Las conexiones con su guía paso a paso, el aspecto, qué notas ver, lo que usará Radarr, el histórico del pase nocturno y la copia de seguridad.'],
];

export default function About() {
  return (
    <div>
      <PageHeader eyebrow={t('Cuenta')} title={t('¿Qué es PowaFlex?')} />
      <p className="text-zinc-300 leading-relaxed mb-6 max-w-5xl">
        {t('PowaFlex vive junto a tu servidor Plex: lee tu biblioteca por la API, la cruza con TMDB y con Radarr y la convierte en dos cosas,')}{' '}
        <b className="text-gold-400">{t('conocer el cine que tienes')}</b>{' '}
        {t('y')}{' '}
        <b className="text-gold-400">{t('cazar el que te falta')}</b>
        {t('. Todo se guarda en tu máquina; de tu red solo salen las consultas a los servicios que conectes.')}
      </p>

      <h2 className="text-lg font-semibold text-zinc-100 mb-3">{t('Si acabas de llegar: la ruta, paso a paso')}</h2>
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        {t('Los cuatro primeros se hacen una vez. Del quinto en adelante empieza el uso diario, y puedes saltarte lo que no te interese.')}
      </p>
      <ol className="grid md:grid-cols-2 gap-3 mb-6">
        {FIRST_STEPS.map((s, i) => (
          <li key={s.title} className="card p-4 flex gap-3">
            <span className="font-display text-2xl text-gold-400 leading-none shrink-0 w-8 tabular">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-100">
                {s.to ? <Link to={s.to} className="hover:text-gold-400">{s.title} →</Link> : s.title}
                {s.optional && <span className="badge-quiet ml-2 align-middle">{t('opcional')}</span>}
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed mt-1">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="text-lg font-semibold text-zinc-100 mb-3">{t('¿Qué puedo hacer con PowaFlex?')}</h2>
      <div className="card p-5 mb-6 text-sm text-zinc-400 leading-relaxed">
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
          {HACER.map(([titulo, puntos]) => (
            <div key={titulo}>
              <div className="text-zinc-200 font-medium mb-1">{t(titulo)}</div>
              <ul className="list-disc pl-5 space-y-1">
                {puntos.map((p) => <li key={p}>{t(p)}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <h2 className="text-lg font-semibold text-zinc-100 mb-3">{t('Cómo funciona')}</h2>
      <div className="card p-5 mb-6 text-sm text-zinc-400 leading-relaxed space-y-2">
        <p>
          <b className="text-zinc-200">{t('1. Sincronización con Plex.')}</b>{' '}
          {t('Con tu X-Plex-Token se descarga de cada película el reparto, los oficios, los géneros, los visionados y los datos técnicos del archivo. Después es incremental y se repite sola cada noche.')}
        </p>
        <p>
          <b className="text-zinc-200">{t('2. Cruce con TMDB.')}</b>{' '}
          {t('Cada película de Plex trae su identificador de TMDB, así que el emparejado es exacto. De ahí salen las filmografías, los estrenos futuros y las sagas, cacheados.')}
        </p>
        <p>
          <b className="text-zinc-200">{t('3. Acción con Radarr.')}</b>{' '}
          {t('Lo que te falte se añade con un clic, monitorizado y con búsqueda automática, usando el perfil de calidad y la carpeta que elijas.')}
        </p>
      </div>

      <h2 className="text-lg font-semibold text-zinc-100 mb-3">{t('Las secciones, una a una')}</h2>
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        {t('Desde cualquier sitio,')} <b className="text-zinc-300">Ctrl/⌘ + K</b>{' '}
        {t('abre la búsqueda global: películas, personas, sagas, listas y festivales.')}
      </p>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {SECCIONES.map(([icon, titulo, to, texto]) => (
          <Block key={titulo} icon={icon} title={t(titulo)} to={to}>
            <p>{t(texto)}</p>
          </Block>
        ))}
      </div>

      <div className="card p-5 text-xs text-zinc-500 leading-relaxed">
        <p>
          {t('PowaFlex corre en Docker, guarda sus datos en SQLite y no tiene cuentas ni telemetría. Datos de cine por cortesía de')}{' '}
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="text-gold-400 hover:underline">
            TMDB
          </a>
          {t('. No la expongas a internet sin un proxy con autenticación: está pensada para tu red local. Define')}{' '}
          <code className="text-zinc-300">POWAFLEX_SECRET</code> {t('para cifrar las credenciales en disco.')}
        </p>
        <p className="mt-2">
          {t('Proyecto de código abierto:')}{' '}
          <a href="https://github.com/ForeverRamone/PowaFlex" target="_blank" rel="noreferrer" className="text-gold-400 hover:underline">
            github.com/ForeverRamone/PowaFlex
          </a>{' '}
          {t('— las novedades de cada versión se publican en Releases.')}
        </p>
      </div>
    </div>
  );
}
