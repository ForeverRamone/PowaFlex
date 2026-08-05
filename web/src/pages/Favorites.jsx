import { useEffect, useState, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import { Star, Clapperboard, Drama, Search, Scissors, X } from 'lucide-react';
import { Spinner, Section, Empty, DeathBadge, ProgressBar, PageHeader, Signature, ErrorBox, Select } from '../components.jsx';
import { toast } from '../toast.js';

// el catálogo de 680 directores de Wikidata vive aquí, en «Añadir»: es una
// herramienta de captación de favoritos, no un listado de tu biblioteca.
// Perezoso para no cargar sus filas si no se despliega.
const Directors = lazy(() => import('./Directors.jsx'));

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
      <div className="w-11 h-11 rounded-full overflow-hidden bg-ink-800 shrink-0 flex items-center justify-center">
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
        className={`text-lg cursor-pointer shrink-0 ${isTracked ? 'text-gold-400' : 'text-zinc-600 hover:text-gold-400'}`}
      >
        ★
      </button>
    </div>
  );
}

const Avatar = ({ person, size = 'w-12 h-12' }) =>
  person.thumb ? (
    <img src={`/img/person/${person.id}`} alt="" loading="lazy" className={`${size} rounded-full object-cover bg-ink-800 shrink-0`} />
  ) : (
    <span className={`${size} rounded-full bg-ink-800 text-zinc-500 flex items-center justify-center shrink-0 text-sm`}>
      {person.name.slice(0, 1)}
    </span>
  );

