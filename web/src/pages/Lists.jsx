import { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Spinner, ErrorBox, Empty, ProgressBar, MovieModal, MediaModal, PageHeader, RadarrButton, useRadarrIds,
} from '../components.jsx';
import { toast } from '../toast.js';
import { addBulkToRadarr } from '../radarr.js';
import { useChartTheme } from '../charts.js';

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
    toast(`⚠️ ${r?.error || 'No encuentro esta película en TMDB'}`, 'error');
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
        title={`${item.title} — ver ficha`}
      >
        {item.title} <span className="text-zinc-500">({item.year ?? '¿?'})</span>
        {resolving && <span className="text-zinc-500"> · buscando…</span>}
      </button>
      <span className="ml-auto flex items-center gap-2 shrink-0 text-xs">
        {item.movie_id && <span className="text-gold-400" title="En tu Plex">📀</span>}
        {item.watched && <span className="text-emerald-400" title="Vista">👁️</span>}
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
      msg: res.error ? `⚠️ ${res.error}` : `✓ ${res.added} añadidas${res.alreadyInRadarr ? ` · ${res.alreadyInRadarr} ya estaban` : ''}${res.failed ? ` · ${res.failed} fallaron` : ''}`,
    });
  };

  return (
    <div className="mt-3">
      <div className="flex gap-2 mb-2 flex-wrap items-center">
        <button className={`btn-ghost !py-1 text-xs ${view === 'missing' ? '!border-gold-400 text-gold-400' : ''}`} onClick={() => setView('missing')}>No tengo ({missing.length})</button>
        <button className={`btn-ghost !py-1 text-xs ${view === 'owned' ? '!border-gold-400 text-gold-400' : ''}`} onClick={() => setView('owned')}>Tengo ({owned.length})</button>
        <button className={`btn-ghost !py-1 text-xs ${view === 'unwatched' ? '!border-gold-400 text-gold-400' : ''}`} onClick={() => setView('unwatched')}>Sin ver ({unwatched.length})</button>
        {missing.length > 0 && (
          <button className="btn-gold !py-1 text-xs ml-auto" onClick={sendMissing} disabled={bulk.running}>
            {bulk.running ? 'Resolviendo en TMDB…' : `➕ Mandar las ${Math.min(missing.length, 300)} que faltan a Radarr`}
          </button>
        )}
      </div>
      {bulk.msg && <div className="text-xs text-emerald-400 mb-2">{bulk.msg}</div>}
      {shown.length === 0 ? (
        <Empty>{view === 'missing' ? '¡Lista completa! 🏆' : view === 'unwatched' ? 'Todas vistas 👁️' : 'Ninguna todavía.'}</Empty>
      ) : (
        <div className="max-h-96 overflow-y-auto card divide-y divide-ink-800">
          {shown.map((i, idx) => (
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
            <span title="En tu Plex"><b className="text-gold-400">{l.owned || 0}</b>/{l.item_count} tengo</span>
            <span title="Vistas (Plex o Letterboxd)"><b className="text-emerald-400">{l.watched || 0}</b>/{l.item_count} vistas</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 mt-1 text-xs">
            {l.url && <a href={l.url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-gold-400">Letterboxd ↗</a>}
            <button
              className="text-zinc-500 hover:text-gold-400"
              title={l.hidden ? 'Mostrar' : 'Ocultar este reto'}
              onClick={async () => { await api(`/letterboxd/lists/${l.id}/hide`, { method: 'POST', body: { hidden: !l.hidden } }); load(); }}
            >
              {l.hidden ? '👁 Mostrar' : '🚫 Ocultar'}
            </button>
            <button
              className="text-zinc-500 hover:text-red-400"
              title="Quitar reto"
              onClick={async () => { await api(`/letterboxd/lists/${l.id}`, { method: 'DELETE' }); if (open === l.id) setOpen(null); load(); }}
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
function LbWatchlist() {
  const [summary, setSummary] = useState(null);
  const [radarrIds, addRadarrId] = useRadarrIds();
  useEffect(() => {
    api('/letterboxd/summary').then((s) => !s?.error && setSummary(s));
  }, []);
  const missing = summary?.watchlistMissing || [];
  const owned = summary?.watchlistOwned || [];
  if (!summary || (!missing.length && !owned.length)) return null;

  return (
    <div className="card p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h2 className="font-semibold text-zinc-100">
          Watchlist de Letterboxd <span className="text-zinc-500 text-xs font-normal">· te faltan {missing.length} en Plex</span>
        </h2>
      </div>
      {missing.length === 0 ? (
        <Empty>Tu watchlist entera está en Plex. 🏆</Empty>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {missing.map((m, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-ink-800 text-sm gap-2">
              <span className="text-zinc-200 min-w-0 truncate">
                {m.title} <span className="text-zinc-500">({m.year ?? '¿?'})</span>
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
        </div>
      )}
      {owned.length > 0 && (
        <details className="mt-3">
          <summary className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-200">
            Ver las {owned.length} de tu watchlist que ya tienes
          </summary>
          <div className="max-h-64 overflow-y-auto mt-2">
            {owned.map((m, i) => (
              <div key={i} className="py-1 border-b border-ink-800 text-sm text-zinc-300">
                ✓ {m.title} <span className="text-zinc-500">({m.year})</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function LetterboxdChallenges() {
  const [lists, setLists] = useState(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [mode, setMode] = useState('both'); // owned | watched | both
  const [showHidden, setShowHidden] = useState(false);

  const load = () => api('/letterboxd/lists').then((r) => setLists(Array.isArray(r) ? r : []));
  useEffect(() => { load(); }, []);

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

  if (!lists) return <Spinner />;
  const visible = lists.filter((l) => !l.hidden);
  const hidden = lists.filter((l) => l.hidden);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-lg font-semibold text-zinc-100">Anillos de completista</h2>
        <div className="flex gap-1">
          {[['owned', '📀 Tengo'], ['watched', '👁️ Visto'], ['both', 'Ambos']].map(([v, label]) => (
            <button key={v} onClick={() => setMode(v)} className={`btn-ghost !py-1 text-xs ${mode === v ? '!border-gold-400 text-gold-400' : ''}`}>{label}</button>
          ))}
        </div>
      </div>
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        Tus listas de Letterboxd como anillos de completismo. El anillo <span className="text-gold-400 font-semibold">exterior</span> son
        las que <b>tienes en Plex</b>; el <span className="text-emerald-400 font-semibold">interior</span>, las que <b>has visto</b> (Plex o Letterboxd).
        Importa el zip en <a href="/letterboxd" className="text-gold-400 hover:underline">Letterboxd</a> o pega la URL de cualquier lista pública.
      </p>

      <form onSubmit={addByUrl} className="card p-4 mb-6 flex gap-2 max-w-2xl">
        <input className="input" placeholder="Pega una lista: https://letterboxd.com/usuario/list/slug/" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn-gold shrink-0" disabled={busy}>{busy ? 'Leyendo…' : 'Añadir'}</button>
      </form>
      {error && <ErrorBox error={error} />}

      {visible.length === 0 && hidden.length === 0 ? (
        <Empty>Aún no hay listas de Letterboxd. Importa tu zip o pega una URL.</Empty>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visible.map((l) => <ChallengeCard key={l.id} l={l} mode={mode} open={open} setOpen={setOpen} load={load} />)}
        </div>
      )}

      {hidden.length > 0 && (
        <div className="mt-6">
          <button className="text-sm text-zinc-400 hover:text-gold-400" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? '▾' : '▸'} Retos ocultos ({hidden.length})
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
        title={`${item.title} — ver ficha`}
        onClick={() => (item.owned && item.rating_key ? onOpenOwned(item.rating_key) : setFicha(true))}
      >
        {item.title} <span className="text-zinc-500">({item.year ?? '¿?'})</span>
      </button>
      <span className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0 text-xs text-zinc-500">
        {item.imdb != null && <span className="hidden sm:inline">IMDb {Number(item.imdb).toFixed(1)}</span>}
        {item.owned ? (
          <span className="text-emerald-400">✓{item.view_count > 0 ? ' vista' : ''}</span>
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
    const { summary } = await addBulkToRadarr(missing.map((i) => i.tmdb_id), { onAdded: addRadarrId, target: '' });
    setBulk({ running: false, summary });
  };

  return (
    <div className="mt-4">
      <div className="flex gap-2 items-center flex-wrap mb-3">
        <button className={view === 'missing' ? 'btn-gold' : 'btn-ghost'} onClick={() => setView('missing')}>
          Te faltan ({missing.length})
        </button>
        <button className={view === 'owned' ? 'btn-gold' : 'btn-ghost'} onClick={() => setView('owned')}>
          Las tienes ({owned.length})
        </button>
        {missing.length > 0 && (
          <button className="btn-gold ml-auto" onClick={bulkAdd} disabled={bulk.running}>
            {bulk.running ? 'Añadiendo…' : `➕ Añadir ${Math.min(missing.length, 300)} a Radarr`}
          </button>
        )}
        {bulk.summary && <span className="text-xs text-emerald-400 w-full">{bulk.summary}</span>}
      </div>
      {shown.length === 0 ? (
        <Empty>{view === 'missing' ? '¡Lista completa! 🏆' : 'Ninguna todavía.'}</Empty>
      ) : (
        <div className="max-h-96 overflow-y-auto card divide-y divide-ink-800">
          {shown.map((i) => (
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
      {selected && <MovieModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

export default function Lists() {
  const [lists, setLists] = useState(null);
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState('letterboxd');

  const load = () => api('/mdblist/lists').then((r) => setLists(Array.isArray(r) ? r : []));
  useEffect(() => {
    load();
  }, []);

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

  if (!lists) return <Spinner />;

  return (
    <div>
      <PageHeader eyebrow="La caza" title="Listas y retos" />
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        Convierte listas famosas en retos de completismo: qué % tienes, qué has visto, qué te falta y envío a Radarr.
      </p>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('letterboxd')} className={tab === 'letterboxd' ? 'btn-gold' : 'btn-ghost'}>🟠 Retos de Letterboxd</button>
        <button onClick={() => setTab('mdblist')} className={tab === 'mdblist' ? 'btn-gold' : 'btn-ghost'}>Listas de MDBList</button>
      </div>

      {tab === 'letterboxd' ? (
        <>
          <LbWatchlist />
          <LetterboxdChallenges />
        </>
      ) : (
      <>
      <p className="text-sm text-zinc-500 mb-5 max-w-3xl">
        Sigue listas de MDBList (1001 películas, palmarés de premios, tops de la comunidad…). Necesita la API key de
        MDBList en Ajustes.
      </p>

      <div className="card p-4 mb-6 grid md:grid-cols-2 gap-4">
        <form onSubmit={addByUrl} className="flex gap-2">
          <input
            className="input"
            placeholder="Pega una URL: https://mdblist.com/lists/usuario/lista"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="btn-gold shrink-0" disabled={busy}>Añadir</button>
        </form>
        <form onSubmit={search} className="flex gap-2">
          <input
            className="input"
            placeholder="…o busca listas: «1001 movies», «palme d'or»"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-ghost shrink-0" disabled={busy}>Buscar</button>
        </form>
      </div>

      {error && <ErrorBox error={error} />}
      {busy && !results && <Spinner label="Consultando MDBList…" />}

      {results && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Resultados ({results.length})</h3>
          {results.length === 0 && <Empty>Nada encontrado.</Empty>}
          <div className="divide-y divide-ink-800">
            {results.slice(0, 20).map((r) => (
              <div key={r.mdb_id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="text-zinc-200 truncate">{r.name}</div>
                  <div className="text-xs text-zinc-500">
                    de {r.user_name ?? '¿?'} · {r.item_count ?? '¿?'} títulos{r.likes != null && ` · ${r.likes} ❤`}
                  </div>
                </div>
                <button className="btn-gold ml-auto shrink-0" onClick={() => addFromSearch(r)} disabled={busy}>
                  Seguir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {lists.length === 0 ? (
        <Empty>No sigues ninguna lista todavía. Añade una por URL o búscala arriba.</Empty>
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
                    className="text-zinc-500 hover:text-gold-400"
                    title="Actualizar la lista desde MDBList"
                    onClick={async () => {
                      await api(`/mdblist/lists/${l.id}/refresh`, { method: 'POST' });
                      load();
                    }}
                  >
                    ↻
                  </button>
                  <button
                    className="text-zinc-500 hover:text-red-400"
                    title="Dejar de seguir"
                    onClick={async () => {
                      await api(`/mdblist/lists/${l.id}`, { method: 'DELETE' });
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
      )}
    </div>
  );
}
