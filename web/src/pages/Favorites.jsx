import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import { Star, Clapperboard, Drama, Search, Scissors, RotateCw, ArrowLeftRight, X, Cross } from 'lucide-react';
import { Spinner, Section, Empty, DeathBadge, ProgressBar, PageHeader } from '../components.jsx';
import { toast } from '../toast.js';

// The whole page is scoped to ONE role at a time: a director you follow is
// never counted, sorted or shown together with their acting work.
const ROLES = [
  ['director', 'Directores/as', 'dirigidas'],
  ['actor', 'Actores/actrices', 'interpretadas'],
];
const roleLabel = (r) => ROLES.find(([k]) => k === r)?.[1] || r;
const roleVerb = (r) => ROLES.find(([k]) => k === r)?.[2] || 'películas';

// A TMDB person tile with a star to add/remove from favorites.
function SuggestionCard({ person, trackedIds, onAdd, onRemove }) {
  const isTracked = person.tracked || trackedIds.has(person.tmdb_id);
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="w-11 h-11 rounded-full overflow-hidden bg-ink-700 shrink-0 flex items-center justify-center">
        {person.profile_path ? (
          <img src={tmdbImg(person.profile_path, 'w185')} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <Clapperboard size={18} className="text-zinc-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-200 truncate">{person.name}</div>
        <div className="text-[11px] text-zinc-500 truncate">
          {person.dept ? `${person.dept === 'Directing' ? 'Dirección' : person.dept === 'Acting' ? 'Interpretación' : person.dept} · ` : ''}
          {(person.knownFor || []).join(', ')}
        </div>
      </div>
      <button
        onClick={() => (isTracked ? onRemove(person) : onAdd(person))}
        title={isTracked ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        className={`text-lg cursor-pointer shrink-0 ${isTracked ? 'text-gold-400' : 'text-ink-600 hover:text-zinc-400'}`}
      >
        ★
      </button>
    </div>
  );
}

const Avatar = ({ person, size = 'w-12 h-12' }) =>
  person.thumb ? (
    <img src={`/img/person/${person.id}`} alt="" loading="lazy" className={`${size} rounded-full object-cover bg-ink-700 shrink-0`} />
  ) : (
    <span className={`${size} rounded-full bg-ink-700 text-zinc-500 flex items-center justify-center shrink-0 text-sm`}>
      {person.name.slice(0, 1)}
    </span>
  );

/** One favorite: who they are, what you have of theirs, and what you're missing. */
function FavoriteCard({ p, role, selectable, selected, onSelect, onRemove, onSwitchRole }) {
  const gaps = p.gaps;
  const complete = gaps === 0;
  return (
    <div className={`card p-3 flex gap-3 items-start ${selected ? '!border-gold-400' : ''}`}>
      {selectable && (
        <input type="checkbox" checked={selected} onChange={() => onSelect(p.id)} className="mt-1 shrink-0" />
      )}
      <Link to={`/personas/${p.id}?role=${role}`} className="shrink-0">
        <Avatar person={p} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <Link to={`/personas/${p.id}?role=${role}`} className="text-sm font-medium text-zinc-100 hover:text-gold-400 truncate">
            {p.name}
          </Link>
          <DeathBadge deathday={p.deathday} />
        </div>
        <div className="text-[11px] text-zinc-500 mt-0.5">
          <b className="text-zinc-300">{p.movies || 0}</b> {roleVerb(role)} en tu Plex
          {p.upcoming > 0 && <span className="text-sky-300"> · {p.upcoming} por venir</span>}
        </div>

        {p.pct != null ? (
          <div className="mt-2">
            <ProgressBar pct={p.pct} />
            <div className="flex justify-between text-[11px] mt-1">
              <span className="text-zinc-500">{p.pct}% de su filmografía</span>
              {complete ? (
                <span className="text-emerald-400">✓ completa</span>
              ) : (
                <Link to="/descubrir" className="text-gold-400 hover:underline">te faltan {gaps}</Link>
              )}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-zinc-600 mt-2">
            Huecos sin calcular · <Link to="/descubrir" className="text-gold-400 hover:underline">Descubrir</Link>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={() => onRemove(p)} title="Quitar de favoritos" className="text-zinc-600 hover:text-red-400">
          <X size={15} />
        </button>
        <button
          onClick={() => onSwitchRole(p)}
          title={`Seguirle como ${role === 'director' ? 'actor/actriz' : 'director/a'} en su lugar`}
          className="text-zinc-600 hover:text-gold-400"
        >
          <ArrowLeftRight size={15} />
        </button>
      </div>
    </div>
  );
}

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
  const [role, setRole] = useState('director'); // scopes the entire page
  const [tab, setTab] = useState('mine'); // mine | discover
  const [health, setHealth] = useState({ gaps: false, calendar: false });
  const [rankItems, setRankItems] = useState(null);
  const [rankMore, setRankMore] = useState(false);
  const [hideDead, setHideDead] = useState(false);
  const [lifeMsg, setLifeMsg] = useState('');
  const [updatingLife, setUpdatingLife] = useState(false);
  const [topN, setTopN] = useState(10);
  const [flash, setFlash] = useState('');
  const [suggest, setSuggest] = useState(null);
  const [pq, setPq] = useState('');
  const [presults, setPresults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [packBusy, setPackBusy] = useState(null);
  const [bulkNames, setBulkNames] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [favSearch, setFavSearch] = useState('');
  const [favSort, setFavSort] = useState('titulos');
  const [pruneMode, setPruneMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [preview, setPreview] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

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
  const trackedIds = new Set((tracked || []).map((t) => t.id));

  const addTmdb = async (p) => {
    await api('/tracked/tmdb', { method: 'POST', body: { tmdbId: p.tmdb_id, name: p.name, profilePath: p.profile_path, role } });
    toast(`⭐ ${p.name} añadido como ${role === 'director' ? 'director/a' : 'actor/actriz'}`, 'success');
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
    const res = await api('/tracked/by-names', { method: 'POST', body: { names: bulkNames, role } });
    setBulkBusy(false);
    if (res.ok) {
      setBulkResult(res);
      toast(`⭐ ${res.added} añadidos a ${roleLabel(role).toLowerCase()}`, 'success');
      setBulkNames('');
      loadTracked();
    } else toast(`⚠️ ${res.error || 'error'}`, 'error');
  };
  const addPack = async (pack) => {
    setPackBusy(pack.key);
    const res = await api('/tracked/tmdb-bulk', {
      method: 'POST',
      body: { role, people: pack.people.map((p) => ({ tmdbId: p.tmdb_id, name: p.name, profilePath: p.profile_path })) },
    });
    setPackBusy(null);
    if (res.ok) { toast(`⭐ ${res.added} de «${pack.title}» añadidos`, 'success'); loadTracked(); }
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
  useEffect(() => { setSelected(new Set()); setPruneMode(false); }, [role]);

  const updateLife = async () => {
    setUpdatingLife(true);
    setLifeMsg('Consultando fechas de nacimiento/fallecimiento en TMDB…');
    const r = await api('/people/life-sync', { method: 'POST' });
    setUpdatingLife(false);
    setLifeMsg(r.error ? `✗ ${r.error}` : `✓ ${r.done} actualizadas · ${r.deceased} fallecidos/as`);
    loadRanking(true);
    loadTracked();
  };

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
  const togglePreview = (id) =>
    setPreview((p) => {
      const checked = new Set(p.checked);
      checked.has(id) ? checked.delete(id) : checked.add(id);
      return { ...p, checked };
    });
  const confirmBulkAdd = async () => {
    const ids = preview.candidates.filter((c) => preview.checked.has(c.id)).map((c) => c.id);
    setPreview(null);
    if (!ids.length) return;
    const res = await api('/tracked/bulk', { method: 'POST', body: { personIds: ids, role } });
    if (res.ok) { toast(`⭐ ${res.added} añadidos a ${roleLabel(role).toLowerCase()}`, 'success'); loadTracked(); }
    else toast(`⚠️ ${res.error || 'error'}`, 'error');
  };

  // the star reflects THIS facet: following someone you already follow in the
  // other facet moves them here rather than silently doing nothing
  const toggle = async (id, name) => {
    const fav = (tracked || []).find((t) => t.id === id);
    const followedHere = fav && (fav.role || 'director') === role;
    if (followedHere) {
      setTracked((prev) => prev.filter((t) => t.id !== id));
      await api(`/tracked/${id}`, { method: 'DELETE' });
      toast(`${name || 'Quitado'} fuera de ${roleLabel(role).toLowerCase()}`);
    } else if (fav) {
      await api(`/tracked/${id}/role`, { method: 'PATCH', body: { role } });
      toast(`⇄ ${name} pasa a ${roleLabel(role).toLowerCase()}`, 'success');
    } else {
      await api(`/tracked/${id}`, { method: 'POST', body: { role } });
      toast(`⭐ ${name || 'Añadido'} a ${roleLabel(role).toLowerCase()}`, 'success');
    }
    loadTracked();
  };
  const removeFav = async (p) => {
    setTracked((prev) => prev.filter((t) => t.id !== p.id));
    await api(`/tracked/${p.id}`, { method: 'DELETE' });
    toast(`${p.name} fuera de favoritos`);
    loadTracked();
  };
  const switchRole = async (p) => {
    const next = p.role === 'director' ? 'actor' : 'director';
    await api(`/tracked/${p.id}/role`, { method: 'PATCH', body: { role: next } });
    toast(`${p.name} pasa a ${next === 'director' ? 'directores/as' : 'actores/actrices'}`);
    loadTracked();
  };

  const clearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    const ids = shownFavs.map((t) => t.id);
    await api('/tracked/batch', { method: 'DELETE', body: { personIds: ids } });
    toast(`Vaciados los ${ids.length} favoritos de ${roleLabel(role).toLowerCase()}`);
    loadTracked();
  };

  const clearDeceased = async () => {
    const ids = shownFavs.filter((t) => t.deathday).map((t) => t.id);
    if (!ids.length) return;
    const r = await api('/tracked/batch', { method: 'DELETE', body: { personIds: ids } });
    if (r.ok) { toast(`✝ ${r.removed} fallecidos/as retirados/as`); loadTracked(); }
  };

  const pruneSelected = async () => {
    const r = await api('/tracked/batch', { method: 'DELETE', body: { personIds: [...selected] } });
    if (r.ok) {
      toast(`✂️ ${r.removed} favoritos quitados`);
      setSelected(new Set());
      setPruneMode(false);
      loadTracked();
    } else toast(`⚠️ ${r.error || 'error'}`, 'error');
  };
  const toggleSelected = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (!tracked) return <Spinner />;

  // everything below is scoped to the active role — no mixed counts, ever
  const roleFavs = tracked.filter((t) => (t.role || 'director') === role);
  const counts = {
    director: tracked.filter((t) => (t.role || 'director') === 'director').length,
    actor: tracked.filter((t) => (t.role || 'director') === 'actor').length,
  };
  const FAV_SORTS = {
    titulos: { label: `Más ${roleVerb(role)} en tu Plex`, fn: (a, b) => (b.movies || 0) - (a.movies || 0) },
    huecos: { label: 'Más huecos', fn: (a, b) => (b.gaps ?? -1) - (a.gaps ?? -1) },
    completismo: { label: 'Menos completos', fn: (a, b) => (a.pct ?? 101) - (b.pct ?? 101) },
    aporte: { label: 'Menos aporte', fn: (a, b) => ((a.gaps ?? 0) + (a.upcoming ?? 0)) - ((b.gaps ?? 0) + (b.upcoming ?? 0)) },
    nombre: { label: 'Nombre (A-Z)', fn: (a, b) => a.name.localeCompare(b.name) },
  };
  const shownFavs = roleFavs
    .filter((t) => !favSearch.trim() || t.name.toLowerCase().includes(favSearch.trim().toLowerCase()))
    .sort(FAV_SORTS[favSort]?.fn || FAV_SORTS.titulos.fn);
  const noContribution = (t) => t.gaps === 0 && (t.upcoming ?? 0) === 0;
  const deceasedCount = roleFavs.filter((t) => t.deathday).length;
  const totalGaps = roleFavs.reduce((n, t) => n + (t.gaps || 0), 0);
  const completeCount = roleFavs.filter((t) => t.gaps === 0).length;
  // "calculado" per facet: the other facet's cache says nothing about this one
  const anyComputed = roleFavs.some((t) => t.gaps != null);

  return (
    <div>
      <PageHeader eyebrow="La caza" title="Favoritos" />
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        La gente que sigues, <b>separada por faceta</b>: a quien sigues como director/a solo cuenta por lo que dirige,
        y a quien sigues como actor/actriz solo por lo que interpreta. Todos entran en{' '}
        <Link to="/calendario" className="text-gold-400 hover:underline">Cine venidero</Link> y en{' '}
        <Link to="/descubrir" className="text-gold-400 hover:underline">Descubrir huecos</Link>.
      </p>

      {/* role scope: the whole page follows this switch */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {ROLES.map(([r, label]) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`${role === r ? 'btn-gold' : 'btn-ghost'} inline-flex items-center gap-2`}
          >
            {r === 'director' ? <Clapperboard size={15} strokeWidth={1.75} /> : <Drama size={15} strokeWidth={1.75} />}
            {label} ({counts[r]})
          </button>
        ))}
        <span className="text-xs text-zinc-600 ml-2">Cada faceta se gestiona por separado</span>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('mine')} className={`${tab === 'mine' ? 'btn-gold' : 'btn-ghost'} inline-flex items-center gap-2`}>
          <Star size={15} strokeWidth={1.75} /> Mis {roleLabel(role).toLowerCase()} ({counts[role]})
        </button>
        <button onClick={() => setTab('discover')} className={`${tab === 'discover' ? 'btn-gold' : 'btn-ghost'} inline-flex items-center gap-2`}>
          <Search size={15} strokeWidth={1.75} /> Añadir {roleLabel(role).toLowerCase()}
        </button>
      </div>

      {tab === 'mine' && (
        <>
          {/* headline numbers for this facet */}
          {roleFavs.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="card p-3">
                <div className="text-xl font-bold text-gold-400">{counts[role]}</div>
                <div className="text-xs text-zinc-500">{roleLabel(role).toLowerCase()} que sigues</div>
              </div>
              <div className="card p-3">
                <div className="text-xl font-bold text-zinc-200">{roleFavs.reduce((n, t) => n + (t.movies || 0), 0)}</div>
                <div className="text-xs text-zinc-500">{roleVerb(role)} suyas en tu Plex</div>
              </div>
              <div className="card p-3">
                <div className="text-xl font-bold text-orange-300">{anyComputed ? totalGaps : '—'}</div>
                <div className="text-xs text-zinc-500">huecos por rellenar</div>
              </div>
              <div className="card p-3">
                <div className="text-xl font-bold text-emerald-400">{anyComputed ? completeCount : '—'}</div>
                <div className="text-xs text-zinc-500">filmografías completas</div>
              </div>
            </div>
          )}

          {roleFavs.length === 0 ? (
            <Empty>
              Aún no sigues a nadie como {role === 'director' ? 'director/a' : 'actor/actriz'}. Usa{' '}
              <button className="text-gold-400 hover:underline" onClick={() => setTab('discover')}>Añadir {roleLabel(role).toLowerCase()}</button>.
            </Empty>
          ) : (
            <>
              <div className="flex gap-2 mb-3 flex-wrap items-center">
                <input
                  className="input !py-1.5 text-sm !w-auto flex-1 min-w-48"
                  placeholder={`Filtrar ${roleLabel(role).toLowerCase()}…`}
                  value={favSearch}
                  onChange={(e) => setFavSearch(e.target.value)}
                />
                <select className="input !w-auto !py-1.5 text-xs" value={favSort} onChange={(e) => setFavSort(e.target.value)}>
                  {Object.entries(FAV_SORTS).map(([k, s]) => (
                    <option key={k} value={k}>{s.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setPruneMode((v) => !v); setSelected(new Set()); }}
                  className={`btn-ghost !py-1.5 text-xs inline-flex items-center gap-1.5 ${pruneMode ? '!border-gold-400 text-gold-400' : ''}`}
                >
                  <Scissors size={13} strokeWidth={2} /> Podar
                </button>
                {deceasedCount > 0 && (
                  <button className="btn-ghost !py-1.5 text-xs" onClick={clearDeceased}>
                    † Quitar fallecidos/as ({deceasedCount})
                  </button>
                )}
                <button className="btn-ghost !py-1.5 text-xs !border-red-500/40 text-red-400" onClick={clearAll}>
                  {confirmClear ? `¿Seguro? Vaciar ${shownFavs.length}` : 'Vaciar'}
                </button>
              </div>

              {pruneMode && (
                <div className="card p-3 mb-3 flex gap-2 flex-wrap items-center text-xs">
                  <span className="text-zinc-400">Poda rápida:</span>
                  <button
                    className="btn-ghost !py-1 text-xs"
                    onClick={() => setSelected(new Set(shownFavs.filter((t) => t.deathday && noContribution(t)).map((t) => t.id)))}
                  >
                    Fallecidos/as con filmografía completa
                  </button>
                  <button
                    className="btn-ghost !py-1 text-xs"
                    onClick={() => setSelected(new Set(shownFavs.filter(noContribution).map((t) => t.id)))}
                  >
                    Sin huecos ni proyectos
                  </button>
                  <button className="btn-gold !py-1 text-xs ml-auto" onClick={pruneSelected} disabled={!selected.size}>
                    Quitar seleccionados ({selected.size})
                  </button>
                </div>
              )}

              {!anyComputed && (
                <p className="text-[11px] text-zinc-500 mb-3">
                  Los huecos y el completismo se calculan al visitar{' '}
                  <Link to="/descubrir" className="text-gold-400 hover:underline">Descubrir huecos</Link>, o con
                  «Actualizar todo» en <Link to="/ajustes" className="text-gold-400 hover:underline">Ajustes</Link>.
                </p>
              )}

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
                {shownFavs.map((p) => (
                  <FavoriteCard
                    key={p.id}
                    p={p}
                    role={role}
                    selectable={pruneMode}
                    selected={selected.has(p.id)}
                    onSelect={toggleSelected}
                    onRemove={removeFav}
                    onSwitchRole={switchRole}
                  />
                ))}
              </div>
            </>
          )}

          {/* ranking of the library, scoped to this role, to add more */}
          <Section title={`Ranking de ${roleLabel(role).toLowerCase()} por títulos en tu Plex`}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <button
                onClick={() => setHideDead((v) => !v)}
                className={`btn-ghost !py-1 text-xs ${hideDead ? '!border-gold-400 text-gold-400' : ''}`}
              >
                {hideDead ? '✓ Ocultando fallecidos/as' : '† Ocultar fallecidos/as'}
              </button>
              <button className="btn-ghost !py-1 text-xs inline-flex items-center gap-1.5" onClick={updateLife} disabled={updatingLife}>
                {updatingLife ? 'Actualizando…' : <><RotateCw size={12} strokeWidth={2} /> Actualizar vivos/muertos</>}
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-zinc-400">Añadir los</span>
                <input type="number" min="1" max="1000" className="input !w-20 text-center !py-1" value={topN} onChange={(e) => setTopN(e.target.value)} />
                <span className="text-xs text-zinc-400">primeros</span>
                <button className="btn-gold !py-1 text-xs inline-flex items-center gap-1.5" onClick={bulkAdd}><Star size={12} strokeWidth={2} /> Revisar y añadir</button>
              </div>
              {lifeMsg && <span className="text-[11px] text-zinc-400 w-full">{lifeMsg}</span>}
              {flash && <span className="text-emerald-400 text-xs w-full">{flash}</span>}
            </div>

            {preview && (
              <div className="card p-4 mb-3">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <h3 className="font-semibold text-zinc-100 text-sm">
                    Vas a seguir a {preview.checked.size} de {preview.candidates.length} como {role === 'director' ? 'director/a' : 'actor/actriz'}
                  </h3>
                  <div className="flex gap-2">
                    <button className="btn-gold !py-1 text-xs inline-flex items-center gap-1.5" onClick={confirmBulkAdd} disabled={!preview.checked.size}>
<Star size={12} strokeWidth={2} /> Confirmar ({preview.checked.size})
                    </button>
                    <button className="btn-ghost !py-1 text-xs" onClick={() => setPreview(null)}>Cancelar</button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 max-h-72 overflow-y-auto">
                  {preview.candidates.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-zinc-300 py-0.5 cursor-pointer min-w-0">
                      <input type="checkbox" checked={preview.checked.has(c.id)} onChange={() => togglePreview(c.id)} />
                      <span className="truncate">{c.name}</span>
                      <DeathBadge deathday={c.deathday} />
                      <span className="text-[11px] text-zinc-500 shrink-0 ml-auto">{c.n} títulos</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!rankItems ? (
              <Spinner />
            ) : (
              <div className="card divide-y divide-ink-800 max-h-[60vh] overflow-y-auto">
                {rankItems.map((p, i) => {
                  const fav = tracked.find((t) => t.id === p.id);
                  const here = fav && (fav.role || 'director') === role;
                  const elsewhere = fav && !here;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="text-zinc-600 text-sm w-8 text-right shrink-0">{i + 1}.</span>
                      <Link to={`/personas/${p.id}?role=${role}`} className="text-sm text-zinc-200 hover:text-gold-400 truncate flex-1 flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{p.name}</span>
                        <DeathBadge deathday={p.deathday} />
                        {elsewhere && (
                          <span className="text-[11px] text-zinc-500 shrink-0" title={`Le sigues como ${fav.role === 'director' ? 'director/a' : 'actor/actriz'}`}>
                            {fav.role === 'director' ? <Clapperboard size={11} /> : <Drama size={11} />}
                          </span>
                        )}
                      </Link>
                      <span className="text-xs text-zinc-500 shrink-0">{p.n} títulos</span>
                      <button
                        onClick={() => toggle(p.id, p.name)}
                        title={
                          here
                            ? `Quitar de ${roleLabel(role).toLowerCase()}`
                            : elsewhere
                              ? `Le sigues como ${fav.role === 'director' ? 'director/a' : 'actor/actriz'}: pásale a ${roleLabel(role).toLowerCase()}`
                              : `Seguir como ${role === 'director' ? 'director/a' : 'actor/actriz'}`
                        }
                        className={`text-lg cursor-pointer transition-colors shrink-0 ${
                          here ? 'text-gold-400' : elsewhere ? 'text-gold-400/30 hover:text-gold-400' : 'text-ink-600 hover:text-zinc-400'
                        }`}
                      >
                        {elsewhere ? <ArrowLeftRight size={15} /> : '★'}
                      </button>
                    </div>
                  );
                })}
                {rankMore && (
                  <button className="w-full py-2 text-xs text-zinc-400 hover:text-gold-400 cursor-pointer" onClick={() => loadRanking(false)}>
                    Ver más
                  </button>
                )}
              </div>
            )}
          </Section>
        </>
      )}

      {tab === 'discover' && (
        <>
          <p className="text-xs text-zinc-500 mb-4">
            Lo que añadas aquí se sigue como <b>{role === 'director' ? 'director/a' : 'actor/actriz'}</b>. Cambia la
            faceta arriba si quieres seguir a alguien por la otra.
          </p>

          <div className="card p-4 mb-6">
            <h2 className="font-semibold text-zinc-100 mb-1">Añadir una lista de nombres</h2>
            <p className="text-xs text-zinc-500 mb-3 max-w-2xl">
              Pega nombres <b>separados por comas o uno por línea</b>. PowaFlex los busca en TMDB y los añade a{' '}
              {roleLabel(role).toLowerCase()}.
            </p>
            <textarea
              className="input !h-28 font-mono text-xs leading-relaxed"
              placeholder={'Pedro Almodóvar, Céline Sciamma\nHirokazu Kore-eda\nGreta Gerwig'}
              value={bulkNames}
              onChange={(e) => setBulkNames(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button className="btn-gold shrink-0 inline-flex items-center gap-2" onClick={addByNames} disabled={bulkBusy || !bulkNames.trim()}>
                {bulkBusy ? 'Añadiendo…' : <><Star size={13} strokeWidth={2} /> Añadir a {roleLabel(role).toLowerCase()}</>}
              </button>
            </div>
            {bulkResult && (
              <div className="text-xs text-zinc-400 mt-2">
                ✓ {bulkResult.added} añadidos de {bulkResult.total}.
                {bulkResult.notFound?.length > 0 && (
                  <span className="text-orange-300"> No encontrados en TMDB: {bulkResult.notFound.join(', ')}.</span>
                )}
              </div>
            )}
          </div>

          <div className="card p-4 mb-6">
            <form onSubmit={searchPeople} className="flex gap-2 max-w-xl">
              <input className="input" placeholder="Buscar por nombre en TMDB…" value={pq} onChange={(e) => setPq(e.target.value)} />
              <button className="btn-gold shrink-0" disabled={searching}>{searching ? 'Buscando…' : 'Buscar'}</button>
              {presults && <button type="button" className="btn-ghost shrink-0" onClick={() => { setPresults(null); setPq(''); }}>✕</button>}
            </form>
            {presults && (
              presults.length === 0 ? (
                <div className="text-sm text-zinc-500 mt-3">Nadie con ese nombre en TMDB.</div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                  {presults.map((p) => <SuggestionCard key={p.tmdb_id} person={p} trackedIds={trackedTmdb} onAdd={addTmdb} onRemove={removeTmdb} />)}
                </div>
              )
            )}
          </div>

          {suggest?.packs && (
            <div className="mb-8 space-y-5">
              {suggest.packs.map((pack) => {
                const pending = pack.people.filter((p) => !p.tracked && !trackedTmdb.has(p.tmdb_id)).length;
                const accent = ACCENTS[pack.accent] || ACCENTS.gold;
                return (
                  <section key={pack.key} className={`card p-0 overflow-hidden border-l-4 ${accent.border}`}>
                    <div className="flex items-start gap-3 p-4 pb-3 flex-wrap">
                      <div className={`text-2xl w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${accent.bg}`}>{pack.emoji}</div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-zinc-100">{pack.title}</h3>
                        <p className="text-xs text-zinc-500">{pack.description}</p>
                      </div>
                      <button
                        className={`btn-ghost !py-1 shrink-0 inline-flex items-center gap-1.5 ${pending ? `!border-current ${accent.text}` : 'opacity-50'}`}
                        disabled={!pending || packBusy === pack.key}
                        onClick={() => addPack(pack)}
                        title={pending ? `Añade los ${pending} que aún no sigues` : 'Ya los sigues a todos'}
                      >
                        {packBusy === pack.key ? 'Añadiendo…' : pending ? <><Star size={12} strokeWidth={2} /> Añadir todos ({pending})</> : '✓ Todos añadidos'}
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
        </>
      )}
    </div>
  );
}