/** One favorite: who they are, what you have of theirs, and what you're missing. */
function FavoriteCard({ p, role, alsoOther, selectable, selected, onSelect, onRemove, onAddOtherFacet }) {
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
        <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
          <Link to={`/personas/${p.id}?role=${role}`} className="text-sm font-medium text-zinc-100 hover:text-gold-400">
            {p.name}
          </Link>
          <DeathBadge deathday={p.deathday} />
        </div>
        <Signature films={p.signature} className="block leading-snug" />
        {/* el mismo criterio que la ficha: largometrajes. El conteo bruto de
            Plex (cortos, documentales, TV, conciertos) va en el tooltip */}
        <div
          className="text-[11px] text-zinc-500 mt-0.5"
          title={
            p.moviesAll != null && p.moviesAll !== p.movies
              ? `Solo largometrajes. En tu Plex hay ${p.moviesAll} títulos suyos contando cortos, documentales, TV y conciertos.`
              : undefined
          }
        >
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
        ) : p.tmdbBlank ? (
          // tienes películas suyas pero TMDB no le devuelve filmografía: casi
          // siempre es un homónimo mal emparejado, no una carrera vacía. Y eso
          // no lo va a arreglar ningún reintento: hay que elegir la ficha buena.
          <div className="text-[11px] text-orange-300 mt-2">
            Sin ficha de TMDB fiable · no se puede calcular su completismo ·{' '}
            <Link
              to={`/personas/${p.id}?role=${role}`}
              className="text-gold-400 hover:underline"
              title="Abre su ficha para elegir a mano la persona correcta en TMDB"
            >
              ✎ corregir
            </Link>
          </div>
        ) : (
          <div className="text-[11px] text-zinc-600 mt-2">
            Huecos sin calcular · <Link to="/descubrir" className="text-gold-400 hover:underline">Descubrir</Link>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={() => onRemove(p)} title={`Quitar de ${roleLabel(role).toLowerCase()}`} className="text-zinc-600 hover:text-red-400">
          <X size={15} />
        </button>
        {alsoOther ? (
          <span
            title={`También le sigues como ${role === 'director' ? 'actor/actriz' : 'director/a'}`}
            className="text-gold-400/60"
          >
            {role === 'director' ? <Drama size={15} /> : <Clapperboard size={15} />}
          </span>
        ) : (
          <button
            onClick={() => onAddOtherFacet(p)}
            title={`Seguirle TAMBIÉN como ${role === 'director' ? 'actor/actriz' : 'director/a'} (sin dejar esta faceta)`}
            className="text-zinc-600 hover:text-gold-400"
          >
            {role === 'director' ? <Drama size={15} /> : <Clapperboard size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

// accent palette per curated pack (#9)
// `borderL` pinta SOLO el filete izquierdo: con `border-<color>` a secas, y las
// utilidades ya encapadas, el recuadro entero se teñía del color del paquete.
// Los tonos 300 no los redefine «Cartelera», así que el texto va en los 400/500.
const ACCENTS = {
  red: { borderL: '!border-l-red-400', bg: 'bg-red-400/15', text: 'text-red-400' },
  gold: { borderL: '!border-l-gold-400', bg: 'bg-gold-400/15', text: 'text-gold-400' },
  emerald: { borderL: '!border-l-emerald-400', bg: 'bg-emerald-400/15', text: 'text-emerald-400' },
  sky: { borderL: '!border-l-sky-300', bg: 'bg-sky-300/15', text: 'text-sky-300' },
  orange: { borderL: '!border-l-orange-400', bg: 'bg-orange-400/15', text: 'text-orange-400' },
};

/**
 * Los cánones de «Grandes ausentes» (TSPDT, los 501 del libro, «en boga» y tus
 * listas pegadas) también se pueden volcar a favoritos desde aquí: son las
 * mismas listas, y buscarlos uno a uno en la otra página era absurdo.
 *
 * Resolver 500 nombres contra TMDB lleva su rato, así que el servidor lo hace en
 * segundo plano y aquí se sigue el progreso.
 */
function CanonPacks({ role, onDone }) {
  const [canons, setCanons] = useState([]);
  const [estado, setEstado] = useState(null);

  useEffect(() => {
    api('/discover/canons').then((r) => Array.isArray(r) && setCanons(r));
    api('/tracked/from-canon').then((r) => !r.error && r.running && setEstado(r));
  }, []);

  // mientras corre, se pregunta cada segundo y medio
  useEffect(() => {
    if (!estado?.running) return undefined;
    const t = setInterval(async () => {
      const r = await api('/tracked/from-canon');
      if (r.error) return;
      setEstado(r);
      if (!r.running) {
        clearInterval(t);
        onDone();
        toast(
          `⭐ ${r.added} añadidos de «${r.canon}»` +
            (r.skipped ? ` · ${r.skipped} ya estaban o los habías quitado` : '') +
            (r.notFound?.length ? ` · ${r.notFound.length} sin ficha en TMDB` : ''),
          'success'
        );
      }
    }, 1500);
    return () => clearInterval(t);
  }, [estado?.running]);

  const añadir = async (c) => {
    const r = await api('/tracked/from-canon', { method: 'POST', body: { canon: c.key, role } });
    if (r.error) return toast(`⚠️ ${r.error}`, 'error');
    setEstado({ running: true, canon: c.label, added: 0, total: r.total });
  };

  if (!canons.length) return null;
  return (
    <Section title="Listas y cánones">
      <p className="text-xs text-zinc-500 -mt-2 mb-3 max-w-3xl">
        Las mismas listas de <Link to="/descubrir" className="text-gold-400 hover:underline">Grandes ausentes</Link>,
        para volcarlas de golpe a tus favoritos. A quien hayas quitado con la ✕ no vuelve a entrar.
      </p>
      {estado?.running && (
        <div className="card p-3 mb-3">
          <div className="text-sm text-zinc-300 mb-2">
            Añadiendo «{estado.canon}»… <span className="tabular">{estado.added || 0}</span> de {estado.total}
          </div>
          <ProgressBar pct={estado.total ? Math.round(((estado.added || 0) / estado.total) * 100) : 0} />
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {canons.map((c) => (
          <div key={c.key} className="card p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-200 truncate">{c.label}</div>
              <div className="text-[11px] text-zinc-500">
                {c.count != null ? `${c.count} nombres` : 'se actualiza sola con TMDB'}
              </div>
            </div>
            <button
              className="btn-ghost !py-1 text-xs shrink-0"
              disabled={estado?.running}
              onClick={() => añadir(c)}
              title={`Añadir a tus ${roleLabel(role).toLowerCase()}`}
            >
              Añadir
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function Favorites() {
  const [tracked, setTracked] = useState(null);
  // la faceta y los filtros sobreviven a la navegación hasta pulsar «Limpiar»
  const [role, setRoleState] = useState(() => localStorage.getItem('fav_role') || 'director'); // scopes the entire page
  const setRole = (r) => { setRoleState(r); localStorage.setItem('fav_role', r); };
  const [tab, setTab] = useState('mine'); // mine | discover
  // el catálogo de directores en activo, plegado por defecto para no alargar
  // la pestaña; /directores (ruta vieja) llega aquí con ?add=activos y lo abre
  const [params] = useSearchParams();
  const [catalogoAbierto, setCatalogoAbierto] = useState(() => params.get('add') === 'activos');
  useEffect(() => {
    if (params.get('add') === 'activos') {
      setRoleState('director');
      localStorage.setItem('fav_role', 'director');
      setTab('discover');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [health, setHealth] = useState({ gaps: false, calendar: false });
  const [suggest, setSuggest] = useState(null);
  const [pq, setPq] = useState('');
  const [presults, setPresults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [packBusy, setPackBusy] = useState(null);
  const [bulkNames, setBulkNames] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [favSearch, setFavSearch] = useState('');
  const [favSort, setFavSortState] = useState(() => localStorage.getItem('fav_sort') || 'titulos');
  const setFavSort = (v) => { setFavSortState(v); localStorage.setItem('fav_sort', v); };
  const limpiarFiltros = () => { setFavSearch(''); setFavSort('titulos'); };
  // un nombre por línea, listo para pegarlo en «añadir por nombres» de otra
  // instalación de PowaFlex — todo en el navegador, sin servidor
  const exportarTxt = () => {
    const nombres = roleFavs.map((t) => t.name).join('\n');
    const blob = new Blob([nombres + '\n'], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `powaflex-${role === 'director' ? 'directores' : 'actores'}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`⬇ ${roleFavs.length} nombres exportados`);
  };
  const hayFiltros = () => favSearch.trim() || favSort !== 'titulos';
  const [pruneMode, setPruneMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  const [loadError, setLoadError] = useState(null);
  const loadTracked = () =>
    api('/tracked/health').then((r) => {
      if (Array.isArray(r?.people)) {
        setTracked(r.people);
        setHealth(r.cached || {});
        setLoadError(null);
      } else if (Array.isArray(r)) setTracked(r);
      // si no, el spinner se quedaba girando indefinidamente sin decir nada
      else setLoadError(r?.error || 'No se han podido cargar tus favoritos');
    });

  // los «habituales de festival» llegan por su propio endpoint: la primera
  // construcción baja ~30 tablas de Wikipedia y no debe frenar al resto
  const [festPacks, setFestPacks] = useState(null);
  useEffect(() => {
    loadTracked();
    api('/people/suggestions').then((s) => !s.error && setSuggest(s));
    api('/people/festival-packs').then((r) => Array.isArray(r?.packs) && setFestPacks(r.packs));
  }, []);

  // scoped to the active facet: followed as director must still be addable as actor
  const trackedTmdb = new Set(
    (tracked || []).filter((t) => (t.role || 'director') === role).map((t) => t.tmdb_id).filter(Boolean)
  );
  const trackedIds = new Set((tracked || []).filter((t) => (t.role || 'director') === role).map((t) => t.id));

  const addTmdb = async (p) => {
    await api('/tracked/tmdb', { method: 'POST', body: { tmdbId: p.tmdb_id, name: p.name, profilePath: p.profile_path, role } });
    toast(`⭐ ${p.name} añadido como ${role === 'director' ? 'director/a' : 'actor/actriz'}`, 'success');
    loadTracked();
  };
  const removeTmdb = async (p) => {
    const t = (tracked || []).find((x) => x.tmdb_id === p.tmdb_id && (x.role || 'director') === role);
    if (t) { await api(`/tracked/${t.id}?role=${role}`, { method: 'DELETE' }); toast(`${p.name} fuera de ${roleLabel(role).toLowerCase()}`); loadTracked(); }
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
    const r = await api(`/people/search-tmdb?q=${encodeURIComponent(pq.trim())}&role=${role}`);
    setSearching(false);
    setPresults(Array.isArray(r) ? r : []);
  };

  useEffect(() => { setSelected(new Set()); setPruneMode(false); }, [role]);
  // la ✕ de una tarjeta quita SOLO la faceta de la lista que estás viendo
  const removeFav = async (p) => {
    setTracked((prev) => prev.filter((t) => !(t.id === p.id && (t.role || 'director') === role)));
    await api(`/tracked/${p.id}?role=${p.role || role}`, { method: 'DELETE' });
    toast(`${p.name} fuera de ${roleLabel(role).toLowerCase()}`);
    loadTracked();
  };
  // seguirle también en la otra faceta, sin dejar esta
  const addOtherFacet = async (p) => {
    const next = (p.role || 'director') === 'director' ? 'actor' : 'director';
    await api(`/tracked/${p.id}`, { method: 'POST', body: { role: next } });
    toast(`⭐ ${p.name} también en ${next === 'director' ? 'directores/as' : 'actores/actrices'}`, 'success');
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
    await api('/tracked/batch', { method: 'DELETE', body: { personIds: ids, role } });
    toast(`Quitados ${ids.length} ${favSearch.trim() ? 'favoritos de los que se ven ahora' : `favoritos de ${roleLabel(role).toLowerCase()}`}`);
    loadTracked();
  };

  const clearDeceased = async () => {
    const ids = shownFavs.filter((t) => t.deathday).map((t) => t.id);
    if (!ids.length) return;
    const r = await api('/tracked/batch', { method: 'DELETE', body: { personIds: ids, role } });
    if (r.ok) { toast(`✝ ${r.removed} fallecidos/as retirados/as`); loadTracked(); }
  };

  const pruneSelected = async () => {
    const r = await api('/tracked/batch', { method: 'DELETE', body: { personIds: [...selected], role } });
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

  if (loadError) return <ErrorBox error={loadError} />;
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

      {/* flex-wrap: en móvil los dos botones no caben y, sin él, se estrujaban
          en bloques de tres líneas en vez de pasar cada uno a su fila */}
      <div className="flex gap-2 mb-6 flex-wrap">
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
                <Select className="!py-1.5 text-xs" value={favSort} onChange={setFavSort}
                  options={Object.entries(FAV_SORTS).map(([k, s]) => [k, s.label])} />
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
                {hayFiltros() && (
                  <button className="btn-ghost !py-1.5 text-xs" onClick={limpiarFiltros}>✕ Limpiar filtros</button>
                )}
                <button
                  className="btn-ghost !py-1.5 text-xs"
                  onClick={exportarTxt}
                  title="Un nombre por línea, listo para pegarlo en «añadir por nombres» de otra instalación"
                >
                  ⬇ Exportar .txt
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
                    alsoOther={tracked.some((t) => t.id === p.id && (t.role || 'director') !== role)}
                    selectable={pruneMode}
                    selected={selected.has(p.id)}
                    onSelect={toggleSelected}
                    onRemove={removeFav}
                    onAddOtherFacet={addOtherFacet}
                  />
                ))}
              </div>
            </>
          )}

          {/* el ranking por títulos vivía duplicado aquí y en Personas; ahora
              Personas tiene la ★ y el alta top-N, y aquí queda el puente */}
          <div className="card p-4 flex items-center justify-between flex-wrap gap-2 text-sm">
            <span className="text-zinc-400">
              ¿Buscas el ranking de {roleLabel(role).toLowerCase()} por títulos en tu Plex? Vive en Personas, con la ★
              para seguir y el alta de «los N primeros».
            </span>
            <Link to={`/personas?role=${role}`} className="btn-ghost !py-1.5 text-xs shrink-0 inline-flex items-center gap-1.5">
              <Star size={13} strokeWidth={2} /> Ir a Personas
            </Link>
          </div>
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

          {/* La puerta grande. Aquí había cuatro paquetes escritos a mano
              —«españoles», «premiados en festivales», «emergentes»,
              «taquilleros»— de veinte nombres fijos cada uno. Las cuatro ideas
              siguen ahí, pero ahora salen de un catálogo de 680 con datos de
              verdad: un filtro y un orden en vez de una lista congelada. El
              catálogo entero vive AQUÍ (plegado): añadir directores en activo
              a favoritos es exactamente para lo que sirve. */}
          {role === 'director' && (
            <div className="card p-4 mb-6">
              <button
                onClick={() => setCatalogoAbierto((v) => !v)}
                className="w-full flex items-center gap-4 text-left cursor-pointer"
              >
                <div className="text-2xl w-11 h-11 rounded-lg flex items-center justify-center shrink-0 bg-gold-400/15">🎬</div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-zinc-100">Añadir directores en activo · el catálogo</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    680 directores y directoras con obra reciente, de Wikidata. Filtra por región, país o género y
                    ordena por importancia, premios, número de largometrajes o taquilla: españoles, premiados,
                    emergentes o taquilleros salen de aquí con dos clics, con la ☆ para seguirlos.
                  </p>
                </div>
                <span className="text-gold-400 shrink-0 text-sm">{catalogoAbierto ? 'Plegar ▴' : 'Explorar ▾'}</span>
              </button>
              {catalogoAbierto && (
                <div className="mt-4 border-t border-ink-700 pt-4">
                  <Suspense fallback={<Spinner />}>
                    <Directors embedded />
                  </Suspense>
                </div>
              )}
            </div>
          )}

          <CanonPacks role={role} onDone={loadTracked} />

          {(festPacks?.length > 0 || suggest?.packs) && (
            <div className="mb-8 space-y-5">
              {/* primero los habituales de Cannes/Venecia/Berlín, luego los curados */}
              {[...(festPacks || []), ...(suggest?.packs || [])].map((pack) => {
                const pending = pack.people.filter((p) => !p.tracked && !trackedTmdb.has(p.tmdb_id)).length;
                const accent = ACCENTS[pack.accent] || ACCENTS.gold;
                return (
                  <section key={pack.key} className={`card p-0 overflow-hidden border-l-4 ${accent.borderL}`}>
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
