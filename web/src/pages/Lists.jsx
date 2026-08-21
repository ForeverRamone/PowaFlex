import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import {
  Spinner, Progreso, useCargaProgresiva, ErrorBox, Empty, ProgressBar, MovieModal, MediaModal,
  PageHeader, RadarrButton, useRadarrIds,
} from '../components.jsx';
import { toast } from '../toast.js';
import { addBulkToRadarr } from '../radarr.js';
import { useChartTheme } from '../charts.js';
import { t } from '../i18n.js';

/**
 * Cuántas filas entran de golpe en una lista larga.
 *
 * Aquí las listas no son de veinte títulos: una de MDBList trae cinco mil y el
 * reto clásico de Letterboxd mil y pico, y todas se pintaban ENTERAS dentro de
 * un recuadro de 384 px de alto donde caben doce filas. Medido con una lista de
 * 5.000: 21.257 nodos en el DOM para enseñar doce. El resto entra al bajar,
 * como la parrilla de Festivales.
 */
const TRAMO = 100;

/**
 * Recuadro con scroll que pinta su contenido por tramos.
 *
 * OJO con el `root` del observador: estas listas NO scrollean con la página,
 * scrollean dentro de su propia caja. Un observador contra la ventana no se
 * entera de que el usuario está bajando ahí dentro y el tramo siguiente no
 * entraba nunca. El sentinel va dentro de la caja, y la caja es el root.
 *
 * `reinicio` es la dependencia que devuelve la lista al primer tramo: cambiar
 * de vista («me faltan» ↔ «las tengo») tiene que empezar arriba otra vez, no
 * heredar los quince tramos que llevaba abierta la anterior.
 */
function CajaPorTramos({ items, reinicio, children, className = '', alto = 'max-h-96' }) {
  const [tramos, setTramos] = useState(1);
  const caja = useRef(null);
  const sentinel = useRef(null);
  useEffect(() => {
    setTramos(1);
    if (caja.current) caja.current.scrollTop = 0;
  }, [reinicio]);
  const pintados = items.slice(0, tramos * TRAMO);
  const faltan = pintados.length < items.length;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !faltan) return;
    // margen generoso: el tramo siguiente entra antes de que el hueco se vea
    const io = new IntersectionObserver(
      (entradas) => entradas.some((e) => e.isIntersecting) && setTramos((n) => n + 1),
      { root: caja.current, rootMargin: '400px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [faltan, tramos, items.length]);
  return (
    <div ref={caja} className={`${alto} overflow-y-auto ${className}`}>
      {children(pintados)}
      {/* fuera del contenedor con `divide-y`: dentro se llevaba una línea
          divisoria suya y parecía una fila vacía al final de la lista */}
      {faltan && <div ref={sentinel} className="h-4" aria-hidden="true" />}
    </div>
  );
}

// --- Letterboxd completista rings -------------------------------------------

// Two concentric rings: owned (Plex, accent) on the outside, watched (green)
// inside. Colours come from the theme: the old navy tracks belonged to the dark
// look and sat like ink stains on «Cartelera»'s paper.
function DualRing({ ownedPct, watchedPct, mode, size = 64 }) {
  const ch = useChartTheme();
  const s = 5;
  const r1 = size / 2 - s / 2 - 1;
  const r2 = r1 - s - 2;
  const c = (r) => 2 * Math.PI * r;
  const off = (r, pct) => c(r) * (1 - Math.min(100, pct) / 100);
  const cx = size / 2;
  const showOwned = mode !== 'watched';
  const showWatched = mode !== 'owned';
  const headline = mode === 'watched' ? watchedPct : ownedPct;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      {showOwned && (
        <>
          <circle cx={cx} cy={cx} r={r1} fill="none" stroke={ch.muted} strokeWidth={s} />
          <circle cx={cx} cy={cx} r={r1} fill="none" stroke={ch.accent} strokeWidth={s} strokeDasharray={c(r1)} strokeDashoffset={off(r1, ownedPct)} strokeLinecap="round" />
        </>
      )}
      {showWatched && (
        <>
          <circle cx={cx} cy={cx} r={r2} fill="none" stroke={ch.muted} strokeWidth={s} opacity={0.6} />
          <circle cx={cx} cy={cx} r={r2} fill="none" stroke={ch.positive} strokeWidth={s} strokeDasharray={c(r2)} strokeDashoffset={off(r2, watchedPct)} strokeLinecap="round" />
        </>
      )}
      <text x="50%" y="50%" transform={`rotate(90 ${cx} ${cx})`} textAnchor="middle" dominantBaseline="central" className="fill-zinc-200" style={{ fontSize: 12, fontWeight: 700 }}>
        {headline}%
      </text>
    </svg>
  );
}

