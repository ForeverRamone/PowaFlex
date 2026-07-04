import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import { Spinner, Section, Empty, DeathBadge } from '../components.jsx';
import { toast } from '../toast.js';

// A TMDB person tile with a star to add/remove from favorites.
function SuggestionCard({ person, trackedIds, onAdd, onRemove }) {
  const isTracked = person.tracked || trackedIds.has(person.tmdb_id);
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="w-11 h-11 rounded-full overflow-hidden bg-ink-700 shrink-0 flex items-center justify-center">
        {person.profile_path ? (
          <img src={tmdbImg(person.profile_path, 'w185')} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="text-lg">🎬</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-200 truncate">{person.name}</div>
        <div className="text-[11px] text-slate-500 truncate">
          {person.dept ? `${person.dept === 'Directing' ? 'Dirección' : person.dept === 'Acting' ? 'Interpretación' : person.dept} · ` : ''}
          {(person.knownFor || []).join(', ')}
        </div>
      </div>
      <button
        onClick={() => (isTracked ? onRemove(person) : onAdd(person))}
        title={isTracked ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        className={`text-lg cursor-pointer shrink-0 ${isTracked ? 'text-gold-400' : 'text-ink-600 hover:text-slate-400'}`}
      >
        ★
      </button>
    </div>
  );
}

const ROLES = [
  ['director', 'Directores'],
  ['actor', 'Actores'],
  ['writer', 'Guionistas'],
];

export default function Favorites() {
  const [tracked, setTracked] = useState(null);
  const [role, setRole] = useState('director');
  const [ranking, setRanking] = useState(null);
  const [topN, setTopN] = useState(10);
  const [flash, setFlash] = useState('');
  const [rankLimit, setRankLimit] = useState(50);
  const [favView, setFavView] = useState('all'); // all | director | actor
  const [tab, setTab] = useState('mine'); // mine | discover
  const [suggest, setSuggest] = useState(null);
  const [pq, setPq] = useState('');
  const [presults, setPresults] = useState(null);
  const [searching, setSearching] = useState(false);

  const loadTracked = () => api('/tracked').then((r) => setTracked(Array.isArray(r) ? r : []));
  useEffect(() => {
    loadTracked();
    api('/people/suggestions').then((s) => !s.error && setSuggest(s));
  }, []);

  const trackedTmdb = new Set((tracked || []).map((t) => t.tmdb_id).filter(Boolean));
  const addTmdb = async (p) => {
    await api('/tracked/tmdb', { method: 'POST', body: { tmdbId: p.tmdb_id, name: p.name, profilePath: p.profile_path } });
    toast(`⭐ ${p.name} añadido a favoritos`, 'success');
    loadTracked();
  };
  const removeTmdb = async (p) => {
    const t = (tracked || []).find((x) => x.tmdb_id === p.tmdb_id);
    if (t) { await api(`/tracked/${t.id}`, { method: 'DELETE' }); toast(`${p.name} quitado de favoritos`); loadTracked(); }
  };
  const searchPeople = async (e) => {
    e.preventDefault();
    if (!pq.trim()) return;
    setSearching(true);
    const r = await api(`/people/search-tmdb?q=${encodeURIComponent(pq.trim())}`);
    setSearching(false);
    setPresults(Array.isArray(r) ? r : []);
  };

  useEffect(() => {
    setRanking(null);
    api(`/people?role=${role}&limit=${rankLimit}`).then((r) => setRanking(Array.isArray(r) ? r : []));
  }, [role, rankLimit]);

  const trackedIds = new Set((tracked || []).map((t) => t.id));

  const bulkAdd = async () => {
    const res = await api('/tracked/bulk', { method: 'POST', body: { role, top: Number(topN) } });
    if (res.ok) {
      setFlash(`✓ ${res.added} añadidos (${res.total - res.added} ya estaban)`);
      setTimeout(() => setFlash(''), 4000);
      loadTracked();
    }
  };

  const toggle = async (id) => {
    await api(`/tracked/${id}`, { method: trackedIds.has(id) ? 'DELETE' : 'POST' });
    loadTracked();
  };

  const clearAll = async () => {
    await api('/tracked/all', { method: 'DELETE' });
    loadTracked();
  };

  const clearDeceased = async () => {
    const r = await api('/tracked/deceased', { method: 'DELETE' });
    if (r.ok) {
      setFlash(`✓ ${r.removed} fallecidos retirados de favoritos`);
      setTimeout(() => setFlash(''), 4000);
      loadTracked();
    }
  };

  if (!tracked) return <Spinner />;
  const deceasedCount = tracked.filter((t) => t.deathday).length;
  const primaryRole = (t) => ((t.directed || 0) >= (t.acted || 0) ? 'director' : 'actor');
  const shownFavs = tracked.filter((t) => favView === 'all' || primaryRole(t) === favView);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Favoritos</h1>
      <p className="text-sm text-slate-500 mb-4 max-w-3xl">
        Tus directores y actores de cabecera. Todos los favoritos entran <b>siempre</b> en el calendario de{' '}
        <Link to="/calendario" className="text-gold-400 hover:underline">Cine venidero</Link> (además del top
        automático que configures en Ajustes).
      </p>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('mine')} className={tab === 'mine' ? 'btn-gold' : 'btn-ghost'}>⭐ Mis favoritos ({tracked.length})</button>
        <button onClick={() => setTab('discover')} className={tab === 'discover' ? 'btn-gold' : 'btn-ghost'}>🔍 Descubrir a quién seguir</button>
      </div>

      {/* bulk controls */}
      {tab === 'mine' && (
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {ROLES.map(([r, label]) => (
            <button key={r} onClick={() => setRole(r)} className={role === r ? 'btn-gold' : 'btn-ghost'}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-slate-400">Añadir los</span>
          <input
            type="number"
            min="1"
            max="1000"
            className="input !w-24 text-center"
            value={topN}
            onChange={(e) => setTopN(e.target.value)}
          />
          <span className="text-sm text-slate-400">primeros</span>
          <button className="btn-gold" onClick={bulkAdd}>⭐ Añadir</button>
        </div>
        {flash && <span className="text-emerald-400 text-sm w-full">{flash}</span>}
      </div>
      )}

      {/* add anyone by typing (#3) */}
      {tab === 'discover' && (
      <div className="card p-4 mb-6">
        <form onSubmit={searchPeople} className="flex gap-2 max-w-xl">
          <input className="input" placeholder="Añadir a favoritos por nombre (cualquier director o actor de TMDB)…" value={pq} onChange={(e) => setPq(e.target.value)} />
          <button className="btn-gold shrink-0" disabled={searching}>{searching ? 'Buscando…' : 'Buscar'}</button>
          {presults && <button type="button" className="btn-ghost shrink-0" onClick={() => { setPresults(null); setPq(''); }}>✕</button>}
        </form>
        {presults && (
          presults.length === 0 ? (
            <div className="text-sm text-slate-500 mt-3">Nadie con ese nombre en TMDB.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
              {presults.map((p) => <SuggestionCard key={p.tmdb_id} person={p} trackedIds={trackedTmdb} onAdd={addTmdb} onRemove={removeTmdb} />)}
            </div>
          )
        )}
      </div>
      )}

      {/* suggested directors (#1) */}
      {tab === 'discover' && suggest && (
        <div className="mb-8 space-y-6">
          {suggest.spanish?.length > 0 && (
            <Section title="🇪🇸 Directores españoles a seguir">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {suggest.spanish.map((p) => <SuggestionCard key={p.tmdb_id} person={p} trackedIds={trackedTmdb} onAdd={addTmdb} onRemove={removeTmdb} />)}
              </div>
            </Section>
          )}
          {suggest.popular?.length > 0 && (
            <Section title="🔥 Directores en el candelero (TMDB)">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {suggest.popular.map((p) => <SuggestionCard key={p.tmdb_id} person={p} trackedIds={trackedTmdb} onAdd={addTmdb} onRemove={removeTmdb} />)}
              </div>
            </Section>
          )}
        </div>
      )}

      {tab === 'mine' && (
      <div className="grid lg:grid-cols-2 gap-6">
        {/* ranking */}
        <Section title={`Ranking de ${ROLES.find(([r]) => r === role)[1].toLowerCase()} por títulos en tu Plex`}>
          {!ranking ? (
            <Spinner />
          ) : (
            <div className="card divide-y divide-ink-800 max-h-[70vh] overflow-y-auto">
              {ranking.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-slate-600 text-sm w-8 text-right shrink-0">{i + 1}.</span>
                  <Link
                    to={`/personas/${p.id}?role=${role}`}
                    className="text-sm text-slate-200 hover:text-gold-400 truncate flex-1"
                  >
                    {p.name}
                  </Link>
                  <span className="text-xs text-slate-500 shrink-0">{p.n} títulos</span>
                  <button
                    onClick={() => toggle(p.id)}
                    title={trackedIds.has(p.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    className={`text-lg cursor-pointer transition-colors shrink-0 ${
                      trackedIds.has(p.id) ? 'text-gold-400' : 'text-ink-600 hover:text-slate-400'
                    }`}
                  >
                    ★
                  </button>
                </div>
              ))}
              {ranking.length >= rankLimit && (
                <button
                  className="w-full py-2 text-xs text-slate-400 hover:text-gold-400 cursor-pointer"
                  onClick={() => setRankLimit((l) => l + 50)}
                >
                  Ver más
                </button>
              )}
            </div>
          )}
        </Section>

        {/* current favorites */}
        <Section
          title={`Tus favoritos (${tracked.length})`}
          action={
            tracked.length > 0 && (
              <div className="flex items-center gap-3">
                {deceasedCount > 0 && (
                  <button className="text-xs text-slate-400 hover:text-gold-400 cursor-pointer" onClick={clearDeceased}>
                    ✝ Quitar fallecidos ({deceasedCount})
                  </button>
                )}
                <button className="text-xs text-red-400 hover:underline cursor-pointer" onClick={clearAll}>
                  Vaciar todos
                </button>
              </div>
            )
          }
        >
          {tracked.length === 0 ? (
            <Empty>
              Aún no tienes favoritos. Añade los primeros del ranking de la izquierda, o marca «☆ Seguir» en la
              ficha de cualquier persona.
            </Empty>
          ) : (
            <>
            <div className="flex gap-2 mb-2">
              {[['all', 'Todos'], ['director', 'Directores'], ['actor', 'Actores']].map(([v, label]) => (
                <button key={v} onClick={() => setFavView(v)} className={`btn-ghost !py-1 text-xs ${favView === v ? '!border-gold-400 text-gold-400' : ''}`}>
                  {label} ({v === 'all' ? tracked.length : tracked.filter((t) => primaryRole(t) === v).length})
                </button>
              ))}
            </div>
            <div className="card divide-y divide-ink-800 max-h-[70vh] overflow-y-auto">
              {shownFavs.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-gold-400">★</span>
                  <Link
                    to={`/personas/${t.id}?role=${t.directed >= t.acted ? 'director' : 'actor'}`}
                    className="text-sm text-slate-200 hover:text-gold-400 truncate flex-1"
                  >
                    {t.name}
                  </Link>
                  <DeathBadge deathday={t.deathday} />
                  <span className="text-xs text-slate-500 shrink-0">
                    {t.directed > 0 && `${t.directed} dirigidas`}
                    {t.directed > 0 && t.acted > 0 && ' · '}
                    {t.acted > 0 && `${t.acted} actuadas`}
                  </span>
                  <button
                    onClick={() => toggle(t.id)}
                    title="Quitar de favoritos"
                    className="text-slate-500 hover:text-red-400 cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            </>
          )}
        </Section>
      </div>
      )}
    </div>
  );
}
