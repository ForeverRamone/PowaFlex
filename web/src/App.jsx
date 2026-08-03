import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Film, Users, CalendarDays, Star, Compass, Trophy, Layers,
  Eye, HardDrive, Settings as SettingsIcon, HelpCircle, Search, Menu, X, Award, HeartPulse,
} from 'lucide-react';
import { Spinner, Toaster, GlobalSearch, LetterboxdLogo, ErrorBoundary } from './components.jsx';
import { api, applyTheme } from './api.js';
import { ScrollMemory } from './scroll.js';

// lazy per route so heavy pages (and recharts) don't weigh down the first paint
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Library = lazy(() => import('./pages/Library.jsx'));
const People = lazy(() => import('./pages/People.jsx'));
const PersonDetail = lazy(() => import('./pages/PersonDetail.jsx'));
const Calendar = lazy(() => import('./pages/Calendar.jsx'));
const Sagas = lazy(() => import('./pages/Sagas.jsx'));
const Letterboxd = lazy(() => import('./pages/Letterboxd.jsx'));
const Quality = lazy(() => import('./pages/Quality.jsx'));
const WatchStats = lazy(() => import('./pages/WatchStats.jsx'));
const Discover = lazy(() => import('./pages/Discover.jsx'));
const Favorites = lazy(() => import('./pages/Favorites.jsx'));
const Lists = lazy(() => import('./pages/Lists.jsx'));
const Festivals = lazy(() => import('./pages/Festivals.jsx'));
const Salud = lazy(() => import('./pages/Salud.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

// grouped so the eye finds things: what you have, what you hunt, everything else
const NAV_GROUPS = [
  {
    label: 'Tu colección',
    items: [
      { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
      { to: '/biblioteca', label: 'Biblioteca', Icon: Film },
      { to: '/personas', label: 'Directores y actores', Icon: Users },
      { to: '/colecciones', label: 'Sagas', Icon: Layers },
      { to: '/visionado', label: 'Visionado', Icon: Eye },
      { to: '/calidad', label: 'Calidad y disco', Icon: HardDrive },
      { to: '/salud', label: 'Salud de los datos', Icon: HeartPulse },
    ],
  },
  {
    label: 'La caza',
    items: [
      { to: '/favoritos', label: 'Favoritos', Icon: Star },
      { to: '/descubrir', label: 'Descubrir huecos', Icon: Compass },
      { to: '/calendario', label: 'Cine venidero', Icon: CalendarDays },
      { to: '/festivales', label: 'Festivales y premios', Icon: Award },
      { to: '/listas', label: 'Listas y retos', Icon: Trophy },
    ],
  },
  {
    label: 'Cuenta',
    items: [
      // the logo is a wide 3-dot mark: give it a size that reads at nav scale
      { to: '/letterboxd', label: 'Letterboxd', Icon: () => <LetterboxdLogo size={7} className="shrink-0" /> },
      { to: '/ajustes', label: 'Ajustes', Icon: SettingsIcon },
      { to: '/acerca', label: '¿Qué es PowaFlex?', Icon: HelpCircle },
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
      if (!st) return;
      localStorage.setItem('primary_rating', st.primary_rating || 'score');
      applyTheme(st.ui_theme || 'cartelera');
    });
  }, []);

  return (
    <div className="flex min-h-screen">
      <ScrollMemory />
      {/* mobile top bar */}
      <div className="app-nav md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 bg-ink-900 border-b border-ink-700 px-4 h-14">
        <button onClick={() => setOpen(true)} className="text-zinc-300 hover:text-zinc-100" aria-label="Menú">
          <Menu size={20} strokeWidth={1.75} />
        </button>
        <Wordmark className="text-lg text-zinc-100" />
        <button
          onClick={() => window.dispatchEvent(new Event('powaflex-search'))}
          className="ml-auto text-zinc-300 hover:text-zinc-100"
          aria-label="Buscar"
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
          <button onClick={() => setOpen(false)} className="md:hidden text-zinc-500" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <button
          onClick={() => { setOpen(false); window.dispatchEvent(new Event('powaflex-search')); }}
          className="mb-4 mx-4 flex items-center gap-2 text-sm text-zinc-400 bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <Search size={15} strokeWidth={1.75} /> Buscar…
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
                        ? 'La última actualización completa tiene más de 26 horas: el pase nocturno puede no estar corriendo'
                        : `La última pasada terminó con ${setup.nightly.errores} error(es): mira el histórico en Ajustes`
                    }
                  />
                )}
              </NavLink>
            ))}
          </div>
        ))}

        {setup && setup.movies > 0 && (
          <div className="mt-auto pt-4 text-xs text-zinc-500 px-5">
            <span className="tabular">{setup.movies.toLocaleString('es-ES')}</span> películas sincronizadas
            {setup.newlyAdded > 0 && (
              <span className="text-emerald-400" title="Añadidas en la última sincronización">
                {' '}+{setup.newlyAdded.toLocaleString('es-ES')}
              </span>
            )}
          </div>
        )}
      </aside>
      {version && (
        <a
          href={`${version.repo}/releases`}
          target="_blank"
          rel="noreferrer"
          title={`PowaFlex ${version.version} — ver novedades en GitHub`}
          /* sobre el papel de «Cartelera» un texto suelto en zinc-600 no se
             leía: va sellado en su propia tarjeta, como el resto de la app */
          className="card-raised fixed bottom-2 right-3 z-40 px-2 py-1 text-[11px] leading-none
                     text-zinc-400 hover:text-gold-400 transition-colors"
        >
          {version.label}
        </a>
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
          <Route path="/colecciones" element={<Sagas />} />
          <Route path="/visionado" element={<WatchStats />} />
          <Route path="/descubrir" element={<Discover />} />
          <Route path="/favoritos" element={<Favorites />} />
          <Route path="/listas" element={<Lists />} />
          <Route path="/festivales" element={<Festivals />} />
          <Route path="/salud" element={<Salud />} />
          <Route path="/acerca" element={<About />} />
          <Route path="/calidad" element={<Quality />} />
          <Route path="/letterboxd" element={<Letterboxd />} />
          <Route path="/ajustes" element={<Settings />} />
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
