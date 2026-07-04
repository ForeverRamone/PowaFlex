import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Spinner, ErrorBox, Empty, ProgressBar, MovieModal } from '../components.jsx';

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
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Sigue listas de MDBList (1001 películas, palmarés de premios, tops de la comunidad…) y conviértelas en
        retos: qué % tienes, qué te falta y botón para monitorizarlo todo en Radarr. Necesita la API key de
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
    </div>
  );
}
