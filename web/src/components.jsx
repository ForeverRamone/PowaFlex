import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDuration, tmdbImg, ratingLinks, primaryRating } from './api.js';
import { onToast, toast } from './toast.js';

// Letterboxd's three-dot mark (orange/green/blue), used wherever we'd otherwise
// write "LB" (#5).
export function LetterboxdLogo({ size = 12, className = '' }) {
  const r = size / 2;
  return (
    <svg width={size * 2.6} height={size} viewBox="0 0 130 50" className={className} aria-label="Letterboxd" role="img">
      <circle cx="25" cy="25" r="24" fill="#00e054" />
      <circle cx="65" cy="25" r="24" fill="#40bcf4" />
      <circle cx="105" cy="25" r="24" fill="#ff8000" />
      <circle cx="45" cy="25" r="24" fill="#40bcf4" opacity="0.85" />
      <circle cx="85" cy="25" r="24" fill="#40bcf4" opacity="0.85" />
    </svg>
  );
}

// Headline rating chip on small poster cards, honouring the user's choice (#5).
// Falls back to whatever rating exists so cards aren't blank.
function PrimaryRating({ movie }) {
  const pref = primaryRating();
  const order = pref === 'imdb'
    ? ['imdb', 'score', 'letterboxd']
    : pref === 'letterboxd'
      ? ['letterboxd', 'score', 'imdb']
      : ['score', 'imdb', 'letterboxd'];
  for (const src of order) {
    if (src === 'score' && movie.mdb_score != null)
      return <span className="text-gold-400 font-semibold">Σ {movie.mdb_score}</span>;
    if (src === 'imdb' && movie.imdb != null)
      return <span className="text-yellow-500">IMDb {Number(movie.imdb).toFixed(1)}</span>;
    if (src === 'letterboxd' && movie.letterboxd != null)
      return <span className="inline-flex items-center gap-1 text-slate-300"><LetterboxdLogo size={9} /> {Number(movie.letterboxd).toFixed(1)}</span>;
  }
  return null;
}

