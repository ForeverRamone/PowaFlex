import { Component, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { api, fmtDuration, tmdbImg, ratingLinks, primaryRating } from './api.js';
import { t } from './i18n.js';
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
        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,.9)]" /> {t('En Plex')}
      </span>
      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-zinc-500" /> {t('Te falta')}</span>
      <span className="flex items-center gap-1.5"><span className="text-gold-400">★</span> {t('Vista')}</span>
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
    <span className="on-art on-art-gold top-1.5 left-1.5" title={t('Vista (Plex o Letterboxd)')}>
      ★
    </span>
  );
}

// Secciones de la app, para saltar a cualquiera desde la paleta. Incluye las
// que ahora son pestañas de otra página (Sagas, Calidad, Salud, catálogo).
const PALETTE_SECTIONS = [
  [t('Dashboard'), '/'],
  [t('Biblioteca'), '/biblioteca'],
  [t('Directores y actores'), '/personas'],
  [t('Directores en activo (catálogo)'), '/favoritos?add=activos'],
  [t('Visionado'), '/visionado'],
  [t('Taller'), '/taller'],
  [t('Calidad y disco'), '/taller?tab=calidad'],
  [t('Salud de los datos'), '/taller?tab=datos'],
  [t('Favoritos'), '/favoritos'],
  [t('Descubrir huecos'), '/descubrir'],
  [t('Sagas'), '/descubrir?tab=sagas'],
  [t('Cine venidero'), '/calendario'],
  [t('Festivales y premios'), '/festivales'],
  [t('Estrenos (cines y plataformas)'), '/estrenos'],
  [t('Estrenos en cines de España'), '/estrenos'],
  [t('Estrenos en cines de EE UU'), '/estrenos?tab=cine-us'],
  [t('Estrenos en plataformas'), '/estrenos?tab=plataformas-es'],
  [t('Listas y retos'), '/listas'],
  [t('Letterboxd (importar)'), '/ajustes?tab=fuentes'],
  [t('Ajustes'), '/ajustes'],
  [t('Últimas novedades'), '/novedades'],
  [t('¿Qué es PowaFlex?'), '/acerca'],
];