/**
 * One row of a challenge list. Films you don't have often reach us with just a
 * title and a year, so the TMDB id is resolved on the first click — then the
 * row behaves like any card in the app: opens its ficha and goes to Radarr on
 * its own, without having to send the whole list (#7).
 */
function ChallengeRow({ listId, item, radarrIds, onAdded, onOpenOwned }) {
  const [tmdbId, setTmdbId] = useState(item.tmdb_id || null);
  const [ficha, setFicha] = useState(false);
  const [resolving, setResolving] = useState(false);

  const ensureId = async () => {
    if (tmdbId) return tmdbId;
    setResolving(true);
    const r = await api(`/letterboxd/lists/${listId}/resolve-item`, {
      method: 'POST',
      body: { title: item.title, year: item.year ?? null },
    });
    setResolving(false);
    if (r?.tmdbId) {
      setTmdbId(r.tmdbId);
      return r.tmdbId;
    }
    toast(`⚠️ ${t(r?.error || t('No encuentro esta película en TMDB'))}`, 'error');
    return null;
  };

  const openFicha = async () => {
    if (item.movie_id) return onOpenOwned(item.movie_id);
    if (await ensureId()) setFicha(true);
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 text-sm">
      {item.position != null && <span className="text-zinc-600 w-8 text-right shrink-0 tabular">{item.position}.</span>}
      <button
        className="text-zinc-200 hover:text-gold-400 truncate text-left min-w-0"
        onClick={openFicha}
        disabled={resolving}
        title={t('{title} — ver ficha', { title: item.title })}
      >
        {item.title} <span className="text-zinc-500">({item.year ?? t('¿?')})</span>
        {resolving && <span className="text-zinc-500">{t(' · buscando…')}</span>}
      </button>
      <span className="ml-auto flex items-center gap-2 shrink-0 text-xs">
        {item.movie_id && <span className="text-gold-400" title={t('En tu Plex')}>📀</span>}
        {item.watched && <span className="text-emerald-400" title={t('Vista')}>👁️</span>}
        {!item.movie_id && (
          <RadarrButton
            tmdbId={tmdbId}
            resolveTmdbId={ensureId}
            small
            inline
            alreadyInRadarr={!!tmdbId && radarrIds.has(tmdbId)}
            onAdded={onAdded}
          />
        )}
      </span>
      {ficha && tmdbId && <MediaModal tmdbId={tmdbId} onClose={() => setFicha(false)} />}
    </div>
  );
}

