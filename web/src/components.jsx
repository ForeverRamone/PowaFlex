import { Component, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
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
      return <span className="inline-flex items-center gap-1 text-zinc-300"><LetterboxdLogo size={9} /> {Number(movie.letterboxd).toFixed(1)}</span>;
  }
  return null;
}

// Consistent status marks across the app: emerald dot = in Plex, gold star = watched.
export function StatusLegend({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 ${className}`}>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,.9)]" /> En Plex
      </span>
      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-zinc-500" /> Te falta</span>
      <span className="flex items-center gap-1.5"><span className="text-gold-400">★</span> Vista</span>
    </div>
  );
}

/**
 * Page masthead: a gold eyebrow in small caps over a display-face title. Two
 * lines of markup that give every page the same anchor.
 */
export function PageHeader({ eyebrow, title, subtitle, action, children }) {
  return (
    <header className="mb-7">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-gold-400/80 mb-1">{eyebrow}</p>
          )}
          <h1 className="font-display text-3xl md:text-4xl text-zinc-100 leading-tight text-balance">{title}</h1>
        </div>
        {action}
      </div>
      {subtitle && <p className="text-sm text-zinc-400 mt-2 max-w-3xl leading-relaxed">{subtitle}</p>}
      {children}
    </header>
  );
}

// Gold star = watched (Plex or Letterboxd); shown top-left on any poster.
function WatchedStar({ watched }) {
  if (!watched) return null;
  return (
    <span className="on-art on-art-gold top-1.5 left-1.5" title="Vista (Plex o Letterboxd)">
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
  // el hook va SIEMPRE (no se pueden llamar a medias) y no hace nada si está cerrado
  const dialogo = useFocusTrap(() => setOpen(false), open);
  const go = (path) => { setOpen(false); setQ(''); navigate(path); };
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-start justify-center p-4 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en tu biblioteca"
        className="card-float w-full max-w-xl p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <input autoFocus className="input" placeholder="Buscar película o persona…" value={q} onChange={(e) => setQ(e.target.value)} />
        {res && (
          <div className="mt-2 max-h-[60vh] overflow-y-auto">
            {res.people?.length > 0 && (
              <div className="text-[11px] uppercase tracking-widest text-zinc-600 px-2 mt-1 mb-1">Personas</div>
            )}
            {res.people?.map((p) => (
              <button
                key={`p${p.id}`}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-ink-800 text-sm text-zinc-200 flex items-center gap-2.5"
                onClick={() => go(`/personas/${p.id}?role=${p.role}`)}
              >
                {p.thumb ? (
                  <img src={`/img/person/${p.id}`} alt="" loading="lazy" className="w-7 h-7 rounded-full object-cover bg-ink-800 shrink-0" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-ink-800 text-zinc-500 text-[11px] flex items-center justify-center shrink-0">
                    {p.name.slice(0, 1)}
                  </span>
                )}
                <span className="truncate">{p.name}</span>
                <span className="text-zinc-500 text-xs ml-auto shrink-0 tabular">{p.total} títulos</span>
              </button>
            ))}
            {res.movies?.length > 0 && (
              <div className="text-[11px] uppercase tracking-widest text-zinc-600 px-2 mt-3 mb-1">Películas</div>
            )}
            {res.movies?.map((m) => (
              <button
                key={`m${m.rating_key}`}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-ink-800 text-sm text-zinc-200 flex items-center gap-2.5"
                onClick={() => setSel(m.rating_key)}
              >
                <img
                  src={`/img/${m.rating_key}/poster`}
                  alt=""
                  loading="lazy"
                  className="w-7 h-10 rounded-sm object-cover bg-ink-800 ring-art shrink-0"
                />
                <span className="truncate">{m.title}</span>
                <span className="text-zinc-500 text-xs ml-auto shrink-0 tabular">{m.year ?? '¿?'}</span>
              </button>
            ))}
            {!res.people?.length && !res.movies?.length && <div className="text-sm text-zinc-500 px-2 py-3">Nada encontrado.</div>}
          </div>
        )}
        {!res && <div className="text-xs text-zinc-500 px-2 py-3">Escribe para buscar en tu biblioteca. Atajo: Ctrl/⌘ + K.</div>}
      </div>
      {sel && <MovieModal id={sel} onClose={() => { setSel(null); setOpen(false); }} />}
    </div>
  );
}

// Unified toast notifications, mounted once in the shell.
export function Toaster() {
  const [items, setItems] = useState([]);
  const timers = useRef([]);
  useEffect(() => {
    const off = onToast((t) => {
      setItems((x) => [...x, t]);
      // los que llevan acción duran más: no da tiempo a pulsar «Deshacer» en 3,5 s
      const ms = t.action ? 8000 : 3500;
      timers.current.push(setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), ms));
    });
    return () => { off(); timers.current.forEach(clearTimeout); timers.current = []; };
  }, []);
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`card-raised px-4 py-2 text-sm max-w-[calc(100vw-2rem)] ${
            t.type === 'error' ? 'text-red-400' : t.type === 'success' ? 'text-emerald-400' : 'text-zinc-200'
          }`}
        >
          {t.message}
          {t.action && (
            <button
              className="ml-3 underline underline-offset-2 pointer-events-auto font-medium"
              onClick={() => { t.action.onClick(); setItems((x) => x.filter((i) => i.id !== t.id)); }}
            >
              {t.action.label}
            </button>
          )}
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
    // Es un botón de verdad: era un div con un onClick y el campo de fichero en
    // `hidden`, así que importar el zip de Letterboxd era imposible sin ratón y
    // un lector de pantalla no anunciaba nada.
    <div
      role="button"
      tabIndex={0}
      aria-label={label || 'Elegir archivos para importar'}
      aria-busy={busy || undefined}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); }
      }}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 ${
        drag ? 'border-gold-400 bg-ink-800' : 'border-ink-600 hover:border-gold-400 bg-ink-900'
      }`}
    >
      {/* sr-only y no `hidden`: display:none lo saca del árbol de accesibilidad */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => pick(e.target.files)}
      />
      <div className="text-3xl mb-2">{busy ? '⏳' : '📥'}</div>
      <div className="text-sm text-zinc-200">{busy ? 'Importando…' : label || 'Arrastra aquí tus archivos o haz clic para elegir'}</div>
      {hint && <div className="text-xs text-zinc-500 mt-1">{hint}</div>}
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
    chips.push(<Chip key="imdb" href={links.imdb} cls="badge-quiet text-yellow-500">IMDb {Number(ratings.imdb).toFixed(1)}</Chip>);
  if (ratings.rt_critic != null)
    chips.push(<Chip key="rt" href={links.rt} cls="badge-quiet text-red-400">🍅 {ratings.rt_critic}%</Chip>);
  if (ratings.rt_audience != null)
    chips.push(<Chip key="rta" href={links.rt} cls="badge-quiet text-orange-300">🍿 {ratings.rt_audience}%</Chip>);
  if (ratings.metacritic != null)
    chips.push(<Chip key="mc" href={links.metacritic} cls="badge-quiet text-emerald-400">MC {ratings.metacritic}</Chip>);
  if (ratings.letterboxd != null)
    chips.push(<Chip key="lb" href={links.letterboxd} cls="badge-quiet text-orange-300 inline-flex items-center gap-1"><LetterboxdLogo size={9} /> {Number(ratings.letterboxd).toFixed(1)}</Chip>);
  if (ratings.score != null)
    chips.push(<Chip key="mdb" href={links.tmdb} cls="badge-quiet text-gold-400 font-semibold">Σ {ratings.score}</Chip>);
  if (!chips.length) return null;
  return <div className={`flex flex-wrap gap-1.5 text-[11px] ${className}`}>{chips}</div>;
}