// acentos fuera y a minúsculas, para que «oscar» encuentre «Óscar»
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Global command palette: movies + people + sagas + lists + festivals +
// sections, keyboard-first (#8). Opens with Ctrl/Cmd+K or 'powaflex-search'.
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(null);
  const [fests, setFests] = useState(null); // índice real de /festivales, una vez
  const [active, setActive] = useState(0);
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
    if (open && !fests) api('/festivals').then((r) => setFests(Array.isArray(r?.festivals) ? r.festivals : []));
  }, [open, fests]);
  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const t = setTimeout(() => api(`/search?q=${encodeURIComponent(q.trim())}`).then((r) => !r.error && setRes(r)), 200);
    return () => clearTimeout(t);
  }, [q]);
  // el hook va SIEMPRE (no se pueden llamar a medias) y no hace nada si está cerrado
  const dialogo = useFocusTrap(() => setOpen(false), open);
  const go = (path) => { setOpen(false); setQ(''); navigate(path); };

  // una sola lista plana con grupos: por ella se mueve el teclado (↑/↓/Enter)
  const term = fold(q.trim());
  const flat = [];
  const grupo = (label, items) => { if (items.length) flat.push({ header: label }, ...items); };
  if (term) {
    grupo(t('Personas'), (res?.people || []).map((p) => ({
      key: `p${p.id}`, kind: 'person', p,
      run: () => go(`/personas/${p.id}?role=${p.role}`),
    })));
    grupo(t('Películas'), (res?.movies || []).map((m) => ({
      key: `m${m.rating_key}`, kind: 'movie', m,
      run: () => setSel(m.rating_key),
    })));
    grupo(t('Sagas'), (res?.sagas || []).map((s) => ({
      key: `s${s.id}`, kind: 'plain', label: s.name, sub: t('{n} en tu Plex', { n: s.n }),
      run: () => go('/descubrir?tab=sagas'),
    })));
    grupo(t('Listas y retos'), (res?.lists || []).map((l) => ({
      key: `l${l.kind}${l.id}`, kind: 'plain', label: l.name, sub: l.kind === 'lb' ? 'Letterboxd' : 'MDBList',
      run: () => go('/listas'),
    })));
    grupo(t('Festivales y premios'), (fests || [])
      .filter((f) => fold(f.name).includes(term) || fold(f.award).includes(term))
      .slice(0, 5)
      .map((f) => ({
        key: `f${f.key}`, kind: 'plain', label: f.name, sub: f.award || t('Festivales'),
        run: () => go(`/festivales?f=${encodeURIComponent(f.key)}`),
      })));
    grupo(t('Secciones'), PALETTE_SECTIONS
      .filter(([label]) => fold(label).includes(term))
      .slice(0, 5)
      .map(([label, path]) => ({ key: `sec${path}${label}`, kind: 'plain', label, sub: t('Ir a'), run: () => go(path) })));
  }
  const rows = flat.filter((f) => !f.header);
  const clamp = (i) => (rows.length ? (i + rows.length) % rows.length : 0);
  const onInputKey = (e) => {
    // 'Down'/'Up' son los nombres antiguos de tecla (IE/Edge y algunos WebView)
    if (e.key === 'ArrowDown' || e.key === 'Down') { e.preventDefault(); setActive((i) => clamp(i + 1)); }
    else if (e.key === 'ArrowUp' || e.key === 'Up') { e.preventDefault(); setActive((i) => clamp(i - 1)); }
    else if (e.key === 'Enter' && rows[active]) { e.preventDefault(); rows[active].run(); }
  };
  // al cambiar los resultados, la selección vuelve arriba
  useEffect(() => { setActive(0); }, [q, res]);

  if (!open) return null;
  let rowIdx = -1;
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-start justify-center p-4 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-label={t('Buscar en PowaFlex')}
        className="card-float w-full max-w-xl p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="input"
          placeholder={t('Película, persona, saga, lista, festival o sección…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
        />
        {term && (
          <div className="mt-2 max-h-[60vh] overflow-y-auto">
            {flat.map((f) => {
              if (f.header) {
                return (
                  <div key={`h${f.header}`} className="text-[11px] uppercase tracking-widest text-zinc-600 px-2 mt-3 first:mt-1 mb-1">
                    {f.header}
                  </div>
                );
              }
              rowIdx++;
              const isActive = rowIdx === active;
              const cls = `w-full text-left px-2 py-1.5 rounded text-sm text-zinc-200 flex items-center gap-2.5 ${
                isActive ? 'bg-ink-800' : 'hover:bg-ink-800'
              }`;
              if (f.kind === 'person') {
                const p = f.p;
                return (
                  <button key={f.key} className={cls} onClick={f.run}>
                    {p.thumb ? (
                      <img src={`/img/person/${p.id}`} alt="" loading="lazy" className="w-7 h-7 rounded-full object-cover bg-ink-800 shrink-0" />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-ink-800 text-zinc-500 text-[11px] flex items-center justify-center shrink-0">
                        {p.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="truncate">{p.name}</span>
                    <span className="text-zinc-500 text-xs ml-auto shrink-0 tabular">{t('{n} títulos', { n: p.total })}</span>
                  </button>
                );
              }
              if (f.kind === 'movie') {
                const m = f.m;
                return (
                  <button key={f.key} className={cls} onClick={f.run}>
                    <img
                      src={`/img/${m.rating_key}/poster`}
                      alt=""
                      loading="lazy"
                      className="w-7 h-10 rounded-sm object-cover bg-ink-800 ring-art shrink-0"
                    />
                    <span className="truncate">{m.title}</span>
                    <span className="text-zinc-500 text-xs ml-auto shrink-0 tabular">{m.year ?? t('¿?')}</span>
                  </button>
                );
              }
              return (
                <button key={f.key} className={cls} onClick={f.run}>
                  <span className="truncate">{f.label}</span>
                  {f.sub && <span className="text-zinc-500 text-xs ml-auto shrink-0">{f.sub}</span>}
                </button>
              );
            })}
            {rows.length === 0 && <div className="text-sm text-zinc-500 px-2 py-3">{t('Nada encontrado.')}</div>}
          </div>
        )}
        {!term && (
          <div className="text-xs text-zinc-500 px-2 py-3">
            {t('Escribe para buscar películas, personas, sagas, listas, festivales o saltar a una sección. ↑↓ para moverte, Enter para abrir. Atajo: Ctrl/⌘ + K.')}
          </div>
        )}
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
      aria-label={label || t('Elegir archivos para importar')}
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
      <div className="text-sm text-zinc-200">{busy ? t('Importando…') : label || t('Arrastra aquí tus archivos o haz clic para elegir')}</div>
      {hint && <div className="text-xs text-zinc-500 mt-1">{hint}</div>}
      {names.length > 0 && !busy && (
        <div className="text-xs text-gold-400 mt-2 truncate">{t('{n} archivo(s): {names}', { n: names.length, names: names.join(', ') })}</div>
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
      <a href={href} target="_blank" rel="noreferrer" className={`${cls} hover:brightness-125 transition`} title={t('Abrir en su web')}>
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

export function Spinner({ label = t('Cargando…') }) {
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
          <div className="font-semibold mb-1">{t('Hay una versión nueva de PowaFlex')}</div>
          <p className="text-sm">{t('Esta pestaña se quedó con la anterior. Recárgala y sigues donde estabas.')}</p>
          <button className="btn-gold mt-3" onClick={() => window.location.reload()}>{t('Recargar')}</button>
        </div>
      );
    }
    return (
      <div className="alert my-6">
        <div className="font-semibold mb-1">{t('Esta página se ha roto.')}</div>
        <p className="text-sm">{msg}</p>
        <div className="flex gap-2 mt-3">
          <button className="btn-ghost" onClick={() => this.setState({ error: null })}>{t('Reintentar')}</button>
          <button className="btn-ghost" onClick={() => window.location.reload()}>{t('Recargar la app')}</button>
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
      title={`${movie.title} (${movie.year ?? t('¿?')})`}
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
        title={t('{title} — ver ficha', { title: item.title })}
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
            title={t('Ya está en tu Plex')}
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,.9)]"
          />
        )}
        {badge}
      </button>
      <div className="mt-1.5 text-xs text-zinc-300 truncate group-hover:text-zinc-100 transition-colors" title={item.title}>
        {item.title}
      </div>
      <div className="text-[11px] text-zinc-500 tabular">{item.date ? item.date.slice(0, 4) : t('Sin fecha')}</div>
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
      setErr(t('Sin ficha en TMDB'));
      toast(t('⚠️ No encuentro esta película en TMDB'), 'error');
      return;
    }
    const res = await api('/radarr/add', { method: 'POST', body: { tmdbId: id } });
    // an "already added" isn't a failure — the film is in Radarr, show it green
    if (res.ok) {
      setState('done');
      onAdded?.(id);
      toast(t('✓ {title} añadida a Radarr', { title: res.title || t('Película') }), 'success');
    } else if (/already/i.test(res.error || '')) {
      setState('done');
      onAdded?.(id);
      toast(t('Ya estaba en Radarr'), 'info');
    } else {
      setState('error');
      setErr(res.error || 'Error');
      toast(`⚠️ Radarr: ${t(res.error || 'error')}`, 'error');
    }
  };
  if (state === 'done')
    return <span className={`text-emerald-400 ${small ? 'text-[11px]' : 'text-sm'}`}>{t('✓ En Radarr')}</span>;
  return (
    <div>
      <button
        onClick={add}
        disabled={state === 'busy'}
        className={`btn-gold ${small ? `text-[11px] px-2 py-1 ${inline ? '' : 'mt-1'}` : ''}`}
      >
        {state === 'busy' ? t('Añadiendo…') : '+ Radarr'}
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
    if (r.error) return <span className="text-[11px] text-red-400">{t('JustWatch no responde')}</span>;
    if (!r.maxQuality) return <span className="text-[11px] text-zinc-500">{t('Sin oferta digital encontrada')}</span>;
    return (
      <span
        className={`text-[11px] ${r.upgradeable ? 'text-emerald-400' : 'text-zinc-500'}`}
        title={r.providers?.length ? t('En {providers}', { providers: r.providers.join(', ') }) : ''}
      >
        {r.upgradeable ? t('↑ Hay {q} en el mercado', { q: r.maxQuality }) : t('Máx. {q} disponible', { q: r.maxQuality })}
      </span>
    );
  }
  return (
    <button onClick={check} disabled={busy} className="text-[11px] text-sky-300 hover:underline cursor-pointer">
      {busy ? t('Consultando…') : t('¿existe mejor versión?')}
    </button>
  );
}

