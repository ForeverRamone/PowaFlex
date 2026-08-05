import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { api, fmtBytes, fmtDate, tmdbImg } from '../api.js';
import { Spinner, StatCard, Section, PersonCard, Empty, MovieModal, LetterboxdLogo, PageHeader, ErrorBox} from '../components.jsx';
import { useChartTheme } from '../charts.js';

// small poster tile used across the "recent" strips
function PosterTile({ item, onClick, badge, sub }) {
  const [err, setErr] = useState(false);
  // Plex poster if in library; otherwise the TMDB poster so LB-only watches
  // still show artwork (#9)
  const src = item.rating_key && item.thumb !== false
    ? `/img/${item.rating_key}/poster`
    : item.poster_path
      ? tmdbImg(item.poster_path)
      : null;
  return (
    <button onClick={onClick} disabled={!item.rating_key} className="w-full text-left group disabled:cursor-default">
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border border-ink-700 group-enabled:group-hover:border-gold-400 transition-colors relative flex items-center justify-center">
        {src && !err ? (
          <img src={src} alt="" loading="lazy" onError={() => setErr(true)} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[11px] text-zinc-400 text-center p-2">{item.title}</span>
        )}
        {badge}
      </div>
      <div className="mt-1 text-[11px] text-zinc-300 truncate">{item.title}</div>
      <div className="text-[11px] text-zinc-500">{sub}</div>
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
              <span className="absolute top-1 right-1 bg-black/70 px-1 py-1 rounded" title="Vista en Letterboxd"><LetterboxdLogo size={9} /></span>
            ) : kind === 'watched' && m.source === 'plex' ? (
              <span className="absolute top-1 right-1 bg-emerald-600/90 text-white text-[11px] px-1 py-0.5 rounded">Plex</span>
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
  const ch = useChartTheme();
  const [ov, setOv] = useState(null);
  const [charts, setCharts] = useState(null);
  const [recent, setRecent] = useState(null);
  const [captures, setCaptures] = useState(null);
  const [events, setEvents] = useState(null);
  const [directors, setDirectors] = useState([]);
  const [actors, setActors] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api('/stats/overview').then(setOv);
    api('/stats/charts').then(setCharts);
    api('/stats/recent').then(setRecent);
    api('/radarr/captures?days=7').then((r) => Array.isArray(r) && setCaptures(r));
    api('/events?days=14').then((r) => Array.isArray(r) && setEvents(r));
    api('/people?role=director&limit=10').then((r) => Array.isArray(r) && setDirectors(r));
    api('/people?role=actor&limit=10').then((r) => Array.isArray(r) && setActors(r));
  }, []);

  // un error del servidor NO es «no hay nada»: antes el Dashboard decía «aún no
  // hay películas sincronizadas» a alguien con 12.400
  if (ov?.error || charts?.error) return <ErrorBox error={ov?.error || charts?.error} />;
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
      <PageHeader eyebrow="Colección" title="Tu cinemateca" />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
        <StatCard label="Películas" value={ov.movies.toLocaleString('es-ES')} />
        <StatCard label="Horas de cine" value={ov.hours.toLocaleString('es-ES')} sub={`≈ ${Math.round(ov.hours / 24)} días`} />
        <StatCard label="En disco" value={fmtBytes(ov.sizeBytes)} />
        <StatCard label="Vistas" value={ov.watched.toLocaleString('es-ES')} sub={`${Math.round((ov.watched / ov.movies) * 100)}% de la biblioteca`} />
        <StatCard label="Directores/as" value={ov.directors.toLocaleString('es-ES')} />
        <StatCard label="En 4K" value={ov.fourK.toLocaleString('es-ES')} />
      </div>

      {/* lo que el pase nocturno ha detectado desde tu última visita */}
      {events?.length > 0 && (
        <Section title={`🔔 Novedades (${events.length} en 14 días)`}>
          <div className="card divide-y divide-ink-800 max-h-72 overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="px-3 py-2 text-sm">
                <div className="flex items-baseline gap-2">
                  {e.url ? (
                    <Link to={e.url} className="text-zinc-200 hover:text-gold-400 font-medium truncate">{e.title}</Link>
                  ) : (
                    <span className="text-zinc-200 font-medium truncate">{e.title}</span>
                  )}
                  <span className="text-[11px] text-zinc-500 shrink-0 ml-auto tabular">{fmtDate(e.created_at)}</span>
                </div>
                {e.body && <div className="text-[12px] text-zinc-500 mt-0.5">{e.body}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* pedidas que POR FIN han llegado: el cierre del ciclo de captura */}
      {captures?.length > 0 && (
        <Section
          title={`🎬 Capturadas esta semana (${captures.length})`}
          action={<Link to="/taller?tab=calidad" className="text-xs text-gold-400 hover:underline">Pendientes →</Link>}
        >
          <div className="card divide-y divide-ink-800 max-h-72 overflow-y-auto">
            {captures.map((c) => (
              <div key={c.id ?? `${c.tmdb_id}-${c.captured_at}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="text-emerald-400">✓</span>
                <span className="text-zinc-200 truncate flex-1">
                  {c.title} <span className="text-zinc-500">({c.year ?? '¿?'})</span>
                </span>
                {c.quality && <span className="badge-quiet shrink-0">{c.quality}</span>}
                <span
                  className={`text-[11px] shrink-0 ${c.rating_key ? 'text-emerald-400' : 'text-zinc-500'}`}
                  title={c.rating_key ? 'Ya sincronizada en tu Plex' : 'Descargada; entrará en Plex en la próxima sincronización'}
                >
                  {c.rating_key ? 'en Plex' : 'aún sin sincronizar'}
                </span>
                <span className="text-[11px] text-zinc-500 shrink-0 tabular">{fmtDate(c.captured_at)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

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
                    <span className={m.has_file ? 'text-emerald-400' : 'text-zinc-500'}>{m.has_file ? '✓' : '⏳'}</span>
                    <span className="text-zinc-200 truncate flex-1">{m.title} <span className="text-zinc-500">({m.year ?? '¿?'})</span></span>
                    <span className="text-[11px] text-zinc-500 shrink-0">{fmtDate(m.added)}</span>
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
        <Section title="Películas por década" className="min-w-0">
          <div className="card p-4 h-72 min-w-0">
            <ResponsiveContainer>
              <BarChart data={charts.byDecade} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <XAxis dataKey="decade" stroke={ch.axis} fontSize={12} tickMargin={6} />
                <YAxis stroke={ch.axis} fontSize={12} width={38} />
                <Tooltip contentStyle={ch.tooltip} labelStyle={ch.tooltipLabel} itemStyle={ch.tooltipItem} cursor={{ fill: ch.cursor }} />
                <Bar dataKey="n" name="Películas" fill={ch.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Géneros principales" className="min-w-0">
          <div className="card p-4 h-72 min-w-0">
            <ResponsiveContainer>
              <BarChart data={charts.byGenre.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis type="number" stroke={ch.axis} fontSize={12} />
                <YAxis type="category" dataKey="name" width={110} stroke={ch.axis} fontSize={11} interval={0} tickMargin={4} />
                <Tooltip contentStyle={ch.tooltip} labelStyle={ch.tooltipLabel} itemStyle={ch.tooltipItem} cursor={{ fill: ch.cursor }} />
                <Bar dataKey="n" name="Películas" fill={ch.ramp[1] || ch.accent} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Crecimiento de la biblioteca (añadidas por mes)" className="min-w-0">
          <div className="card p-4 h-72 min-w-0">
            <ResponsiveContainer>
              <LineChart data={charts.addedByMonth} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <XAxis dataKey="month" stroke={ch.axis} fontSize={10} tickMargin={6} minTickGap={24} />
                <YAxis stroke={ch.axis} fontSize={12} width={38} />
                <Tooltip contentStyle={ch.tooltip} labelStyle={ch.tooltipLabel} itemStyle={ch.tooltipItem} cursor={{ stroke: ch.axis }} />
                <Line type="monotone" dataKey="n" name="Añadidas" stroke={ch.accent} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section
          title="Directores/as con más películas"
          action={<Link to="/personas" className="text-xs text-gold-400 hover:underline">Ver todos →</Link>}
        >
          <div className="grid sm:grid-cols-2 gap-2">
            {directors.map((p) => <PersonCard key={p.id} person={p} role="director" />)}
          </div>
        </Section>
        <Section
          title="Actores/actrices con más películas"
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
