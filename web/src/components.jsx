import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDuration, tmdbImg } from './api.js';

export function Spinner({ label = 'Cargando…' }) {
  return (
    <div className="flex items-center gap-3 text-slate-400 py-10 justify-center">
      <div className="w-5 h-5 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBox({ error }) {
  return (
    <div className="card p-4 border-red-800 bg-red-950/40 text-red-300 text-sm my-4">
      ⚠️ {error}
    </div>
  );
}

export function StatCard({ label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-bold text-gold-400">{value}</div>
      <div className="text-sm text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export function Section({ title, action, children }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MovieCard({ movie, onClick }) {
  const [imgError, setImgError] = useState(false);
  return (
    <button
      onClick={onClick}
      className="group text-left cursor-pointer w-full"
      title={`${movie.title} (${movie.year ?? '¿?'})`}
    >
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border border-ink-700 group-hover:border-gold-400 transition-colors relative">
        {!imgError ? (
          <img
            src={`/img/${movie.rating_key}/poster`}
            alt={movie.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-center p-2 text-xs text-slate-400">
            {movie.title}
          </div>
        )}
        {movie.view_count > 0 && (
          <span className="absolute top-1.5 right-1.5 bg-emerald-600/90 text-white text-[10px] px-1.5 py-0.5 rounded">
            ✓
          </span>
        )}
        {movie.resolution === '4k' && (
          <span className="absolute bottom-1.5 left-1.5 bg-black/70 text-gold-400 text-[10px] px-1.5 py-0.5 rounded font-semibold">
            4K
          </span>
        )}
        {movie.hdr && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-sky-300 text-[10px] px-1.5 py-0.5 rounded">
            {movie.hdr === 'Dolby Vision' ? 'DV' : 'HDR'}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-xs text-slate-300 truncate">{movie.title}</div>
      <div className="text-[11px] text-slate-500 flex gap-2">
        <span>{movie.year ?? '—'}</span>
        {movie.audience_rating != null && <span>★ {Number(movie.audience_rating).toFixed(1)}</span>}
        {movie.user_rating != null && <span className="text-gold-400">Tú: {Number(movie.user_rating).toFixed(1)}</span>}
      </div>
    </button>
  );
}

export function TmdbCard({ item, badge, children }) {
  const img = tmdbImg(item.poster_path);
  return (
    <div className="text-left">
      <div
        className={`aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border relative ${
          item.owned ? 'border-emerald-600' : 'border-ink-700'
        }`}
      >
        {img ? (
          <img src={img} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-center p-2 text-xs text-slate-400">
            {item.title}
          </div>
        )}
        {badge}
      </div>
      <div className="mt-1.5 text-xs text-slate-300 truncate" title={item.title}>
        {item.title}
      </div>
      <div className="text-[11px] text-slate-500">{item.date ? item.date.slice(0, 4) : 'Sin fecha'}</div>
      {children}
    </div>
  );
}

export function RadarrButton({ tmdbId, small = false, alreadyInRadarr = false, onAdded }) {
  const [state, setState] = useState(alreadyInRadarr ? 'done' : 'idle');
  const [err, setErr] = useState('');
  // reflect a late-arriving radarr snapshot (ids often load after first paint)
  useEffect(() => {
    if (alreadyInRadarr) setState((s) => (s === 'idle' ? 'done' : s));
  }, [alreadyInRadarr]);
  const add = async () => {
    setState('busy');
    const res = await api('/radarr/add', { method: 'POST', body: { tmdbId } });
    // an "already added" isn't a failure — the film is in Radarr, show it green
    if (res.ok || /already/i.test(res.error || '')) {
      setState('done');
      onAdded?.(tmdbId);
    } else {
      setState('error');
      setErr(res.error || 'Error');
    }
  };
  if (state === 'done')
    return <span className={`text-emerald-400 ${small ? 'text-[11px]' : 'text-sm'}`}>✓ En Radarr</span>;
  return (
    <div>
      <button
        onClick={add}
        disabled={state === 'busy'}
        className={`btn-gold ${small ? 'text-[11px] px-2 py-1 mt-1' : ''}`}
      >
        {state === 'busy' ? 'Añadiendo…' : '+ Radarr'}
      </button>
      {state === 'error' && <div className="text-[11px] text-red-400 mt-1 max-w-40">{err}</div>}
    </div>
  );
}

export function PersonCard({ person, role }) {
  const [imgError, setImgError] = useState(false);
  return (
    <Link
      to={`/personas/${person.id}?role=${role}`}
      className="card p-3 flex items-center gap-3 hover:border-gold-400 transition-colors"
    >
      <div className="w-12 h-12 rounded-full overflow-hidden bg-ink-700 shrink-0 flex items-center justify-center">
        {!imgError ? (
          <img
            src={`/img/person/${person.id}`}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-lg">🎭</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-200 truncate">{person.name}</div>
        <div className="text-xs text-slate-500">
          {person.n} películas
          {person.watched != null && <span> · {person.watched} vistas</span>}
        </div>
      </div>
    </Link>
  );
}

export function ProgressBar({ pct }) {
  return (
    <div className="h-2 bg-ink-700 rounded-full overflow-hidden">
      <div
        className="h-full bg-gold-400 transition-all"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export function Empty({ children }) {
  return <div className="text-slate-500 text-sm py-8 text-center">{children}</div>;
}

// Radarr snapshot ids from the local cache (no network round-trip per page).
// Returns [set, addOne] so buttons can optimistically mark films as queued.
export function useRadarrIds() {
  const [ids, setIds] = useState(new Set());
  useEffect(() => {
    api('/radarr/ids').then((r) => r.tmdbIds && setIds(new Set(r.tmdbIds)));
  }, []);
  const add = (tmdbId) => setIds((prev) => new Set(prev).add(tmdbId));
  return [ids, add];
}

// Shorts / documentaries / TV-movie visibility toggles, persisted. Defaults to
// hidden (the completist wants features first). `key` scopes the storage.
const TYPE_DEFAULTS = { shorts: false, docs: false, tv: false };

export function useTypeFilters(key = 'type_filters') {
  const [show, setShow] = useState(() => {
    try {
      return { ...TYPE_DEFAULTS, ...JSON.parse(localStorage.getItem(key) || '{}') };
    } catch {
      return { ...TYPE_DEFAULTS };
    }
  });
  const toggle = (k) => {
    const next = { ...show, [k]: !show[k] };
    setShow(next);
    localStorage.setItem(key, JSON.stringify(next));
  };
  return [show, toggle];
}

export const matchesTypeFilters = (item, show) =>
  (show.shorts || !item.isShort) && (show.docs || !item.isDocumentary) && (show.tv || !item.isTvMovie);

export function TypeFilterBar({ show, toggle, counts }) {
  return (
    <div className="card p-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-500 text-xs mr-1">Mostrar:</span>
      {[
        ['shorts', 'Cortos', counts?.shorts],
        ['docs', 'Documentales', counts?.docs],
        ['tv', 'Películas de TV', counts?.tv],
      ].map(([k, label, n]) => (
        <button
          key={k}
          onClick={() => toggle(k)}
          title={show[k] ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          className={`btn-ghost !py-1 ${show[k] ? '!border-gold-400 text-gold-400' : 'line-through opacity-60'}`}
        >
          {show[k] ? '👁 ' : '🚫 '}{label}{n != null ? ` (${n})` : ''}
        </button>
      ))}
    </div>
  );
}

export function DeathBadge({ deathday, className = '' }) {
  if (!deathday) return null;
  const year = String(deathday).slice(0, 4);
  return (
    <span
      title={`Fallecido${year ? ` en ${year}` : ''}`}
      className={`text-[10px] px-1.5 py-0.5 rounded bg-ink-700 text-slate-400 ${className}`}
    >
      ✝ {year}
    </span>
  );
}

export function MovieModal({ id, onClose }) {
  const [movie, setMovie] = useState(null);
  useEffect(() => {
    api(`/movies/${id}`).then(setMovie);
  }, [id]);
  if (!movie) return null;
  const directors = (movie.people || []).filter((p) => p.role === 'director');
  const actors = (movie.people || []).filter((p) => p.role === 'actor').slice(0, 12);
  const genres = (movie.tags || []).filter((t) => t.type === 'genre').map((t) => t.name);
  const countries = (movie.tags || []).filter((t) => t.type === 'country').map((t) => t.name);
  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 flex gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={`/img/${movie.rating_key}/poster`}
          alt=""
          className="w-44 h-66 object-cover rounded-lg shrink-0 hidden sm:block"
        />
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-100">
            {movie.title} <span className="text-slate-500 font-normal">({movie.year})</span>
          </h2>
          {movie.tagline && <div className="text-gold-400 text-sm italic mt-1">{movie.tagline}</div>}
          <div className="text-xs text-slate-400 mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <span>{fmtDuration(movie.duration_ms)}</span>
            {movie.resolution && <span>{movie.resolution.toUpperCase?.() || movie.resolution}</span>}
            {movie.hdr && <span className="text-sky-300">{movie.hdr}</span>}
            {movie.video_codec && <span>{movie.video_codec}</span>}
            {movie.audience_rating != null && <span>★ {movie.audience_rating}</span>}
            {movie.user_rating != null && <span className="text-gold-400">Tu nota: {movie.user_rating}</span>}
            {movie.view_count > 0 && <span className="text-emerald-400">Vista {movie.view_count}×</span>}
          </div>
          {movie.ratings && (
            <div className="flex flex-wrap gap-1.5 mt-2 text-[11px]">
              {movie.ratings.imdb != null && (
                <span className="bg-yellow-900/50 text-yellow-300 px-1.5 py-0.5 rounded">IMDb {Number(movie.ratings.imdb).toFixed(1)}</span>
              )}
              {movie.ratings.rt_critic != null && (
                <span className="bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded">🍅 {movie.ratings.rt_critic}%</span>
              )}
              {movie.ratings.rt_audience != null && (
                <span className="bg-red-900/40 text-orange-300 px-1.5 py-0.5 rounded">🍿 {movie.ratings.rt_audience}%</span>
              )}
              {movie.ratings.metacritic != null && (
                <span className="bg-emerald-900/50 text-emerald-300 px-1.5 py-0.5 rounded">MC {movie.ratings.metacritic}</span>
              )}
              {movie.ratings.letterboxd != null && (
                <span className="bg-orange-900/50 text-orange-300 px-1.5 py-0.5 rounded">LB {Number(movie.ratings.letterboxd).toFixed(1)}</span>
              )}
              {movie.ratings.score != null && (
                <span className="bg-ink-700 text-gold-400 px-1.5 py-0.5 rounded font-semibold">Σ {movie.ratings.score}</span>
              )}
            </div>
          )}
          <p className="text-sm text-slate-300 mt-3 leading-relaxed">{movie.summary}</p>
          <div className="mt-3 text-sm">
            {directors.length > 0 && (
              <div>
                <span className="text-slate-500">Dirección: </span>
                {directors.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && ', '}
                    <Link className="text-gold-400 hover:underline" to={`/personas/${d.id}?role=director`} onClick={onClose}>
                      {d.name}
                    </Link>
                  </span>
                ))}
              </div>
            )}
            {actors.length > 0 && (
              <div className="mt-1">
                <span className="text-slate-500">Reparto: </span>
                <span className="text-slate-300">{actors.map((a) => a.name).join(', ')}</span>
              </div>
            )}
            {genres.length > 0 && (
              <div className="mt-1 text-slate-400 text-xs">{genres.join(' · ')} {countries.length > 0 && `· ${countries.join(', ')}`}</div>
            )}
            {movie.file_path && (
              <div className="mt-2 text-[11px] text-slate-600 break-all">{movie.file_path}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