/**
 * La referencia de una persona para la URL de su ficha, con lo que haya:
 * el id local si está en tu biblioteca, el de TMDB si lo conocemos, y si no
 * el nombre a secas, que es todo lo que dan las tablas de Wikipedia.
 *
 * Del `nombre:` se encarga el servidor AL ABRIR la ficha, no al pintar la
 * lista: enlazar los doscientos nombres de un canon no cuesta ni una petición
 * hasta que se pulsa uno.
 */
export const refPersona = ({ personId = null, tmdbId = null, nombre = '' }) =>
  personId ? String(personId) : tmdbId ? `tmdb:${tmdbId}` : `nombre:${encodeURIComponent(nombre)}`;

/**
 * EL NOMBRE DE CUALQUIER PERSONA, SIEMPRE CLICABLE.
 *
 * Da igual que esté en tus favoritos, en tu biblioteca o en ninguna parte: el
 * nombre de quien dirige una película de Cannes lleva a su ficha igual que el
 * de quien tienes fichado, con su filmografía y su botón de seguir.
 */
export function EnlacePersona({ nombre, personId = null, tmdbId = null, role = 'director', className = '', children = null }) {
  if (!nombre && !personId && !tmdbId) return null;
  return (
    <Link
      to={`/personas/${refPersona({ personId, tmdbId, nombre })}?role=${role}`}
      className={`hover:text-gold-400 hover:underline transition-colors ${className}`}
      title={t('Ver la ficha de {nombre}', { nombre })}
      onClick={(e) => e.stopPropagation()}
    >
      {children ?? nombre}
    </Link>
  );
}