export function Spinner({ label = 'Cargando…' }) {
  return (
    <div className="flex items-center gap-3 text-zinc-400 py-10 justify-center">
      <div className="w-5 h-5 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      {label}
    </div>
  );
}

/**
 * Barrera de errores. Sin ella, cualquier excepción al pintar dejaba la página
 * completamente en blanco y sin pista de qué había pasado.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[PowaFlex] fallo al pintar', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message || this.state.error);
    // Tras actualizar el contenedor, una pestaña abierta pide trozos de código
    // de la versión anterior, que ya no existen. Eso no es un error de la app:
    // es que hay una versión nueva esperando.
    const versionNueva = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(msg);
    if (versionNueva) {
      return (
        <div className="alert my-6">
          <div className="font-semibold mb-1">Hay una versión nueva de PowaFlex</div>
          <p className="text-sm">Esta pestaña se quedó con la anterior. Recárgala y sigues donde estabas.</p>
          <button className="btn-gold mt-3" onClick={() => window.location.reload()}>Recargar</button>
        </div>
      );
    }
    return (
      <div className="alert my-6">
        <div className="font-semibold mb-1">Esta página se ha roto.</div>
        <p className="text-sm">{msg}</p>
        <div className="flex gap-2 mt-3">
          <button className="btn-ghost" onClick={() => this.setState({ error: null })}>Reintentar</button>
          <button className="btn-ghost" onClick={() => window.location.reload()}>Recargar la app</button>
        </div>
      </div>
    );
  }
}

export function ErrorBox({ error }) {
  return (
    <div className="alert my-4">
      ⚠️ {error}
    </div>
  );
}

// Numbers read as data, not as accents: gold is reserved for actions and
// favourites, so the figure itself is white in the display face.
export function StatCard({ label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="font-display text-3xl text-zinc-100 tabular leading-none">{value}</div>
      <div className="text-sm text-zinc-400 mt-2">{label}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

export function Section({ title, action, children, className = '' }) {
  return (
    <section className={`mb-8 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
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
      {/* everything here is in your library, so no "owned" colour: a clean
          poster with a quiet ring, lifting on hover */}
      <div className="poster">
        {!imgError ? (
          <img
            src={`/img/${movie.rating_key}/poster`}
            alt={movie.title}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-center p-2 text-[11px] text-zinc-400">
            {movie.title}
          </div>
        )}
        <WatchedStar watched={movie.watched != null ? movie.watched : movie.view_count > 0} />
        {movie.resolution === '4k' && (
          <span className="on-art bottom-1.5 left-1.5 font-semibold">4K</span>
        )}
        {movie.hdr && (
          <span className="on-art bottom-1.5 right-1.5">{movie.hdr === 'Dolby Vision' ? 'DV' : 'HDR'}</span>
        )}
      </div>
      <div className="mt-1.5 text-xs text-zinc-300 truncate group-hover:text-zinc-100 transition-colors">{movie.title}</div>
      <div className="text-[11px] text-zinc-500 flex gap-2 items-center tabular">
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
    <div className="text-left group">
      <button
        type="button"
        onClick={() => item.tmdb_id && setOpenFicha(true)}
        className="block w-full poster cursor-pointer"
        title={`${item.title} — ver ficha`}
      >
        {img ? (
          <img src={img} alt={item.title} loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-center p-2 text-[11px] text-zinc-400">
            {item.title}
          </div>
        )}
        <WatchedStar watched={item.watched} />
        {/* "in Plex" is information, not decoration: a dot, not a green frame */}
        {item.owned && !badge && (
          <span
            title="Ya está en tu Plex"
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,.9)]"
          />
        )}
        {badge}
      </button>
      <div className="mt-1.5 text-xs text-zinc-300 truncate group-hover:text-zinc-100 transition-colors" title={item.title}>
        {item.title}
      </div>
      <div className="text-[11px] text-zinc-500 tabular">{item.date ? item.date.slice(0, 4) : 'Sin fecha'}</div>
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

