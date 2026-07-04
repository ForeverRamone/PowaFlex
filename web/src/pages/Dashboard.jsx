import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { api, fmtBytes } from '../api.js';
import { Spinner, StatCard, Section, PersonCard, Empty } from '../components.jsx';

const GOLD = '#e8b53a';
const COLORS = ['#e8b53a', '#38bdf8', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#f87171', '#94a3b8'];

const tooltipStyle = {
  backgroundColor: '#1a2030',
  border: '1px solid #35405c',
  borderRadius: 8,
  color: '#e2e8f0',
};

export default function Dashboard() {
  const [ov, setOv] = useState(null);
  const [charts, setCharts] = useState(null);
  const [directors, setDirectors] = useState([]);
  const [actors, setActors] = useState([]);

  useEffect(() => {
    api('/stats/overview').then(setOv);
    api('/stats/charts').then(setCharts);
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

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Section title="Películas por década">
          <div className="card p-4 h-64">
            <ResponsiveContainer>
              <BarChart data={charts.byDecade}>
                <XAxis dataKey="decade" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#252d4266' }} />
                <Bar dataKey="n" name="Películas" fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Géneros principales">
          <div className="card p-4 h-64">
            <ResponsiveContainer>
              <BarChart data={charts.byGenre.slice(0, 10)} layout="vertical">
                <XAxis type="number" stroke="#64748b" fontSize={12} />
                <YAxis type="category" dataKey="name" width={100} stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#252d4266' }} />
                <Bar dataKey="n" name="Películas" fill="#38bdf8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Crecimiento de la biblioteca (añadidas por mes)">
          <div className="card p-4 h-64">
            <ResponsiveContainer>
              <LineChart data={charts.addedByMonth}>
                <XAxis dataKey="month" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="n" name="Añadidas" stroke={GOLD} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Resoluciones">
          <div className="card p-4 h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={charts.byResolution}
                  dataKey="n"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={85}
                  label={(e) => `${e.name} (${e.n})`}
                  fontSize={11}
                >
                  {charts.byResolution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
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
    </div>
  );
}