/**
 * `follow` (opcional) pinta la estrella de seguir dentro de la tarjeta:
 * { state: 'here' | 'elsewhere' | 'no', title, onToggle }. El clic en la
 * estrella NO navega (preventDefault): la tarjeta entera sigue siendo el
 * enlace a la ficha.
 */
export function PersonCard({ person, role, follow = null }) {
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
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-200 truncate flex items-center gap-1.5">
          <span className="truncate">{person.name}</span>
          <DeathBadge deathday={person.deathday} />
        </div>
        <div className="text-xs text-zinc-500">
          {t('{n} películas', { n: person.n })}
          {person.watched != null && <span>{t(' · {n} vistas', { n: person.watched })}</span>}
        </div>
      </div>
      {follow && (
        <button
          onClick={(e) => { e.preventDefault(); follow.onToggle(person); }}
          title={follow.title}
          className={`text-lg cursor-pointer transition-colors shrink-0 ${
            follow.state === 'here'
              ? 'text-gold-400'
              : follow.state === 'elsewhere'
                ? 'text-gold-400/30 hover:text-gold-400'
                : 'text-zinc-600 hover:text-gold-400'
          }`}
        >
          ★
        </button>
      )}
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

/**
 * Desplegable de filtro. Estaba duplicado carácter a carácter en Biblioteca y
 * en Personas.
 *
 * SIN `placeholder` no se pinta la opción vacía: eso vale para un filtro («sin
 * filtrar» es un estado real) pero no para elegir un orden, donde siempre hay
 * uno puesto — ahí la opción vacía salía como un duplicado del primer orden.
 */
export function Select({ value, onChange, options, placeholder = null, className = '' }) {
  return (
    <select className={`input !w-auto ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

export function Empty({ children }) {
  return <div className="text-zinc-500 text-sm py-8 text-center">{children}</div>;
}

/**
 * Listón de nota mínima Σ. Vivía copiado carácter a carácter en Descubrir y en
 * la ficha de persona (y con él su regla de oro): el listón solo esconde lo que
 * tiene nota por debajo; lo que no tiene nota se queda a la vista.
 */
export const passesScore = (i, minScore) => !minScore || i.mdb?.score == null || i.mdb.score >= minScore;

export function MinScoreBar({ minScore, setMinScore }) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <span className="text-xs text-zinc-500">{t('Nota mínima Σ:')}</span>
      {[0, 40, 50, 60, 70].map((v) => (
        <button
          key={v}
          onClick={() => setMinScore(v)}
          className={`btn-ghost !py-1 text-xs ${minScore === v ? '!border-gold-400 text-gold-400' : ''}`}
        >
          {v === 0 ? t('Todas') : `Σ ≥ ${v}`}
        </button>
      ))}
      <span className="text-xs text-zinc-600">{t('(las sin nota no se ocultan)')}</span>
    </div>
  );
}

/**
 * El corrector manual de emparejado con TMDB, para lo que ninguna regla va a
 * acertar: dos personas con el mismo nombre, alguien con la obra repartida en
 * dos fichas, o una película que Plex identificó con el guid de otra.
 *
 * Sirve para personas y para películas —cambia lo que se busca y cómo se pinta
 * cada candidato, no el diálogo— y lo usan la ficha de persona, la tarjeta de
 * Favoritos, la ficha de película y Festivales.
 */
export function MatchCorrector({
  kind = 'movie',
  title,
  subtitle,
  initialQuery = '',
  year = null,
  role = null,
  // Festivales busca candidatos con su propio endpoint (acotado al año de la
  // edición); el resto usa las rutas por defecto según `kind`
  searchPath = null,
  onPick,
  onClear = null,
  clearLabel = t('Quitar corrección / volver al automático'),
  onClose,
}) {
  const esPersona = kind === 'person';
  const [q, setQ] = useState(initialQuery);
  const [cands, setCands] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [fijando, setFijando] = useState(false);
  const dialogo = useFocusTrap(onClose);

  const buscar = async () => {
    if (!q.trim()) return;
    setBuscando(true);
    const ruta = searchPath
      ? searchPath(q.trim())
      : esPersona
        ? `/people/search-tmdb?q=${encodeURIComponent(q.trim())}${role ? `&role=${role}` : ''}`
        : `/movies/match-candidates?q=${encodeURIComponent(q.trim())}&year=${year || ''}`;
    const r = await api(ruta);
    setBuscando(false);
    // las personas llegan como lista pelada; las películas, envueltas
    setCands(r.error ? [] : (Array.isArray(r) ? r : r.candidates) || []);
  };
  // la primera búsqueda se lanza sola con el nombre que ya conocemos: en la
  // inmensa mayoría de los casos la ficha buena sale ahí mismo
  useEffect(() => { if (initialQuery.trim()) buscar(); }, []);

  const elegir = async (id) => {
    setFijando(true);
    await onPick(id);
    setFijando(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-label={t('Corregir emparejado de {title}', { title })}
        className="card-raised p-4 w-full max-w-lg mt-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-zinc-100 text-sm">{t('Corregir emparejado · «{title}»', { title })}</h3>
          <button className="text-zinc-500 hover:text-zinc-200 shrink-0" onClick={onClose} aria-label={t('Cerrar')}>✕</button>
        </div>
        <p className="text-[11px] text-zinc-500 mb-3">
          {subtitle || (esPersona
            ? t('Busca en TMDB y elige la ficha correcta. Se recuerda para siempre y ningún automatismo la revisa.')
            : t('Busca en TMDB y elige la ficha correcta. Se recuerda y sobrevive a las sincronizaciones de Plex.'))}
        </p>

        <form className="flex gap-2 mb-3" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
          <input
            className="input flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={esPersona ? t('Nombre a buscar en TMDB…') : t('Título a buscar en TMDB…')}
          />
          <button type="submit" className="btn-gold" disabled={buscando}>{buscando ? '…' : t('Buscar')}</button>
        </form>

        {cands && cands.length === 0 && <Empty>{t('Nada en TMDB con esa búsqueda.')}</Empty>}
        {cands?.length > 0 && (
          <div className="divide-y divide-ink-800 max-h-80 overflow-y-auto">
            {cands.map((c) => {
              const id = esPersona ? c.tmdb_id : c.id;
              const img = esPersona ? c.profile_path : c.poster_path;
              const pie = esPersona
                ? [c.dept === 'Directing' ? t('Dirección') : c.dept === 'Acting' ? t('Interpretación') : c.dept, (c.knownFor || []).join(', ')]
                    .filter(Boolean).join(' · ')
                : [c.date ? c.date.slice(0, 4) : t('sin fecha'),
                   c.original_title && c.original_title !== c.title ? c.original_title : null]
                    .filter(Boolean).join(' · ');
              return (
                <button
                  key={id}
                  disabled={fijando}
                  onClick={() => elegir(id)}
                  className="w-full flex items-center gap-3 py-2 text-left hover:bg-ink-800 px-2 cursor-pointer disabled:opacity-50"
                >
                  {img ? (
                    <img
                      src={tmdbImg(img, 'w92')}
                      alt=""
                      className={`w-10 shrink-0 border border-ink-700 ${esPersona ? 'h-14 object-cover rounded-full' : 'rounded'}`}
                    />
                  ) : (
                    <span className="w-10 h-14 shrink-0 border border-ink-700 rounded flex items-center justify-center text-[9px] text-zinc-500">
                      {esPersona ? t('sin foto') : t('sin cartel')}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm text-zinc-200 truncate">{esPersona ? c.name : c.title}</span>
                    <span className="block text-[11px] text-zinc-500 truncate">{pie || `TMDB ${id}`}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {onClear && (
          <button className="btn-ghost !py-1 text-xs mt-3" disabled={fijando} onClick={onClear}>{clearLabel}</button>
        )}
      </div>
    </div>
  );
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
export function BuildProgress({ label = t('Construyendo desde TMDB…') }) {
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
const TYPE_DEFAULTS = { shorts: false, docs: false, music: false, tv: false, eventos: false, coral: false, cameos: false };

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
  (show.tv || !item.isTvMovie) && (show.eventos || !item.isEvento) &&
  (show.coral || !item.isCoral) && (show.cameos || !item.isCameo);

// Toggle chips, not struck-through buttons: strikethrough reads as
// "unavailable", and this bar sits above the gaps grid all day long.
export function TypeFilterBar({ show, toggle, counts }) {
  const items = [
    ['shorts', t('Cortos'), counts?.shorts],
    ['docs', t('Documentales'), counts?.docs],
    ['music', t('Conciertos'), counts?.music],
    ['tv', t('Películas de TV'), counts?.tv],
    ['eventos', t('Lucha libre y eventos'), counts?.eventos],
    ['coral', t('Dirección coral'), counts?.coral],
    ['cameos', t('Cameos'), counts?.cameos],
  ].filter(([, , n]) => n == null || n > 0);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4 text-sm">
      <span className="text-zinc-500 text-xs mr-1">{t('Mostrar:')}</span>
      {items.map(([k, label, n]) => (
        <button
          key={k}
          onClick={() => toggle(k)}
          title={show[k] ? t('Ocultar {x}', { x: label.toLowerCase() }) : t('Mostrar {x}', { x: label.toLowerCase() })}
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
    <span title={year ? t('Fallecido en {year}', { year }) : t('Fallecido')} className={`badge-quiet shrink-0 ${className}`}>
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
      directors: (movie.people || []).filter((p) => p.role === 'director').map((p) => ({ id: p.id, tmdb_id: p.tmdb_id ?? null, name: p.name })),
      cast: (movie.people || []).filter((p) => p.role === 'actor').slice(0, 14).map((p) => ({ id: p.id, tmdb_id: p.tmdb_id ?? null, name: p.name })),
      ratings: movie.ratings,
      tmdb_id: movie.tmdb_id,
      imdb_id: movie.imdb_id,
      tmdbLocked: !!movie.tmdb_locked,
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
    directors: (m.directors || []).map((d) => ({ id: d.id, tmdb_id: d.tmdb_id ?? null, name: d.name })),
    cast: (m.cast || []).map((a) => ({ id: a.id, tmdb_id: a.tmdb_id ?? null, name: a.name })),
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
  const [corrigiendo, setCorrigiendo] = useState(false);
  const dialogo = useFocusTrap(onClose);
  const cargar = () => {
    setVm(null); setErr(null);
    if (ratingKey) {
      api(`/movies/${ratingKey}`).then((d) => (d.error ? setErr(d.error) : setVm(toViewModel({ ratingKey, movie: d }))));
    } else {
      api(`/media/${tmdbId}`).then((d) => (d.error ? setErr(d.error) : setVm(toViewModel({ media: d }))));
    }
  };
  useEffect(cargar, [ratingKey, tmdbId]);

  // corregir a mano a qué ficha de TMDB apunta ESTA película de tu biblioteca:
  // de ahí salen las notas, el reparto y el completismo de su gente
  const fijarPelicula = async (nuevoId) => {
    const r = await api(`/movies/${ratingKey}/match`, { method: 'POST', body: { tmdbId: nuevoId } });
    if (r.error) { toast(`⚠️ ${t(r.error)}`, 'error'); return; }
    setCorrigiendo(false);
    toast(nuevoId ? t('✓ Emparejado corregido') : t('✓ Corrección quitada'));
    cargar();
  };

  const owned = vm?.owned;
  // TODO nombre clicable, esté o no en tu biblioteca: con id local va directo,
  // y si no, la ruta /personas/:ref resuelve `tmdb:123` o `nombre:Fulano` AL
  // PULSAR. Antes, quien no estaba en tu Plex se quedaba en texto plano.
  const PersonLinks = ({ people, role, cls }) => (
    <>
      {people.map((p, i) => (
        <span key={`${p.id ?? p.tmdb_id ?? p.name}-${i}`}>
          {i > 0 && ', '}
          <Link
            className={cls}
            to={`/personas/${refPersona({ personId: p.id, tmdbId: p.tmdb_id, nombre: p.name })}?role=${role}`}
            onClick={onClose}
          >
            {p.name}
          </Link>
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
        aria-label={vm?.title || t('Ficha de película')}
        className="card-float max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 flex gap-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={t('Cerrar')}
          className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-100 transition-colors z-10"
        >
          <X size={18} />
        </button>
        {!vm ? (
          err ? <ErrorBox error={err} /> : <Spinner label={t('Cargando ficha…')} />
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
                {vm.title} <span className="text-zinc-500 font-normal">({vm.year ?? t('¿?')})</span>
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
                {owned?.view_count > 0 && <span className="text-gold-400">{t('★ Vista {n}×', { n: owned.view_count })}</span>}
              </div>
              <RatingsChips ratings={vm.ratings} movie={vm} className="mt-2" />
              {vm.overview && <p className="text-sm text-zinc-300 mt-3 leading-relaxed">{vm.overview}</p>}
              <div className="mt-3 text-sm">
                {vm.directors.length > 0 && (
                  <div><span className="text-zinc-500">{t('Dirección: ')}</span><PersonLinks people={vm.directors} role="director" cls="text-zinc-100 hover:text-gold-400 hover:underline" /></div>
                )}
                {vm.cast.length > 0 && (
                  <div className="mt-1"><span className="text-zinc-500">{t('Reparto: ')}</span><PersonLinks people={vm.cast} role="actor" cls="text-zinc-300 hover:text-gold-400 hover:underline" /></div>
                )}
                {(vm.genres.length > 0 || vm.countries.length > 0) && (
                  <div className="mt-1 text-zinc-400 text-xs">{vm.genres.join(' · ')}{vm.countries.length > 0 && ` · ${vm.countries.join(', ')}`}</div>
                )}
              </div>
              <div className="mt-4">
                {owned ? (
                  SUB_1080.includes(owned.resolution) && vm.tmdb_id ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-orange-400">{t('{res} · por debajo de 1080p — pedir upgrade:', { res: owned.resolution?.toUpperCase() })}</span>
                      <RadarrButton tmdbId={vm.tmdb_id} small alreadyInRadarr={vm.inRadarr} />
                    </div>
                  ) : (
                    <span className="text-emerald-400 text-sm">{t('✓ En tu biblioteca')}</span>
                  )
                ) : (
                  vm.tmdb_id && <RadarrButton tmdbId={vm.tmdb_id} alreadyInRadarr={vm.inRadarr} />
                )}
              </div>
              {/* solo para lo que está en tu biblioteca: una ficha de TMDB
                  suelta no tiene emparejado que corregir */}
              {ratingKey && (
                <div className="mt-3">
                  <button
                    onClick={() => setCorrigiendo(true)}
                    className="text-[11px] text-zinc-500 hover:text-gold-400 cursor-pointer"
                    title={t('Elegir a mano su ficha de TMDB')}
                  >
                    ✎ {vm.tmdbLocked ? t('emparejado a mano') : t('corregir emparejado con TMDB')}
                  </button>
                </div>
              )}
              {owned?.file_path && <div className="mt-2 text-[11px] text-zinc-600 break-all">{owned.file_path}</div>}
            </div>
          </>
        )}
      </div>
      {corrigiendo && vm && (
        <MatchCorrector
          kind="movie"
          title={vm.title}
          initialQuery={vm.originalTitle || vm.title}
          year={vm.year}
          subtitle={t('Elige su ficha de TMDB. De ahí salen las notas, el reparto y el completismo de su gente. La corrección se recuerda y sobrevive a las sincronizaciones de Plex.')}
          onPick={fijarPelicula}
          onClear={vm.tmdbLocked ? () => fijarPelicula(null) : null}
          clearLabel={t('Quitar la corrección y volver a lo que diga Plex')}
          onClose={() => setCorrigiendo(false)}
        />
      )}
    </div>
  );
}