// Consistent status colours across the app (#3): 🟢 en Plex · 🟡 vista.
export function StatusLegend({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 ${className}`}>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border-2 border-emerald-500" /> En Plex</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border-2 border-ink-600" /> Te falta</span>
      <span className="flex items-center gap-1.5"><span className="text-gold-400">★</span> Vista</span>
      <span className="flex items-center gap-1.5"><span className="text-ink-500">★</span> Sin ver</span>
    </div>
  );
}

// Gold star = watched (Plex or Letterboxd); shown top-left on any poster.
function WatchedStar({ watched }) {
  if (!watched) return null;
  return (
    <span className="absolute top-1.5 left-1.5 bg-black/70 text-gold-400 text-[11px] leading-none px-1.5 py-1 rounded" title="Vista (Plex o Letterboxd)">
      ★
    </span>
  );
}

// Global command palette: search movies + people, jump anywhere (#8).
// Opens with Ctrl/Cmd+K or a window 'powaflex-search' event.
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') setOpen(false);
    };
    const onEvt = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('powaflex-search', onEvt);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('powaflex-search', onEvt); };
  }, []);
  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const t = setTimeout(() => api(`/search?q=${encodeURIComponent(q.trim())}`).then((r) => !r.error && setRes(r)), 200);
    return () => clearTimeout(t);
  }, [q]);
  if (!open) return null;
  const go = (path) => { setOpen(false); setQ(''); navigate(path); };
  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-start justify-center p-4 pt-24" onClick={() => setOpen(false)}>
      <div className="card w-full max-w-xl p-3" onClick={(e) => e.stopPropagation()}>
        <input autoFocus className="input" placeholder="Buscar película o persona…" value={q} onChange={(e) => setQ(e.target.value)} />
        {res && (
          <div className="mt-2 max-h-[60vh] overflow-y-auto">
            {res.people?.length > 0 && <div className="text-xs text-slate-500 px-1 mt-1 mb-0.5">Personas</div>}
            {res.people?.map((p) => (
              <button key={`p${p.id}`} className="w-full text-left px-2 py-1.5 rounded hover:bg-ink-800 text-sm text-slate-200" onClick={() => go(`/personas/${p.id}?role=${p.role}`)}>
                🎭 {p.name} <span className="text-slate-500 text-xs">· {p.total} títulos</span>
              </button>
            ))}
            {res.movies?.length > 0 && <div className="text-xs text-slate-500 px-1 mt-2 mb-0.5">Películas</div>}
            {res.movies?.map((m) => (
              <button key={`m${m.rating_key}`} className="w-full text-left px-2 py-1.5 rounded hover:bg-ink-800 text-sm text-slate-200" onClick={() => setSel(m.rating_key)}>
                🎬 {m.title} <span className="text-slate-500 text-xs">({m.year ?? '¿?'})</span>
              </button>
            ))}
            {!res.people?.length && !res.movies?.length && <div className="text-sm text-slate-500 px-2 py-3">Nada encontrado.</div>}
          </div>
        )}
        {!res && <div className="text-xs text-slate-500 px-2 py-3">Escribe para buscar en tu biblioteca. Atajo: Ctrl/⌘ + K.</div>}
      </div>
      {sel && <MovieModal id={sel} onClose={() => { setSel(null); setOpen(false); }} />}
    </div>
  );
}

// Unified toast notifications, mounted once in the shell.
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(
    () =>
      onToast((t) => {
        setItems((x) => [...x, t]);
        setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 3500);
      }),
    []
  );
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2 rounded-lg text-sm shadow-lg border ${
            t.type === 'error'
              ? 'bg-red-950 border-red-800 text-red-200'
              : t.type === 'success'
                ? 'bg-emerald-950 border-emerald-800 text-emerald-200'
                : 'bg-ink-800 border-ink-600 text-slate-200'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// Reusable drag-and-drop upload zone (#4). Auto-fires onFiles on drop/select.
export function Dropzone({ accept, multiple = true, onFiles, busy = false, label, hint }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);
  const [names, setNames] = useState([]);
  const pick = (files) => {
    if (files?.length) {
      setNames([...files].map((f) => f.name));
      onFiles(files);
    }
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        drag ? 'border-gold-400 bg-ink-800' : 'border-ink-600 hover:border-gold-400 bg-ink-900'
      }`}
    >
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => pick(e.target.files)} />
      <div className="text-3xl mb-2">{busy ? '⏳' : '📥'}</div>
      <div className="text-sm text-slate-200">{busy ? 'Importando…' : label || 'Arrastra aquí tus archivos o haz clic para elegir'}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
      {names.length > 0 && !busy && (
        <div className="text-xs text-gold-400 mt-2 truncate">{names.length} archivo(s): {names.join(', ')}</div>
      )}
    </div>
  );
}

// Linked rating chips (IMDb, RT, Metacritic, Letterboxd, mdblist Σ). Each opens
// the film on the corresponding site. `movie` supplies imdb_id/tmdb_id/title.
export function RatingsChips({ ratings, movie, className = '' }) {
  if (!ratings) return null;
  const links = ratingLinks(movie || {});
  const Chip = ({ href, cls, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer" className={`${cls} hover:brightness-125 transition`} title="Abrir en su web">
        {children}
      </a>
    ) : (
      <span className={cls}>{children}</span>
    );
  const chips = [];
  if (ratings.imdb != null)
    chips.push(<Chip key="imdb" href={links.imdb} cls="bg-yellow-900/50 text-yellow-300 px-1.5 py-0.5 rounded">IMDb {Number(ratings.imdb).toFixed(1)}</Chip>);
  if (ratings.rt_critic != null)
    chips.push(<Chip key="rt" href={links.rt} cls="bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded">🍅 {ratings.rt_critic}%</Chip>);
  if (ratings.rt_audience != null)
    chips.push(<Chip key="rta" href={links.rt} cls="bg-red-900/40 text-orange-300 px-1.5 py-0.5 rounded">🍿 {ratings.rt_audience}%</Chip>);
  if (ratings.metacritic != null)
    chips.push(<Chip key="mc" href={links.metacritic} cls="bg-emerald-900/50 text-emerald-300 px-1.5 py-0.5 rounded">MC {ratings.metacritic}</Chip>);
  if (ratings.letterboxd != null)
    chips.push(<Chip key="lb" href={links.letterboxd} cls="bg-orange-900/40 text-orange-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1"><LetterboxdLogo size={9} /> {Number(ratings.letterboxd).toFixed(1)}</Chip>);
  if (ratings.score != null)
    chips.push(<Chip key="mdb" href={links.tmdb} cls="bg-ink-700 text-gold-400 px-1.5 py-0.5 rounded font-semibold">Σ {ratings.score}</Chip>);
  if (!chips.length) return null;
  return <div className={`flex flex-wrap gap-1.5 text-[11px] ${className}`}>{chips}</div>;
}

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
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border border-emerald-600/70 group-hover:border-gold-400 transition-colors relative">
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
        <WatchedStar watched={movie.watched != null ? movie.watched : movie.view_count > 0} />
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
      <div className="text-[11px] text-slate-500 flex gap-2 items-center">
        <span>{movie.year ?? '—'}</span>
        <PrimaryRating movie={movie} />
      </div>
    </button>
  );
}

