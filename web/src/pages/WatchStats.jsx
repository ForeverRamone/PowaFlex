import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api.js';
import { Spinner, Section, MovieCard, Empty } from '../components.jsx';
import { MovieModal } from '../components.jsx';

const tooltipStyle = { backgroundColor: '#1a2030', border: '1px solid #35405c', borderRadius: 8, color: '#e2e8f0' };

function InsightGrid({ title, items, caption, onSelect }) {
  if (!items?.length) return null;
  return (
    <Section title={title}>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-3">
        {items.map((m) => (
          <div key={m.rating_key}>
            <MovieCard movie={m} onClick={() => onSelect(m.rating_key)} />
            <div className="text-[11px] text-slate-500">{caption(m)}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function WatchStats() {
  const [data, setData] = useState(null);
  const [ins, setIns] = useState(null);
  const [selected, setSelected] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState('');

  const load = () => api('/stats/watch').then(setData);
  useEffect(() => {
    load();
    api('/mdblist/insights').then((r) => !r.error && setIns(r));
  }, []);

  const resolveUnmatched = async () => {
    setResolving(true);
    setResolveMsg('Buscando en TMDB las vistas sin emparejar…');
    const r = await api('/letterboxd/resolve', { method: 'POST' });
    setResolving(false);
    setResolveMsg(r.error ? `✗ ${r.error}` : `✓ ${r.matched} vistas emparejadas con tu biblioteca`);
    load();
  };

  if (!data) return <Spinner />;

  const s = data.summary;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Visionado</h1>

      {/* watched counter (#1) */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="card p-4">
            <div className="text-2xl font-bold text-gold-400">{s.total.toLocaleString('es-ES')}</div>
            <div className="text-sm text-slate-400 mt-1">Marcadas como vistas</div>
            <div className="text-xs text-slate-500 mt-1">{Math.round((s.total / s.library) * 100)}% de tu biblioteca</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-slate-200">{s.plex.toLocaleString('es-ES')}</div>
            <div className="text-sm text-slate-400 mt-1">Vistas en Plex</div>
            <div className="text-xs text-slate-500 mt-1">con reproducción registrada</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-orange-300">{s.lbInLibrary.toLocaleString('es-ES')}</div>
            <div className="text-sm text-slate-400 mt-1">Solo por Letterboxd</div>
            <div className="text-xs text-slate-500 mt-1">en tu biblioteca, sin verlas en Plex</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-slate-200">{s.lbTotal.toLocaleString('es-ES')}</div>
            <div className="text-sm text-slate-400 mt-1">Total en Letterboxd</div>
            <div className="text-xs text-slate-500 mt-1">
              {s.lbUnmatched > 0
                ? `${s.lbUnmatched.toLocaleString('es-ES')} sin emparejar con tu Plex`
                : 'todas emparejadas'}
            </div>
          </div>
        </div>
      )}

      {s && s.lbUnmatched > 0 && (
        <div className="card p-3 mb-8 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-400">
            Tienes <b className="text-orange-300">{s.lbUnmatched.toLocaleString('es-ES')}</b> películas vistas en Letterboxd que
            no cuadran con tu biblioteca (a menudo por el idioma del título). Búscalas en TMDB para emparejarlas:
          </span>
          <button className="btn-gold !py-1 shrink-0" onClick={resolveUnmatched} disabled={resolving}>
            {resolving ? 'Emparejando…' : '↻ Reintentar emparejado por TMDB'}
          </button>
          {resolveMsg && <span className="text-xs text-slate-400">{resolveMsg}</span>}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Section title="Visto vs. pendiente por década">
          <div className="card p-4 h-72">
            <ResponsiveContainer>
              <BarChart data={data.watchedByDecade} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <XAxis dataKey="decade" stroke="#64748b" fontSize={12} tickMargin={6} />
                <YAxis stroke="#64748b" fontSize={12} width={38} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#252d4266' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="watched" name="Vistas" stackId="a" fill="#34d399" />
                <Bar dataKey="total" name="Total" fill="#35405c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Visto vs. total por género">
          <div className="card p-4 h-72">
            <ResponsiveContainer>
              <BarChart data={data.watchedByGenre} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis type="number" stroke="#64748b" fontSize={12} />
                <YAxis type="category" dataKey="name" width={120} stroke="#94a3b8" fontSize={11} interval={0} tickMargin={4} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#252d4266' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="watched" name="Vistas" fill="#34d399" />
                <Bar dataKey="total" name="Total" fill="#35405c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <Section title="Directores/as con obra pendiente en tu biblioteca">
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

      {ins && (
        <>
          <InsightGrid
            title="💎 Joyas tuyas que la crítica no entendió (tu nota LB ≥ 8, RT ≤ 55%)"
            items={ins.hiddenGems}
            caption={(m) => `Tú: ${Number(m.my_rating).toFixed(1)} · 🍅 ${m.rt_critic}%`}
            onSelect={setSelected}
          />
          <InsightGrid
            title="🏛️ Consenso crítico que tienes sin ver"
            items={ins.consensusUnwatched}
            caption={(m) => `Σ ${m.score}${m.rt_critic != null ? ` · 🍅 ${m.rt_critic}%` : ''}`}
            onSelect={setSelected}
          />
          <InsightGrid
            title="🎈 El mundo las ama, tú no (tu nota LB ≤ 5, consenso ≥ 75)"
            items={ins.overrated}
            caption={(m) => `Tú: ${Number(m.my_rating).toFixed(1)} · Σ ${m.score}`}
            onSelect={setSelected}
          />
          <InsightGrid
            title="↔️ Donde más discrepas de la comunidad de Letterboxd"
            items={ins.letterboxdDivergence}
            caption={(m) => `Tú: ${Number(m.my_rating).toFixed(1)} · comunidad ${(m.letterboxd * 2).toFixed(1)}/10`}
            onSelect={setSelected}
          />
        </>
      )}

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
