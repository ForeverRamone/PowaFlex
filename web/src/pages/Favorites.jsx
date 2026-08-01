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

// 'writer' removed: the rest of the flow (gaps, auto-Radarr) never supported
// it, so offering it here was a promise the product didn't keep
const ROLES = [
  ['director', 'Directores/as'],
  ['actor', 'Actores/actrices'],
];

// accent palette per curated pack (#9)
const ACCENTS = {
  red: { border: 'border-red-500', bg: 'bg-red-500/15', text: 'text-red-300' },
  gold: { border: 'border-gold-400', bg: 'bg-gold-400/15', text: 'text-gold-400' },
  emerald: { border: 'border-emerald-500', bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  sky: { border: 'border-sky-500', bg: 'bg-sky-500/15', text: 'text-sky-300' },
  orange: { border: 'border-orange-500', bg: 'bg-orange-500/15', text: 'text-orange-300' },
};

export default function Favorites() {
  const [tracked, setTracked] = useState(null);
  const [role, setRole] = useState('director');
  const [rankItems, setRankItems] = useState(null);
  const [rankMore, setRankMore] = useState(false);
  const [hideDead, setHideDead] = useState(false);
  const [lifeMsg, setLifeMsg] = useState('');
  const [updatingLife, setUpdatingLife] = useState(false);
  const [topN, setTopN] = useState(10);
  const [flash, setFlash] = useState('');
  const [favView, setFavView] = useState('all'); // all | director | actor
  const [tab, setTab] = useState('mine'); // mine | discover
  const [suggest, setSuggest] = useState(null);
  const [pq, setPq] = useState('');
  const [presults, setPresults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [packBusy, setPackBusy] = useState(null);
  const [bulkNames, setBulkNames] = useState('');
  const [bulkRole, setBulkRole] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [health, setHealth] = useState({ gaps: false, calendar: false });
  const [favSearch, setFavSearch] = useState('');
  const [favSort, setFavSort] = useState('titulos');
  const [pruneMode, setPruneMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [preview, setPreview] = useState(null); // top-N candidates awaiting confirmation
  const [confirmClear, setConfirmClear] = useState(false);

  // /tracked/health = the /tracked list enriched with gaps + upcoming from the
  // caches, so the list itself shows who still contributes
  const loadTracked = () =>
    api('/tracked/health').then((r) => {
      if (Array.isArray(r?.people)) {
        setTracked(r.people);
        setHealth(r.cached || {});
      } else if (Array.isArray(r)) setTracked(r);
    });
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
  const addByNames = async () => {
    if (!bulkNames.trim()) return;
    setBulkBusy(true);
    setBulkResult(null);
    const res = await api('/tracked/by-names', { method: 'POST', body: { names: bulkNames, role: bulkRole || null } });
    setBulkBusy(false);
    if (res.ok) {
      setBulkResult(res);
      toast(`⭐ ${res.added} añadidos a favoritos`, 'success');
      setBulkNames('');
      loadTracked();
    } else toast(`⚠️ ${res.error || 'error'}`, 'error');
  };
  const addPack = async (pack) => {
    setPackBusy(pack.key);
    const res = await api('/tracked/tmdb-bulk', {
      method: 'POST',
      body: { people: pack.people.map((p) => ({ tmdbId: p.tmdb_id, name: p.name, profilePath: p.profile_path })) },
    });
    setPackBusy(null);
    if (res.ok) { toast(`⭐ ${res.added} de «${pack.title}» añadidos a favoritos`, 'success'); loadTracked(); }
    else toast(`⚠️ ${res.error || 'error'}`, 'error');
  };
  const searchPeople = async (e) => {
    e.preventDefault();
    if (!pq.trim()) return;
    setSearching(true);
    const r = await api(`/people/search-tmdb?q=${encodeURIComponent(pq.trim())}`);
    setSearching(false);
    setPresults(Array.isArray(r) ? r : []);
  };

  const RANK_PAGE = 100;
  const loadRanking = (reset = true) => {
    const offset = reset ? 0 : rankItems?.length || 0;
    if (reset) setRankItems(null);
    api(`/people?role=${role}&limit=${RANK_PAGE}&offset=${offset}&hideDead=${hideDead ? '1' : '0'}`).then((r) => {
      const arr = Array.isArray(r) ? r : [];
      setRankItems((prev) => (reset ? arr : [...(prev || []), ...arr]));
      setRankMore(arr.length === RANK_PAGE);
    });
  };
  useEffect(() => { loadRanking(true); }, [role, hideDead]);

  const updateLife = async () => {
    setUpdatingLife(true);
    setLifeMsg('Consultando fechas de nacimiento/fallecimiento en TMDB…');
    const r = await api('/people/life-sync', { method: 'POST' });
    setUpdatingLife(false);
    setLifeMsg(r.error ? `✗ ${r.error}` : `✓ ${r.done} actualizadas · ${r.deceased} fallecidos/as detectados/as`);
    loadRanking(true);
    loadTracked();
  };

  const trackedIds = new Set((tracked || []).map((t) => t.id));

  // the old blind top-N add was the factory of favorite noise: preview first
  const bulkAdd = async () => {
    const res = await api('/tracked/bulk', { method: 'POST', body: { role, top: Number(topN), preview: true } });
    if (res.error) { toast(`⚠️ ${res.error}`, 'error'); return; }
    const candidates = res.candidates || [];
    if (!candidates.length) {
      setFlash('Nadie nuevo que añadir con ese criterio');
      setTimeout(() => setFlash(''), 4000);
      return;
    }
    setPreview({ candidates, checked: new Set(candidates.map((c) => c.id)) });
  };
  const togglePreview = (id) => {
    setPreview((p) => {
      const checked = new Set(p.checked);
      checked.has(id) ? checked.delete(id) : checked.add(id);
      return { ...p, checked };
    });
  };
  const confirmBulkAdd = async () => {
    const ids = preview.candidates.filter((c) => preview.checked.has(c.id)).map((c) => c.id);
    setPreview(null);
    if (!ids.length) return;
    const res = await api('/tracked/bulk', { method: 'POST', body: { personIds: ids } });
    if (res.ok) { toast(`⭐ ${res.added} añadidos a favoritos`, 'success'); loadTracked(); }
    else toast(`⚠️ ${res.error || 'error'}`, 'error');
  };

  const toggle = async (id, name) => {
    const wasFav = trackedIds.has(id);
    if (wasFav) setTracked((prev) => prev.filter((t) => t.id !== id)); // optimistic, no flicker
    await api(`/tracked/${id}`, { method: wasFav ? 'DELETE' : 'POST' });
    toast(wasFav ? `${name || 'Quitado'} fuera de favoritos` : `⭐ ${name || 'Añadido'} a favoritos`, wasFav ? 'info' : 'success');
    loadTracked();
  };

  // two-step confirmation: one accidental click used to wipe a curated list
  const clearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    const n = tracked?.length || 0;
    await api('/tracked/all', { method: 'DELETE' });
    toast(`Lista de favoritos vaciada (${n})`);
    loadTracked();
  };

  const pruneSelected = async () => {
    const ids = [...selected];
    const r = await api('/tracked/batch', { method: 'DELETE', body: { personIds: ids } });
    if (r.ok) {
      toast(`✂️ ${r.removed} favoritos quitados`);
      setSelected(new Set());
      setPruneMode(false);
      loadTracked();
    } else toast(`⚠️ ${r.error || 'error'}`, 'error');
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
  // don't mix roles (D): each tab shows only the matching role's films/count.
  // People with no library titles yet (added from TMDB) are treated as directors.
  const isDir = (t) => (t.directed || 0) > 0 || (t.acted || 0) === 0;
  const isAct = (t) => (t.acted || 0) > 0;
  const favRole = (t) => (favView === 'actor' ? 'actor' : favView === 'director' ? 'director' : primaryRole(t));
  const FAV_SORTS = {
    titulos: { label: 'Más títulos', fn: (a, b) => (b.movies || 0) - (a.movies || 0) },
    huecos: { label: 'Más huecos', fn: (a, b) => (b.gaps ?? -1) - (a.gaps ?? -1) },
    aporte: { label: 'Menos aporte primero', fn: (a, b) => ((a.gaps ?? 0) + (a.upcoming ?? 0)) - ((b.gaps ?? 0) + (b.upcoming ?? 0)) },
    nombre: { label: 'Nombre', fn: (a, b) => a.name.localeCompare(b.name) },
  };
  const shownFavs = tracked
    .filter((t) => (favView === 'all' ? true : favView === 'director' ? isDir(t) : isAct(t)))
    .filter((t) => !favSearch.trim() || t.name.toLowerCase().includes(favSearch.trim().toLowerCase()))
    .sort(FAV_SORTS[favSort]?.fn || FAV_SORTS.titulos.fn);
  const favCounts = {
    all: tracked.length,
    director: tracked.filter(isDir).length,
    actor: tracked.filter(isAct).length,
  };
  // safe-to-prune: no pending gaps and no announced projects (per the caches)
  const noContribution = (t) => t.gaps === 0 && (t.upcoming ?? 0) === 0;
  const toggleSelected = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Favoritos</h1>
      <p className="text-sm text-slate-500 mb-4 max-w-3xl">
        Tus directores/as y actores/actrices de cabecera. Todos los favoritos entran <b>siempre</b> en el calendario de{' '}
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
          <button className="btn-gold" onClick={bulkAdd}>⭐ Revisar y añadir</button>
        </div>
        {flash && <span className="text-emerald-400 text-sm w-full">{flash}</span>}
      </div>
      )}

      {/* top-N preview: see who you're about to follow before confirming */}
      {tab === 'mine' && preview && (
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h3 className="font-semibold text-slate-100">
              Vas a añadir {preview.checked.size} de {preview.candidates.length} — desmarca a quien no te interese
            </h3>
            <div className="flex gap-2">
              <button className="btn-gold !py-1" onClick={confirmBulkAdd} disabled={!preview.checked.size}>
                ⭐ Confirmar ({preview.checked.size})
              </button>
              <button className="btn-ghost !py-1" onClick={() => setPreview(null)}>Cancelar</button>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 max-h-72 overflow-y-auto">
            {preview.candidates.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-slate-300 py-0.5 cursor-pointer min-w-0">
                <input type="checkbox" checked={preview.checked.has(c.id)} onChange={() => togglePreview(c.id)} />
                <span className="truncate">{c.name}</span>
                <DeathBadge deathday={c.deathday} />
                <span className="text-[11px] text-slate-500 shrink-0 ml-auto">{c.n} títulos</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* add a whole pasted list of names at once */}
      {tab === 'discover' && (
      <div className="card p-4 mb-6">
        <h2 className="font-semibold text-slate-100 mb-1">Añadir una lista de nombres</h2>
        <p className="text-xs text-slate-500 mb-3 max-w-2xl">
          Pega directores/as y/o actores/actrices, <b>separados por comas o uno por línea</b>. PowaFlex los busca en
          TMDB y los añade todos de una vez a tus favoritos.
        </p>
        <textarea
          className="input !h-28 font-mono text-xs leading-relaxed"
          placeholder={'Pedro Almodóvar, Céline Sciamma\nHirokazu Kore-eda\nGreta Gerwig'}
          value={bulkNames}
          onChange={(e) => setBulkNames(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-xs text-slate-400">Si hay ambigüedad, priorizar:</span>
          <select className="input !w-auto !py-1 text-sm" value={bulkRole} onChange={(e) => setBulkRole(e.target.value)}>
            <option value="">Automático</option>
            <option value="director">Dirección</option>
            <option value="actor">Interpretación</option>
          </select>
          <button className="btn-gold shrink-0" onClick={addByNames} disabled={bulkBusy || !bulkNames.trim()}>
            {bulkBusy ? 'Añadiendo…' : '⭐ Añadir todos'}
          </button>
        </div>
        {bulkResult && (
          <div className="text-xs text-slate-400 mt-2">
            ✓ {bulkResult.added} añadidos de {bulkResult.total}.
            {bulkResult.notFound?.length > 0 && (
              <span className="text-orange-300"> No encontrados en TMDB: {bulkResult.notFound.join(', ')}.</span>
            )}
          </div>
        )}
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

      {/* curated director packs (#9) */}
      {tab === 'discover' && suggest?.packs && (
        <div className="mb-8 space-y-5">
          {suggest.packs.map((pack) => {
            const pending = pack.people.filter((p) => !p.tracked && !trackedTmdb.has(p.tmdb_id)).length;
            const accent = ACCENTS[pack.accent] || ACCENTS.gold;
            return (
              <section key={pack.key} className={`card p-0 overflow-hidden border-l-4 ${accent.border}`}>
                <div className="flex items-start gap-3 p-4 pb-3 flex-wrap">
                  <div className={`text-2xl w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${accent.bg}`}>{pack.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-100">{pack.title}</h3>
                    <p className="text-xs text-slate-500">{pack.description}</p>
                  </div>
                  <button
                    className={`btn-ghost !py-1 shrink-0 ${pending ? `!border-current ${accent.text}` : 'opacity-50'}`}
                    disabled={!pending || packBusy === pack.key}
                    onClick={() => addPack(pack)}
                    title={pending ? `Añade los ${pending} que aún no sigues` : 'Ya los sigues a todos'}
                  >
                    {packBusy === pack.key ? 'Añadiendo…' : pending ? `⭐ Añadir todos (${pending})` : '✓ Todos añadidos'}
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 p-4 pt-0">
                  {pack.people.map((p) => <SuggestionCard key={p.tmdb_id} person={p} trackedIds={trackedTmdb} onAdd={addTmdb} onRemove={removeTmdb} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === 'mine' && (
      <div className="grid lg:grid-cols-2 gap-6">
        {/* ranking */}
        <Section title={`Ranking de ${ROLES.find(([r]) => r === role)[1].toLowerCase()} por títulos en tu Plex`}>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button
              onClick={() => setHideDead((v) => !v)}
              className={`btn-ghost !py-1 text-xs ${hideDead ? '!border-gold-400 text-gold-400' : ''}`}
              title="Oculta a quienes ya han fallecido (a quienes se les conoce la fecha)"
            >
              {hideDead ? '✓ Ocultando fallecidos/as' : '✝ Ocultar fallecidos/as'}
            </button>
            <button className="btn-ghost !py-1 text-xs" onClick={updateLife} disabled={updatingLife}>
              {updatingLife ? 'Actualizando…' : '↻ Actualizar vivos/muertos'}
            </button>
            {lifeMsg && <span className="text-[11px] text-slate-400">{lifeMsg}</span>}
          </div>
          {!rankItems ? (
            <Spinner />
          ) : (
            <div className="card divide-y divide-ink-800 max-h-[70vh] overflow-y-auto">
              {rankItems.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-slate-600 text-sm w-8 text-right shrink-0">{i + 1}.</span>
                  <Link
                    to={`/personas/${p.id}?role=${role}`}
                    className="text-sm text-slate-200 hover:text-gold-400 truncate flex-1 flex items-center gap-1.5 min-w-0"
                  >
                    <span className="truncate">{p.name}</span>
                    <DeathBadge deathday={p.deathday} />
                  </Link>
                  <span className="text-xs text-slate-500 shrink-0">{p.n} títulos</span>
                  <button
                    onClick={() => toggle(p.id, p.name)}
                    title={trackedIds.has(p.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    className={`text-lg cursor-pointer transition-colors shrink-0 ${
                      trackedIds.has(p.id) ? 'text-gold-400' : 'text-ink-600 hover:text-slate-400'
                    }`}
                  >
                    ★
                  </button>
                </div>
              ))}
              {rankMore && (
                <button
                  className="w-full py-2 text-xs text-slate-400 hover:text-gold-400 cursor-pointer"
                  onClick={() => loadRanking(false)}
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
                  {confirmClear ? `¿Seguro? Vaciar ${tracked.length}` : 'Vaciar todos'}
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
            <div className="flex gap-2 mb-2 flex-wrap items-center">
              {[['all', 'Todos'], ['director', 'Directores/as'], ['actor', 'Actores/actrices']].map(([v, label]) => (
                <button key={v} onClick={() => setFavView(v)} className={`btn-ghost !py-1 text-xs ${favView === v ? '!border-gold-400 text-gold-400' : ''}`}>
                  {label} ({favCounts[v]})
                </button>
              ))}
              <select className="input !w-auto !py-1 text-xs" value={favSort} onChange={(e) => setFavSort(e.target.value)} title="Ordenar">
                {Object.entries(FAV_SORTS).map(([k, s]) => (
                  <option key={k} value={k}>{s.label}</option>
                ))}
              </select>
              <button
                onClick={() => { setPruneMode((v) => !v); setSelected(new Set()); }}
                className={`btn-ghost !py-1 text-xs ${pruneMode ? '!border-gold-400 text-gold-400' : ''}`}
              >
                ✂️ Podar
              </button>
            </div>
            <input
              className="input !py-1.5 text-sm mb-2"
              placeholder="Filtrar por nombre…"
              value={favSearch}
              onChange={(e) => setFavSearch(e.target.value)}
            />
            {pruneMode && (
              <div className="flex gap-2 mb-2 flex-wrap items-center text-xs">
                <button
                  className="btn-ghost !py-1 text-xs"
                  onClick={() => setSelected(new Set(shownFavs.filter((t) => t.deathday && noContribution(t)).map((t) => t.id)))}
                >
                  Marcar fallecidos completos
                </button>
                <button
                  className="btn-ghost !py-1 text-xs"
                  onClick={() => setSelected(new Set(shownFavs.filter(noContribution).map((t) => t.id)))}
                >
                  Marcar sin aporte
                </button>
                <button className="btn-gold !py-1 text-xs" onClick={pruneSelected} disabled={!selected.size}>
                  Quitar seleccionados ({selected.size})
                </button>
              </div>
            )}
            {!health.gaps && (
              <p className="text-[11px] text-slate-500 mb-2">
                Los huecos por favorito se calculan al visitar <Link to="/descubrir" className="text-gold-400 hover:underline">Descubrir → Tus favoritos</Link>.
              </p>
            )}
            <div className="card divide-y divide-ink-800 max-h-[70vh] overflow-y-auto">
              {shownFavs.map((t) => {
                const r = favRole(t);
                const count = r === 'director' ? t.directed : t.acted;
                return (
                <div key={t.id} className="group flex items-center gap-3 px-4 py-1.5 hover:bg-ink-800/60">
                  {pruneMode ? (
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelected(t.id)} />
                  ) : (
                    <span className="text-gold-400">★</span>
                  )}
                  {t.thumb ? (
                    <img src={`/img/person/${t.id}`} alt="" loading="lazy" className="w-7 h-7 rounded-full object-cover bg-ink-700 shrink-0" />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-ink-700 text-slate-500 text-[11px] flex items-center justify-center shrink-0">
                      {t.name.slice(0, 1)}
                    </span>
                  )}
                  <Link
                    to={`/personas/${t.id}?role=${r}`}
                    className="text-sm text-slate-200 hover:text-gold-400 truncate flex-1 flex items-center gap-1.5 min-w-0"
                  >
                    <span className="truncate">{t.name}</span>
                    <DeathBadge deathday={t.deathday} />
                  </Link>
                  <span className="text-[11px] text-slate-500 shrink-0 text-right">
                    {count > 0 ? `${count} ${r === 'director' ? 'dirigidas' : 'actuadas'}` : ''}
                    {t.gaps != null && (
                      <span className={t.gaps === 0 ? 'text-emerald-400' : ''}>{count > 0 ? ' · ' : ''}{t.gaps === 0 ? '✓ completo' : `${t.gaps} huecos`}</span>
                    )}
                    {t.upcoming != null && t.upcoming > 0 && <span className="text-sky-300"> · {t.upcoming} próximas</span>}
                    {t.gaps === 0 && (t.upcoming ?? 0) === 0 && t.upcoming != null && (
                      <span className="text-slate-600"> · sin aporte</span>
                    )}
                  </span>
                  {!pruneMode && (
                    <button
                      onClick={() => toggle(t.id, t.name)}
                      title="Quitar de favoritos"
                      className="text-slate-500 hover:text-red-400 cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  )}
                </div>
                );
              })}
            </div>
            </>
          )}
        </Section>
      </div>
      )}
    </div>
  );
}