export function TmdbCard({ item, badge, children }) {
  const img = tmdbImg(item.poster_path);
  const [openFicha, setOpenFicha] = useState(false);
  return (
    <div className="text-left">
      <button
        type="button"
        onClick={() => item.tmdb_id && setOpenFicha(true)}
        className={`block w-full aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border relative cursor-pointer group ${
          item.owned ? 'border-emerald-600' : 'border-ink-700 hover:border-gold-400'
        }`}
        title={`${item.title} — ver ficha`}
      >
        {img ? (
          <img src={img} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-center p-2 text-xs text-slate-400">
            {item.title}
          </div>
        )}
        <WatchedStar watched={item.watched} />
        {badge}
      </button>
      <div className="mt-1.5 text-xs text-slate-300 truncate" title={item.title}>
        {item.title}
      </div>
      <div className="text-[11px] text-slate-500">{item.date ? item.date.slice(0, 4) : 'Sin fecha'}</div>
      {children}
      {openFicha && <MediaModal tmdbId={item.tmdb_id} onClose={() => setOpenFicha(false)} />}
    </div>
  );
}

// Unified "ficha" for any TMDB movie (owned or not), used from every card (#7).
// Both movie modals render through one component for a consistent ficha (#2).
export function MediaModal({ tmdbId, onClose }) {
  return <Ficha tmdbId={tmdbId} onClose={onClose} />;
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
    if (res.ok) {
      setState('done');
      onAdded?.(tmdbId);
      toast(`✓ ${res.title || 'Película'} añadida a Radarr`, 'success');
    } else if (/already/i.test(res.error || '')) {
      setState('done');
      onAdded?.(tmdbId);
      toast('Ya estaba en Radarr', 'info');
    } else {
      setState('error');
      setErr(res.error || 'Error');
      toast(`⚠️ Radarr: ${res.error || 'error'}`, 'error');
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

// Ask JustWatch whether a better-quality digital version exists on the market (#2).
export function JustWatchCheck({ tmdbId }) {
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    setR(await api(`/justwatch/${tmdbId}`));
    setBusy(false);
  };
  if (r) {
    if (r.error) return <span className="text-[10px] text-red-400">JustWatch no responde</span>;
    if (!r.maxQuality) return <span className="text-[10px] text-slate-500">Sin oferta digital encontrada</span>;
    return (
      <span
        className={`text-[10px] ${r.upgradeable ? 'text-emerald-400' : 'text-slate-500'}`}
        title={r.providers?.length ? `En ${r.providers.join(', ')}` : ''}
      >
        {r.upgradeable ? `↑ Hay ${r.maxQuality} en el mercado` : `Máx. ${r.maxQuality} disponible`}
      </span>
    );
  }
  return (
    <button onClick={check} disabled={busy} className="text-[10px] text-sky-400 hover:underline cursor-pointer">
      {busy ? 'Consultando…' : '¿existe mejor versión?'}
    </button>
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
        <div className="text-sm font-medium text-slate-200 truncate flex items-center gap-1.5">
          <span className="truncate">{person.name}</span>
          <DeathBadge deathday={person.deathday} />
        </div>
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

// Poster-grid skeleton for loading states.
export function SkeletonGrid({ n = 20 }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="aspect-[2/3] rounded-lg bg-ink-800 border border-ink-700 animate-pulse" />
      ))}
    </div>
  );
}

