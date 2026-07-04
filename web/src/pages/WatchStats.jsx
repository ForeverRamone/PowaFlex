import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api.js';
import { Spinner, Section, MovieCard, Empty } from '../components.jsx';
import { MovieModal } from '../components.jsx';

const tooltipStyle = { backgroundColor: '#1a2030', border: '1px solid #35405c', borderRadius: 8, color: '#e2e8f0' };

export default function WatchStats() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api('/stats/watch').then(setData);
  }, []);

  if (!data) return <Spinner />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Visionado</h1>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Section title="Visto vs. pendiente por década">
          <div className="card p-4 h-72">
            <ResponsiveContainer>
              <BarChart data={data.watchedByDecade}>
                <XAxis dataKey="decade" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#252d4266' }} />
                <Legend />
                <Bar dataKey="watched" name="Vistas" stackId="a" fill="#34d399" />
                <Bar dataKey="total" name="Total" fill="#35405c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Visto vs. total por género">
          <div className="card p-4 h-72">
            <ResponsiveContainer>
              <BarChart data={data.watchedByGenre} layout="vertical">
                <XAxis type="number" stroke="#64748b" fontSize={12} />
                <YAxis type="category" dataKey="name" width={95} stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#252d4266' }} />
                <Legend />
                <Bar dataKey="watched" name="Vistas" fill="#34d399" />
                <Bar dataKey="total" name="Total" fill="#35405c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <Section title="Directores con obra pendiente en tu biblioteca">
        {data.directorsPending.length === 0 ? (
          <Empty>Nada pendiente. 🏆</Empty>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {data.directorsPending.map((d) => (
              <Link key={d.id} to={`/biblioteca?personId=${d.id}&personRole=director&watched=no`} className="card p-3 hover:border-gold-400 transition-colors">
                <div className="text-sm font-medium text-slate-200">{d.name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {d.watched} vistas de {d.total} · <span className="text-gold-400">{d.total - d.watched} pendientes</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Mejor valoradas que aún no has visto">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-3">
          {data.unwatchedTopRated.map((m) => (
            <MovieCard key={m.rating_key} movie={m} onClick={() => setSelected(m.rating_key)} />
          ))}
        </div>
      </Section>

      <Section title="Vistas recientemente">
        {data.recentlyViewed.length === 0 ? (
          <Empty>Plex no registra visionados aún.</Empty>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-3">
            {data.recentlyViewed.map((m) => (
              <MovieCard key={m.rating_key} movie={m} onClick={() => setSelected(m.rating_key)} />
            ))}
          </div>
        )}
      </Section>

      {selected && <MovieModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
