import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api.js';
import { Spinner, Section, MovieCard, Empty, PageHeader, ErrorBox } from '../components.jsx';
import { MovieModal } from '../components.jsx';
import { useChartTheme } from '../charts.js';

function InsightGrid({ title, hint, items, caption, onSelect }) {
  if (!items?.length) return null;
  return (
    <Section title={title}>
      {hint && <p className="text-xs text-zinc-500 -mt-2 mb-3 max-w-3xl">{hint}</p>}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-3">
        {items.map((m) => (
          <div key={m.rating_key}>
            <MovieCard movie={m} onClick={() => onSelect(m.rating_key)} />
            <div className="text-[11px] text-zinc-500">{caption(m)}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function WatchStats() {
  const ch = useChartTheme();
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
    if (r.error) {
      setResolveMsg(`✗ ${r.error}`);
    } else {
      const bits = [`✓ ${r.matched} emparejadas`];
      if (r.library?.resolved) bits.push(`${r.library.resolved} películas de Plex ganaron ficha TMDB`);
      if (r.unmatched?.sinTmdb) bits.push(`${r.unmatched.sinTmdb} sin ficha en TMDB`);
      if (r.unmatched?.noEnBiblioteca) bits.push(`${r.unmatched.noEnBiblioteca} vistas fuera de tu colección`);
      if (r.englishPending)
        bits.push(`completando ${r.englishPending.toLocaleString('es-ES')} títulos en inglés en segundo plano — reintenta en unos minutos`);
      setResolveMsg(bits.join(' · '));
    }
    load();
  };

  if (data?.error) return <ErrorBox error={data.error} />;
  if (!data) return <Spinner />;

  const s = data.summary;

  return (
    <div>
      <PageHeader eyebrow="Colección" title="Visionado" />

      {/* watched counter (#1) */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="card p-4">
            <div className="text-2xl font-bold text-gold-400">{s.total.toLocaleString('es-ES')}</div>
            <div className="text-sm text-zinc-400 mt-1">Marcadas como vistas</div>
            <div className="text-xs text-zinc-500 mt-1">{s.library ? `${Math.round((s.total / s.library) * 100)}% de tu biblioteca` : 'sin biblioteca sincronizada'}</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-zinc-200">{s.plex.toLocaleString('es-ES')}</div>
            <div className="text-sm text-zinc-400 mt-1">Vistas en Plex</div>
            <div className="text-xs text-zinc-500 mt-1">con reproducción registrada</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-orange-300">{s.lbInLibrary.toLocaleString('es-ES')}</div>
            <div className="text-sm text-zinc-400 mt-1">Solo por Letterboxd</div>
            <div className="text-xs text-zinc-500 mt-1">en tu biblioteca, sin verlas en Plex</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-zinc-200">{s.lbTotal.toLocaleString('es-ES')}</div>
            <div className="text-sm text-zinc-400 mt-1">Total en Letterboxd</div>
            <div className="text-xs text-zinc-500 mt-1">
              {s.lbUnmatched > 0
                ? `${s.lbUnmatched.toLocaleString('es-ES')} sin emparejar con tu Plex`
                : 'todas emparejadas'}
            </div>
          </div>
        </div>
      )}

      {s && s.lbUnmatched > 0 && (
        <div className="card p-3 mb-8 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-zinc-400">
            Tienes <b className="text-orange-300">{s.lbUnmatched.toLocaleString('es-ES')}</b> películas vistas en Letterboxd que
            no cuadran con tu biblioteca (a menudo por el idioma del título). Búscalas en TMDB para emparejarlas:
          </span>
          <button className="btn-gold !py-1 shrink-0" onClick={resolveUnmatched} disabled={resolving}>
            {resolving ? 'Emparejando…' : '↻ Reintentar emparejado por TMDB'}
          </button>
          {resolveMsg && <span className="text-xs text-zinc-400">{resolveMsg}</span>}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Section title="Visto vs. pendiente por década" className="min-w-0">
          <div className="card p-4 h-72 min-w-0">
            <ResponsiveContainer>
              <BarChart data={data.watchedByDecade} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <XAxis dataKey="decade" stroke={ch.axis} fontSize={12} tickMargin={6} />
                <YAxis stroke={ch.axis} fontSize={12} width={38} />
                <Tooltip contentStyle={ch.tooltip} labelStyle={ch.tooltipLabel} itemStyle={ch.tooltipItem} cursor={{ fill: ch.cursor }} />
                {/* el formatter es necesario: recharts pinta cada rótulo del color de su
                    serie, y el gris claro de «Total» era ilegible sobre el papel */}
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => <span style={{ color: ch.axis }}>{v}</span>}
                />
                <Bar dataKey="watched" name="Vistas" stackId="a" fill={ch.positive} />
                <Bar dataKey="total" name="Total" fill={ch.muted} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Visto vs. total por género" className="min-w-0">
          <div className="card p-4 h-72 min-w-0">
            <ResponsiveContainer>
              <BarChart data={data.watchedByGenre} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis type="number" stroke={ch.axis} fontSize={12} />
                <YAxis type="category" dataKey="name" width={104} stroke={ch.axis} fontSize={11} interval={0} tickMargin={4} />
                <Tooltip contentStyle={ch.tooltip} labelStyle={ch.tooltipLabel} itemStyle={ch.tooltipItem} cursor={{ fill: ch.cursor }} />
                {/* el formatter es necesario: recharts pinta cada rótulo del color de su
                    serie, y el gris claro de «Total» era ilegible sobre el papel */}
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => <span style={{ color: ch.axis }}>{v}</span>}
                />
                <Bar dataKey="watched" name="Vistas" fill={ch.positive} />
                <Bar dataKey="total" name="Total" fill={ch.muted} />
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
                <div className="text-sm font-medium text-zinc-200">{d.name}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {d.watched} vistas de {d.total} · <span className="text-gold-400">{d.total - d.watched} pendientes</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Directores/as que más has visto">
        {!data.directorsMostWatched?.length ? (
          <Empty>Aún no hay visionados registrados.</Empty>
        ) : (
          <>
            <p className="text-xs text-zinc-500 -mt-2 mb-3 max-w-3xl">
              Por número de películas suyas que has visto, contando lo reproducido en Plex y lo que
              tienes marcado en Letterboxd. Solo entran las que están emparejadas con tu biblioteca:
              de una entrada de Letterboxd suelta no se sabe quién la dirigió.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {data.directorsMostWatched.map((d, i) => (
                <Link
                  key={d.id}
                  to={`/biblioteca?personId=${d.id}&personRole=director&watched=yes`}
                  className="card p-3 flex items-baseline gap-2 hover:border-gold-400 transition-colors"
                >
                  <span className="text-[11px] text-zinc-600 tabular w-5 shrink-0">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-zinc-200 block truncate">{d.name}</span>
                    <span className="text-xs text-zinc-500">
                      <b className="text-gold-400 tabular">{d.watched}</b> vistas de {d.total} suyas que tienes
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* «Consenso crítico sin ver» y «Mejor valoradas que aún no has visto»
          eran la MISMA consulta (sin ver + nota combinada, ordenadas por nota):
          una sola sección, con la de MDBList cuando hay notas y la de la
          biblioteca como respaldo. */}
      <InsightGrid
        title="🏛️ Lo mejor valorado que tienes sin ver"
        hint="Películas de tu Plex que ni has reproducido ni tienes marcadas en Letterboxd, ordenadas por la nota combinada de MDBList."
        items={ins?.consensusUnwatched?.length ? ins.consensusUnwatched : data.unwatchedTopRated}
        caption={(m) => {
          const score = m.score ?? m.mdb_score;
          return [score != null ? `Σ ${score}` : null, m.rt_critic != null ? `🍅 ${m.rt_critic}%` : null]
            .filter(Boolean)
            .join(' · ');
        }}
        onSelect={setSelected}
      />

      {ins && (
        <>
          <InsightGrid
            title="🏅 «Must-see» de Metacritic que tienes sin ver (metascore ≥ 81)"
            hint="El listón de consenso crítico más exigente, avalado por volumen de votos en IMDb. Todo sale de las notas de MDBList ya descargadas."
            items={ins.mustSee}
            caption={(m) => `MC ${m.metacritic}${m.imdb != null ? ` · IMDb ${Number(m.imdb).toFixed(1)}` : ''}`}
            onSelect={setSelected}
          />
          <InsightGrid
            title="💎 Joyas tuyas que la crítica no entendió (tu nota LB ≥ 8, RT ≤ 55%)"
            items={ins.hiddenGems}
            caption={(m) => `Tú: ${Number(m.my_rating).toFixed(1)} · 🍅 ${m.rt_critic}%`}
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
            caption={(m) => `Tú: ${Number(m.my_rating).toFixed(1)}/10 · comunidad ${Number(m.letterboxd).toFixed(1)}/10`}
            onSelect={setSelected}
          />
        </>
      )}

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
