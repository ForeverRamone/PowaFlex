import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Spinner, ErrorBox, Empty, ProgressBar, MovieModal } from '../components.jsx';

// --- Letterboxd completista rings -------------------------------------------

// Two concentric rings: owned (Plex, gold) on the outside, watched (green) inside.
function DualRing({ ownedPct, watchedPct, mode, size = 64 }) {
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
          <circle cx={cx} cy={cx} r={r1} fill="none" stroke="#252d42" strokeWidth={s} />
          <circle cx={cx} cy={cx} r={r1} fill="none" stroke="#e8b53a" strokeWidth={s} strokeDasharray={c(r1)} strokeDashoffset={off(r1, ownedPct)} strokeLinecap="round" />
        </>
      )}
      {showWatched && (
        <>
          <circle cx={cx} cy={cx} r={r2} fill="none" stroke="#1c2740" strokeWidth={s} />
          <circle cx={cx} cy={cx} r={r2} fill="none" stroke="#34d399" strokeWidth={s} strokeDasharray={c(r2)} strokeDashoffset={off(r2, watchedPct)} strokeLinecap="round" />
        </>
      )}
      <text x="50%" y="50%" transform={`rotate(90 ${cx} ${cx})`} textAnchor="middle" dominantBaseline="central" className="fill-slate-200" style={{ fontSize: 12, fontWeight: 700 }}>
        {headline}%
      </text>
    </svg>
  );
}

