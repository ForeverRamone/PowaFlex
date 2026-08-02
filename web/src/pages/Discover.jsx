import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import { Star, Clapperboard, Drama, Landmark, Plus, RotateCw, User, LayoutGrid } from 'lucide-react';
import {
  Spinner, ErrorBox, TmdbCard, RadarrButton, ProgressBar, Empty, BuildProgress,
  useRadarrIds, useTypeFilters, TypeFilterBar, matchesTypeFilters, DeathBadge, PageHeader } from '../components.jsx';
import { toast } from '../toast.js';

const TABS = [
  ['favorites', 'Tus favoritos', Star],
  ['director', 'Directores/as top', Clapperboard],
  ['actor', 'Actores/actrices top', Drama],
  ['absent', 'Grandes ausentes', Landmark],
];

// send a visible batch to Radarr in one go
async function sendBulk(ids, addRadarrId) {
  if (!ids.length) return;
  const res = await api('/radarr/add-bulk', { method: 'POST', body: { tmdbIds: ids.slice(0, 300) } });
  if (res.error) {
    toast(`⚠️ ${res.error}`, 'error');
    return;
  }
  for (const r of res.results || []) if (r.ok || r.alreadyExists) addRadarrId(r.tmdbId);
  toast(
    `✓ ${res.added} añadidas a Radarr${res.alreadyInRadarr ? ` · ${res.alreadyInRadarr} ya estaban` : ''}${res.failed ? ` · ⚠️ ${res.failed} fallaron` : ''}`
  );
}

const passesScore = (f, minScore) => !minScore || f.mdb?.score == null || f.mdb.score >= minScore;
const visibleMissing = (p, show, minScore, dismissed) =>
  (p.missing || []).filter(
    (f) => !dismissed.has(f.tmdb_id) && matchesTypeFilters(f, show) && passesScore(f, minScore)
  );

function GapCard({ f, radarrIds, addRadarrId, onDismiss, person }) {
  return (
    <TmdbCard item={f}>
      {person && (
        <Link to={`/personas/${person.id}?role=${person.role || 'director'}`} className="text-[11px] text-zinc-500 hover:text-gold-400 truncate block">
          {person.name}
        </Link>
      )}
      {f.mdb?.score != null && (
        <div className="text-[11px] text-gold-400">
          Σ {f.mdb.score}{f.mdb.imdb != null ? ` · IMDb ${Number(f.mdb.imdb).toFixed(1)}` : ''}
        </div>
      )}
      <div className="flex items-center gap-1">
        <RadarrButton tmdbId={f.tmdb_id} small alreadyInRadarr={radarrIds.has(f.tmdb_id)} onAdded={addRadarrId} />
        <button
          title="No me interesa: no volverá a aparecer en los huecos"
          onClick={() => onDismiss(f)}
          className="text-zinc-500 hover:text-red-400 text-xs px-1 shrink-0"
        >
          ✕
        </button>
      </div>
    </TmdbCard>
  );
}

// «¿y este quién era?»: sus dos películas más reconocibles junto al nombre, para
// no tener que abrir la ficha de cada director/a de la lista
function Signature({ films }) {
  if (!films?.length) return null;
  return (
    <span className="text-xs text-zinc-500 font-normal">
      {' ('}
      {films.map((f, i) => (
        <span key={f.tmdb_id ?? i}>
          {i > 0 && ', '}
          <i>{f.title}</i>
        </span>
      ))}
      {')'}
    </span>
  );
}

