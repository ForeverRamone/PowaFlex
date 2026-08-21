import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtBytes, fmtDate, tmdbImg } from '../api.js';
import { t, locale } from '../i18n.js';
import { Progreso, useCargaProgresiva, StatCard, Section, PersonCard, Empty, MovieModal, LetterboxdLogo, PageHeader, ErrorBox} from '../components.jsx';
import { useChartTheme } from '../charts.js';

// recharts son 400 KB y esta es la pantalla de entrada: en diferido, los
// contadores y las novedades se pintan sin esperar a la librería de gráficas
const DashboardCharts = lazy(() => import('./charts/DashboardCharts.jsx'));

// Las altas automáticas se leen por PERSONA, no por fecha: la pregunta es «¿qué
// me ha bajado el robot de quién?». Las filas viejas del log no llevan nombre
// (la columna es nueva) y se agrupan aparte en vez de inventarse uno.
const SIN_PERSONA = '\u0000';
function porPersona(filas) {
  const mapa = new Map();
  for (const f of filas) {
    const k = f.person || SIN_PERSONA;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(f);
  }
  // quien más ha traído, primero; el bloque sin nombre siempre al final
  return [...mapa.entries()].sort((a, b) =>
    a[0] === SIN_PERSONA ? 1 : b[0] === SIN_PERSONA ? -1 : b[1].length - a[1].length
  );
}

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
  if (!items?.length) return <Empty>{t('Nada todavía.')}</Empty>;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {items.map((m, i) => (
        <PosterTile
          key={`${m.rating_key || m.title}-${i}`}
          item={m}
          onClick={() => m.rating_key && onSelect(m.rating_key)}
          badge={
            kind === 'watched' && m.source === 'letterboxd' ? (
              <span className="absolute top-1 right-1 bg-black/70 px-1 py-1 rounded" title={t('Vista en Letterboxd')}><LetterboxdLogo size={9} /></span>
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
  const [selected, setSelected] = useState(null);

  // Siete peticiones agrupadas en cuatro pasos por lo que cuentan, no por
  // endpoint: quien espera entiende «lo último que ha entrado», no tres rutas.
  // Todas salen a la vez; los contadores y las gráficas pintan sin esperar al
  // resto, que es lo que aquí bloquea.
  const carga = useCargaProgresiva([
    { clave: 'resumen', etiqueta: t('Contando tu colección…'), carga: () => api('/stats/overview') },
    { clave: 'graficas', etiqueta: t('Dibujando las gráficas de tu biblioteca…'), carga: () => api('/stats/charts') },
    {
      clave: 'reciente',
      etiqueta: t('Repasando lo último que ha entrado…'),
      carga: () => Promise.all([
        api('/stats/recent'),
        api('/events?days=14'),
        api('/radarr/captures?days=7'),
        api('/radarr/rules/sent?days=30&limit=24'),
      ]).then(([recent, events, captures, autoEnviadas]) => ({
        recent,
        events: Array.isArray(events) ? events : null,
        captures: Array.isArray(captures) ? captures : null,
        autoEnviadas: Array.isArray(autoEnviadas) ? autoEnviadas : null,
      })),
    },
    {
      clave: 'personas',
      etiqueta: t('Ordenando quién manda en tu biblioteca…'),
      carga: () => Promise.all([
        api('/people?role=director&limit=10'),
        api('/people?role=actor&limit=10'),
      ]).then(([directors, actors]) => ({
        directors: Array.isArray(directors) ? directors : [],
        actors: Array.isArray(actors) ? actors : [],
      })),
    },
  ], []);
  const ov = carga.datos.resumen ?? null;
  const charts = carga.datos.graficas ?? null;
  const recent = carga.datos.reciente?.recent ?? null;
  const events = carga.datos.reciente?.events ?? null;
  const captures = carga.datos.reciente?.captures ?? null;
  const autoEnviadas = carga.datos.reciente?.autoEnviadas ?? null;
  const directors = carga.datos.personas?.directors ?? [];
  const actors = carga.datos.personas?.actors ?? [];

  // un error del servidor NO es «no hay nada»: antes el Dashboard decía «aún no
  // hay películas sincronizadas» a alguien con 12.400
  if (ov?.error || charts?.error) return <ErrorBox error={ov?.error || charts?.error} />;
  if (!ov || !charts) return <Progreso {...carga} />;
  if (!ov.movies)
    return (
      <Empty>
        {t('Aún no hay películas sincronizadas. Ve a')}{' '}
        <Link className="text-gold-400" to="/ajustes">{t('Ajustes')}</Link>{' '}
        {t('para conectar con Plex y lanzar la primera sincronización.')}
      </Empty>
    );

  return (
    <div>
      <PageHeader eyebrow={t('Colección')} title={t('Tu cinemateca')} />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
        <StatCard label={t('Películas')} value={ov.movies.toLocaleString(locale())} />
        <StatCard label={t('Horas de cine')} value={ov.hours.toLocaleString(locale())} sub={t('≈ {n} días', { n: Math.round(ov.hours / 24) })} />
        <StatCard label={t('En disco')} value={fmtBytes(ov.sizeBytes)} />
        <StatCard label={t('Vistas')} value={ov.watched.toLocaleString(locale())} sub={t('{pct}% de la biblioteca', { pct: Math.round((ov.watched / ov.movies) * 100) })} />
        <StatCard label={t('Directores/as')} value={ov.directors.toLocaleString(locale())} />
        <StatCard label={t('En 4K')} value={ov.fourK.toLocaleString(locale())} />
      </div>

      {/* lo que el pase nocturno ha detectado desde tu última visita */}
      {events?.length > 0 && (
        <Section title={t('🔔 Novedades ({n} en 14 días)', { n: events.length })}>
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
          title={t('🎬 Capturadas esta semana ({n})', { n: captures.length })}
          action={<Link to="/taller?tab=calidad" className="text-xs text-gold-400 hover:underline">{t('Pendientes →')}</Link>}
        >
          <div className="card divide-y divide-ink-800 max-h-72 overflow-y-auto">
            {captures.map((c) => (
              <div key={c.id ?? `${c.tmdb_id}-${c.captured_at}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="text-emerald-400">✓</span>
                <span className="text-zinc-200 truncate flex-1">
                  {c.title} <span className="text-zinc-500">({c.year ?? t('¿?')})</span>
                </span>
                {c.quality && <span className="badge-quiet shrink-0">{c.quality}</span>}
                <span
                  className={`text-[11px] shrink-0 ${c.rating_key ? 'text-emerald-400' : 'text-zinc-500'}`}
                  title={c.rating_key ? t('Ya sincronizada en tu Plex') : t('Descargada; entrará en Plex en la próxima sincronización')}
                >
                  {c.rating_key ? t('en Plex') : t('aún sin sincronizar')}
                </span>
                <span className="text-[11px] text-zinc-500 shrink-0 tabular">{fmtDate(c.captured_at)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Lo que el pase de favoritos ha bajado SOLO, agrupado por la persona a
          cuenta de la que entró: «Últimas peticiones a Radarr» (más abajo) es la
          lista de Radarr entera y ahí esto se pierde entre lo que mandas a mano. */}
      {autoEnviadas?.length > 0 && (
        <Section
          title={t('🤖 El automático las bajó por ti ({n} en 30 días)', { n: autoEnviadas.length })}
          action={<Link to="/ajustes?tab=automatismos" className="text-xs text-gold-400 hover:underline">{t('Automatismos →')}</Link>}
        >
          <div className="card divide-y divide-ink-800 max-h-72 overflow-y-auto">
            {porPersona(autoEnviadas).map(([quien, pelis]) => (
              <div key={quien} className="px-3 py-2 text-sm">
                <div className="text-[11px] uppercase tracking-wide text-gold-400 font-semibold">
                  {quien === SIN_PERSONA ? t('Sin persona apuntada') : quien}
                  <span className="text-zinc-600 font-normal normal-case tracking-normal"> · {pelis.length}</span>
                </div>
                {pelis.map((p) => (
                  <div key={`${p.tmdb_id}-${p.at}`} className="flex items-center gap-2 mt-0.5">
                    <span className={p.has_file ? 'text-emerald-400' : 'text-zinc-500'} title={p.has_file ? t('Ya descargada') : t('Pedida, aún sin archivo')}>
                      {p.has_file ? '✓' : '⏳'}
                    </span>
                    <span className="text-zinc-200 truncate flex-1">{p.title}</span>
                    {p.score != null && <span className="text-[11px] text-gold-400 shrink-0 tabular">Σ {p.score}</span>}
                    <span className="text-[11px] text-zinc-500 shrink-0 tabular">{fmtDate(p.at)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* recent activity (#8) */}
      {recent && (
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <Section title={t('Últimas añadidas a Plex')} action={<Link to="/biblioteca?sort=added" className="text-xs text-gold-400 hover:underline">{t('Ver más →')}</Link>}>
            <RecentStrip items={recent.recentlyAdded} onSelect={setSelected} kind="added" />
          </Section>
          <Section title={t('Últimas vistas')} action={<Link to="/visionado" className="text-xs text-gold-400 hover:underline">{t('Ver más →')}</Link>}>
            {recent.recentlyWatched?.length ? (
              <RecentStrip items={recent.recentlyWatched} onSelect={setSelected} kind="watched" />
            ) : (
              <Empty>{t('Sin visionados de Plex ni de Letterboxd todavía. Configura tu RSS en «Letterboxd».')}</Empty>
            )}
          </Section>
          <Section title={t('Últimas peticiones a Radarr')} action={<Link to="/ajustes?tab=automatismos" className="text-xs text-gold-400 hover:underline">{t('Ajustes →')}</Link>}>
            {recent.radarrRecent?.length ? (
              <div className="card divide-y divide-ink-800 max-h-[420px] overflow-y-auto">
                {recent.radarrRecent.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={m.has_file ? 'text-emerald-400' : 'text-zinc-500'}>{m.has_file ? '✓' : '⏳'}</span>
                    <span className="text-zinc-200 truncate flex-1">{m.title} <span className="text-zinc-500">({m.year ?? t('¿?')})</span></span>
                    <span className="text-[11px] text-zinc-500 shrink-0">{fmtDate(m.added)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>{t('Sincroniza Radarr en Ajustes para ver aquí las últimas peticiones.')}</Empty>
            )}
          </Section>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* los huecos reservan el alto de las tres gráficas para que lo de
            debajo no dé un salto cuando entren */}
        <Suspense fallback={<><div className="card h-72" /><div className="card h-72" /><div className="card h-72" /></>}>
          <DashboardCharts ch={ch} byDecade={charts.byDecade} byGenre={charts.byGenre} addedByMonth={charts.addedByMonth} />
        </Suspense>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section
          title={t('Directores/as con más películas')}
          action={<Link to="/personas" className="text-xs text-gold-400 hover:underline">{t('Ver todos →')}</Link>}
        >
          <div className="grid sm:grid-cols-2 gap-2">
            {directors.map((p) => <PersonCard key={p.id} person={p} role="director" />)}
          </div>
        </Section>
        <Section
          title={t('Actores/actrices con más películas')}
          action={<Link to="/personas?role=actor" className="text-xs text-gold-400 hover:underline">{t('Ver todos →')}</Link>}
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