function ChallengeDetail({ listId, onChanged }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState('missing');
  const [selected, setSelected] = useState(null);
  const [bulk, setBulk] = useState({ running: false, msg: null });

  const reload = () => api(`/letterboxd/lists/${listId}`).then(setData);
  useEffect(() => { setData(null); reload(); }, [listId]);
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
            <div key={idx} className="flex items-center gap-3 px-4 py-1.5 text-sm">
              {i.position != null && <span className="text-slate-600 w-8 text-right shrink-0">{i.position}.</span>}
              {i.movie_id ? (
                <button className="text-slate-200 hover:text-gold-400 truncate text-left" onClick={() => setSelected(i.movie_id)}>
                  {i.title} <span className="text-slate-500">({i.year ?? '¿?'})</span>
                </button>
              ) : (
                <span className="text-slate-300 truncate">{i.title} <span className="text-slate-500">({i.year ?? '¿?'})</span></span>
              )}
              <span className="ml-auto flex items-center gap-2 shrink-0 text-xs">
                {i.movie_id && <span className="text-gold-400" title="En tu Plex">📀</span>}
                {i.watched && <span className="text-emerald-400" title="Vista">👁️</span>}
              </span>
            </div>
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
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <DualRing ownedPct={ownedPct} watchedPct={watchedPct} mode={mode} />
        <div className="min-w-0 flex-1">
          <button
            className="font-medium text-slate-100 hover:text-gold-400 text-left text-sm block truncate w-full"
            onClick={() => setOpen(open === l.id ? null : l.id)}
            title={l.name}
          >
            {l.official ? '🏅 ' : ''}{l.name}
          </button>
          <div className="text-xs text-slate-400 mt-1 flex gap-3">
            <span title="En tu Plex"><b className="text-gold-400">{l.owned || 0}</b>/{l.item_count} tengo</span>
            <span title="Vistas (Plex o Letterboxd)"><b className="text-emerald-400">{l.watched || 0}</b>/{l.item_count} vistas</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs">
            {l.url && <a href={l.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-gold-400">Letterboxd ↗</a>}
            <button
              className="text-slate-500 hover:text-gold-400"
              title={l.hidden ? 'Mostrar' : 'Ocultar este reto'}
              onClick={async () => { await api(`/letterboxd/lists/${l.id}/hide`, { method: 'POST', body: { hidden: !l.hidden } }); load(); }}
            >
              {l.hidden ? '👁 Mostrar' : '🚫 Ocultar'}
            </button>
            <button
              className="text-slate-500 hover:text-red-400"
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
        <h2 className="text-lg font-semibold text-slate-100">Anillos de completista</h2>
        <div className="flex gap-1">
          {[['owned', '📀 Tengo'], ['watched', '👁️ Visto'], ['both', 'Ambos']].map(([v, label]) => (
            <button key={v} onClick={() => setMode(v)} className={`btn-ghost !py-1 text-xs ${mode === v ? '!border-gold-400 text-gold-400' : ''}`}>{label}</button>
          ))}
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-4 max-w-3xl">
        Tus listas de Letterboxd como anillos de completismo. Anillo exterior <span className="text-gold-400">dorado</span> = las que
        <b> tienes en Plex</b>; anillo interior <span className="text-emerald-400">verde</span> = las que <b>has visto</b> (Plex o Letterboxd).
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
          <button className="text-sm text-slate-400 hover:text-gold-400" onClick={() => setShowHidden(!showHidden)}>
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

function ListDetail({ listId, onChanged }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState('missing');
  const [bulk, setBulk] = useState({ running: false, summary: null });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setData(null);
    api(`/mdblist/lists/${listId}`).then(setData);
  }, [listId]);

  if (!data) return <Spinner />;
  const items = data.items || [];
  const missing = items.filter((i) => !i.owned);
  const owned = items.filter((i) => i.owned);
  const shown = view === 'missing' ? missing : owned;

  const bulkAdd = async () => {
    setBulk({ running: true, summary: null });
    const res = await api('/radarr/add-bulk', {
      method: 'POST',
      body: { tmdbIds: missing.slice(0, 300).map((i) => i.tmdb_id) },
    });
    setBulk({
      running: false,
      summary: res.error
        ? `⚠️ ${res.error}`
        : `✓ ${res.added} añadidas${res.alreadyInRadarr ? ` · ${res.alreadyInRadarr} ya estaban` : ''}${res.failed ? ` · ⚠️ ${res.failed} fallaron` : ''}`,
    });
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
            <div key={i.tmdb_id} className="flex items-center gap-3 px-4 py-1.5 text-sm">
              {i.rank != null && <span className="text-slate-600 w-10 text-right shrink-0">{i.rank}.</span>}
              {i.owned && i.rating_key ? (
                <button className="text-slate-200 hover:text-gold-400 truncate text-left" onClick={() => setSelected(i.rating_key)}>
                  {i.title} <span className="text-slate-500">({i.year ?? '¿?'})</span>
                </button>
              ) : (
                <span className="text-slate-300 truncate">
                  {i.title} <span className="text-slate-500">({i.year ?? '¿?'})</span>
                </span>
              )}
              <span className="ml-auto flex items-center gap-3 shrink-0 text-xs text-slate-500">
                {i.imdb != null && <span>IMDb {Number(i.imdb).toFixed(1)}</span>}
                {i.owned ? (
                  <span className="text-emerald-400">✓{i.view_count > 0 ? ' vista' : ''}</span>
                ) : null}
              </span>
            </div>
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
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Listas y retos</h1>
      <p className="text-sm text-slate-500 mb-4 max-w-3xl">
        Convierte listas famosas en retos de completismo: qué % tienes, qué has visto, qué te falta y envío a Radarr.
      </p>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('letterboxd')} className={tab === 'letterboxd' ? 'btn-gold' : 'btn-ghost'}>🟠 Retos de Letterboxd</button>
        <button onClick={() => setTab('mdblist')} className={tab === 'mdblist' ? 'btn-gold' : 'btn-ghost'}>Listas de MDBList</button>
      </div>

      {tab === 'letterboxd' ? (
        <LetterboxdChallenges />
      ) : (
      <>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
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
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Resultados ({results.length})</h3>
          {results.length === 0 && <Empty>Nada encontrado.</Empty>}
          <div className="divide-y divide-ink-800">
            {results.slice(0, 20).map((r) => (
              <div key={r.mdb_id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="text-slate-200 truncate">{r.name}</div>
                  <div className="text-xs text-slate-500">
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
                  className="font-semibold text-slate-100 hover:text-gold-400 text-left"
                  onClick={() => setOpen(open === l.id ? null : l.id)}
                >
                  {open === l.id ? '▾' : '▸'} {l.name}
                </button>
                <div className="text-xs text-slate-400 flex items-center gap-3">
                  <span>
                    <b className="text-gold-400">{l.owned || 0}</b> / {l.items} · {pct}%
                  </span>
                  {l.url && (
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-gold-400">
                      MDBList ↗
                    </a>
                  )}
                  <button
                    className="text-slate-500 hover:text-gold-400"
                    title="Actualizar la lista desde MDBList"
                    onClick={async () => {
                      await api(`/mdblist/lists/${l.id}/refresh`, { method: 'POST' });
                      load();
                    }}
                  >
                    ↻
                  </button>
                  <button
                    className="text-slate-500 hover:text-red-400"
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