function ChallengeDetail({ listId, onChanged }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState('missing');
  const [selected, setSelected] = useState(null);
  const [bulk, setBulk] = useState({ running: false, msg: null });
  const [radarrIds, addRadarrId] = useRadarrIds();

  const reload = () => api(`/letterboxd/lists/${listId}`).then(setData);
  useEffect(() => { setData(null); reload(); }, [listId]);
  if (data?.error) return <ErrorBox error={data.error} />;
  if (!data) return <Spinner />;

  const items = data.items || [];
  const missing = items.filter((i) => !i.movie_id);
  const owned = items.filter((i) => i.movie_id);
  const unwatched = items.filter((i) => !i.watched);
  const shown = view === 'missing' ? missing : view === 'owned' ? owned : unwatched;

  const sendMissing = async () => {
    setBulk({ running: true, msg: null });
    const res = await api(`/letterboxd/lists/${listId}/radarr`, { method: 'POST' });
    setBulk({
      running: false,
      error: !!res.error,
      msg: res.error ? `⚠️ ${t(res.error)}` : `✓ ${t('{n} añadidas', { n: res.added })}${res.alreadyInRadarr ? ` · ${t('{n} ya estaban', { n: res.alreadyInRadarr })}` : ''}${res.failed ? ` · ${t('{n} fallaron', { n: res.failed })}` : ''}`,
    });
  };

  return (
    <div className="mt-3">
      <div className="flex gap-2 mb-2 flex-wrap items-center">
        {/* mismo vocabulario en primera persona que OwnFilterBar (Me faltan / Las tengo) */}
        <button className={`btn-ghost !py-1 text-xs ${view === 'missing' ? '!border-gold-400 text-gold-400' : ''}`} onClick={() => setView('missing')}>{t('Me faltan ({n})', { n: missing.length })}</button>
        <button className={`btn-ghost !py-1 text-xs ${view === 'owned' ? '!border-gold-400 text-gold-400' : ''}`} onClick={() => setView('owned')}>{t('Las tengo ({n})', { n: owned.length })}</button>
        <button className={`btn-ghost !py-1 text-xs ${view === 'unwatched' ? '!border-gold-400 text-gold-400' : ''}`} onClick={() => setView('unwatched')}>{t('Sin ver ({n})', { n: unwatched.length })}</button>
        {missing.length > 0 && (
          <button className="btn-gold !py-1 text-xs ml-auto" onClick={sendMissing} disabled={bulk.running}>
            {bulk.running ? t('Resolviendo en TMDB…') : t('➕ Mandar las {n} que faltan a Radarr', { n: Math.min(missing.length, 300) })}
          </button>
        )}
      </div>
      {/* en verde solo el éxito: un fallo vestido de emerald se lee como «hecho» */}
      {bulk.msg && <div className={`text-xs mb-2 ${bulk.error ? 'text-red-400' : 'text-emerald-400'}`}>{bulk.msg}</div>}
      {shown.length === 0 ? (
        <Empty>{view === 'missing' ? t('¡Lista completa! 🏆') : view === 'unwatched' ? t('Todas vistas 👁️') : t('Ninguna todavía.')}</Empty>
      ) : (
        <CajaPorTramos items={shown} reinicio={view} className="card">
          {(pintados) => (
            <div className="divide-y divide-ink-800">
              {pintados.map((i, idx) => (
                <ChallengeRow
                  key={`${i.tmdb_id || i.title}-${idx}`}
                  listId={listId}
                  item={i}
                  radarrIds={radarrIds}
                  onAdded={addRadarrId}
                  onOpenOwned={setSelected}
                />
              ))}
            </div>
          )}
        </CajaPorTramos>
      )}
      {selected && <MovieModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ChallengeCard({ l, mode, open, setOpen, load }) {
  const ownedPct = l.item_count ? Math.round(((l.owned || 0) / l.item_count) * 100) : 0;
  const watchedPct = l.item_count ? Math.round(((l.watched || 0) / l.item_count) * 100) : 0;
  return (
    // min-w-0: sin él la pista `1fr` del grid se dimensiona por el min-content
    // de la tarjeta y en móvil se sale de la pantalla
    <section className="card p-4 min-w-0">
      <div className="flex items-center gap-3">
        <DualRing ownedPct={ownedPct} watchedPct={watchedPct} mode={mode} />
        <div className="min-w-0 flex-1">
          <button
            className="font-medium text-zinc-100 hover:text-gold-400 text-left text-sm block truncate w-full"
            onClick={() => setOpen(open === l.id ? null : l.id)}
            title={l.name}
          >
            {l.official ? '🏅 ' : ''}{l.name}
          </button>
          <div className="text-xs text-zinc-400 mt-1 flex flex-wrap gap-x-3">
            <span title={t('En tu Plex')}><b className="text-gold-400">{l.owned || 0}</b>/{l.item_count} {t('tengo')}</span>
            <span title={t('Vistas (Plex o Letterboxd)')}><b className="text-emerald-400">{l.watched || 0}</b>/{l.item_count} {t('vistas')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 mt-1 text-xs">
            {l.url && <a href={l.url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-gold-400">Letterboxd ↗</a>}
            <button
              className="text-zinc-500 hover:text-gold-400"
              title={l.hidden ? t('Mostrar') : t('Ocultar este reto')}
              onClick={async () => { await api(`/letterboxd/lists/${l.id}/hide`, { method: 'POST', body: { hidden: !l.hidden } }); load(); }}
            >
              {l.hidden ? t('👁 Mostrar') : t('🚫 Ocultar')}
            </button>
            <button
              className="text-zinc-500 hover:text-red-400"
              title={t('Quitar reto')}
              onClick={async () => {
                // quitar el reto borra también su progreso importado: se pregunta
                // con el nombre delante para que la ✕ pequeña no se lleve otro
                if (!window.confirm(t('¿Quitar el reto «{name}»? Su progreso se pierde.', { name: l.name }))) return;
                const r = await api(`/letterboxd/lists/${l.id}`, { method: 'DELETE' });
                if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
                if (open === l.id) setOpen(null);
                load();
              }}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
      {open === l.id && <ChallengeDetail listId={l.id} />}
    </section>
  );
}

/**
 * Tu watchlist de Letterboxd es el reto más personal de todos; vivía en la
 * antigua página Letterboxd sin botón de Radarr (la única lista de faltantes
 * de la app sin él). Ahora vive aquí, y las que el emparejado ya resolvió a
 * TMDB se pueden pedir a Radarr directamente.
 */
// El resumen se lo pasa la pestaña, que lo pide junto a los retos y cuenta las
// dos esperas en la misma barra: pedirlo aquí dentro dejaba la sección sin
// avisar de nada mientras llegaban sus cien kilobytes.
function LbWatchlist({ summary }) {
  const [radarrIds, addRadarrId] = useRadarrIds();
  const missing = summary?.watchlistMissing || [];
  const owned = summary?.watchlistOwned || [];
  if (!summary || (!missing.length && !owned.length)) return null;

  return (
    <div className="card p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h2 className="font-semibold text-zinc-100">
          {t('Watchlist de Letterboxd')} <span className="text-zinc-500 text-xs font-normal">{t('· te faltan {n} en Plex', { n: missing.length })}</span>
        </h2>
      </div>
      {missing.length === 0 ? (
        <Empty>{t('Tu watchlist entera está en Plex. 🏆')}</Empty>
      ) : (
        <CajaPorTramos items={missing} reinicio={missing.length}>
          {(pintados) => pintados.map((m, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-ink-800 text-sm gap-2">
              <span className="text-zinc-200 min-w-0 truncate">
                {m.title} <span className="text-zinc-500">({m.year ?? t('¿?')})</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {m.tmdb_id && (
                  <RadarrButton tmdbId={m.tmdb_id} small alreadyInRadarr={radarrIds.has(m.tmdb_id)} onAdded={addRadarrId} />
                )}
                {m.uri && (
                  <a href={m.uri} target="_blank" rel="noreferrer" className="text-gold-400 text-xs hover:underline">
                    Letterboxd ↗
                  </a>
                )}
              </span>
            </div>
          ))}
        </CajaPorTramos>
      )}
      {owned.length > 0 && (
        <details className="mt-3">
          <summary className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-200">
            {t('Ver las {n} de tu watchlist que ya tienes', { n: owned.length })}
          </summary>
          <CajaPorTramos items={owned} reinicio={owned.length} alto="max-h-64" className="mt-2">
            {(pintados) => pintados.map((m, i) => (
              <div key={i} className="py-1 border-b border-ink-800 text-sm text-zinc-300">
                ✓ {m.title} <span className="text-zinc-500">({m.year})</span>
              </div>
            ))}
          </CajaPorTramos>
        </details>
      )}
    </div>
  );
}

function LetterboxdChallenges({ listasIniciales }) {
  const [lists, setLists] = useState(listasIniciales);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [mode, setMode] = useState('both'); // owned | watched | both
  const [showHidden, setShowHidden] = useState(false);

  // la primera lectura llega ya hecha desde la pestaña; esto es para después de
  // añadir, ocultar o quitar un reto
  const load = () => api('/letterboxd/lists').then((r) => setLists(Array.isArray(r) ? r : []));

  const addByUrl = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    const res = await api('/letterboxd/lists', { method: 'POST', body: { url: url.trim() } });
    setBusy(false);
    if (res.error) setError(res.error);
    else { setUrl(''); load(); }
  };

  const visible = (lists || []).filter((l) => !l.hidden);
  const hidden = (lists || []).filter((l) => l.hidden);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-lg font-semibold text-zinc-100">{t('Anillos de completista')}</h2>
        <div className="flex gap-1">
          {[['owned', '📀 Tengo'], ['watched', '👁️ Visto'], ['both', 'Ambos']].map(([v, label]) => (
            <button key={v} onClick={() => setMode(v)} className={`btn-ghost !py-1 text-xs ${mode === v ? '!border-gold-400 text-gold-400' : ''}`}>{t(label)}</button>
          ))}
        </div>
      </div>
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        {t('Tus listas de Letterboxd como anillos de completismo. El anillo ')}<span className="text-gold-400 font-semibold">{t('exterior')}</span>{t(' son las que ')}<b>{t('tienes en Plex')}</b>{t('; el ')}<span className="text-emerald-400 font-semibold">{t('interior')}</span>{t(', las que ')}<b>{t('has visto')}</b>{t(' (Plex o Letterboxd). Importa el zip en ')}<a href="/letterboxd" className="text-gold-400 hover:underline">Letterboxd</a>{t(' o pega la URL de cualquier lista pública.')}
      </p>

      <form onSubmit={addByUrl} className="card p-4 mb-6 flex gap-2 max-w-2xl">
        <input className="input" placeholder={t('Pega una lista: https://letterboxd.com/usuario/list/slug/')} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn-gold shrink-0" disabled={busy}>{busy ? t('Leyendo…') : t('Añadir')}</button>
      </form>
      {error && <ErrorBox error={error} />}

      {visible.length === 0 && hidden.length === 0 ? (
        <Empty>{t('Aún no hay listas de Letterboxd. Importa tu zip o pega una URL.')}</Empty>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visible.map((l) => <ChallengeCard key={l.id} l={l} mode={mode} open={open} setOpen={setOpen} load={load} />)}
        </div>
      )}

      {hidden.length > 0 && (
        <div className="mt-6">
          <button className="text-sm text-zinc-400 hover:text-gold-400" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? '▾' : '▸'} {t('Retos ocultos ({n})', { n: hidden.length })}
          </button>
          {showHidden && (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3 opacity-70">
              {hidden.map((l) => <ChallengeCard key={l.id} l={l} mode={mode} open={open} setOpen={setOpen} load={load} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// MDBList rows always carry a TMDB id, so the ficha and Radarr are one click.
function MdbRow({ item, radarrIds, onAdded, onOpenOwned }) {
  const [ficha, setFicha] = useState(false);
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 text-sm">
      {item.rank != null && <span className="text-zinc-600 w-10 text-right shrink-0 tabular">{item.rank}.</span>}
      <button
        className="text-zinc-200 hover:text-gold-400 truncate text-left min-w-0"
        title={t('{title} — ver ficha', { title: item.title })}
        onClick={() => (item.owned && item.rating_key ? onOpenOwned(item.rating_key) : setFicha(true))}
      >
        {item.title} <span className="text-zinc-500">({item.year ?? t('¿?')})</span>
      </button>
      <span className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0 text-xs text-zinc-500">
        {item.imdb != null && <span className="hidden sm:inline">IMDb {Number(item.imdb).toFixed(1)}</span>}
        {item.owned ? (
          <span className="text-emerald-400">✓{item.view_count > 0 ? t(' vista') : ''}</span>
        ) : (
          <RadarrButton
            tmdbId={item.tmdb_id}
            small
            inline
            alreadyInRadarr={radarrIds.has(item.tmdb_id)}
            onAdded={onAdded}
          />
        )}
      </span>
      {ficha && <MediaModal tmdbId={item.tmdb_id} onClose={() => setFicha(false)} />}
    </div>
  );
}

function ListDetail({ listId, onChanged }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState('missing');
  const [bulk, setBulk] = useState({ running: false, summary: null });
  const [selected, setSelected] = useState(null);
  const [radarrIds, addRadarrId] = useRadarrIds();

  useEffect(() => {
    setData(null);
    api(`/mdblist/lists/${listId}`).then(setData);
  }, [listId]);

  if (data?.error) return <ErrorBox error={data.error} />;
  if (!data) return <Spinner />;
  const items = data.items || [];
  const missing = items.filter((i) => !i.owned);
  const owned = items.filter((i) => i.owned);
  const shown = view === 'missing' ? missing : owned;

  const bulkAdd = async () => {
    setBulk({ running: true, summary: null });
    // sin «a Radarr» detrás: aquí el contexto ya es la lista y su botón
    const { summary, error } = await addBulkToRadarr(missing.map((i) => i.tmdb_id), { onAdded: addRadarrId, target: '' });
    setBulk({ running: false, summary, error: !!error });
  };

  return (
    <div className="mt-4">
      <div className="flex gap-2 items-center flex-wrap mb-3">
        {/* mismo vocabulario en primera persona que OwnFilterBar (Me faltan / Las tengo) */}
        <button className={view === 'missing' ? 'btn-gold' : 'btn-ghost'} onClick={() => setView('missing')}>
          {t('Me faltan ({n})', { n: missing.length })}
        </button>
        <button className={view === 'owned' ? 'btn-gold' : 'btn-ghost'} onClick={() => setView('owned')}>
          {t('Las tengo ({n})', { n: owned.length })}
        </button>
        {missing.length > 0 && (
          <button className="btn-gold ml-auto" onClick={bulkAdd} disabled={bulk.running}>
            {bulk.running ? t('Añadiendo…') : t('➕ Añadir {n} a Radarr', { n: Math.min(missing.length, 300) })}
          </button>
        )}
        {/* en verde solo el éxito: un fallo vestido de emerald se lee como «hecho» */}
        {bulk.summary && <span className={`text-xs w-full ${bulk.error ? 'text-red-400' : 'text-emerald-400'}`}>{bulk.summary}</span>}
      </div>
      {shown.length === 0 ? (
        <Empty>{view === 'missing' ? t('¡Lista completa! 🏆') : t('Ninguna todavía.')}</Empty>
      ) : (
        <CajaPorTramos items={shown} reinicio={view} className="card">
          {(pintados) => (
            <div className="divide-y divide-ink-800">
              {pintados.map((i) => (
                <MdbRow
                  key={i.tmdb_id}
                  item={i}
                  radarrIds={radarrIds}
                  onAdded={addRadarrId}
                  onOpenOwned={setSelected}
                />
              ))}
            </div>
          )}
        </CajaPorTramos>
      )}
      {selected && <MovieModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/**
 * La pestaña de Letterboxd, que es la que se abre al entrar: pide sus dos cosas
 * a la vez y las cuenta en la misma barra. Antes cada sección traía su propio
 * spinner mudo, y encima la página entera esperaba a las listas de MDBList —los
 * datos de la OTRA pestaña— antes de pintar nada de esta.
 */
function PanelLetterboxd() {
  const carga = useCargaProgresiva([
    { clave: 'resumen', etiqueta: t('Leyendo tu watchlist de Letterboxd…'), carga: () => api('/letterboxd/summary') },
    { clave: 'retos', etiqueta: t('Repasando tus retos en marcha…'), carga: () => api('/letterboxd/lists') },
  ], []);

  if (!carga.terminado) return <Progreso {...carga} />;
  const resumen = carga.datos.resumen;
  return (
    <>
      <LbWatchlist summary={resumen && !resumen.error ? resumen : null} />
      <LetterboxdChallenges listasIniciales={Array.isArray(carga.datos.retos) ? carga.datos.retos : []} />
    </>
  );
}

/** Las listas de MDBList, que solo se piden cuando se abre SU pestaña. */
function PanelMdblist() {
  const [lists, setLists] = useState(null);
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  // el ↻ de una lista puede tardar (MDBList + reemparejado): sin este estado el
  // botón parecía muerto y se pulsaba tres veces, encolando tres refrescos
  const [refreshingId, setRefreshingId] = useState(null);

  const refreshList = async (l) => {
    setRefreshingId(l.id);
    const r = await api(`/mdblist/lists/${l.id}/refresh`, { method: 'POST' });
    setRefreshingId(null);
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    toast(t('↻ «{name}» actualizada desde MDBList', { name: l.name }), 'success');
    load();
  };

  const load = () => api('/mdblist/lists').then((r) => setLists(Array.isArray(r) ? r : []));
  // una sola petición: barra indeterminada y sin porcentaje inventado
  const carga = useCargaProgresiva([
    { clave: 'listas', etiqueta: t('Buscando las listas que sigues en MDBList…'), carga: () => api('/mdblist/lists') },
  ], []);
  useEffect(() => {
    const r = carga.datos.listas;
    if (r) setLists(Array.isArray(r) ? r : []);
  }, [carga.datos.listas]);

  const addByUrl = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    const res = await api('/mdblist/lists', { method: 'POST', body: { url: url.trim() } });
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setUrl('');
      load();
    }
  };

  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setResults(null);
    const res = await api(`/mdblist/lists/search?query=${encodeURIComponent(query.trim())}`);
    setBusy(false);
    if (res.error) setError(res.error);
    else setResults(res);
  };

  const addFromSearch = async (r) => {
    setBusy(true);
    const res = await api('/mdblist/lists', {
      method: 'POST',
      body: { mdbId: r.mdb_id, name: r.name, slug: r.slug, userName: r.user_name },
    });
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setResults(null);
      setQuery('');
      load();
    }
  };

  if (!lists) return <Progreso {...carga} />;

  return (
    <>
      <p className="text-sm text-zinc-500 mb-5 max-w-3xl">
        {t('Sigue listas de MDBList (1001 películas, palmarés de premios, tops de la comunidad…). Necesita la API key de MDBList en Ajustes.')}
      </p>

      <div className="card p-4 mb-6 grid md:grid-cols-2 gap-4">
        <form onSubmit={addByUrl} className="flex gap-2">
          <input
            className="input"
            placeholder={t('Pega una URL: https://mdblist.com/lists/usuario/lista')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="btn-gold shrink-0" disabled={busy}>{t('Añadir')}</button>
        </form>
        <form onSubmit={search} className="flex gap-2">
          <input
            className="input"
            placeholder={t("…o busca listas: «1001 movies», «palme d'or»")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-ghost shrink-0" disabled={busy}>{t('Buscar')}</button>
        </form>
      </div>

      {error && <ErrorBox error={error} />}
      {busy && !results && <Spinner label={t('Consultando MDBList…')} />}

      {results && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">{t('Resultados ({n})', { n: results.length })}</h3>
          {results.length === 0 && <Empty>{t('Nada encontrado.')}</Empty>}
          <div className="divide-y divide-ink-800">
            {results.slice(0, 20).map((r) => (
              <div key={r.mdb_id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="text-zinc-200 truncate">{r.name}</div>
                  <div className="text-xs text-zinc-500">
                    {t('de {user} · {n} títulos', { user: r.user_name ?? t('¿?'), n: r.item_count ?? t('¿?') })}{r.likes != null && ` · ${r.likes} ❤`}
                  </div>
                </div>
                <button className="btn-gold ml-auto shrink-0" onClick={() => addFromSearch(r)} disabled={busy}>
                  {t('Seguir')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {lists.length === 0 ? (
        <Empty>{t('No sigues ninguna lista todavía. Añade una por URL o búscala arriba.')}</Empty>
      ) : (
        lists.map((l) => {
          const pct = l.items ? Math.round(((l.owned || 0) / l.items) * 100) : 0;
          return (
            <section key={l.id} className="card p-4 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <button
                  className="font-semibold text-zinc-100 hover:text-gold-400 text-left"
                  onClick={() => setOpen(open === l.id ? null : l.id)}
                >
                  {open === l.id ? '▾' : '▸'} {l.name}
                </button>
                <div className="text-xs text-zinc-400 flex items-center gap-3">
                  <span>
                    <b className="text-gold-400">{l.owned || 0}</b> / {l.items} · {pct}%
                  </span>
                  {l.url && (
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-gold-400">
                      MDBList ↗
                    </a>
                  )}
                  <button
                    className="text-zinc-500 hover:text-gold-400 disabled:opacity-40 disabled:animate-pulse"
                    title={t('Actualizar la lista desde MDBList')}
                    disabled={refreshingId === l.id}
                    onClick={() => refreshList(l)}
                  >
                    ↻
                  </button>
                  <button
                    className="text-zinc-500 hover:text-red-400"
                    title={t('Dejar de seguir')}
                    onClick={async () => {
                      // dejar de seguir borra el progreso calculado de la lista:
                      // se pregunta con el nombre para que la ✕ no se equivoque de fila
                      if (!window.confirm(t('¿Dejar de seguir «{name}»?', { name: l.name }))) return;
                      const r = await api(`/mdblist/lists/${l.id}`, { method: 'DELETE' });
                      if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
                      if (open === l.id) setOpen(null);
                      load();
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="max-w-md mt-2">
                <ProgressBar pct={pct} />
              </div>
              {open === l.id && <ListDetail listId={l.id} onChanged={load} />}
            </section>
          );
        })
      )}
    </>
  );
}

export default function Lists() {
  // cada pestaña pide LO SUYO y solo al abrirse: la de Letterboxd es la que se
  // pinta al entrar y no tiene por qué esperar a MDBList
  const [tab, setTab] = useState('letterboxd');

  return (
    <div>
      <PageHeader eyebrow={t('La caza')} title={t('Listas y retos')} />
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        {t('Convierte listas famosas en retos de completismo: qué % tienes, qué has visto, qué te falta y envío a Radarr.')}
      </p>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('letterboxd')} className={tab === 'letterboxd' ? 'btn-gold' : 'btn-ghost'}>{t('🟠 Retos de Letterboxd')}</button>
        <button onClick={() => setTab('mdblist')} className={tab === 'mdblist' ? 'btn-gold' : 'btn-ghost'}>{t('Listas de MDBList')}</button>
      </div>

      {tab === 'letterboxd' ? <PanelLetterboxd /> : <PanelMdblist />}
    </div>
  );
}
