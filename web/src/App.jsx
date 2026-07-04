import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { Spinner, Toaster, GlobalSearch } from './components.jsx';
import { api } from './api.js';

// lazy per route so heavy pages (and recharts) don't weigh down the first paint
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Library = lazy(() => import('./pages/Library.jsx'));
const People = lazy(() => import('./pages/People.jsx'));
const PersonDetail = lazy(() => import('./pages/PersonDetail.jsx'));
const Calendar = lazy(() => import('./pages/Calendar.jsx'));
const Collections = lazy(() => import('./pages/Collections.jsx'));
const Letterboxd = lazy(() => import('./pages/Letterboxd.jsx'));
const Quality = lazy(() => import('./pages/Quality.jsx'));
const WatchStats = lazy(() => import('./pages/WatchStats.jsx'));
const Discover = lazy(() => import('./pages/Discover.jsx'));
const Favorites = lazy(() => import('./pages/Favorites.jsx'));
const Lists = lazy(() => import('./pages/Lists.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/biblioteca', label: 'Biblioteca', icon: '🎞️' },
  { to: '/personas', label: 'Directores/as y actores/actrices', icon: '🎭' },
  { to: '/calendario', label: 'Cine venidero', icon: '🗓️' },
  { to: '/favoritos', label: 'Favoritos', icon: '⭐' },
  { to: '/descubrir', label: 'Descubrir huecos', icon: '🧭' },
  { to: '/listas', label: 'Listas y retos', icon: '🏆' },
  { to: '/colecciones', label: 'Sagas', icon: '📚' },
  { to: '/visionado', label: 'Visionado', icon: '👁️' },
  { to: '/calidad', label: 'Calidad y disco', icon: '💾' },
  { to: '/letterboxd', label: 'Letterboxd', icon: '🟠' },
  { to: '/ajustes', label: 'Ajustes', icon: '⚙️' },
  { to: '/acerca', label: '¿Qué es PowaFlex?', icon: '❓' },
];

function Shell() {
  const navigate = useNavigate();
  const [setup, setSetup] = useState(null);
  const [version, setVersion] = useState(null);
  const [open, setOpen] = useState(false); // mobile drawer

  useEffect(() => {
    api('/setup-state').then((s) => {
      setSetup(s);
      if (!s.plex && window.location.pathname !== '/ajustes') navigate('/ajustes');
    });
    api('/version').then((v) => v.label && setVersion(v));
    // mirror the headline-rating pref so poster cards can read it synchronously (#5)
    api('/settings').then((st) => st && localStorage.setItem('primary_rating', st.primary_rating || 'score'));
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 bg-ink-900 border-b border-ink-700 px-4 h-14">
        <button onClick={() => setOpen(true)} className="text-slate-200 text-2xl leading-none" aria-label="Menú">☰</button>
        <div className="text-lg font-black text-gold-400">Powa<span className="text-slate-100">Flex</span></div>
        <button onClick={() => window.dispatchEvent(new Event('powaflex-search'))} className="ml-auto text-slate-300 text-xl" aria-label="Buscar">🔍</button>
      </div>
      {open && <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setOpen(false)} />}

      <aside
        className={`w-56 shrink-0 border-r border-ink-700 bg-ink-900 p-4 flex flex-col gap-1 z-50 fixed md:sticky top-0 h-screen overflow-y-auto transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="text-xl font-black text-gold-400 mb-3 px-2 flex items-center justify-between">
          <span>Powa<span className="text-slate-100">Flex</span></span>
          <button onClick={() => setOpen(false)} className="md:hidden text-slate-400 text-xl" aria-label="Cerrar">✕</button>
        </div>
        <button
          onClick={() => { setOpen(false); window.dispatchEvent(new Event('powaflex-search')); }}
          className="mb-3 mx-1 flex items-center gap-2 text-sm text-slate-400 bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 hover:border-gold-400"
        >
          🔍 Buscar… <span className="ml-auto text-[10px] text-slate-600">⌘K</span>
        </button>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 transition-colors ${
                isActive
                  ? 'bg-ink-700 text-gold-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-ink-800'
              }`
            }
          >
            <span>{n.icon}</span> {n.label}
          </NavLink>
        ))}
        {setup && setup.movies > 0 && (
          <div className="mt-auto pt-4 text-xs text-slate-500 px-2">
            {setup.movies.toLocaleString('es-ES')} películas sincronizadas
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
          className="fixed bottom-2 right-3 z-40 text-[10px] text-slate-600 hover:text-gold-400 transition-colors"
        >
          {version.label}
        </a>
      )}
      <main className="flex-1 p-4 pt-20 md:p-6 max-w-[1600px] min-w-0">
        <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/biblioteca" element={<Library />} />
          <Route path="/personas" element={<People />} />
          <Route path="/personas/:id" element={<PersonDetail />} />
          <Route path="/calendario" element={<Calendar />} />
          <Route path="/colecciones" element={<Collections />} />
          <Route path="/visionado" element={<WatchStats />} />
          <Route path="/descubrir" element={<Discover />} />
          <Route path="/favoritos" element={<Favorites />} />
          <Route path="/listas" element={<Lists />} />
          <Route path="/acerca" element={<About />} />
          <Route path="/calidad" element={<Quality />} />
          <Route path="/letterboxd" element={<Letterboxd />} />
          <Route path="/ajustes" element={<Settings />} />
        </Routes>
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