function PersonGaps({ p, role, show, minScore, dismissed, onDismiss, radarrIds, addRadarrId }) {
  const shown = visibleMissing(p, show, minScore, dismissed);
  const alive = (p.missing || []).filter((f) => !dismissed.has(f.tmdb_id));
  const hidden = alive.length - shown.length;
  const pendingIds = shown.filter((f) => !radarrIds.has(f.tmdb_id)).map((f) => f.tmdb_id);

  // never vanish silently: with everything filtered out, keep a compact row so
  // "no aparece" can't be read as "no le falta nada"
  if (!shown.length) {
    return (
      <section className="card p-3 mb-3 flex items-center justify-between flex-wrap gap-2 text-sm">
        <Link to={`/personas/${p.id}?role=${p.role || role}`} className="font-semibold text-zinc-300 hover:text-gold-400">
          {p.name} →<Signature films={p.signature} />
        </Link>
        <span className="text-xs text-zinc-500">
          {p.missingTotal === 0 ? '✓ filmografía completa' : `${p.missingTotal} te faltan · todas ocultas por tus filtros`}
        </span>
      </section>
    );
  }

  return (
    <section className="card p-4 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <Link to={`/personas/${p.id}?role=${p.role || role}`} className="font-semibold text-zinc-100 hover:text-gold-400 min-w-0">
          {p.name} →<Signature films={p.signature} />
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-zinc-400">
            Tienes <b className="text-gold-400">{p.owned}</b> de {p.released} estrenadas ({p.pct}%) · {p.missingTotal} te faltan
            {hidden > 0 ? ` · ${hidden} ocultas por filtros` : ''}
          </span>
          {pendingIds.length > 1 && (
            <button className="btn-ghost !py-1 text-xs shrink-0 inline-flex items-center gap-1.5" onClick={() => sendBulk(pendingIds, addRadarrId)}>
<Plus size={13} strokeWidth={2.5} /> Añadir las {pendingIds.length} visibles a Radarr
            </button>
          )}
        </div>
      </div>
      <div className="max-w-sm mb-4"><ProgressBar pct={p.pct} /></div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {shown.map((f) => (
          <GapCard key={f.tmdb_id} f={f} radarrIds={radarrIds} addRadarrId={addRadarrId} onDismiss={onDismiss} />
        ))}
      </div>
    </section>
  );
}

function typeCounts(people) {
  const all = people.flatMap((p) => p.missing || []);
  return {
    shorts: all.filter((f) => f.isShort).length,
    docs: all.filter((f) => f.isDocumentary).length,
    music: all.filter((f) => f.isMusic).length,
    tv: all.filter((f) => f.isTvMovie).length,
    coral: all.filter((f) => f.isCoral).length,
    cameos: all.filter((f) => f.isCameo).length,
  };
}

function MinScoreBar({ minScore, setMinScore }) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <span className="text-xs text-zinc-500">Nota mínima Σ:</span>
      {[0, 40, 50, 60, 70].map((v) => (
        <button
          key={v}
          onClick={() => setMinScore(v)}
          className={`btn-ghost !py-1 text-xs ${minScore === v ? '!border-gold-400 text-gold-400' : ''}`}
        >
          {v === 0 ? 'Todas' : `Σ ≥ ${v}`}
        </button>
      ))}
      <span className="text-xs text-zinc-600">(las sin nota no se ocultan)</span>
    </div>
  );
}

