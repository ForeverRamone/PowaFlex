import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api, tmdbImg, fmtDate } from '../api.js';
import {
  Spinner, ErrorBox, TmdbCard, RadarrButton, ProgressBar, Empty, StatusLegend,
  useRadarrIds, useTypeFilters, TypeFilterBar, matchesTypeFilters, DeathBadge,
} from '../components.jsx';
import { toast } from '../toast.js';

const VIEWS = [
  ['all', 'Todas'],
  ['owned', 'Las tienes'],
  ['missing', 'Te faltan'],
  ['upcoming', 'Próximas'],
];

const ROLE_LABEL = { director: 'director/a', actor: 'actor/actriz', writer: 'guionista' };
const ROLE_TAB = { director: '🎬 Como director/a', actor: '🎭 Como actor/actriz', writer: '✍️ Como guionista' };

// Orden de la parrilla. «reciente» replica el orden que ya traía el servidor
// (fecha descendente, las sin fecha/anunciadas primero).
const SORTS = {
  reciente: { label: 'Más recientes', fn: (a, b) => String(b.date || '9999').localeCompare(String(a.date || '9999')) },
  antigua: { label: 'Más antiguas', fn: (a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')) },
  score: { label: 'Nota media Σ', fn: (a, b) => (b.mdb?.score ?? -1) - (a.mdb?.score ?? -1) },
  imdb: { label: 'Nota IMDb', fn: (a, b) => (b.mdb?.imdb ?? -1) - (a.mdb?.imdb ?? -1) },
  letterboxd: { label: 'Nota Letterboxd', fn: (a, b) => (b.mdb?.letterboxd ?? -1) - (a.mdb?.letterboxd ?? -1) },
  votos: { label: 'Más votadas', fn: (a, b) => (b.votes || 0) - (a.votes || 0) },
};

// Igual que en Descubrir: el listón solo esconde lo que tiene nota por debajo;
// lo que no tiene nota se queda a la vista.
const passesScore = (i, minScore) => !minScore || i.mdb?.score == null || i.mdb.score >= minScore;

export default function PersonDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const wantRole = params.get('role') || 'director';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [role, setRole] = useState(null); // active role tab
  // vista, orden y listón sobreviven a la navegación hasta pulsar «Limpiar filtros»
  const [view, setView] = useState(() => localStorage.getItem('person_view') || 'all');
  const [trackedRoles, setTrackedRoles] = useState(new Set()); // facetas seguidas
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [show, toggle, resetTypes] = useTypeFilters();
  const [localShow, setLocalShow] = useState({}); // anulaciones SOLO de esta ficha (documentalistas)
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sort, setSort] = useState(() => localStorage.getItem('person_film_sort') || 'reciente');
  const [minScore, setMinScore] = useState(() => Number(localStorage.getItem('person_min_score') || 0));
  const setSortPref = (v) => { setSort(v); localStorage.setItem('person_film_sort', v); };
  const setMinScorePref = (v) => { setMinScore(v); localStorage.setItem('person_min_score', String(v)); };
  const setViewPref = (v) => { setView(v); localStorage.setItem('person_view', v); };
  const limpiarFiltros = () => {
    setViewPref('all');
    setSortPref('reciente');
    setMinScorePref(0);
    setLocalShow({});
    resetTypes();
  };
  const hayFiltros = view !== 'all' || sort !== 'reciente' || minScore > 0;

  useEffect(() => {
    setData(null);
    setError(null);
    setRole(null);
    setLocalShow({});
    api(`/people/${id}/filmography?role=${wantRole}`).then((d) => {
      if (d.error) setError(d.error);
      else {
        setData(d);
        setRole(d.roles?.[wantRole] ? wantRole : d.primary);
      }
    });
    api('/tracked').then(
      (list) =>
        Array.isArray(list) &&
        setTrackedRoles(new Set(list.filter((t) => t.id === Number(id)).map((t) => t.role || 'director')))
    );
  }, [id, wantRole]);

  // follow/unfollow THE FACET you're looking at: the other one is untouched,
  // so someone can be a favorite director AND actor at once
  const toggleTrack = async (facet) => {
    const siguiendo = trackedRoles.has(facet);
    const r = siguiendo
      ? await api(`/tracked/${id}?role=${facet}`, { method: 'DELETE' })
      : await api(`/tracked/${id}`, { method: 'POST', body: { role: facet } });
    setTrackedRoles((prev) => {
      const next = new Set(prev);
      if (siguiendo) next.delete(facet);
      else {
        next.add(facet);
        if (r?.directorAlso) next.add('director');
        if (r?.actorAlso) next.add('actor');
      }
      return next;
    });
    if (!siguiendo && r?.directorAlso) toast('⭐ Añadido también a directores/as: dirige 4+ películas de tu biblioteca');
    if (!siguiendo && r?.actorAlso) toast('⭐ Añadido también a actores/actrices: tiene 8+ interpretadas en tu biblioteca');
  };

  if (error) return <ErrorBox error={`No se pudo cargar la filmografía: ${error}. ¿Está configurada la API key de TMDB en Ajustes?`} />;
  if (!data) return <Spinner label="Consultando TMDB…" />;
  if (!data.matched)
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">{data.person?.name}</h1>
        <Empty>No se encontró esta persona en TMDB.</Empty>
      </div>
    );

  const { person, roles } = data;
  const roleKeys = Object.keys(roles || {});
  const active = (role && roles[role] && role) || (roles[data.primary] && data.primary) || roleKeys[0];
  if (!active)
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">{person?.name}</h1>
        <Empty>No hay filmografía que mostrar.</Empty>
      </div>
    );
  const { stats, items } = roles[active];

  // En la ficha de un/a documentalista (o de quien filma conciertos), su obra
  // principal no puede llegar escondida por el filtro global de tipos: aquí
  // esos tipos arrancan visibles y el chip los conmuta SOLO en esta ficha,
  // sin tocar el filtro global del resto de páginas.
  const specialistDefaults = {};
  if (stats.documentarian) specialistDefaults.docs = true;
  if (stats.concertFilmmaker) specialistDefaults.music = true;
  const showEff = { ...show, ...specialistDefaults, ...localShow };
  const toggleEff = (k) =>
    k in specialistDefaults ? setLocalShow((p) => ({ ...p, [k]: !showEff[k] })) : toggle(k);

  const typeCounts = {
    shorts: items.filter((i) => i.isShort).length,
    docs: items.filter((i) => i.isDocumentary).length,
    music: items.filter((i) => i.isMusic).length,
    tv: items.filter((i) => i.isTvMovie).length,
    coral: items.filter((i) => i.isCoral).length,
  };
  const filtered = items
    .filter((i) => {
      if (!matchesTypeFilters(i, showEff) || !passesScore(i, minScore)) return false;
      if (view === 'owned') return i.owned;
      if (view === 'missing') return i.released && !i.owned;
      if (view === 'upcoming') return !i.released;
      return true;
    })
    .sort(SORTS[sort]?.fn || SORTS.reciente.fn);

  // bulk-add what's visible in "Te faltan" instead of one click per film
  const missingPendingIds = items
    .filter((i) => matchesTypeFilters(i, showEff) && passesScore(i, minScore) && i.released && !i.owned && !radarrIds.has(i.tmdb_id))
    .map((i) => i.tmdb_id);
  // …y decir cuántas dejan fuera los filtros de tipo y nota, para que el número
  // del botón no parezca que se come parte de la filmografía
  const hiddenMissing = items.filter(
    (i) => !(matchesTypeFilters(i, showEff) && passesScore(i, minScore)) && i.released && !i.owned && !radarrIds.has(i.tmdb_id)
  ).length;
  const bulkAddMissing = async () => {
    setBulkBusy(true);
    const res = await api('/radarr/add-bulk', { method: 'POST', body: { tmdbIds: missingPendingIds.slice(0, 300) } });
    setBulkBusy(false);
    if (res.error) {
      toast(`⚠️ ${res.error}`, 'error');
      return;
    }
    for (const r of res.results || []) if (r.ok || r.alreadyExists) addRadarrId(r.tmdbId);
    toast(
      `✓ ${res.added} añadidas a Radarr${res.alreadyInRadarr ? ` · ${res.alreadyInRadarr} ya estaban` : ''}${res.failed ? ` · ⚠️ ${res.failed} fallaron` : ''}`
    );
  };

  return (
    <div>
      <div className="flex gap-6 items-start mb-6 flex-wrap">
        {person.profile_path && (
          <img src={tmdbImg(person.profile_path, 'w185')} alt="" className="w-28 rounded-xl border border-ink-700" />
        )}
        <div className="flex-1 min-w-60">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-3xl text-zinc-100 leading-tight">{person.name}</h1>
            <DeathBadge deathday={person.deathday} />
            <button
              onClick={() => toggleTrack(active === 'actor' ? 'actor' : 'director')}
              className={trackedRoles.has(active === 'actor' ? 'actor' : 'director') ? 'btn-gold' : 'btn-ghost'}
              title={
                person.deathday
                  ? 'Ya fallecido: no tendrá nuevos estrenos, no hace falta seguirlo'
                  : 'Sigue ESTA faceta: puedes tenerle a la vez en directores y en actores'
              }
            >
              {trackedRoles.has(active === 'actor' ? 'actor' : 'director')
                ? `★ Siguiendo como ${active === 'actor' ? 'actor/actriz' : 'director/a'}`
                : `☆ Seguir como ${active === 'actor' ? 'actor/actriz' : 'director/a'}`}
            </button>
            <Link to={`/biblioteca?personId=${person.id}&personRole=${active}`} className="btn-ghost">
              Ver en tu biblioteca
            </Link>
          </div>
          {person.birthday && (
            <div className="text-sm text-zinc-500 mt-1">
              {fmtDate(person.birthday)}
              {person.deathday && ` — ${fmtDate(person.deathday)}`}
            </div>
          )}

          {/* role switch when the person both directs and acts (#8) */}
          {roleKeys.length > 1 && (
            <div className="flex gap-2 mt-3">
              {roleKeys.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRole(r); setViewPref('all'); }}
                  className={`btn-ghost !py-1 text-xs ${active === r ? '!border-gold-400 text-gold-400' : ''}`}
                >
                  {ROLE_TAB[r] || r} ({roles[r].stats.owned}/{roles[r].stats.released})
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 max-w-md">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-zinc-300">Completismo (como {ROLE_LABEL[active] || active})</span>
              <span className="text-gold-400 font-semibold">
                {stats.owned} / {stats.released} · {stats.pct}%
              </span>
            </div>
            <ProgressBar pct={stats.pct} />
            {active === 'director' && (
              <div className="text-[11px] text-zinc-500 mt-1">
                Solo largometrajes
                {stats.documentarian ? ' (incluye documentales: es documentalista)' : ''}
                {stats.concertFilmmaker ? ' (incluye conciertos: los filma a menudo)' : ''}
                {stats.excludedFromCompletion > 0 && ` · ${stats.excludedFromCompletion} fuera del cómputo (cortos, TV, docs, conciertos o dirección coral)`}
              </div>
            )}
            {stats.upcoming > 0 && (
              <div className="text-xs text-sky-300 mt-2">🗓️ {stats.upcoming} proyectos anunciados o por estrenar</div>
            )}
          </div>
          {person.biography && (
            <p className="text-sm text-zinc-400 mt-3 leading-relaxed max-w-3xl line-clamp-4">{person.biography}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {VIEWS.map(([v, label]) => (
          <button key={v} onClick={() => setViewPref(v)} className={view === v ? 'btn-gold' : 'btn-ghost'}>
            {label}
            {v === 'missing' && ` (${stats.released - stats.owned})`}
            {v === 'upcoming' && ` (${stats.upcoming})`}
          </button>
        ))}
        {/* acción, no pestaña: antes vivía solo dentro de «Te faltan» y con el
            mismo `btn-ghost` que los conmutadores de vista, así que se leía
            como una pestaña más */}
        {missingPendingIds.length > 0 && (
          <button className="btn-gold ml-auto" disabled={bulkBusy} onClick={bulkAddMissing}>
            {bulkBusy ? 'Añadiendo…' : `➕ Mandar a Radarr las ${missingPendingIds.length} que te faltan`}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <StatusLegend />
        {hiddenMissing > 0 && (
          <span className="text-[11px] text-zinc-500">
            {hiddenMissing} más quedan fuera por los filtros de abajo (tipo o nota mínima)
          </span>
        )}
      </div>

      {Object.values(typeCounts).some((n) => n > 0) && (
        <TypeFilterBar show={showEff} toggle={toggleEff} counts={typeCounts} />
      )}

      {/* orden y listón de nota, con las notas de MDBList que trae el servidor */}
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap mb-4 text-sm">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Ordenar:
          <select className="input !w-auto !py-1 text-xs" value={sort} onChange={(e) => setSortPref(e.target.value)}>
            {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500">Nota mínima Σ:</span>
          {[0, 40, 50, 60, 70].map((v) => (
            <button
              key={v}
              onClick={() => setMinScorePref(v)}
              className={`btn-ghost !py-1 text-xs ${minScore === v ? '!border-gold-400 text-gold-400' : ''}`}
            >
              {v === 0 ? 'Todas' : `Σ ≥ ${v}`}
            </button>
          ))}
          <span className="text-xs text-zinc-600">(las sin nota no se ocultan)</span>
        </div>
        {hayFiltros && (
          <button className="btn-ghost !py-1 text-xs" onClick={limpiarFiltros}>✕ Limpiar filtros</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty>Nada que mostrar aquí. {view === 'missing' && '¡Filmografía completa! 🏆'}</Empty>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {filtered.map((item) => (
            <TmdbCard
              key={item.tmdb_id}
              item={item}
              badge={
                item.owned ? (
                  <span className="absolute top-1.5 right-1.5 bg-emerald-600/90 text-white text-[11px] px-1.5 py-0.5 rounded">✓ La tienes</span>
                ) : !item.released ? (
                  <span className="absolute top-1.5 right-1.5 bg-sky-600/90 text-white text-[11px] px-1.5 py-0.5 rounded">
                    {item.date ? fmtDate(item.date) : 'Anunciada'}
                  </span>
                ) : null
              }
            >
              {item.mdb?.score != null && (
                <div className="text-[11px] text-gold-400/90 tabular">
                  Σ {item.mdb.score}
                  {item.mdb.imdb != null ? ` · IMDb ${Number(item.mdb.imdb).toFixed(1)}` : ''}
                </div>
              )}
              {!item.owned && (
                <RadarrButton tmdbId={item.tmdb_id} small alreadyInRadarr={radarrIds.has(item.tmdb_id)} onAdded={addRadarrId} />
              )}
            </TmdbCard>
          ))}
        </div>
      )}
    </div>
  );
}
