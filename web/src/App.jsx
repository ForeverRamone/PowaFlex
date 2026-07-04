import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Library from './pages/Library.jsx';
import People from './pages/People.jsx';
import PersonDetail from './pages/PersonDetail.jsx';
import Calendar from './pages/Calendar.jsx';
import Collections from './pages/Collections.jsx';
import Letterboxd from './pages/Letterboxd.jsx';
import Quality from './pages/Quality.jsx';
import WatchStats from './pages/WatchStats.jsx';
import Discover from './pages/Discover.jsx';
import Favorites from './pages/Favorites.jsx';
import About from './pages/About.jsx';
import Settings from './pages/Settings.jsx';
import { api } from './api.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/biblioteca', label: 'Biblioteca', icon: '🎞️' },
  { to: '/personas', label: 'Directores y actores', icon: '🎭' },
  { to: '/calendario', label: 'Cine venidero', icon: '🗓️' },
  { to: '/favoritos', label: 'Favoritos', icon: '⭐' },
  { to: '/descubrir', label: 'Descubrir huecos', icon: '🧭' },
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
          <Route path="/acerca" element={<About />} />
          <Route path="/calidad" element={<Quality />} />
          <Route path="/letterboxd" element={<Letterboxd />} />
          <Route path="/ajustes" element={<Settings />} />
        </Routes>
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
