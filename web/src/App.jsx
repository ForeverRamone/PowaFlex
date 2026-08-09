import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Film, Users, CalendarDays, Star, Compass, Trophy,
  Eye, Wrench, Settings as SettingsIcon, HelpCircle, Search, Menu, X, Award, Ticket, Sparkles,
} from 'lucide-react';
import { Spinner, Toaster, GlobalSearch, ErrorBoundary } from './components.jsx';
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
const Estrenos = lazy(() => import('./pages/Estrenos.jsx'));
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
      { to: '/estrenos', label: t('Estrenos'), Icon: Ticket },
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

const Wordmark = ({ className = '' }) => (
  <span className={`font-display tracking-wide ${className}`}>
    Powa<span className="text-gold-400">Flex</span>
  </span>
);

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
        <button onClick={() => setOpen(true)} className="text-zinc-300 hover:text-zinc-100" aria-label={t('Menú')}>
          <Menu size={20} strokeWidth={1.75} />
        </button>
        <Wordmark className="text-lg text-zinc-100" />
        <button
          onClick={() => window.dispatchEvent(new Event('powaflex-search'))}
          className="ml-auto text-zinc-300 hover:text-zinc-100"
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
        className={`app-nav w-56 shrink-0 border-r border-ink-700 bg-ink-900 py-4 flex flex-col z-50 fixed md:sticky top-0 h-screen overflow-y-auto transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="mb-4 px-5 flex items-center justify-between">
          <Wordmark className="text-2xl text-zinc-100" />
          <button onClick={() => setOpen(false)} className="md:hidden text-zinc-500" aria-label={t('Cerrar')}>
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
          <Route path="/estrenos" element={<Estrenos />} />
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