/**
 * `resolveTmdbId` covers rows that only know a title and a year (Letterboxd
 * challenge lists): the id is looked up on the first click instead of resolving
 * hundreds of films up front.
 */
export function RadarrButton({ tmdbId, resolveTmdbId, small = false, inline = false, alreadyInRadarr = false, onAdded }) {
  const [state, setState] = useState(alreadyInRadarr ? 'done' : 'idle');
  const [err, setErr] = useState('');
  // reflect a late-arriving radarr snapshot (ids often load after first paint)
  useEffect(() => {
    if (alreadyInRadarr) setState((s) => (s === 'idle' ? 'done' : s));
  }, [alreadyInRadarr]);
  const add = async () => {
    setState('busy');
    const id = tmdbId || (resolveTmdbId ? await resolveTmdbId() : null);
    if (!id) {
      setState('error');
      setErr('Sin ficha en TMDB');
      toast('⚠️ No encuentro esta película en TMDB', 'error');
      return;
    }
    const res = await api('/radarr/add', { method: 'POST', body: { tmdbId: id } });
    // an "already added" isn't a failure — the film is in Radarr, show it green
    if (res.ok) {
      setState('done');
      onAdded?.(id);
      toast(`✓ ${res.title || 'Película'} añadida a Radarr`, 'success');
    } else if (/already/i.test(res.error || '')) {
      setState('done');
      onAdded?.(id);
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
        className={`btn-gold ${small ? `text-[11px] px-2 py-1 ${inline ? '' : 'mt-1'}` : ''}`}
      >
        {state === 'busy' ? 'Añadiendo…' : '+ Radarr'}
      </button>
      {state === 'error' && <div className="text-[11px] text-red-400 mt-1 max-w-40">{err}</div>}
    </div>
  );
}

// Ask JustWatch whether a better-quality digital version exists on the market (#2).
// `result` lets a batch check (Calidad) fill these in without one request per card
export function JustWatchCheck({ tmdbId, result = null }) {
  const [own, setOwn] = useState(null);
  const [busy, setBusy] = useState(false);
  const r = own || result;
  const check = async () => {
    setBusy(true);
    setOwn(await api(`/justwatch/${tmdbId}`));
    setBusy(false);
  };
  if (r) {
    if (r.error) return <span className="text-[11px] text-red-400">JustWatch no responde</span>;
    if (!r.maxQuality) return <span className="text-[11px] text-zinc-500">Sin oferta digital encontrada</span>;
    return (
      <span
        className={`text-[11px] ${r.upgradeable ? 'text-emerald-400' : 'text-zinc-500'}`}
        title={r.providers?.length ? `En ${r.providers.join(', ')}` : ''}
      >
        {r.upgradeable ? `↑ Hay ${r.maxQuality} en el mercado` : `Máx. ${r.maxQuality} disponible`}
      </span>
    );
  }
  return (
    <button onClick={check} disabled={busy} className="text-[11px] text-sky-300 hover:underline cursor-pointer">
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
      <div className="w-12 h-12 rounded-full overflow-hidden bg-ink-800 shrink-0 flex items-center justify-center">
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
        <div className="text-sm font-medium text-zinc-200 truncate flex items-center gap-1.5">
          <span className="truncate">{person.name}</span>
          <DeathBadge deathday={person.deathday} />
        </div>
        <div className="text-xs text-zinc-500">
          {person.n} películas
          {person.watched != null && <span> · {person.watched} vistas</span>}
        </div>
      </div>
    </Link>
  );
}

export function ProgressBar({ pct }) {
  return (
    <div className="h-2 bg-ink-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-gold-400 transition-all"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

/** Desplegable de filtro con su opción vacía como marcador de posición. Estaba
 *  duplicado carácter a carácter en Biblioteca y en Personas. */
export function Select({ value, onChange, options, placeholder, className = '' }) {
  return (
    <select className={`input !w-auto ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

export function Empty({ children }) {
  return <div className="text-zinc-500 text-sm py-8 text-center">{children}</div>;
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
      <div className="flex items-center gap-3 justify-center text-zinc-400 mb-4">
        <div className="w-5 h-5 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
        {label}
      </div>
      {p && p.total > 0 && (
        <>
          <ProgressBar pct={Math.round((p.done / p.total) * 100)} />
          <div className="text-xs text-zinc-500 mt-2">{p.label} · {p.done} / {p.total}</div>
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

// Shorts / documentaries / TV-movie / cameo visibility toggles, persisted.
// Defaults to hidden (the completist wants features first). All pages share the
// default 'type_filters' key so a preference set once applies everywhere.
const TYPE_DEFAULTS = { shorts: false, docs: false, music: false, tv: false, coral: false, cameos: false };

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
  // tercer elemento opcional: los botones «Limpiar filtros» de cada página
  const reset = () => {
    setShow({ ...TYPE_DEFAULTS });
    localStorage.removeItem(key);
  };
  return [show, toggle, reset];
}

export const matchesTypeFilters = (item, show) =>
  (show.shorts || !item.isShort) && (show.docs || !item.isDocumentary) &&
  (show.music || !item.isMusic) &&
  (show.tv || !item.isTvMovie) && (show.coral || !item.isCoral) &&
  (show.cameos || !item.isCameo);

// Toggle chips, not struck-through buttons: strikethrough reads as
// "unavailable", and this bar sits above the gaps grid all day long.
export function TypeFilterBar({ show, toggle, counts }) {
  const items = [
    ['shorts', 'Cortos', counts?.shorts],
    ['docs', 'Documentales', counts?.docs],
    ['music', 'Conciertos', counts?.music],
    ['tv', 'Películas de TV', counts?.tv],
    ['coral', 'Dirección coral', counts?.coral],
    ['cameos', 'Cameos', counts?.cameos],
  ].filter(([, , n]) => n == null || n > 0);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4 text-sm">
      <span className="text-zinc-500 text-xs mr-1">Mostrar:</span>
      {items.map(([k, label, n]) => (
        <button
          key={k}
          onClick={() => toggle(k)}
          title={show[k] ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          className={`chip ${show[k] ? 'chip-on' : ''}`}
        >
          {label}
          {n != null && <span className="tabular opacity-70"> {n}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * «¿y este quién era?»: las dos películas por las que se reconoce a alguien,
 * junto a su nombre, para no tener que abrir su ficha. Los puntos suspensivos
 * dejan claro que hay más obra detrás de esas dos.
 */
export function Signature({ films, className = '' }) {
  if (!films?.length) return null;
  return (
    <span className={`text-xs text-zinc-500 font-normal ${className}`}>
      {' ('}
      {films.map((f, i) => (
        <span key={f.tmdb_id ?? i}>
          {i > 0 && ', '}
          <i>{f.title}</i>
        </span>
      ))}
      {'…)'}
    </span>
  );
}

export function DeathBadge({ deathday, className = '' }) {
  if (!deathday) return null;
  const year = String(deathday).slice(0, 4);
  return (
    <span title={`Fallecido${year ? ` en ${year}` : ''}`} className={`badge-quiet shrink-0 ${className}`}>
      ✝ {year}
    </span>
  );
}

// Cierre con Escape y trampa de foco: sin ella, con Tab te ibas paseando por la
// página de detrás mientras el diálogo seguía abierto, y al cerrarlo el foco se
// quedaba en el limbo.
function useEsc(onClose) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

export function useFocusTrap(onClose, activo = true) {
  const ref = useRef(null);
  useEsc(onClose);
  useEffect(() => {
    if (!activo) return undefined;
    const previo = document.activeElement;
    const foco = () =>
      [...(ref.current?.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])') || [])];
    foco()[0]?.focus();
    const onKey = (e) => {
      if (e.key !== 'Tab' || !ref.current) return;
      const f = foco();
      if (!f.length) return;
      const [primero, ultimo] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previo?.focus?.(); };
  }, [activo]);
  return ref;
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
  const dialogo = useFocusTrap(onClose);
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
            <span className="text-zinc-300">{p.name}</span>
          )}
        </span>
      ))}
    </>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-label={vm?.title || 'Ficha de película'}
        className="card-float max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 flex gap-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-100 transition-colors z-10"
        >
          <X size={18} />
        </button>
        {!vm ? (
          err ? <ErrorBox error={err} /> : <Spinner label="Cargando ficha…" />
        ) : (
          <>
            {vm.posterUrl && (
              <img
                src={vm.posterUrl}
                alt=""
                className="w-44 rounded-lg shrink-0 hidden sm:block object-cover self-start ring-art shadow-2xl shadow-black/60"
              />
            )}
            <div className="min-w-0">
              <h2 className="font-display text-3xl text-zinc-100 leading-tight text-balance">
                {vm.title} <span className="text-zinc-500 font-normal">({vm.year ?? '¿?'})</span>
              </h2>
              {vm.tagline && <div className="text-zinc-400 text-sm italic mt-1">{vm.tagline}</div>}
              {vm.originalTitle && vm.originalTitle !== vm.title && (
                <div className="text-sm text-zinc-500 italic">{vm.originalTitle}</div>
              )}
              <div className="text-xs text-zinc-400 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {vm.runtimeMin ? <span>{fmtDuration(vm.runtimeMin * 60000)}</span> : null}
                {owned?.resolution && <span className="text-zinc-300">{owned.resolution.toUpperCase?.() || owned.resolution}</span>}
                {owned?.hdr && <span className="text-sky-300">{owned.hdr}</span>}
                {owned?.video_codec && <span>{owned.video_codec}</span>}
                {owned?.view_count > 0 && <span className="text-gold-400">★ Vista {owned.view_count}×</span>}
              </div>
              <RatingsChips ratings={vm.ratings} movie={vm} className="mt-2" />
              {vm.overview && <p className="text-sm text-zinc-300 mt-3 leading-relaxed">{vm.overview}</p>}
              <div className="mt-3 text-sm">
                {vm.directors.length > 0 && (
                  <div><span className="text-zinc-500">Dirección: </span><PersonLinks people={vm.directors} role="director" cls="text-zinc-100 hover:text-gold-400 hover:underline" /></div>
                )}
                {vm.cast.length > 0 && (
                  <div className="mt-1"><span className="text-zinc-500">Reparto: </span><PersonLinks people={vm.cast} role="actor" cls="text-zinc-300 hover:text-gold-400 hover:underline" /></div>
                )}
                {(vm.genres.length > 0 || vm.countries.length > 0) && (
                  <div className="mt-1 text-zinc-400 text-xs">{vm.genres.join(' · ')}{vm.countries.length > 0 && ` · ${vm.countries.join(', ')}`}</div>
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
              {owned?.file_path && <div className="mt-2 text-[11px] text-zinc-600 break-all">{owned.file_path}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
