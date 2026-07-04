import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { api, fmtBytes, fmtDate } from '../api.js';
import { Spinner, StatCard, Section, PersonCard, Empty, MovieModal } from '../components.jsx';

const GOLD = '#e8b53a';
const COLORS = ['#e8b53a', '#38bdf8', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#f87171', '#94a3b8'];

const tooltipStyle = {
  backgroundColor: '#1a2030',
  border: '1px solid #35405c',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 12,
};

// small poster tile used across the "recent" strips
function PosterTile({ item, onClick, badge, sub }) {
  const [err, setErr] = useState(false);
  const showImg = item.rating_key && item.thumb !== false && !err;
  return (
    <button onClick={onClick} disabled={!item.rating_key} className="w-full text-left group disabled:cursor-default">
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border border-ink-700 group-enabled:group-hover:border-gold-400 transition-colors relative flex items-center justify-center">
        {showImg ? (
          <img src={`/img/${item.rating_key}/poster`} alt="" loading="lazy" onError={() => setErr(true)} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[11px] text-slate-400 text-center p-2">{item.title}</span>
        )}
        {badge}
      </div>
      <div className="mt-1 text-[11px] text-slate-300 truncate">{item.title}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </button>
  );
}

function RecentStrip({ items, onSelect, kind }) {
  if (!items?.length) return <Empty>Nada todavía.</Empty>;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {items.map((m, i) => (
        <PosterTile
          key={`${m.rating_key || m.title}-${i}`}
          item={m}
          onClick={() => m.rating_key && onSelect(m.rating_key)}
          badge={
            kind === 'watched' && m.source === 'letterboxd' ? (
              <span className="absolute top-1 right-1 bg-orange-600/90 text-white text-[9px] px-1 py-0.5 rounded">LB</span>
            ) : kind === 'watched' && m.source === 'plex' ? (
              <span className="absolute top-1 right-1 bg-emerald-600/90 text-white text-[9px] px-1 py-0.5 rounded">Plex</span>
            ) : null
          }
          sub={
            kind === 'added'
              ? fmtDate(m.added_at ? new Date(m.added_at * 1000) : null)
              : kind === 'watched'
                ? `${fmtDate(m.date)}${m.rating ? ` · ★${m.rating}` : ''}`
                : `${m.year ?? ''}`
          }
        />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [ov, setOv] = useState(null);
  const [charts, setCharts] = useState(null);
  const [recent, setRecent] = useState(null);
  const [directors, setDirectors] = useState([]);
  const [actors, setActors] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api('/stats/overview').then(setOv);
    api('/stats/charts').then(setCharts);
    api('/stats/recent').then(setRecent);
    api('/people?role=director&limit=10').then((r) => Array.isArray(r) && setDirectors(r));
    api('/people?role=actor&limit=10').then((r) => Array.isArray(r) && setActors(r));
  }, []);

  if (!ov || !charts) return <Spinner />;
  if (!ov.movies)
    return (
      <Empty>
        Aún no hay películas sincronizadas. Ve a <Link className="text-gold-400" to="/ajustes">Ajustes</Link> para
        conectar con Plex y lanzar la primera sincronización.
      </Empty>
    );

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Tu cinemateca</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
        <StatCard label="Películas" value={ov.movies.toLocaleString('es-ES')} />
        <StatCard label="Horas de cine" value={ov.hours.toLocaleString('es-ES')} sub={`≈ ${Math.round(ov.hours / 24)} días`} />
        <StatCard label="En disco" value={fmtBytes(ov.sizeBytes)} />
        <StatCard label="Vistas" value={ov.watched.toLocaleString('es-ES')} sub={`${Math.round((ov.watched / ov.movies) * 100)}% de la biblioteca`} />
        <StatCard label="Directores" value={ov.directors.toLocaleString('es-ES')} />
        <StatCard label="En 4K" value={ov.fourK.toLocaleString('es-ES')} />
      </div>

      {/* recent activity (#8) */}
      {recent && (
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <Section title="Últimas añadidas a Plex" action={<Link to="/biblioteca?sort=added" className="text-xs text-gold-400 hover:underline">Ver más →</Link>}>
            <RecentStrip items={recent.recentlyAdded} onSelect={setSelected} kind="added" />
          </Section>
          <Section title="Últimas vistas" action={<Link to="/visionado" className="text-xs text-gold-400 hover:underline">Ver más →</Link>}>
            {recent.recentlyWatched?.length ? (
              <RecentStrip items={recent.recentlyWatched} onSelect={setSelected} kind="watched" />
            ) : (
              <Empty>Sin visionados de Plex ni de Letterboxd todavía. Configura tu RSS en «Letterboxd».</Empty>
            )}
          </Section>
          <Section title="Últimas peticiones a Radarr" action={<Link to="/ajustes" className="text-xs text-gold-400 hover:underline">Ajustes →</Link>}>
            {recent.radarrRecent?.length ? (
              <div className="card divide-y divide-ink-800 max-h-[420px] overflow-y-auto">
                {recent.radarrRecent.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={m.has_file ? 'text-emerald-400' : 'text-slate-500'}>{m.has_file ? '✓' : '⏳'}</span>
                    <span className="text-slate-200 truncate flex-1">{m.title} <span className="text-slate-500">({m.year ?? '¿?'})</span></span>
                    <span className="text-[11px] text-slate-500 shrink-0">{fmtDate(m.added)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Sincroniza Radarr en Ajustes para ver aquí las últimas peticiones.</Empty>
            )}
          </Section>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Section title="Películas por década">
          <div className="card p-4 h-72">
            <ResponsiveContainer>
              <BarChart data={charts.byDecade} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <XAxis dataKey="decade" stroke="#64748b" fontSize={12} tickMargin={6} />
                <YAxis stroke="#64748b" fontSize={12} width={38} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#252d4266' }} />
                <Bar dataKey="n" name="Películas" fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Géneros principales">
          <div className="card p-4 h-72">
            <ResponsiveContainer>
              <BarChart data={charts.byGenre.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis type="number" stroke="#64748b" fontSize={12} />
                <YAxis type="category" dataKey="name" width={130} stroke="#94a3b8" fontSize={11} interval={0} tickMargin={4} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#252d4266' }} />
                <Bar dataKey="n" name="Películas" fill="#38bdf8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Crecimiento de la biblioteca (añadidas por mes)">
          <div className="card p-4 h-72">
            <ResponsiveContainer>
              <LineChart data={charts.addedByMonth} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <XAxis dataKey="month" stroke="#64748b" fontSize={10} tickMargin={6} minTickGap={24} />
                <YAxis stroke="#64748b" fontSize={12} width={38} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="n" name="Añadidas" stroke={GOLD} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Resoluciones">
          <div className="card p-4 h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={charts.byResolution}
                  dataKey="n"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={80}
                >
                  {charts.byResolution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n, p) => [`${v} películas`, p.payload.name]} />
                <Legend formatter={(v) => <span className="text-xs text-slate-300">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section
          title="Directores con más películas"
          action={<Link to="/personas" className="text-xs text-gold-400 hover:underline">Ver todos →</Link>}
        >
          <div className="grid sm:grid-cols-2 gap-2">
            {directors.map((p) => <PersonCard key={p.id} person={p} role="director" />)}
          </div>
        </Section>
        <Section
          title="Actores con más películas"
          action={<Link to="/personas?role=actor" className="text-xs text-gold-400 hover:underline">Ver todos →</Link>}
        >
          <div className="grid sm:grid-cols-2 gap-2">
            {actors.map((p) => <PersonCard key={p.id} person={p} role="actor" />)}
          </div>
        </Section>
      </div>

      {selected && <MovieModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