const PERSON_SORTS = {
  huecos: { label: 'Más huecos primero', fn: (a, b) => (b.missingTotal || 0) - (a.missingTotal || 0) },
  biblioteca: { label: 'Más películas en tu Plex', fn: (a, b) => (b.inLibrary || b.owned || 0) - (a.inLibrary || a.owned || 0) },
  completismo: { label: 'Menos completos primero', fn: (a, b) => (a.pct ?? 101) - (b.pct ?? 101) },
  nombre: { label: 'Alfabético (A-Z)', fn: (a, b) => a.name.localeCompare(b.name) },
};
const FILM_SORTS = {
  score: { label: 'Nota media Σ', fn: (a, b) => (b.mdb?.score ?? -1) - (a.mdb?.score ?? -1) },
  votos: { label: 'Más votadas', fn: (a, b) => (b.votes || 0) - (a.votes || 0) },
  reciente: { label: 'Más recientes', fn: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
  antigua: { label: 'Más antiguas', fn: (a, b) => String(a.date || '').localeCompare(String(b.date || '')) },
  titulo: { label: 'Título (A-Z)', fn: (a, b) => a.title.localeCompare(b.title) },
};

/** All missing films of everyone, in one grid — no person-by-person scrolling. */
function FilmGrid({ people, show, minScore, dismissed, onDismiss, radarrIds, addRadarrId, sort }) {
  const byId = new Map();
  for (const p of people) {
    for (const f of visibleMissing(p, show, minScore, dismissed)) {
      if (!byId.has(f.tmdb_id)) byId.set(f.tmdb_id, { ...f, _person: { id: p.id, name: p.name, role: p.role } });
    }
  }
  const films = [...byId.values()].sort(FILM_SORTS[sort]?.fn || FILM_SORTS.score.fn);
  const pendingIds = films.filter((f) => !radarrIds.has(f.tmdb_id)).map((f) => f.tmdb_id);

  if (!films.length) return <Empty>Nada que rellenar con estos filtros.</Empty>;
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <span className="text-sm text-zinc-400">
          <b className="text-gold-400">{films.length}</b> películas te faltan en total
        </span>
        {pendingIds.length > 1 && (
          <button className="btn-gold !py-1 text-xs inline-flex items-center gap-1.5" onClick={() => sendBulk(pendingIds.slice(0, 300), addRadarrId)}>
<Plus size={13} strokeWidth={2.5} /> Añadir {Math.min(pendingIds.length, 300)} a Radarr
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
        {films.map((f) => (
          <GapCard
            key={f.tmdb_id}
            f={f}
            person={f._person}
            radarrIds={radarrIds}
            addRadarrId={addRadarrId}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </>
  );
}

function GapsView({
  endpoint, role, radarrIds, addRadarrId, show, toggle, minScore, setMinScore,
  dismissed, onDismiss, intro, paginated,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState(() => localStorage.getItem('gaps_view') || 'person');
  const [personSort, setPersonSort] = useState(() => localStorage.getItem('gaps_person_sort') || 'huecos');
  const [filmSort, setFilmSort] = useState(() => localStorage.getItem('gaps_film_sort') || 'score');

  const setViewPref = (v) => { setView(v); localStorage.setItem('gaps_view', v); };
  const setPersonSortPref = (v) => { setPersonSort(v); localStorage.setItem('gaps_person_sort', v); };
  const setFilmSortPref = (v) => { setFilmSort(v); localStorage.setItem('gaps_film_sort', v); };

  const load = (refresh = false) => {
    setError(null);
    if (refresh) setRefreshing(true);
    else setData(null);
    api(`${endpoint}${refresh ? (endpoint.includes('?') ? '&' : '?') + 'refresh=1' : ''}`).then((d) => {
      setRefreshing(false);
      if (d.error) setError(d.error);
      else setData(d);
    });
  };
  useEffect(() => { load(); }, [endpoint]);

  // walk the ranking further down (top tabs only)
  const loadMore = () => {
    setLoadingMore(true);
    const next = (data.offset || 0) + (data.pageSize || 20);
    api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}offset=${next}`).then((d) => {
      setLoadingMore(false);
      if (d.error) return setError(d.error);
      setData({ ...d, people: [...data.people, ...d.people] });
    });
  };

  if (error) return <ErrorBox error={`${error} — comprueba la API key de TMDB en Ajustes.`} />;
  if (!data) return <BuildProgress label="Cruzando filmografías con TMDB…" />;

  // people with something still missing drive this page
  const withGaps = (data.people || []).filter((p) => (p.missingTotal || 0) > 0);
  const sortedPeople = [...withGaps].sort(PERSON_SORTS[personSort]?.fn || PERSON_SORTS.huecos.fn);
  const complete = (data.people || []).length - withGaps.length;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-sm text-zinc-500">
          {intro} Actualizado {new Date(data.generatedAt).toLocaleString('es-ES')}.
          {complete > 0 && <span className="text-emerald-400"> · {complete} con filmografía completa</span>}
        </p>
        <button className="btn-ghost !py-1 shrink-0 inline-flex items-center gap-1.5" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : <><RotateCw size={13} strokeWidth={2} /> Actualizar</>}
        </button>
      </div>

      {data.people.length === 0 ? (
        <Empty>Nada que rellenar aquí: filmografías completas.</Empty>
      ) : (
        <>
          <div className="card p-3 mb-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-xs text-zinc-500">Vista:</span>
              <button
                onClick={() => setViewPref('person')}
                className={`btn-ghost !py-1 text-xs inline-flex items-center gap-1.5 ${view === 'person' ? '!border-gold-400 text-gold-400' : ''}`}
              >
<User size={13} strokeWidth={2} /> Por persona
              </button>
              <button
                onClick={() => setViewPref('grid')}
                className={`btn-ghost !py-1 text-xs inline-flex items-center gap-1.5 ${view === 'grid' ? '!border-gold-400 text-gold-400' : ''}`}
              >
<LayoutGrid size={13} strokeWidth={2} /> Todas las películas juntas
              </button>
              <span className="text-xs text-zinc-500 ml-2">Ordenar:</span>
              {view === 'person' ? (
                <select className="input !w-auto !py-1 text-xs" value={personSort} onChange={(e) => setPersonSortPref(e.target.value)}>
                  {Object.entries(PERSON_SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              ) : (
                <select className="input !w-auto !py-1 text-xs" value={filmSort} onChange={(e) => setFilmSortPref(e.target.value)}>
                  {Object.entries(FILM_SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              )}
            </div>
            <MinScoreBar minScore={minScore} setMinScore={setMinScore} />
          </div>

          <TypeFilterBar show={show} toggle={toggle} counts={typeCounts(data.people)} />

          {view === 'grid' ? (
            <FilmGrid
              people={sortedPeople} show={show} minScore={minScore} dismissed={dismissed}
              onDismiss={onDismiss} radarrIds={radarrIds} addRadarrId={addRadarrId} sort={filmSort}
            />
          ) : (
            sortedPeople.map((p) => (
              <PersonGaps
                key={p.id} p={p} role={role} show={show} minScore={minScore}
                dismissed={dismissed} onDismiss={onDismiss}
                radarrIds={radarrIds} addRadarrId={addRadarrId}
              />
            ))
          )}

          {paginated && data.hasMore && (
            <div className="text-center mt-4">
              <button className="btn-ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore
                  ? 'Cargando…'
                  : `Ver más (${data.offset + data.pageSize} de ${Math.min(data.totalPeople, 500)})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const CANONS = [
  ['alltime', 'Top 250 de siempre', 'https://theyshootpictures.com/gf1000_top250directors.htm'],
  ['21c', 'Top 100 del siglo XXI', 'https://theyshootpictures.com/21stcentury_top100directors.htm'],
];

function AbsentView({ radarrIds, addRadarrId, dismissed, onDismiss }) {
  const [canon, setCanon] = useState('alltime');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = (refresh = false) => {
    setError(null);
    if (refresh) setRefreshing(true);
    else setData(null);
    api(`/discover/absent?canon=${canon}${refresh ? '&refresh=1' : ''}`).then((d) => {
      setRefreshing(false);
      if (d.error) setError(d.error);
      else setData(d);
    });
  };
  useEffect(() => { load(); }, [canon]);

  const canonUrl = CANONS.find(([k]) => k === canon)?.[2];

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {CANONS.map(([k, label]) => (
          <button key={k} onClick={() => setCanon(k)} className={`btn-ghost !py-1 text-sm ${canon === k ? '!border-gold-400 text-gold-400' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorBox error={`${error} — comprueba la API key de TMDB en Ajustes.`} />
      ) : !data ? (
        <Spinner label="Comprobando el canon de grandes directores/as contra tu Plex…" />
      ) : (
      <>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-sm text-zinc-500">
          Del canon de {data.checked} grandes directores/as de{' '}
          <a href={canonUrl} target="_blank" rel="noreferrer" className="underline hover:text-gold-400">They Shoot Pictures</a>,{' '}
          <b className="text-gold-400">{data.absent.length} no tienen ni una película en tu Plex</b> ({data.present.length} sí están).
        </p>
        <button className="btn-ghost !py-1 shrink-0 inline-flex items-center gap-1.5" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : <><RotateCw size={13} strokeWidth={2} /> Actualizar</>}
        </button>
      </div>
      {data.absent.length === 0 ? (
        <Empty>Están todos. Eres un completista de verdad.</Empty>
      ) : (
        data.absent.map((d) => {
          const top = d.top.filter((f) => !dismissed.has(f.tmdb_id));
          const pendingIds = top.filter((f) => !radarrIds.has(f.tmdb_id)).map((f) => f.tmdb_id);
          if (!top.length) return null;
          return (
          <section key={d.tmdb_id} className="card p-4 mb-5">
            <div className="flex items-center gap-3 mb-3">
              {d.profile_path ? (
                <img src={tmdbImg(d.profile_path, 'w185')} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-ink-800 flex items-center justify-center text-zinc-500"><Clapperboard size={18} /></div>
              )}
              <div className="flex-1">
                <div className="font-semibold text-zinc-100">{d.name}</div>
                <div className="text-xs text-zinc-500">{d.filmCount} películas dirigidas · 0 en tu Plex</div>
              </div>
              {pendingIds.length > 1 && (
                <button className="btn-ghost !py-1 text-xs shrink-0 inline-flex items-center gap-1.5" onClick={() => sendBulk(pendingIds, addRadarrId)}>
<Plus size={13} strokeWidth={2.5} /> Añadir las {pendingIds.length} a Radarr
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {top.map((f) => (
                <GapCard key={f.tmdb_id} f={f} radarrIds={radarrIds} addRadarrId={addRadarrId} onDismiss={onDismiss} />
              ))}
            </div>
          </section>
          );
        })
      )}
      {data.present.length > 0 && (
        <details className="mt-6">
          <summary className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-200">
            Ver los {data.present.length} del canon que sí tienes
          </summary>
          <div className="flex flex-wrap gap-2 mt-3">
            {data.present.map((p) => (
              <span key={p.name} className="text-xs bg-ink-800 border border-ink-600 rounded-full px-3 py-1 text-zinc-300">
                {p.name} <span className="text-gold-400">({p.inLibrary})</span>
              </span>
            ))}
          </div>
        </details>
      )}
      </>
      )}
    </div>
  );
}

export default function Discover() {
  const [tab, setTab] = useState('favorites');
  const [favRole, setFavRole] = useState(() => localStorage.getItem('gaps_fav_role') || 'director');
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [show, toggle] = useTypeFilters();
  const [minScore, setMinScoreState] = useState(() => Number(localStorage.getItem('gaps_min_score') || 0));
  const setMinScore = (v) => {
    setMinScoreState(v);
    localStorage.setItem('gaps_min_score', String(v));
  };
  const [dismissed, setDismissed] = useState(new Set());
  useEffect(() => {
    api('/discover/dismissed').then((r) => Array.isArray(r) && setDismissed(new Set(r.map((d) => d.tmdb_id))));
  }, []);
  const onDismiss = (f) => {
    setDismissed((prev) => new Set(prev).add(f.tmdb_id));
    api('/discover/dismiss', { method: 'POST', body: { tmdbId: f.tmdb_id, title: f.title } });
    toast(`✕ «${f.title}» descartada — no volverá a aparecer en los huecos`);
  };
  const setFavRolePref = (r) => { setFavRole(r); localStorage.setItem('gaps_fav_role', r); };

  const gapProps = { radarrIds, addRadarrId, show, toggle, minScore, setMinScore, dismissed, onDismiss };

  return (
    <div>
      <PageHeader eyebrow="La caza" title="Descubrir huecos" />
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        Lo que le falta a tu colección. <b>Tus favoritos</b> son los que tú eliges en{' '}
        <Link to="/favoritos" className="text-gold-400 hover:underline">Favoritos</Link>, cada uno en la faceta por la
        que le sigues; los <b>top</b> son los más presentes en tu biblioteca; y <b>grandes ausentes</b> son nombres del
        canon que aún no tienes. ¿Buscas a alguien concreto? Usa ⌘K o{' '}
        <Link to="/personas" className="text-gold-400 hover:underline">Personas</Link>.
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t)} className={`${tab === t ? 'btn-gold' : 'btn-ghost'} inline-flex items-center gap-2`}>
            <Icon size={15} strokeWidth={1.75} /> {label}
          </button>
        ))}
      </div>

      {tab === 'favorites' && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <span className="text-xs text-zinc-500">Faceta:</span>
          {[['director', 'Como directores/as', Clapperboard], ['actor', 'Como actores/actrices', Drama]].map(([r, label, Icon]) => (
            <button
              key={r}
              onClick={() => setFavRolePref(r)}
              className={`btn-ghost !py-1 text-xs inline-flex items-center gap-1.5 ${favRole === r ? '!border-gold-400 text-gold-400' : ''}`}
            >
              <Icon size={13} strokeWidth={2} /> {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'absent' ? (
        <AbsentView radarrIds={radarrIds} addRadarrId={addRadarrId} dismissed={dismissed} onDismiss={onDismiss} />
      ) : tab === 'favorites' ? (
        <GapsView
          key={`fav-${favRole}`}
          endpoint={`/discover/favorites?role=${favRole}`}
          role={favRole}
          {...gapProps}
          intro={`Qué te falta (ya estrenado) de tus favoritos seguidos como ${favRole === 'director' ? 'directores/as' : 'actores/actrices'}.`}
        />
      ) : (
        <GapsView
          key={tab}
          endpoint={`/discover/gaps?role=${tab}`}
          role={tab}
          paginated
          {...gapProps}
          intro={`Qué te falta de las filmografías de ${tab === 'director' ? 'directores/as' : 'actores/actrices'} más presentes en tu biblioteca.`}
        />
      )}
    </div>
  );
}
