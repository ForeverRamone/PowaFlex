import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, tmdbImg, fmtDate } from '../api.js';
import { Spinner, ErrorBox, RadarrButton, Empty } from '../components.jsx';

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const names = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${names[Number(m) - 1]} ${y}`;
}

function EventCard({ ev, radarrIds }) {
  const img = tmdbImg(ev.poster_path, 'w185');
  return (
    <div className="card p-3 flex gap-3">
      <div className="w-20 shrink-0 aspect-[2/3] rounded overflow-hidden bg-ink-800">
        {img ? <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-100 text-sm">{ev.title}</div>
        {ev.original_title !== ev.title && (
          <div className="text-xs text-slate-500 italic">{ev.original_title}</div>
        )}
        <div className="text-xs text-gold-400 mt-1">{ev.date ? fmtDate(ev.date) : 'Fecha por anunciar'}</div>
        <div className="text-xs text-slate-400 mt-1">
          {ev.people.map((p, i) => (
            <span key={`${p.id}-${p.credit}`}>
              {i > 0 && ' · '}
              {p.credit}{' '}
              <Link to={`/personas/${p.id}?role=${p.credit === 'Dirige' ? 'director' : 'actor'}`} className="text-slate-200 hover:text-gold-400">
                {p.name}
              </Link>
            </span>
          ))}
        </div>
        {ev.overview && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{ev.overview}</p>}
        <div className="mt-2">
          {ev.inLibrary ? (
            <span className="text-emerald-400 text-xs">✓ Ya en tu biblioteca</span>
          ) : (
            <RadarrButton tmdbId={ev.tmdb_id} small alreadyInRadarr={radarrIds.has(ev.tmdb_id)} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function Calendar() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [radarrIds, setRadarrIds] = useState(new Set());

  const load = (refresh = false) => {
    setError(null);
    if (refresh) setRefreshing(true);
    else setData(null);
    api(`/calendar${refresh ? '?refresh=1' : ''}`).then((d) => {
      setRefreshing(false);
      if (d.error) setError(d.error);
      else setData(d);
    });
  };

  useEffect(() => {
    load();
    api('/radarr/context').then((c) => {
      if (c.tmdbIds) setRadarrIds(new Set(c.tmdbIds));
    });
  }, []);

  if (error)
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-100 mb-4">Cine venidero</h1>
        <ErrorBox error={`${error} — comprueba la API key de TMDB en Ajustes.`} />
      </div>
    );
  if (!data) return <Spinner label="Construyendo calendario desde TMDB (la primera vez tarda un poco)…" />;

  const today = data.today;
  const upcoming = data.events.filter((e) => e.date && e.date >= today);
  const recent = data.events.filter((e) => e.date && e.date < today);
  const undated = data.events.filter((e) => !e.date);

  const byMonth = new Map();
  for (const ev of upcoming) {
    const ym = ev.date.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(ev);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-100">Cine venidero</h1>
        <button className="btn-ghost" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : '↻ Actualizar desde TMDB'}
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Estrenos próximos y proyectos anunciados de los {data.peopleCount} directores/actores vigilados: el top
        automático de tu biblioteca más tus <Link to="/favoritos" className="text-gold-400 hover:underline">favoritos</Link>.
        Generado {new Date(data.generatedAt).toLocaleString('es-ES')}.
      </p>

      {data.errors?.length > 0 && data.events.length === 0 && (
        <ErrorBox error={`No se pudo consultar TMDB: ${data.errors[0].split(': ').slice(1).join(': ')} — revisa Ajustes y pulsa «Actualizar desde TMDB».`} />
      )}
      {upcoming.length === 0 && undated.length === 0 && data.events.length === 0 && data.errors?.length === 0 && (
        <Empty>No hay estrenos próximos registrados en TMDB.</Empty>
      )}

      {[...byMonth.entries()].map(([ym, evs]) => (
        <section key={ym} className="mb-8">
          <h2 className="text-lg font-semibold text-gold-400 mb-3 capitalize">{monthLabel(ym)}</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {evs.map((ev) => <EventCard key={ev.tmdb_id} ev={ev} radarrIds={radarrIds} />)}
          </div>
        </section>
      ))}

      {undated.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-sky-300 mb-3">Anunciadas, sin fecha</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {undated.map((ev) => <EventCard key={ev.tmdb_id} ev={ev} radarrIds={radarrIds} />)}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-400 mb-3">Estrenadas recientemente (últimos 60 días)</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {recent.reverse().map((ev) => <EventCard key={ev.tmdb_id} ev={ev} radarrIds={radarrIds} />)}
          </div>
        </section>
      )}
    </div>
  );
}
