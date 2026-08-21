import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import { Star, Clapperboard, Drama, Landmark, Plus, RotateCw, User, LayoutGrid, X, Layers, EyeOff, UserX } from 'lucide-react';
import {
  Spinner, Progreso, useCargaProgresiva, ErrorBox, TmdbCard, RadarrButton, ProgressBar, Empty, BuildProgress,
  useRadarrIds, useTypeFilters, TypeFilterBar, matchesTypeFilters, typeCounts, PageHeader, Signature, Select,
  MinScoreBar, passesScore, useMinScore, useAvales, conAval } from '../components.jsx';
import { toast } from '../toast.js';
import { addBulkToRadarr } from '../radarr.js';
import { t, locale } from '../i18n.js';

// las sagas se cazan aquí desde que /colecciones dejó de ser página propia
const Sagas = lazy(() => import('./Sagas.jsx'));

const TABS = [
  ['favorites', 'Tus favoritos', Star],
  ['director', 'Directores/as top', Clapperboard],
  ['actor', 'Actores/actrices top', Drama],
  ['absent', 'Grandes ausentes', Landmark],
  ['sagas', 'Sagas', Layers],
];

// send a visible batch to Radarr in one go
async function sendBulk(ids, addRadarrId) {
  const { error, summary } = await addBulkToRadarr(ids, { onAdded: addRadarrId });
  if (summary) toast(summary, error ? 'error' : undefined);
}

/**
 * Lo que de verdad se pinta de una persona.
 *
 * `ocultarRadarr` es el filtro que faltaba para el completismo por tandas: lo
 * que ya has mandado a Radarr está resuelto —llegará cuando llegue— y seguía
 * ocupando sitio en la parrilla, así que cada visita había que volver a
 * distinguir a ojo lo pendiente de lo ya pedido. Va aparte del ✕ de descartar,
 * que es «esta no me interesa» y es para siempre.
 */
const visibleMissing = (p, show, minScore, dismissed, ocultarRadarr = false, radarrIds = null) =>
  (p.missing || []).filter(
    (f) =>
      !dismissed.has(f.tmdb_id) &&
      !(ocultarRadarr && radarrIds?.has(f.tmdb_id)) &&
      matchesTypeFilters(f, show) &&
      passesScore(f, minScore)
  );

function GapCard({ f, radarrIds, addRadarrId, onDismiss, person, avales }) {
  return (
    <TmdbCard item={conAval(f, avales)}>
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
          title={t('No me interesa: no volverá a aparecer en los huecos')}
          onClick={() => onDismiss(f)}
          className="text-zinc-500 hover:text-red-400 text-xs px-1 shrink-0"
        >
          ✕
        </button>
      </div>
    </TmdbCard>
  );
}

