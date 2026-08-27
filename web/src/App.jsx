import { useEffect, useId, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Film, Users, CalendarDays, Star, Compass, Trophy,
  Eye, Wrench, Settings as SettingsIcon, HelpCircle, Search, Menu, X, Award, Ticket, Sparkles,
  TrendingUp, Globe2,
} from 'lucide-react';
import { Spinner, Toaster, GlobalSearch, ErrorBoundary, useBloqueoDeFondo } from './components.jsx';
import { api, applyTheme } from './api.js';
import { t, getLang, setLang, locale } from './i18n.js';
import { ScrollMemory } from './scroll.js';

// lazy per route so heavy pages (and recharts) don't weigh down the first paint.
// Sagas, Quality, Salud y Directors ya no son rutas: viven como pestañas dentro
// de Descubrir, Taller y Personas, que las cargan perezosas por su cuenta.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Library = lazy(() => import('./pages/Library.jsx'));
const People = lazy(() => import('./pages/People.jsx'));
const PersonDetail = lazy(() => import('./pages/PersonDetail.jsx'));
const Calendar = lazy(() => import('./pages/Calendar.jsx'));
const Taller = lazy(() => import('./pages/Taller.jsx'));
const WatchStats = lazy(() => import('./pages/WatchStats.jsx'));
const Discover = lazy(() => import('./pages/Discover.jsx'));
const Favorites = lazy(() => import('./pages/Favorites.jsx'));
const Lists = lazy(() => import('./pages/Lists.jsx'));
const Festivals = lazy(() => import('./pages/Festivals.jsx'));
const Emergentes = lazy(() => import('./pages/Emergentes.jsx'));
const Estrenos = lazy(() => import('./pages/Estrenos.jsx'));
const Paises = lazy(() => import('./pages/Paises.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Novedades = lazy(() => import('./pages/Novedades.jsx'));

// grouped so the eye finds things: what you have, what you hunt, everything else
// t() en tiempo de módulo vale: el idioma queda fijado antes del primer render
// y cambiarlo recarga la página entera
const NAV_GROUPS = [
  {
    label: t('Tu colección'),
    items: [
      { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
      { to: '/biblioteca', label: t('Biblioteca'), Icon: Film },
      { to: '/personas', label: t('Directores y actores'), Icon: Users },
      { to: '/visionado', label: t('Visionado'), Icon: Eye },
      { to: '/taller', label: t('Taller'), Icon: Wrench },
    ],
  },
  {
    label: t('La caza'),
    items: [
      { to: '/favoritos', label: t('Favoritos'), Icon: Star },
      { to: '/descubrir', label: t('Descubrir huecos'), Icon: Compass },
      { to: '/calendario', label: t('Cine venidero'), Icon: CalendarDays },
      { to: '/festivales', label: t('Festivales y premios'), Icon: Award },
      { to: '/emergentes', label: t('Directores emergentes'), Icon: TrendingUp },
      { to: '/estrenos', label: t('Estrenos'), Icon: Ticket },
      { to: '/paises', label: t('Por países'), Icon: Globe2 },
      { to: '/listas', label: t('Listas y retos'), Icon: Trophy },
    ],
  },
  {
    label: t('Cuenta'),
    items: [
      { to: '/ajustes', label: t('Ajustes'), Icon: SettingsIcon },
      { to: '/novedades', label: t('Últimas novedades'), Icon: Sparkles },
      { to: '/acerca', label: t('¿Qué es PowaFlex?'), Icon: HelpCircle },
    ],
  },
];

/**
 * EL LOGOTIPO, montado según el pliego de marca (assets/logo/c-1317.png).
 *
 * Tres piezas, una sola tinta:
 *
 *  1. El MONOGRAMA P+F, que hace de inicial. Es un PNG de una tinta sobre fondo
 *     transparente teñido con `currentColor` a través de una máscara CSS: el
 *     mismo fichero vale para el crema sobre rojo de Cartelera y para el oro de
 *     los dos aspectos oscuros, sin duplicar el icono.
 *  2. El TEXTO, que NO repite la P ni la F —el símbolo ya las pone— y por eso
 *     dice «OWA / LEX» y no «PowaFlex».
 *  3. La X DE PELÍCULA, dos tiras perforadas cruzadas, dibujada aquí en SVG.
 *
 * OJO con la tipografía: va fijada a Archivo Black y NO usa la clase
 * `font-display`, porque `--font-display` cambia con el aspecto —en Cinemateca
 * es una Bodoni con serifas— y el logotipo tiene que ser el mismo dibujo en los
 * tres. Lo único que cambia entre aspectos es la tinta, como manda el pliego.
 */
const TIPO_LOGO = {
  fontFamily: "'Archivo Black', 'Archivo Variable', Impact, sans-serif",
  letterSpacing: '-0.02em',
  lineHeight: 0.82,
  fontWeight: 400,
};

/**
 * El símbolo del logotipo usa `logo-simbolo.png`, que es `icon.png` RECORTADO a
 * su dibujo. No es duplicar por duplicar: el icono de la app lleva un 16,6 % de
 * aire transparente a los lados y un 11,9 % arriba y abajo —lo necesita para
 * respirar como favicon—, y dentro del logotipo ese aire se convertía en un
 * hueco entre la P y la «OWA» que rompía la palabra. Con el dibujo a sangre, el
 * alto y la separación que se piden aquí son los que se ven.
 */
const Simbolo = ({ className = '', alto = '1.05em' }) => (
  <span
    aria-hidden="true"
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      // el tamaño va en línea: sin contenido, el elemento no tiene alto propio
      width: `calc(${alto} * 0.877)`, // la proporción real del dibujo recortado
      height: alto,
      WebkitMaskImage: 'url(/logo-simbolo.png)',
      maskImage: 'url(/logo-simbolo.png)',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);

/**
 * La X de LEX: dos tiras de película cruzadas. Va en SVG y no como imagen para
 * que las perforaciones sigan siendo cuadrados limpios a cualquier tamaño.
 *
 * El `useId` no es adorno: el logotipo se pinta DOS veces a la vez (la barra
 * lateral y la superior de móvil) y dos máscaras con el mismo id hacen que la
 * segunda use la del primero.
 */
function CruzDePelicula({ className = '' }) {
  const uid = useId().replace(/:/g, '');
  const mask = `perf-${uid}`;
  // Una tira: barra de 100 de largo por 34 de ancho con cinco perforaciones.
  // El grosor no es libre — tiene que aguantar la comparación con el trazo de
  // la Archivo Black, que es pesadísimo, o la X parece de otra familia.
  const perforaciones = [];
  // la tira se sale de la caja por los dos lados y el viewBox la corta a
  // escuadra: así las perforaciones llegan hasta la punta de cada brazo, como
  // en el pliego, en vez de dejar los extremos macizos
  for (let i = 0; i < 9; i++) {
    perforaciones.push(<rect key={i} x={-25 + i * 19} y={-5.5} width="11" height="11" rx="1.8" />);
  }
  const tira = (giro) => (
    <g transform={`rotate(${giro} 50 50)`}>
      <rect x="-30" y="33" width="160" height="34" />
      <g transform="translate(0 50)" fill="#000">{perforaciones}</g>
    </g>
  );
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" style={{ display: 'block' }}>
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
        <rect width="100" height="100" fill="#000" />
        <g fill="#fff">{tira(45)}</g>
        <g fill="#fff">{tira(-45)}</g>
      </mask>
      <rect width="100" height="100" fill="currentColor" mask={`url(#${mask})`} />
    </svg>
  );
}

/**
 * `variante`: «apilado» es el logotipo principal a dos líneas (A1 del pliego) y
 * «linea» el horizontal (A2), que es el que aguanta una barra de 56 px de alto.
 */
function Logotipo({ variante = 'apilado', className = '' }) {
  // La X es una LETRA más: va a la altura de las mayúsculas (0,73 em en Archivo
  // Black) y apoyada en la línea base, no centrada en la caja de línea — ahí es
  // donde caía antes, colgando por debajo del resto.
  // en una fila con `items-baseline`, la línea base de un SVG es su borde
  // INFERIOR: así la X se apoya exactamente donde apoyan la L y la E
  const equis = <CruzDePelicula className="w-[0.73em] h-[0.73em] shrink-0" />;
  if (variante === 'linea') {
    return (
      <span className={`inline-flex items-center gap-[0.06em] ${className}`} style={TIPO_LOGO}>
        <Simbolo alto="1.02em" />
        <span className="inline-flex items-baseline leading-none">
          <span>OWAFLE</span>
          {equis}
        </span>
        <span className="sr-only">PowaFlex</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-[0.07em] ${className}`} style={TIPO_LOGO}>
      {/* el símbolo pisa el alto de las DOS líneas: la P abre «OWA» y la F abre
          «LEX», así que tiene que leerse POWA / FLEX sin hueco en medio */}
      <Simbolo alto="1.74em" />
      <span className="inline-flex flex-col">
        <span>OWA</span>
        <span className="inline-flex items-baseline leading-none">
          <span>LE</span>
          {equis}
        </span>
      </span>
      <span className="sr-only">PowaFlex</span>
    </span>
  );
}

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [setup, setSetup] = useState(null);
  const [version, setVersion] = useState(null);
  const [open, setOpen] = useState(false); // mobile drawer
  // el menú lateral es un cajón solo por debajo de md; hay que saberlo para no
  // marcarlo inerte en escritorio, donde está siempre a la vista
  const [enMovil, setEnMovil] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = (e) => setEnMovil(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // con el cajón abierto, el gesto de scroll atravesaba el velo y movía la
  // página de detrás; solo en móvil, que es donde el menú es un cajón
  useBloqueoDeFondo(enMovil && open);

  useEffect(() => {
    api('/setup-state').then((s) => {
      setSetup(s);
      if (!s.plex && window.location.pathname !== '/ajustes') navigate('/ajustes');
    });
    api('/version').then((v) => v.label && setVersion(v));
    // mirror display prefs locally: cards read the rating synchronously and
    // index.html applies the look before paint
    api('/settings').then((st) => {
      // api() no rechaza nunca: un fallo devuelve { error } truthy. Sin este
      // guard, un corte transitorio reseteaba el idioma a ES y recargaba.
      if (!st || st.error) return;
      localStorage.setItem('primary_rating', st.primary_rating || 'score');
      applyTheme(st.ui_theme || 'cartelera');
      // el idioma vive en el servidor pero se lee de localStorage al pintar;
      // si otro dispositivo lo cambió, un reload único lo pone al día (tras él
      // ambos coinciden y no se vuelve a entrar aquí)
      const remoteLang = st.ui_language === 'en' ? 'en' : 'es';
      if (remoteLang !== getLang()) { setLang(remoteLang); window.location.reload(); }
    });
  }, []);

  return (
    <div className="flex min-h-screen">
      <ScrollMemory />
      {/* mobile top bar */}
      <div className="app-nav md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 bg-ink-900 border-b border-ink-700 px-4 h-14">
        {/* padding + margen negativo: el área táctil llega a ~44 px sin mover
            el icono ni un píxel de donde estaba */}
        <button onClick={() => setOpen(true)} className="p-2.5 -m-2.5 text-zinc-300 hover:text-zinc-100" aria-label={t('Menú')}>
          <Menu size={20} strokeWidth={1.75} />
        </button>
        {/* la barra de móvil mide 56 px: ahí va el horizontal, no el apilado */}
        <Logotipo variante="linea" className="text-[19px] text-zinc-100" />
        <button
          onClick={() => window.dispatchEvent(new Event('powaflex-search'))}
          className="ml-auto p-2.5 -my-2.5 -mr-2.5 text-zinc-300 hover:text-zinc-100"
          aria-label={t('Buscar')}
        >
          <Search size={18} strokeWidth={1.75} />
        </button>
      </div>
      {open && <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setOpen(false)} />}

      <aside
        /* cerrado en móvil sigue estando en el orden de tabulación: al tabular
           desde la barra superior recorrías trece enlaces invisibles */
        inert={enMovil && !open}
        /* h-dvh y no h-screen: en móvil 100vh incluye la barra del navegador y
           el pie del menú quedaba escondido debajo de ella */
        className={`app-nav w-56 shrink-0 border-r border-ink-700 bg-ink-900 py-4 flex flex-col z-50 fixed md:sticky top-0 h-dvh overflow-y-auto overscroll-contain transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="mb-4 px-5 flex items-center justify-between">
          <Logotipo className="text-[27px] text-zinc-100" />
          <button onClick={() => setOpen(false)} className="md:hidden p-2.5 -m-2.5 text-zinc-500" aria-label={t('Cerrar')}>
            <X size={18} />
          </button>
        </div>
        <button
          onClick={() => { setOpen(false); window.dispatchEvent(new Event('powaflex-search')); }}
          className="mb-4 mx-4 flex items-center gap-2 text-sm text-zinc-400 bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <Search size={15} strokeWidth={1.75} /> {t('Buscar…')}
          <span className="ml-auto text-[11px] text-zinc-600">⌘K</span>
        </button>

        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="nav-group px-5 pb-1 text-[11px] font-semibold tracking-[0.18em] uppercase text-zinc-600">
              {group.label}
            </div>
            {group.items.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `nav-item pl-4 pr-3 py-2 text-sm flex items-center gap-2.5 border-l-2 transition-colors ${
                    isActive
                      ? 'nav-item-on border-gold-400 bg-gold-400/5 text-gold-400 font-medium'
                      : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-ink-800'
                  }`
                }
              >
                <Icon size={16} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate">{label}</span>
                {/* el pase nocturno falló o lleva 26+ h sin correr: avísalo donde se mira */}
                {to === '/ajustes' && setup?.nightly && (setup.nightly.errores > 0 || setup.nightly.stale) && (
                  <span
                    className="ml-auto w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,.9)] shrink-0"
                    title={
                      setup.nightly.stale
                        ? t('La última actualización completa tiene más de 26 horas: el pase nocturno puede no estar corriendo')
                        : t('La última pasada terminó con {n} error(es): mira el histórico en Ajustes', { n: setup.nightly.errores })
                    }
                  />
                )}
                {/* la cuarentena vive dentro de una pestaña de Ajustes: sin este
                    punto, lo que espera tu ✓ no se ve desde ninguna parte. Ámbar
                    y no rojo: no es una avería, es algo que decidir. */}
                {to === '/ajustes' && setup?.pendientes > 0 && (
                  <span
                    className="ml-auto text-[10px] leading-none tabular text-ink-900 bg-amber-400 rounded-full px-1.5 py-0.5 shrink-0"
                    title={t('{n} película(s) en cuarentena esperan tu ✓ en Ajustes → Automatismos', { n: setup.pendientes })}
                  >
                    {setup.pendientes}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}

        {setup && setup.movies > 0 && (
          <div className="mt-auto pt-4 text-xs text-zinc-500 px-5">
            <span className="tabular">{setup.movies.toLocaleString(locale())}</span> {t('películas sincronizadas')}
            {setup.newlyAdded > 0 && (
              <span className="text-emerald-400" title={t('Añadidas en la última sincronización')}>
                {' '}+{setup.newlyAdded.toLocaleString(locale())}
              </span>
            )}
          </div>
        )}
      </aside>
      {version && (
        <Link
          to="/novedades"
          title={t('PowaFlex {v} — ver qué trae esta versión', { v: version.version })}
          /* sobre el papel de «Cartelera» un texto suelto en zinc-600 no se
             leía: va sellado en su propia tarjeta, como el resto de la app.
             En móvil se oculta: flotando sobre una columna tapaba contenido. */
          className="card-raised fixed bottom-2 right-3 z-40 px-2 py-1 text-[11px] leading-none
                     text-zinc-400 hover:text-gold-400 transition-colors hidden md:block"
        >
          {version.label}
        </Link>
      )}
      <main className="flex-1 p-4 pt-20 md:p-6 max-w-[1600px] min-w-0">
        <Suspense fallback={<Spinner />}>
        {/* la clave hace que la barrera se reinicie al cambiar de página: si no,
            una vez rota se quedaba rota aunque navegaras a otro sitio */}
        <ErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/biblioteca" element={<Library />} />
          <Route path="/personas" element={<People />} />
          <Route path="/personas/:id" element={<PersonDetail />} />
          <Route path="/calendario" element={<Calendar />} />
          <Route path="/visionado" element={<WatchStats />} />
          <Route path="/descubrir" element={<Discover />} />
          <Route path="/favoritos" element={<Favorites />} />
          <Route path="/listas" element={<Lists />} />
          <Route path="/festivales" element={<Festivals />} />
          <Route path="/emergentes" element={<Emergentes />} />
          <Route path="/estrenos" element={<Estrenos />} />
          <Route path="/paises" element={<Paises />} />
          <Route path="/taller" element={<Taller />} />
          <Route path="/acerca" element={<About />} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="/novedades" element={<Novedades />} />
          {/* rutas de antes de la reorganización: los marcadores viejos siguen
              llegando a su contenido, ahora pestañas de otras páginas */}
          <Route path="/colecciones" element={<Navigate to="/descubrir?tab=sagas" replace />} />
          <Route path="/calidad" element={<Navigate to="/taller?tab=calidad" replace />} />
          <Route path="/salud" element={<Navigate to="/taller?tab=datos" replace />} />
          <Route path="/directores" element={<Navigate to="/favoritos?add=activos" replace />} />
          <Route path="/letterboxd" element={<Navigate to="/ajustes?tab=fuentes" replace />} />
        </Routes>
        </ErrorBoundary>
        </Suspense>
      </main>
      <Toaster />
      <GlobalSearch />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