// Polls /build-progress so long TMDB-building pages show a real bar (#5).
export function BuildProgress({ label = 'Construyendo desde TMDB…' }) {
  const [p, setP] = useState(null);
  useEffect(() => {
    const t = setInterval(() => {
      api('/build-progress').then((r) => setP(r && r.active ? r : null)).catch(() => {});
    }, 900);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="py-12 max-w-md mx-auto text-center">
      <div className="flex items-center gap-3 justify-center text-slate-400 mb-4">
        <div className="w-5 h-5 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
        {label}
      </div>
      {p && p.total > 0 && (
        <>
          <ProgressBar pct={Math.round((p.done / p.total) * 100)} />
          <div className="text-xs text-slate-500 mt-2">{p.label} · {p.done} / {p.total}</div>
        </>
      )}
    </div>
  );
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
const TYPE_DEFAULTS = { shorts: false, docs: false, tv: false, coral: false };

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
  (show.shorts || !item.isShort) && (show.docs || !item.isDocumentary) &&
  (show.tv || !item.isTvMovie) && (show.coral || !item.isCoral);

export function TypeFilterBar({ show, toggle, counts }) {
  return (
    <div className="card p-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-500 text-xs mr-1">Mostrar:</span>
      {[
        ['shorts', 'Cortos', counts?.shorts],
        ['docs', 'Documentales', counts?.docs],
        ['tv', 'Películas de TV', counts?.tv],
        ['coral', 'Dirección coral', counts?.coral],
      ].filter(([, , n]) => n == null || n > 0).map(([k, label, n]) => (
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

// Close-on-Escape for modals.
function useEsc(onClose) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

export function MovieModal({ id, onClose }) {
  return <Ficha ratingKey={id} onClose={onClose} />;
}

const SUB_1080 = ['sd', '480', '576', '720'];

// Normalise a library (/movies/:id) or TMDB (/media/:id) payload into one shape.
function toViewModel({ ratingKey, movie, media }) {
  if (movie) {
    return {
      title: movie.title,
      originalTitle: movie.original_title,
      year: movie.year,
      tagline: movie.tagline,
      overview: movie.summary,
      posterUrl: `/img/${ratingKey}/poster`,
      runtimeMin: movie.duration_ms ? Math.round(movie.duration_ms / 60000) : null,
      genres: (movie.tags || []).filter((t) => t.type === 'genre').map((t) => t.name),
      countries: (movie.tags || []).filter((t) => t.type === 'country').map((t) => t.name),
      directors: (movie.people || []).filter((p) => p.role === 'director').map((p) => ({ id: p.id, name: p.name })),
      cast: (movie.people || []).filter((p) => p.role === 'actor').slice(0, 14).map((p) => ({ id: p.id, name: p.name })),
      ratings: movie.ratings,
      tmdb_id: movie.tmdb_id,
      imdb_id: movie.imdb_id,
      owned: {
        rating_key: ratingKey, resolution: movie.resolution, hdr: movie.hdr, video_codec: movie.video_codec,
        user_rating: movie.user_rating, view_count: movie.view_count, file_path: movie.file_path,
      },
      inRadarr: false,
    };
  }
  const m = media;
  return {
    title: m.title,
    originalTitle: m.original_title,
    year: m.year,
    overview: m.overview,
    posterUrl: m.owned?.rating_key ? `/img/${m.owned.rating_key}/poster` : tmdbImg(m.poster_path),
    runtimeMin: m.runtime || null,
    genres: m.genres || [],
    countries: [],
    directors: (m.directors || []).map((d) => ({ id: d.id, name: d.name })),
    cast: (m.cast || []).map((a) => ({ id: a.id, name: a.name })),
    ratings: m.ratings,
    tmdb_id: m.tmdb_id,
    imdb_id: m.imdb_id,
    owned: m.owned,
    inRadarr: m.inRadarr,
  };
}

// Single unified movie "ficha" for both owned and not-owned films (#2).
export function Ficha({ ratingKey, tmdbId, onClose }) {
  const [vm, setVm] = useState(null);
  const [err, setErr] = useState(null);
  useEsc(onClose);
  useEffect(() => {
    setVm(null); setErr(null);
    if (ratingKey) {
      api(`/movies/${ratingKey}`).then((d) => (d.error ? setErr(d.error) : setVm(toViewModel({ ratingKey, movie: d }))));
    } else {
      api(`/media/${tmdbId}`).then((d) => (d.error ? setErr(d.error) : setVm(toViewModel({ media: d }))));
    }
  }, [ratingKey, tmdbId]);

  const owned = vm?.owned;
  const PersonLinks = ({ people, role, cls }) => (
    <>
      {people.map((p, i) => (
        <span key={`${p.id ?? p.name}-${i}`}>
          {i > 0 && ', '}
          {p.id ? (
            <Link className={cls} to={`/personas/${p.id}?role=${role}`} onClick={onClose}>{p.name}</Link>
          ) : (
            <span className="text-slate-300">{p.name}</span>
          )}
        </span>
      ))}
    </>
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 flex gap-6" onClick={(e) => e.stopPropagation()}>
        {!vm ? (
          err ? <ErrorBox error={err} /> : <Spinner label="Cargando ficha…" />
        ) : (
          <>
            {vm.posterUrl && (
              <img src={vm.posterUrl} alt="" className="w-44 rounded-lg shrink-0 hidden sm:block object-cover self-start" />
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-100">
                {vm.title} <span className="text-slate-500 font-normal">({vm.year ?? '¿?'})</span>
              </h2>
              {vm.tagline && <div className="text-gold-400 text-sm italic mt-1">{vm.tagline}</div>}
              {vm.originalTitle && vm.originalTitle !== vm.title && (
                <div className="text-sm text-slate-500 italic">{vm.originalTitle}</div>
              )}
              <div className="text-xs text-slate-400 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {vm.runtimeMin ? <span>{fmtDuration(vm.runtimeMin * 60000)}</span> : null}
                {owned?.resolution && <span className="text-slate-300">{owned.resolution.toUpperCase?.() || owned.resolution}</span>}
                {owned?.hdr && <span className="text-sky-300">{owned.hdr}</span>}
                {owned?.video_codec && <span>{owned.video_codec}</span>}
                {owned?.view_count > 0 && <span className="text-gold-400">★ Vista {owned.view_count}×</span>}
              </div>
              <RatingsChips ratings={vm.ratings} movie={vm} className="mt-2" />
              {vm.overview && <p className="text-sm text-slate-300 mt-3 leading-relaxed">{vm.overview}</p>}
              <div className="mt-3 text-sm">
                {vm.directors.length > 0 && (
                  <div><span className="text-slate-500">Dirección: </span><PersonLinks people={vm.directors} role="director" cls="text-gold-400 hover:underline" /></div>
                )}
                {vm.cast.length > 0 && (
                  <div className="mt-1"><span className="text-slate-500">Reparto: </span><PersonLinks people={vm.cast} role="actor" cls="text-slate-300 hover:text-gold-400 hover:underline" /></div>
                )}
                {(vm.genres.length > 0 || vm.countries.length > 0) && (
                  <div className="mt-1 text-slate-400 text-xs">{vm.genres.join(' · ')}{vm.countries.length > 0 && ` · ${vm.countries.join(', ')}`}</div>
                )}
              </div>
              <div className="mt-4">
                {owned ? (
                  SUB_1080.includes(owned.resolution) && vm.tmdb_id ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-orange-400">{owned.resolution?.toUpperCase()} · por debajo de 1080p — pedir upgrade:</span>
                      <RadarrButton tmdbId={vm.tmdb_id} small alreadyInRadarr={vm.inRadarr} />
                    </div>
                  ) : (
                    <span className="text-emerald-400 text-sm">✓ En tu biblioteca</span>
                  )
                ) : (
                  vm.tmdb_id && <RadarrButton tmdbId={vm.tmdb_id} alreadyInRadarr={vm.inRadarr} />
                )}
              </div>
              {owned?.file_path && <div className="mt-2 text-[11px] text-slate-600 break-all">{owned.file_path}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