function PersonGaps({ p, role, show, minScore, dismissed, onDismiss, radarrIds, addRadarrId, ocultarRadarr, ocultarVacios, avales }) {
  const shown = visibleMissing(p, show, minScore, dismissed, ocultarRadarr, radarrIds);
  const alive = (p.missing || []).filter((f) => !dismissed.has(f.tmdb_id));
  const hidden = alive.length - shown.length;
  const pendingIds = shown.filter((f) => !radarrIds.has(f.tmdb_id)).map((f) => f.tmdb_id);

  // never vanish silently: with everything filtered out, keep a compact row so
  // "no aparece" can't be read as "no le falta nada"
  // …salvo que hayas pedido justo eso: con listas largas, media pantalla de
  // filas «todas ocultas por tus filtros» es ruido, y por eso el interruptor.
  if (!shown.length && ocultarVacios) return null;
  if (!shown.length) {
    return (
      <section className="card p-3 mb-3 flex items-center justify-between flex-wrap gap-2 text-sm">
        <Link to={`/personas/${p.id}?role=${p.role || role}`} className="font-semibold text-zinc-300 hover:text-gold-400">
          {p.name} →<Signature films={p.signature} />
        </Link>
        <span className="text-xs text-zinc-500">
          {p.missingTotal === 0 ? t('✓ filmografía completa') : t('{n} te faltan · todas ocultas por tus filtros', { n: p.missingTotal })}
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
            {t('Tienes')} <b className="text-gold-400">{p.owned}</b> {t('de {released} estrenadas ({pct}%) · {missing} te faltan', { released: p.released, pct: p.pct, missing: p.missingTotal })}
            {hidden > 0 ? t(' · {n} ocultas por filtros', { n: hidden }) : ''}
          </span>
          {pendingIds.length > 1 && (
            <button className="btn-ghost !py-1 text-xs shrink-0 inline-flex items-center gap-1.5" onClick={() => sendBulk(pendingIds, addRadarrId)}>
<Plus size={13} strokeWidth={2.5} /> {pendingIds.length > 300 ? t('Añadir 300 de las {n} visibles a Radarr', { n: pendingIds.length }) : t('Añadir las {n} visibles a Radarr', { n: pendingIds.length })}
            </button>
          )}
        </div>
      </div>
      <div className="max-w-sm mb-4"><ProgressBar pct={p.pct} /></div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {shown.map((f) => (
          <GapCard key={f.tmdb_id} f={f} radarrIds={radarrIds} addRadarrId={addRadarrId} onDismiss={onDismiss} avales={avales} />
        ))}
      </div>
    </section>
  );
}

const PERSON_SORTS = {
  huecos: { label: 'Más huecos primero', fn: (a, b) => (b.missingTotal || 0) - (a.missingTotal || 0) },
  biblioteca: { label: 'Más películas en tu Plex', fn: (a, b) => (b.inLibrary || b.owned || 0) - (a.inLibrary || a.owned || 0) },
  completismo: { label: 'Menos completos primero', fn: (a, b) => (a.pct ?? 101) - (b.pct ?? 101) },
  nombre: { label: 'Nombre (A-Z)', fn: (a, b) => a.name.localeCompare(b.name) },
};
const FILM_SORTS = {
  score: { label: 'Nota combinada Σ', fn: (a, b) => (b.mdb?.score ?? -1) - (a.mdb?.score ?? -1) },
  votos: { label: 'Más votadas', fn: (a, b) => (b.votes || 0) - (a.votes || 0) },
  reciente: { label: 'Más recientes', fn: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
  antigua: { label: 'Más antiguas', fn: (a, b) => String(a.date || '').localeCompare(String(b.date || '')) },
  titulo: { label: 'Título (A-Z)', fn: (a, b) => a.title.localeCompare(b.title) },
  // el orden que solo esta página puede dar: qué hueco está respaldado por más
  // premios y cánones. A igualdad de avales, mandan los ganados.
  avales: {
    label: 'Más avalada (premios y cánones)',
    fn: (a, b) => (b.avales?.total || 0) - (a.avales?.total || 0) || (b.avales?.ganados || 0) - (a.avales?.ganados || 0),
  },
};

/** All missing films of everyone, in one grid — no person-by-person scrolling. */
function FilmGrid({ people, show, minScore, dismissed, onDismiss, radarrIds, addRadarrId, sort, ocultarRadarr, avales }) {
  const byId = new Map();
  for (const p of people) {
    for (const f of visibleMissing(p, show, minScore, dismissed, ocultarRadarr, radarrIds)) {
      if (!byId.has(f.tmdb_id)) byId.set(f.tmdb_id, { ...f, _person: { id: p.id, name: p.name, role: p.role } });
    }
  }
  // los avales entran ANTES de ordenar: si no, «más avalada» ordenaría por un
  // campo que la tarjeta pinta pero la lista no tiene
  const films = [...byId.values()].map((f) => conAval(f, avales)).sort(FILM_SORTS[sort]?.fn || FILM_SORTS.score.fn);
  const pendingIds = films.filter((f) => !radarrIds.has(f.tmdb_id)).map((f) => f.tmdb_id);

  if (!films.length) return <Empty>{t('Nada que rellenar con estos filtros.')}</Empty>;
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <span className="text-sm text-zinc-400">
          <b className="text-gold-400">{films.length}</b> {t('películas te faltan en total')}
        </span>
        {pendingIds.length > 1 && (
          <button className="btn-gold !py-1 text-xs inline-flex items-center gap-1.5" onClick={() => sendBulk(pendingIds.slice(0, 300), addRadarrId)}>
<Plus size={13} strokeWidth={2.5} /> {t('Añadir {n} a Radarr', { n: Math.min(pendingIds.length, 300) })}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
        {films.map((f) => (
          <GapCard
            key={f.tmdb_id}
            f={f}
            person={f._person}
            avales={avales}
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
  dismissed, onDismiss, intro, paginated, clearBaseFilters, cargando,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState(() => localStorage.getItem('gaps_view') || 'person');
  const [personSort, setPersonSort] = useState(() => localStorage.getItem('gaps_person_sort') || 'huecos');
  const [filmSort, setFilmSort] = useState(() => localStorage.getItem('gaps_film_sort') || 'score');
  // los dos interruptores de «enséñame solo lo que me queda por decidir»
  const [ocultarRadarr, setOcultarRadarr] = useState(() => localStorage.getItem('gaps_hide_radarr') === '1');
  const [ocultarVacios, setOcultarVacios] = useState(() => localStorage.getItem('gaps_hide_empty') === '1');
  const setOcultarRadarrPref = (v) => { setOcultarRadarr(v); localStorage.setItem('gaps_hide_radarr', v ? '1' : '0'); };
  const setOcultarVaciosPref = (v) => { setOcultarVacios(v); localStorage.setItem('gaps_hide_empty', v ? '1' : '0'); };

  const setViewPref = (v) => { setView(v); localStorage.setItem('gaps_view', v); };
  const setPersonSortPref = (v) => { setPersonSort(v); localStorage.setItem('gaps_person_sort', v); };
  const setFilmSortPref = (v) => { setFilmSort(v); localStorage.setItem('gaps_film_sort', v); };

  // cambiar un filtro relanza la carga sin esperar a la anterior: cada petición
  // lleva su número y solo la última en salir puede pintar, para que una
  // respuesta lenta (un cruce de filmografías sin cachear) no pise a la nueva
  const reqId = useRef(0);
  const load = (refresh = false) => {
    const id = ++reqId.current;
    setError(null);
    if (refresh) setRefreshing(true);
    else setData(null);
    api(`${endpoint}${refresh ? (endpoint.includes('?') ? '&' : '?') + 'refresh=1' : ''}`).then((d) => {
      if (id !== reqId.current) return;
      setRefreshing(false);
      if (d.error) setError(d.error);
      else setData(d);
    });
  };
  useEffect(() => { load(); }, [endpoint]);

  // En cuántos palmareses y cánones está cada hueco: una sola petición para
  // toda la página. Va AQUÍ, antes de los `return` de error y de carga, porque
  // `useAvales` es un hook y no puede quedar detrás de una salida temprana.
  const idsVisibles = useMemo(
    () => [...new Set((data?.people || []).flatMap((p) => (p.missing || []).map((f) => f.tmdb_id).filter(Boolean)))],
    [data]
  );
  const avales = useAvales(idsVisibles);

  // walk the ranking further down (top tabs only)
  const loadMore = () => {
    const id = ++reqId.current;
    setLoadingMore(true);
    const next = (data.offset || 0) + (data.pageSize || 20);
    api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}offset=${next}`).then((d) => {
      if (id !== reqId.current) return;
      setLoadingMore(false);
      if (d.error) return setError(d.error);
      setData({ ...d, people: [...data.people, ...d.people] });
    });
  };

  if (error) return <ErrorBox error={t('{error} — comprueba la API key de TMDB en Ajustes.', { error })} />;
  // BuildProgress y no Progreso: aquí hay UNA petición, pero mientras el
  // servidor arma el cruce va publicando done/total en /build-progress, y ese
  // es el único porcentaje de verdad que se puede enseñar. La etiqueta la pone
  // cada pestaña: no es lo mismo cruzar tus favoritos que ordenar el top.
  if (!data) return <BuildProgress label={cargando || t('Cruzando filmografías con TMDB…')} />;

  // people with something still missing drive this page
  const withGaps = (data.people || []).filter((p) => (p.missingTotal || 0) > 0);
  const sortedPeople = [...withGaps].sort(PERSON_SORTS[personSort]?.fn || PERSON_SORTS.huecos.fn);
  const complete = (data.people || []).length - withGaps.length;
  // cuántas de las que TIENEN huecos se quedan sin nada que enseñar
  const escondidas = withGaps.filter(
    (p) => visibleMissing(p, show, minScore, dismissed, ocultarRadarr, radarrIds).length === 0
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-sm text-zinc-500">
          {intro} {t('Actualizado {date}.', { date: new Date(data.generatedAt).toLocaleString(locale()) })}
          {complete > 0 && <span className="text-emerald-400"> · {t('{n} con filmografía completa', { n: complete })}</span>}
        </p>
        <button className="btn-ghost !py-1 shrink-0 inline-flex items-center gap-1.5" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? t('Actualizando…') : <><RotateCw size={13} strokeWidth={2} /> {t('Actualizar')}</>}
        </button>
      </div>

      {data.people.length === 0 ? (
        <Empty>
          {data.totalPeople === 0
            ? t('Nadie en tu biblioteca casa con esos filtros. Puede que falten datos demográficos: amplíalos en Ajustes → «Actualizar estado vital».')
            : t('Nada que rellenar aquí: filmografías completas.')}
        </Empty>
      ) : (
        <>
          <div className="card p-3 mb-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-xs text-zinc-500">{t('Vista:')}</span>
              <button
                onClick={() => setViewPref('person')}
                className={`btn-ghost !py-1 text-xs inline-flex items-center gap-1.5 ${view === 'person' ? '!border-gold-400 text-gold-400' : ''}`}
              >
<User size={13} strokeWidth={2} /> {t('Por persona')}
              </button>
              <button
                onClick={() => setViewPref('grid')}
                className={`btn-ghost !py-1 text-xs inline-flex items-center gap-1.5 ${view === 'grid' ? '!border-gold-400 text-gold-400' : ''}`}
              >
<LayoutGrid size={13} strokeWidth={2} /> {t('Todas las películas juntas')}
              </button>
              <span className="text-xs text-zinc-500 ml-2">{t('Ordenar:')}</span>
              {view === 'person' ? (
                <Select className="!py-1 text-xs" value={personSort} onChange={setPersonSortPref}
                  options={Object.entries(PERSON_SORTS).map(([k, s]) => [k, t(s.label)])} />
              ) : (
                <Select className="!py-1 text-xs" value={filmSort} onChange={setFilmSortPref}
                  options={Object.entries(FILM_SORTS).map(([k, s]) => [k, t(s.label)])} />
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <MinScoreBar minScore={minScore} setMinScore={setMinScore} />
              <button
                onClick={() => setOcultarRadarrPref(!ocultarRadarr)}
                className={`btn-ghost !py-1 text-xs inline-flex items-center gap-1.5 ${ocultarRadarr ? '!border-gold-400 text-gold-400' : ''}`}
                title={t('Lo que ya has mandado a Radarr está decidido: esto lo quita de la parrilla para dejar solo lo que falta por pedir')}
              >
                <EyeOff size={13} strokeWidth={2} /> {t('Ocultar las que ya están en Radarr')}
              </button>
              {view === 'person' && (
                <button
                  onClick={() => setOcultarVaciosPref(!ocultarVacios)}
                  className={`btn-ghost !py-1 text-xs inline-flex items-center gap-1.5 ${ocultarVacios ? '!border-gold-400 text-gold-400' : ''}`}
                  title={t('Quita de la lista a quien, con los filtros puestos, no ofrece ninguna película')}
                >
                  <UserX size={13} strokeWidth={2} /> {t('Ocultar a quien no ofrece nada')}
                </button>
              )}
              <button
                className="btn-ghost !py-1 text-xs"
                title={t('Vuelve la página a su estado de fábrica: vista, orden, nota mínima y filtros de tipo')}
                onClick={() => {
                  clearBaseFilters?.();
                  setViewPref('person');
                  setPersonSortPref('huecos');
                  setFilmSortPref('score');
                  setOcultarRadarrPref(false);
                  setOcultarVaciosPref(false);
                }}
              >
                {t('✕ Limpiar filtros')}
              </button>
            </div>
          </div>

          {/* las siete claves contadas siempre (typeCounts, components.jsx):
              omitir una pintaba su chip sin recuento en vez de esconderlo */}
          <TypeFilterBar show={show} toggle={toggle} counts={typeCounts(data.people.flatMap((p) => p.missing || []))} />

          {view === 'grid' ? (
            <FilmGrid
              people={sortedPeople} show={show} minScore={minScore} dismissed={dismissed}
              onDismiss={onDismiss} radarrIds={radarrIds} addRadarrId={addRadarrId} sort={filmSort}
              ocultarRadarr={ocultarRadarr} avales={avales}
            />
          ) : (
            <>
              {sortedPeople.map((p) => (
                <PersonGaps
                  key={p.id} p={p} role={role} show={show} minScore={minScore}
                  dismissed={dismissed} onDismiss={onDismiss}
                  radarrIds={radarrIds} addRadarrId={addRadarrId}
                  ocultarRadarr={ocultarRadarr} ocultarVacios={ocultarVacios} avales={avales}
                />
              ))}
              {/* la cuenta de quién se ha escondido: sin ella, «ocultar a quien
                  no ofrece nada» deja una página más corta sin explicar por qué */}
              {ocultarVacios && escondidas > 0 && (
                <p className="text-xs text-zinc-500 mb-4">
                  {t('{n} personas escondidas: con estos filtros no ofrecen ninguna película.', { n: escondidas })}
                </p>
              )}
            </>
          )}

          {paginated && data.hasMore && (
            <div className="text-center mt-4">
              <button className="btn-ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore
                  ? t('Cargando…')
                  : t('Ver más ({shown} de {total})', { shown: data.offset + data.pageSize, total: Math.min(data.totalPeople, 500) })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const CANON_URLS = {
  alltime: 'https://theyshootpictures.com/gf1000_top250directors.htm',
  '21c': 'https://theyshootpictures.com/21stcentury_top100directors.htm',
  'tmdb-popular': 'https://www.themoviedb.org/person',
  imdb501: 'https://www.imdb.com/list/ls000774551/',
};

/** Pegar una lista de nombres (la de IMDb, la de un libro…) como canon propio. */
function NewCanonForm({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [names, setNames] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const r = await api('/discover/canons', { method: 'POST', body: { label, names } });
    setBusy(false);
    if (r.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    toast(t('✓ «{label}» guardada con {n} nombres', { label: r.label, n: r.count }), 'success');
    setLabel(''); setNames(''); setOpen(false);
    onSaved(r.key);
  };

  if (!open) {
    return (
      <button className="btn-ghost !py-1 text-sm inline-flex items-center gap-1.5" onClick={() => setOpen(true)}>
        <Plus size={13} strokeWidth={2.5} /> {t('Lista propia')}
      </button>
    );
  }
  return (
    <div className="card p-4 mb-4 w-full">
      <div className="text-sm text-zinc-300 mb-2">
        {t('Pega aquí cualquier lista de directores/as —una por línea— y se convierte en un canon más. Vale copiada de IMDb, de un libro o escrita a mano; la numeración («12. Chantal Akerman») se ignora sola.')}
      </div>
      <input
        className="input mb-2"
        placeholder={t('Nombre de la lista (p. ej. «IMDb · 501 Directors»)')}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <textarea
        className="input h-40 font-mono text-xs"
        placeholder={'Chantal Akerman\nRobert Aldrich\nTomás Gutiérrez Alea\n…'}
        value={names}
        onChange={(e) => setNames(e.target.value)}
      />
      <div className="flex gap-2 mt-2">
        <button className="btn-gold" onClick={save} disabled={busy || !names.trim()}>
          {busy ? t('Guardando…') : t('Guardar canon')}
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>{t('Cancelar')}</button>
      </div>
    </div>
  );
}

/**
 * El nombre de un «gran ausente» abre su ficha. Como no está en tu biblioteca,
 * puede que no tenga fila propia todavía: la primera vez se crea al vuelo (solo
 * la ficha, seguirlo es otra cosa) y luego se navega.
 */
function AbsentName({ person }) {
  const navigate = useNavigate();
  const [yendo, setYendo] = useState(false);
  const abrir = async () => {
    if (person.personId) return navigate(`/personas/${person.personId}?role=director`);
    setYendo(true);
    const r = await api('/people/from-tmdb', {
      method: 'POST',
      body: { tmdbId: person.tmdb_id, name: person.name, profilePath: person.profile_path },
    });
    setYendo(false);
    if (r.personId) navigate(`/personas/${r.personId}?role=director`);
    else toast(`⚠️ ${t(r.error || t('No se ha podido abrir su ficha'))}`, 'error');
  };
  return (
    <button
      onClick={abrir}
      disabled={yendo}
      className="font-semibold text-zinc-100 hover:text-gold-400 transition-colors text-left truncate block max-w-full"
      title={t('Ver la ficha de {name}', { name: person.name })}
    >
      {person.name} {yendo ? '…' : '→'}
    </button>
  );
}

/** Añadir a favoritos sin salir de la página. */
function FollowButton({ person, seguido, onSeguir }) {
  const [ocupado, setOcupado] = useState(false);
  if (seguido) {
    return (
      <span className="text-xs text-gold-400 shrink-0 inline-flex items-center gap-1" title={t('Ya lo sigues')}>
        <Star size={13} strokeWidth={2.5} /> {t('En favoritos')}
      </span>
    );
  }
  return (
    <button
      className="btn-ghost !py-1 text-xs shrink-0 inline-flex items-center gap-1.5"
      disabled={ocupado}
      title={t('Añadir a tus directores/as favoritos: entrará en el calendario y en los huecos')}
      onClick={async () => { setOcupado(true); await onSeguir(person); setOcupado(false); }}
    >
      <Star size={13} strokeWidth={2.5} /> {ocupado ? t('Añadiendo…') : t('Seguir')}
    </button>
  );
}

function AbsentView({ radarrIds, addRadarrId, dismissed, onDismiss }) {
  const [canon, setCanon] = useState('alltime');
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Las tres a la vez: la lista de cánones y a quién sigues no hacen falta para
  // lanzar la comparación, y son un milisegundo cada una frente a los seis
  // segundos de la tercera. Se rehacen al cambiar de canon porque el canon es
  // justo lo que decide qué se compara.
  const carga = useCargaProgresiva([
    { clave: 'canones', etiqueta: t('Buscando los cánones disponibles…'), carga: () => api('/discover/canons') },
    { clave: 'seguidos', etiqueta: t('Comprobando a quién ya sigues…'), carga: () => api('/tracked') },
    {
      clave: 'ausentes',
      etiqueta: t('Comparando el canon de grandes directores/as con tu Plex…'),
      carga: () => api(`/discover/absent?canon=${canon}`),
    },
  ], [canon]);

  // guardar o borrar una lista propia cambia los cánones sin recargar nada más
  const [canonesFrescos, setCanonesFrescos] = useState(null);
  const loadCanons = () => api('/discover/canons').then((r) => Array.isArray(r) && setCanonesFrescos(r));
  const canons = canonesFrescos ?? (Array.isArray(carga.datos.canones) ? carga.datos.canones : []);

  // quiénes sigues ya, para no ofrecer «Seguir» a quien está en favoritos
  const [seguidos, setSeguidos] = useState(new Set());
  useEffect(() => {
    const r = carga.datos.seguidos;
    if (Array.isArray(r)) setSeguidos(new Set(r.map((p) => p.tmdb_id).filter(Boolean)));
  }, [carga.datos.seguidos]);
  const onSeguir = async (person) => {
    const r = await api('/tracked/tmdb-bulk', {
      method: 'POST',
      body: {
        role: 'director',
        people: [{ tmdbId: person.tmdb_id, name: person.name, profilePath: person.profile_path }],
      },
    });
    if (r.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    setSeguidos((prev) => new Set(prev).add(person.tmdb_id));
    toast(t('⭐ {name} añadido a tus directores/as favoritos', { name: person.name }), 'success');
  };

  // borrar un canon propio destruye la lista de nombres que el usuario pegó a
  // mano: sin vuelta atrás, así que se pregunta antes con su nombre delante
  const removeCanon = async (c) => {
    if (!window.confirm(t('¿Borrar la lista «{name}»? No hay papelera: habría que volver a pegar los nombres.', { name: c.label }))) return;
    const r = await api(`/discover/canons/${encodeURIComponent(c.key)}`, { method: 'DELETE' });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    if (canon === c.key) setCanon('alltime');
    loadCanons();
  };

  // «Actualizar» rehace SOLO la comparación (es lo único que se recalcula) y su
  // resultado manda sobre el de la primera carga
  const [dataFresca, setDataFresca] = useState(null);
  const refrescar = () => {
    setError(null);
    setRefreshing(true);
    api(`/discover/absent?canon=${canon}&refresh=1`).then((d) => {
      setRefreshing(false);
      if (d.error) setError(d.error);
      else setDataFresca(d);
    });
  };
  // al cambiar de canon lo refrescado ya no vale: es de otra lista
  useEffect(() => { setDataFresca(null); setError(null); }, [canon]);

  const bruto = dataFresca ?? carga.datos.ausentes ?? null;
  const fallo = error ?? bruto?.error ?? null;
  const data = bruto && !bruto.error ? bruto : null;

  const canonUrl = CANON_URLS[canon];
  const activo = canons.find((c) => c.key === canon);

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {canons.map((c) => (
          <span key={c.key} className="inline-flex items-center">
            <button
              onClick={() => setCanon(c.key)}
              title={c.count ? t('{n} nombres', { n: c.count }) : t('Se actualiza solo con el ranking de TMDB')}
              className={`btn-ghost !py-1 text-sm ${canon === c.key ? '!border-gold-400 text-gold-400' : ''}`}
            >
              {c.label}
            </button>
            {!c.builtin && (
              <button
                onClick={() => removeCanon(c)}
                title={t('Borrar esta lista')}
                className="text-zinc-600 hover:text-red-400 ml-1"
              >
                <X size={13} />
              </button>
            )}
          </span>
        ))}
        <NewCanonForm onSaved={(key) => { loadCanons(); setCanon(key); }} />
      </div>

      {fallo ? (
        <ErrorBox error={t('{error} — comprueba la API key de TMDB en Ajustes.', { error: fallo })} />
      ) : !data ? (
        <Progreso {...carga} />
      ) : (
      <>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-sm text-zinc-500">
          {t('De los {n} directores/as de', { n: data.checked })}{' '}
          {canonUrl ? (
            <a href={canonUrl} target="_blank" rel="noreferrer" className="underline hover:text-gold-400">
              {activo?.label || t('la lista')}
            </a>
          ) : (
            <b className="text-zinc-300">{activo?.label || t('tu lista')}</b>
          )}
          ,{' '}
          <b className="text-gold-400">{t('{n} no tienen ni una película en tu Plex', { n: data.absent.length })}</b> {t('({n} sí están).', { n: data.present.length })}
        </p>
        <button className="btn-ghost !py-1 shrink-0 inline-flex items-center gap-1.5" onClick={refrescar} disabled={refreshing}>
          {refreshing ? t('Actualizando…') : <><RotateCw size={13} strokeWidth={2} /> {t('Actualizar')}</>}
        </button>
      </div>
      {data.absent.length === 0 ? (
        <Empty>{t('Están todos. Eres un completista de verdad.')}</Empty>
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
              <div className="flex-1 min-w-0">
                <AbsentName person={d} />
                <div className="text-xs text-zinc-500">{t('{n} películas dirigidas · 0 en tu Plex', { n: d.filmCount })}</div>
              </div>
              <FollowButton person={d} seguido={seguidos.has(d.tmdb_id)} onSeguir={onSeguir} />
              {pendingIds.length > 1 && (
                <button className="btn-ghost !py-1 text-xs shrink-0 inline-flex items-center gap-1.5" onClick={() => sendBulk(pendingIds, addRadarrId)}>
<Plus size={13} strokeWidth={2.5} /> {t('Añadir las {n} a Radarr', { n: pendingIds.length })}
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
            {t('Ver los {n} del canon que sí tienes', { n: data.present.length })}
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

const DEMO_VACIO = { gender: '', life: '', continent: '', country: '' };

const TAB_KEYS = new Set(TABS.map(([t]) => t));

export default function Discover() {
  // la pestaña vive en la URL: se puede enlazar («/descubrir?tab=sagas») y
  // /colecciones redirige aquí sin romper marcadores viejos
  const [params, setParams] = useSearchParams();
  const tab = TAB_KEYS.has(params.get('tab')) ? params.get('tab') : 'favorites';
  const setTab = (t) => setParams(t === 'favorites' ? {} : { tab: t });
  const [favRole, setFavRole] = useState(() => localStorage.getItem('gaps_fav_role') || 'director');
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [show, toggle, resetTypes] = useTypeFilters();
  // listón Σ compartido con el resto de páginas (hereda el gaps_min_score viejo)
  const [minScore, setMinScore] = useMinScore();
  // filtros demográficos de las pestañas «top», compartidos con Personas bajo
  // una única clave: elegir «mujeres españolas» en una página vale en la otra.
  // La primera lectura hereda de las claves viejas de cada página.
  const [demo, setDemo] = useState(() => {
    try {
      const crudo = localStorage.getItem('demo_filters')
        ?? localStorage.getItem('gaps_demo_filters')
        ?? localStorage.getItem('people_filters');
      return { ...DEMO_VACIO, ...JSON.parse(crudo || '{}') };
    } catch {
      return { ...DEMO_VACIO };
    }
  });
  useEffect(() => {
    localStorage.setItem('demo_filters', JSON.stringify(demo));
  }, [demo]);
  const setDemoFilter = (k) => (v) => setDemo((prev) => ({ ...prev, [k]: v }));
  const demoActivo = Object.values(demo).some(Boolean);
  // opciones de continente/país: se piden la primera vez que se entra a un top
  const [demoOpts, setDemoOpts] = useState(null);
  useEffect(() => {
    if ((tab === 'director' || tab === 'actor') && !demoOpts)
      api('/people/filter-options').then((o) => !o.error && setDemoOpts(o));
  }, [tab, demoOpts]);
  const demoQs = Object.entries(demo)
    .filter(([, v]) => v)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join('');
  // la parte del padre de «limpiar filtros»: listón de nota, filtros de tipo y
  // demografía (la vista y los órdenes viven en GapsView, que completa la limpieza)
  const clearBaseFilters = () => {
    setMinScore(0);
    resetTypes();
    setDemo({ ...DEMO_VACIO });
  };
  // los oficios los manda el servidor: la lista vivía aquí a mano y se quedó
  // vieja en cuanto la 1.04 pasó de dos a seis
  const [roles, setRoles] = useState([
    { key: 'director', label: 'Directores/as' },
    { key: 'actor', label: 'Actores/actrices' },
  ]);
  useEffect(() => {
    api('/roles').then((r) => Array.isArray(r) && r.length && setRoles(r));
  }, []);
  const [dismissed, setDismissed] = useState(new Set());
  useEffect(() => {
    api('/discover/dismissed').then((r) => Array.isArray(r) && setDismissed(new Set(r.map((d) => d.tmdb_id))));
  }, []);
  // Descartar es reversible: el aviso lleva un «deshacer», porque antes una
  // película descartada por error no volvía a aparecer nunca.
  const undismiss = async (f) => {
    const r = await api(`/discover/dismiss/${f.tmdb_id}`, { method: 'DELETE' });
    if (r.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    setDismissed((prev) => { const n = new Set(prev); n.delete(f.tmdb_id); return n; });
    toast(t('↩︎ «{title}» vuelve a la lista', { title: f.title }));
  };
  const onDismiss = async (f) => {
    setDismissed((prev) => new Set(prev).add(f.tmdb_id));
    const r = await api('/discover/dismiss', { method: 'POST', body: { tmdbId: f.tmdb_id, title: f.title } });
    // si el servidor no la aceptó, no se puede cantar que está descartada
    if (r.error) {
      setDismissed((prev) => { const n = new Set(prev); n.delete(f.tmdb_id); return n; });
      return toast(t('⚠️ No se ha podido descartar: {error}', { error: r.error }), 'error');
    }
    toast(t('✕ «{title}» descartada', { title: f.title }), 'info', { label: t('Deshacer'), onClick: () => undismiss(f) });
  };
  const setFavRolePref = (r) => { setFavRole(r); localStorage.setItem('gaps_fav_role', r); };

  const gapProps = { radarrIds, addRadarrId, show, toggle, minScore, setMinScore, dismissed, onDismiss, clearBaseFilters };

  return (
    <div>
      <PageHeader eyebrow={t('La caza')} title={t('Descubrir huecos')} />
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        {t('Lo que le falta a tu colección.')} <b>{t('Tus favoritos')}</b> {t('son los que tú eliges en')}{' '}
        <Link to="/favoritos" className="text-gold-400 hover:underline">{t('Favoritos')}</Link>
        {t(', cada uno en la faceta por la que le sigues; los ')}<b>top</b>
        {t(' son los más presentes en tu biblioteca; ')}<b>{t('grandes ausentes')}</b>
        {t(' son nombres del canon que aún no tienes; y ')}<b>{t('sagas')}</b>
        {t(' son tus franquicias a medias. ¿Buscas a alguien concreto? Usa ⌘K o')}{' '}
        <Link to="/personas" className="text-gold-400 hover:underline">{t('Personas')}</Link>.
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {/* la clave de pestaña NO puede llamarse t: pisaría la función de
            traducción importada y el {t(label)} de abajo reventaría la página */}
        {TABS.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`${tab === key ? 'btn-gold' : 'btn-ghost'} inline-flex items-center gap-2`}>
            <Icon size={15} strokeWidth={1.75} /> {t(label)}
          </button>
        ))}
      </div>

      {(tab === 'director' || tab === 'actor') && (
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <Select value={demo.gender} onChange={setDemoFilter('gender')} placeholder={t('Género||persona')}
            options={[['female', t('Mujer')], ['male', t('Hombre')], ['other', t('No binario')]]} />
          <Select value={demo.life} onChange={setDemoFilter('life')} placeholder={t('Vivo/fallecido')}
            options={[['alive', t('Vivos')], ['dead', t('Fallecidos')]]} />
          <Select value={demo.continent} onChange={setDemoFilter('continent')} placeholder={t('Continente')}
            options={(demoOpts?.continents || []).map((c) => [c, c])} />
          <Select value={demo.country} onChange={setDemoFilter('country')} placeholder={t('País (nacimiento)')}
            options={(demoOpts?.countries || []).map((c) => [c, c])} />
          {demoActivo && (
            <button className="btn-ghost !py-1 text-xs" onClick={() => setDemo({ ...DEMO_VACIO })}>
              {t('✕ Limpiar filtros')}
            </button>
          )}
          {demoOpts && (
            <span className="text-xs text-zinc-500 ml-auto">
              {t('Datos demográficos de {n} personas · amplíalos en Ajustes → «Actualizar estado vital»', { n: demoOpts.enriched.toLocaleString(locale()) })}
            </span>
          )}
        </div>
      )}

      {tab === 'favorites' && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <span className="text-xs text-zinc-500">{t('Faceta:')}</span>
          {/* los seis oficios, en el orden del servidor: el pase nocturno ya
              calcula los huecos de todos y sin esto no había forma de verlos */}
          {roles.map((r) => (
            <button
              key={r.key}
              onClick={() => setFavRolePref(r.key)}
              className={`btn-ghost !py-1 text-xs inline-flex items-center gap-1.5 ${favRole === r.key ? '!border-gold-400 text-gold-400' : ''}`}
            >
              {r.key === 'director' ? <Clapperboard size={13} strokeWidth={2} /> : r.key === 'actor' ? <Drama size={13} strokeWidth={2} /> : null}
              {t('Como {oficio}', { oficio: t(r.label).toLowerCase() })}
            </button>
          ))}
        </div>
      )}

      {tab === 'sagas' ? (
        <Suspense fallback={<Spinner label={t('Abriendo tus sagas…')} />}>
          <Sagas embedded />
        </Suspense>
      ) : tab === 'absent' ? (
        <AbsentView radarrIds={radarrIds} addRadarrId={addRadarrId} dismissed={dismissed} onDismiss={onDismiss} />
      ) : tab === 'favorites' ? (
        <GapsView
          key={`fav-${favRole}`}
          endpoint={`/discover/favorites?role=${favRole}`}
          role={favRole}
          cargando={t('Cruzando las filmografías de tus favoritos con tu Plex…')}
          {...gapProps}
          intro={t('Qué te falta (ya estrenado) de tus favoritos seguidos como {role}.', { role: t(roles.find((r) => r.key === favRole)?.label || 'Directores/as').toLowerCase() })}
        />
      ) : (
        <GapsView
          key={tab}
          endpoint={`/discover/gaps?role=${tab}${demoQs}`}
          role={tab}
          paginated
          cargando={t('Ordenando quién manda en tu biblioteca…')}
          {...gapProps}
          intro={demoActivo
            ? t('Qué te falta de las filmografías de {role} más presentes en tu biblioteca, con tus filtros demográficos aplicados.', { role: tab === 'director' ? t('directores/as') : t('actores/actrices') })
            : t('Qué te falta de las filmografías de {role} más presentes en tu biblioteca.', { role: tab === 'director' ? t('directores/as') : t('actores/actrices') })}
        />
      )}
    </div>
  );
}
