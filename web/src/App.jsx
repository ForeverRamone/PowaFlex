import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { Spinner } from './components.jsx';
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
  { to: '/personas', label: 'Directores y actores', icon: '🎭' },
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

  useEffect(() => {
    api('/setup-state').then((s) => {
      setSetup(s);
      if (!s.plex && window.location.pathname !== '/ajustes') navigate('/ajustes');
    });
    api('/version').then((v) => v.label && setVersion(v));
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-ink-700 bg-ink-900 p-4 flex flex-col gap-1 sticky top-0 h-screen overflow-y-auto">
        <div className="text-xl font-black text-gold-400 mb-4 px-2">
          Powa<span className="text-slate-100">Flex</span>
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
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
      <main className="flex-1 p-6 max-w-[1600px] min-w-0">
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
