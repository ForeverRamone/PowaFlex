import { memo, useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import { Star, Clapperboard, Drama, Search, Scissors, X } from 'lucide-react';
import {
  Progreso, useCargaProgresiva, Subpestanas, Section, Empty, DeathBadge, ProgressBar,
  PageHeader, Signature, ErrorBox, SortSelect,
} from '../components.jsx';
import { toast } from '../toast.js';
import { t } from '../i18n.js';

// el catálogo de 680 directores de Wikidata vive aquí, en «Añadir»: es una
// herramienta de captación de favoritos, no un listado de tu biblioteca.
// Perezoso para no cargar sus filas si no se despliega.
const Directors = lazy(() => import('./Directors.jsx'));

// The whole page is scoped to ONE role at a time: a director you follow is
// never counted, sorted or shown together with their acting work.
//
// La lista de oficios la sirve el servidor (GET /roles); esto es solo lo que se
// pinta mientras llega, con la dirección primero.
const ROLES_INICIALES = [
  { key: 'director', label: 'Directores/as', singular: 'director/a', rankable: true, principal: true },
  { key: 'actor', label: 'Actores/actrices', singular: 'actor/actriz', rankable: true, principal: true },
];
// el endpoint no lleva verbo de conteo: solo dirección e interpretación tienen
// uno propio, el resto cuenta «películas» a secas
const VERBOS = { director: 'dirigidas', actor: 'interpretadas' };

// dirección e interpretación van emparejadas: es la otra cara del atajo
// Eastwood, y solo entre esas dos se ofrece «seguirle TAMBIÉN como…».
// Fuera del componente porque no cierra sobre nada, y así los manejadores que
// la usan pueden tener una referencia estable sin arrastrarla como dependencia.
const parejaDe = (r) => (r === 'director' ? 'actor' : 'director');

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
          {person.dept ? `${person.dept === 'Directing' ? t('Dirección') : person.dept === 'Acting' ? t('Interpretación') : person.dept} · ` : ''}
          {(person.knownFor || []).join(', ')}
        </div>
      </div>
      <button
        onClick={() => (isTracked ? onRemove(person) : onAdd(person))}
        title={isTracked ? t('Quitar de favoritos') : t('Añadir a favoritos')}
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

/**
 * One favorite: who they are, what you have of theirs, and what you're missing.
 *
 * Memorizada porque la lista es larga —seguir a varios centenares de personas
 * es lo normal en esta casa— y casi ningún render la cambia: marcar UNA casilla
 * de «Podar» o teclear una letra en el filtro repintaba las 600. Medido con
 * 600 seguidos: 29 ms por casilla y 15.306 nodos en pie.
 */
const FavoriteCard = memo(function FavoriteCard({ p, role, faceta, verbo, crossFacet, alsoOther, selectable, selected, onSelect, onRemove, onAddOtherFacet }) {
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
              ? t('Solo largometrajes. En tu Plex hay {n} títulos suyos contando cortos, documentales, TV y conciertos.', { n: p.moviesAll })
              : undefined
          }
        >
          <b className="text-zinc-300">{p.movies || 0}</b> {verbo} {t('en tu Plex')}
          {p.upcoming > 0 && <span className="text-sky-300"> · {p.upcoming} {t('por venir')}</span>}
        </div>

        {p.pct != null ? (
          <div className="mt-2">
            <ProgressBar pct={p.pct} />
            <div className="flex justify-between text-[11px] mt-1">
              <span className="text-zinc-500">{t('{pct}% de su filmografía', { pct: p.pct })}</span>
              {complete ? (
                <span className="text-emerald-400">{t('✓ completa')}</span>
              ) : (
                <Link to="/descubrir" className="text-gold-400 hover:underline">{t('te faltan {n}', { n: gaps })}</Link>
              )}
            </div>
          </div>
        ) : p.tmdbBlank ? (
          // tienes películas suyas pero TMDB no le devuelve filmografía: casi
          // siempre es un homónimo mal emparejado, no una carrera vacía. Y eso
          // no lo va a arreglar ningún reintento: hay que elegir la ficha buena.
          <div className="text-[11px] text-orange-300 mt-2">
            {t('Sin ficha de TMDB fiable · no se puede calcular su completismo ·')}{' '}
            <Link
              to={`/personas/${p.id}?role=${role}`}
              className="text-gold-400 hover:underline"
              title={t('Abre su ficha para elegir a mano la persona correcta en TMDB')}
            >
              {t('✎ corregir')}
            </Link>
          </div>
        ) : (
          <div className="text-[11px] text-zinc-600 mt-2">
            {t('Huecos sin calcular ·')} <Link to="/descubrir" className="text-gold-400 hover:underline">{t('Descubrir')}</Link>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={() => onRemove(p)} title={t('Quitar de {faceta}', { faceta })} className="text-zinc-600 hover:text-red-400">
          <X size={15} />
        </button>
        {/* el atajo dirección↔interpretación (el caso Eastwood) solo tiene
            sentido entre esos dos oficios; en los demás no se pinta */}
        {!crossFacet ? null : alsoOther ? (
          <span
            title={t('También le sigues como {faceta}', { faceta: role === 'director' ? t('actor/actriz') : t('director/a') })}
            className="text-gold-400/60"
          >
            {role === 'director' ? <Drama size={15} /> : <Clapperboard size={15} />}
          </span>
        ) : (
          <button
            onClick={() => onAddOtherFacet(p)}
            title={t('Seguirle TAMBIÉN como {faceta} (sin dejar esta faceta)', { faceta: role === 'director' ? t('actor/actriz') : t('director/a') })}
            className="text-zinc-600 hover:text-gold-400"
          >
            {role === 'director' ? <Drama size={15} /> : <Clapperboard size={15} />}
          </button>
        )}
      </div>
    </div>
  );
});

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
function CanonPacks({ role, faceta, canons, enMarcha, onDone }) {
  // las dos peticiones que alimentaban esta sección las hace ya la pestaña
  // «Añadir», que es la única que la pinta, y las cuenta en su barra
  const [estado, setEstado] = useState(() => (enMarcha?.running ? enMarcha : null));

  // mientras corre, se pregunta cada segundo y medio
  useEffect(() => {
    if (!estado?.running) return undefined;
    const timer = setInterval(async () => {
      const r = await api('/tracked/from-canon');
      if (r.error) return;
      setEstado(r);
      if (!r.running) {
        clearInterval(timer);
        onDone();
        toast(
          t('⭐ {n} añadidos de «{canon}»', { n: r.added, canon: r.canon }) +
            (r.skipped ? t(' · {n} ya estaban o los habías quitado', { n: r.skipped }) : '') +
            (r.notFound?.length ? t(' · {n} sin ficha en TMDB', { n: r.notFound.length }) : ''),
          'success'
        );
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [estado?.running]);

  const añadir = async (c) => {
    const r = await api('/tracked/from-canon', { method: 'POST', body: { canon: c.key, role } });
    if (r.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    setEstado({ running: true, canon: c.label, added: 0, total: r.total });
  };

  if (!canons?.length) return null;
  return (
    <Section title={t('Listas y cánones')}>
      <p className="text-xs text-zinc-500 -mt-2 mb-3 max-w-3xl">
        {t('Las mismas listas de')} <Link to="/descubrir" className="text-gold-400 hover:underline">{t('Grandes ausentes')}</Link>
        {t(', para volcarlas de golpe a tus favoritos. A quien hayas quitado con la ✕ no vuelve a entrar.')}
      </p>
      {estado?.running && (
        <div className="card p-3 mb-3">
          <div className="text-sm text-zinc-300 mb-2">
            {t('Añadiendo «{canon}»…', { canon: estado.canon })} <span className="tabular">{estado.added || 0}</span> {t('de')} {estado.total}
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
                {c.count != null ? t('{n} nombres', { n: c.count }) : t('se actualiza sola con TMDB')}
              </div>
            </div>
            <button
              className="btn-ghost !py-1 text-xs shrink-0"
              disabled={estado?.running}
              onClick={() => añadir(c)}
              title={t('Añadir a tus {faceta}', { faceta })}
            >
              {t('Añadir')}
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

// las cuatro claves de «Añadir», en un sitio para que la comprobación de caché
// no se desincronice de los pasos
const CLAVES_ANADIR = ['canones', 'enMarcha', 'sugerencias', 'festivales'];

/**
 * Las cuatro peticiones de «Añadir». Antes se lanzaban AL MONTAR LA PÁGINA, y
 * una de ellas —los habituales de festival— baja unas treinta tablas de
 * Wikipedia: veintiséis segundos la primera vez de cada semana, para pintar una
 * pestaña que casi nunca se estaba mirando. Ahora se piden al abrirla, y esa
 * espera sí es de quien la pidió: por eso se le cuenta con barra y con nombre.
 *
 * La caché la pone la página (un ref) y no este componente: Subpestanas
 * DESMONTA la pestaña al cambiar, así que volver a «Añadir» pediría otra vez lo
 * mismo. Lo que falla NO se guarda: un error de red no puede dejar la pestaña
 * rota hasta que se recargue la aplicación.
 */
function CargaAnadir({ cache, children }) {
  const pedir = (clave, fn) =>
    clave in cache.current
      ? cache.current[clave]
      : Promise.resolve(fn()).then((r) => {
          if (r && !r.error) cache.current[clave] = r;
          return r;
        });
  const carga = useCargaProgresiva([
    { clave: 'canones', etiqueta: t('Buscando los cánones disponibles…'), carga: () => pedir('canones', () => api('/discover/canons')) },
    { clave: 'enMarcha', etiqueta: t('Comprobando si hay un alta en marcha…'), carga: () => pedir('enMarcha', () => api('/tracked/from-canon')) },
    { clave: 'sugerencias', etiqueta: t('Buscando a quién más podrías seguir…'), carga: () => pedir('sugerencias', () => api('/people/suggestions')) },
    {
      clave: 'festivales',
      etiqueta: t('Bajando de Wikipedia los habituales de Cannes, Venecia y Berlín (la primera vez tarda; se guarda una semana)…'),
      carga: () => pedir('festivales', () => api('/people/festival-packs')),
    },
  ], []);

  // ya cacheado: se pinta directamente, sin que la barra pegue un parpadeo
  const enCache = CLAVES_ANADIR.every((k) => k in cache.current);
  if (!carga.terminado && !enCache) return <Progreso {...carga} />;
  return children(carga.terminado ? carga.datos : cache.current);
}

export default function Favorites() {
  const [tracked, setTracked] = useState(null);
  // la faceta y los filtros sobreviven a la navegación hasta pulsar «Limpiar»
  const [role, setRoleState] = useState(() => localStorage.getItem('fav_role') || 'director'); // scopes the entire page
  const setRole = (r) => { setRoleState(r); localStorage.setItem('fav_role', r); };
  const [roles, setRoles] = useState(ROLES_INICIALES);
  const info = (r) => roles.find((x) => x.key === r) || { key: r, label: r, singular: r, rankable: false, principal: false };
  const roleLabel = (r) => t(info(r).label); // «Directores/as»
  const roleSingular = (r) => t(info(r).singular); // «director/a»
  const roleVerb = (r) => t(VERBOS[r] || 'películas');
  const faceta = roleLabel(role).toLowerCase();
  const secundarios = roles.filter((r) => !r.principal);
  // el catálogo de directores en activo, plegado por defecto para no alargar
  // la pestaña; /directores (ruta vieja) llega aquí con ?add=activos y lo abre
  const [params, setParams] = useSearchParams();
  const [catalogoAbierto, setCatalogoAbierto] = useState(() => params.get('add') === 'activos');
  // la pestaña abierta vive en la URL (Subpestanas la lee de ahí): así el
  // enlace viejo /directores?add=activos sigue abriendo «Añadir»
  const irAAnadir = () =>
    setParams((previos) => {
      const siguientes = new URLSearchParams(previos);
      siguientes.set('tab', 'discover');
      return siguientes;
    }, { replace: true });
  useEffect(() => {
    if (params.get('add') !== 'activos') return;
    setRoleState('director');
    localStorage.setItem('fav_role', 'director');
    irAAnadir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [health, setHealth] = useState({ gaps: false, calendar: false });
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
    const nombres = roleFavs.map((fav) => fav.name).join('\n');
    const blob = new Blob([nombres + '\n'], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // la clave del oficio, nunca su etiqueta: el nombre del fichero no se traduce
    a.download = `powaflex-${role}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t('⬇ {n} nombres exportados', { n: roleFavs.length }));
  };
  const hayFiltros = () => favSearch.trim() || favSort !== 'titulos';
  const [pruneMode, setPruneMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  const [loadError, setLoadError] = useState(null);
  // Referencias estables: estas dos viajan dentro de los manejadores que reciben
  // las tarjetas, y una tarjeta memorizada solo se salta el render si sus props
  // son las MISMAS. Una función nueva por render deja el memo en adorno.
  const aplicarSalud = useCallback((r) => {
    if (Array.isArray(r?.people)) {
      setTracked(r.people);
      setHealth(r.cached || {});
      setLoadError(null);
    } else if (Array.isArray(r)) setTracked(r);
    // si no, el spinner se quedaba girando indefinidamente sin decir nada
    else setLoadError(r?.error || t('No se han podido cargar tus favoritos'));
  }, []);
  const loadTracked = useCallback(() => api('/tracked/health').then(aplicarSalud), [aplicarSalud]);

  // Lo ÚNICO que hace falta para pintar la pestaña que se abre. Lo de «Añadir»
  // —sugerencias, cánones y los habituales de festival— se pide al abrir esa
  // pestaña y no antes: es lo que convertía esta página en una espera de medio
  // minuto la primera vez de cada semana.
  const carga = useCargaProgresiva([
    { clave: 'roles', etiqueta: t('Mirando qué oficios se pueden seguir…'), carga: () => api('/roles') },
    { clave: 'salud', etiqueta: t('Repasando a quién sigues y qué le falta…'), carga: () => api('/tracked/health') },
  ], []);
  useEffect(() => {
    const catalogo = carga.datos.roles;
    if (Array.isArray(catalogo) && catalogo.length) setRoles(catalogo);
  }, [carga.datos.roles]);
  useEffect(() => {
    if (carga.datos.salud) aplicarSalud(carga.datos.salud);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carga.datos.salud]);

  // lo que ya se bajó para «Añadir», para no volver a pedirlo cada vez que se
  // vuelve a esa pestaña (Subpestanas la desmonta al cambiar)
  const cacheAnadir = useRef({});

  // scoped to the active facet: followed as director must still be addable as actor
  const trackedTmdb = new Set(
    (tracked || []).filter((t) => (t.role || 'director') === role).map((t) => t.tmdb_id).filter(Boolean)
  );
  const trackedIds = new Set((tracked || []).filter((t) => (t.role || 'director') === role).map((t) => t.id));

  const addTmdb = async (p) => {
    // api() nunca rechaza: los fallos llegan como {error}, y cantar éxito sobre
    // un alta que no ocurrió deja al usuario buscando una estrella que no está
    const r = await api('/tracked/tmdb', { method: 'POST', body: { tmdbId: p.tmdb_id, name: p.name, profilePath: p.profile_path, role } });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    toast(t('⭐ {nombre} añadido como {faceta}', { nombre: p.name, faceta: roleSingular(role) }), 'success');
    loadTracked();
  };
  const removeTmdb = async (p) => {
    const fav = (tracked || []).find((x) => x.tmdb_id === p.tmdb_id && (x.role || 'director') === role);
    if (fav) { await api(`/tracked/${fav.id}?role=${role}`, { method: 'DELETE' }); toast(t('{nombre} fuera de {faceta}', { nombre: p.name, faceta })); loadTracked(); }
  };
  const addByNames = async () => {
    if (!bulkNames.trim()) return;
    setBulkBusy(true);
    setBulkResult(null);
    const res = await api('/tracked/by-names', { method: 'POST', body: { names: bulkNames, role } });
    setBulkBusy(false);
    if (res.ok) {
      setBulkResult(res);
      toast(t('⭐ {n} añadidos a {faceta}', { n: res.added, faceta }), 'success');
      setBulkNames('');
      loadTracked();
    } else toast(`⚠️ ${t(res.error || 'error')}`, 'error');
  };
  const addPack = async (pack) => {
    setPackBusy(pack.key);
    const res = await api('/tracked/tmdb-bulk', {
      method: 'POST',
      body: { role, people: pack.people.map((p) => ({ tmdbId: p.tmdb_id, name: p.name, profilePath: p.profile_path })) },
    });
    setPackBusy(null);
    if (res.ok) { toast(t('⭐ {n} de «{pack}» añadidos', { n: res.added, pack: pack.title }), 'success'); loadTracked(); }
    else toast(`⚠️ ${t(res.error || 'error')}`, 'error');
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
  const removeFav = useCallback(async (p) => {
    setTracked((prev) => prev.filter((t) => !(t.id === p.id && (t.role || 'director') === role)));
    const r = await api(`/tracked/${p.id}?role=${p.role || role}`, { method: 'DELETE' });
    // la tarjeta ya se quitó en optimista: si el borrado falló, loadTracked la
    // devuelve a su sitio y el toast explica por qué reaparece
    if (r?.error) { toast(`⚠️ ${t(r.error)}`, 'error'); return loadTracked(); }
    toast(t('{nombre} fuera de {faceta}', { nombre: p.name, faceta }));
    loadTracked();
  }, [role, faceta, loadTracked]);
  // seguirle también en la otra faceta, sin dejar esta
  const addOtherFacet = useCallback(async (p) => {
    const next = parejaDe(p.role || 'director');
    const r = await api(`/tracked/${p.id}`, { method: 'POST', body: { role: next } });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    toast(t('⭐ {nombre} también en {faceta}', { nombre: p.name, faceta: next === 'director' ? t('directores/as') : t('actores/actrices') }), 'success');
    loadTracked();
  }, [loadTracked]);

  const clearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    const ids = shownFavs.map((t) => t.id);
    await api('/tracked/batch', { method: 'DELETE', body: { personIds: ids, role } });
    toast(favSearch.trim() ? t('Quitados {n} favoritos de los que se ven ahora', { n: ids.length }) : t('Quitados {n} favoritos de {faceta}', { n: ids.length, faceta }));
    loadTracked();
  };

  const clearDeceased = async () => {
    const ids = shownFavs.filter((t) => t.deathday).map((t) => t.id);
    if (!ids.length) return;
    const r = await api('/tracked/batch', { method: 'DELETE', body: { personIds: ids, role } });
    if (r.ok) { toast(t('✝ {n} fallecidos/as retirados/as', { n: r.removed })); loadTracked(); }
  };

  const pruneSelected = async () => {
    const r = await api('/tracked/batch', { method: 'DELETE', body: { personIds: [...selected], role } });
    if (r.ok) {
      toast(t('✂️ {n} favoritos quitados', { n: r.removed }));
      setSelected(new Set());
      setPruneMode(false);
      loadTracked();
    } else toast(`⚠️ ${t(r.error || 'error')}`, 'error');
  };
  const toggleSelected = useCallback((id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    }), []);

  // Todo lo derivado va MEMORIZADO y por encima de los returns tempraneros (las
  // reglas de los hooks no admiten otra cosa). No es purismo: quien sigue a
  // varios centenares de personas recorría la lista entera —filtrar, contar,
  // ORDENAR— en cada render, y aquí hay renders que no cambian ni una tarjeta,
  // como marcar una casilla de «Podar» o escribir una letra en el filtro.
  const FAV_SORTS = useMemo(() => ({
    titulos: { label: t('Más {verbo} en tu Plex', { verbo: roleVerb(role) }), fn: (a, b) => (b.movies || 0) - (a.movies || 0) },
    huecos: { label: t('Más huecos'), fn: (a, b) => (b.gaps ?? -1) - (a.gaps ?? -1) },
    completismo: { label: t('Menos completos'), fn: (a, b) => (a.pct ?? 101) - (b.pct ?? 101) },
    aporte: { label: t('Menos aporte'), fn: (a, b) => ((a.gaps ?? 0) + (a.upcoming ?? 0)) - ((b.gaps ?? 0) + (b.upcoming ?? 0)) },
    nombre: { label: t('Nombre (A-Z)'), fn: (a, b) => a.name.localeCompare(b.name) },
  }), [role]);
  // everything below is scoped to the active role — no mixed counts, ever
  const roleFavs = useMemo(
    () => (tracked || []).filter((t) => (t.role || 'director') === role),
    [tracked, role]
  );
  const counts = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.key, (tracked || []).filter((fav) => (fav.role || 'director') === r.key).length])),
    [tracked, roles]
  );
  const shownFavs = useMemo(
    () => roleFavs
      .filter((t) => !favSearch.trim() || t.name.toLowerCase().includes(favSearch.trim().toLowerCase()))
      .sort(FAV_SORTS[favSort]?.fn || FAV_SORTS.titulos.fn),
    [roleFavs, favSearch, favSort, FAV_SORTS]
  );
  // Quién está seguido TAMBIÉN en la otra faceta, resuelto de una vez.
  // Antes cada tarjeta preguntaba `tracked.some(...)` por su cuenta: con la
  // lista dentro del bucle que la pinta, el trabajo crecía al cuadrado. Con 600
  // seguidos eran 360.000 comparaciones por render; con este conjunto, 600.
  const idsOtraFaceta = useMemo(() => {
    const pareja = parejaDe(role);
    return new Set((tracked || []).filter((f) => (f.role || 'director') === pareja).map((f) => f.id));
  }, [tracked, role]);
  const resumen = useMemo(() => ({
    deceasedCount: roleFavs.filter((t) => t.deathday).length,
    totalGaps: roleFavs.reduce((n, t) => n + (t.gaps || 0), 0),
    completeCount: roleFavs.filter((t) => t.gaps === 0).length,
    peliculas: roleFavs.reduce((n, t) => n + (t.movies || 0), 0),
    // "calculado" per facet: the other facet's cache says nothing about this one
    anyComputed: roleFavs.some((t) => t.gaps != null),
  }), [roleFavs]);
  const { deceasedCount, totalGaps, completeCount, anyComputed } = resumen;
  const noContribution = (t) => t.gaps === 0 && (t.upcoming ?? 0) === 0;

  if (loadError) return <ErrorBox error={loadError} />;
  if (!tracked) return <Progreso {...carga} />;

  return (
    <div>
      <PageHeader eyebrow={t('La caza')} title={t('Favoritos')} />
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        {t('La gente que sigues,')} <b>{t('separada por faceta')}</b>
        {t(': a quien sigues como director/a solo cuenta por lo que dirige, y a quien sigues como actor/actriz solo por lo que interpreta. Todos entran en')}{' '}
        <Link to="/calendario" className="text-gold-400 hover:underline">{t('Cine venidero')}</Link> {t('y en')}{' '}
        <Link to="/descubrir" className="text-gold-400 hover:underline">{t('Descubrir huecos')}</Link>.
      </p>

      {/* role scope: the whole page follows this switch. La dirección abre y
          manda, la interpretación la sigue, y los cuatro oficios restantes van
          agrupados detrás en formato menor: seis pestañas iguales convertirían
          la página en un índice y le quitarían el centro a la dirección */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {roles.filter((r) => r.principal).map((r) => (
          <button
            key={r.key}
            onClick={() => setRole(r.key)}
            className={`${role === r.key ? 'btn-gold' : 'btn-ghost'} inline-flex items-center gap-2`}
          >
            {r.key === 'director' ? <Clapperboard size={15} strokeWidth={1.75} /> : <Drama size={15} strokeWidth={1.75} />}
            {t(r.label)} ({counts[r.key] || 0})
          </button>
        ))}
        {secundarios.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center border-l border-ink-700 pl-3 ml-1">
            <span className="text-xs text-zinc-600">{t('y también')}</span>
            {secundarios.map((r) => (
              <button
                key={r.key}
                onClick={() => setRole(r.key)}
                className={`btn-ghost !py-1 text-xs ${role === r.key ? '!border-gold-400 text-gold-400' : ''}`}
              >
                {t(r.label)} ({counts[r.key] || 0})
              </button>
            ))}
          </div>
        )}
        <span className="text-xs text-zinc-600 w-full">{t('Cada faceta se gestiona por separado')}</span>
      </div>

      {/* Cada pestaña carga LO SUYO, y la de «Añadir» solo cuando se abre.
          Antes las dos vivían en el mismo montaje: entrar aquí bajaba treinta
          tablas de Wikipedia para una pestaña que no se estaba mirando. */}
      <Subpestanas
        id="favoritos"
        className="mt-1"
        pestanas={[
          {
            clave: 'mine',
            icono: Star,
            etiqueta: `${t('Mis {faceta}', { faceta })} (${counts[role] || 0})`,
            render: () => (
        <>
          {/* headline numbers for this facet */}
          {roleFavs.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="card p-3">
                <div className="text-xl font-bold text-gold-400">{counts[role]}</div>
                <div className="text-xs text-zinc-500">{t('{faceta} que sigues', { faceta })}</div>
              </div>
              <div className="card p-3">
                <div className="text-xl font-bold text-zinc-200">{resumen.peliculas}</div>
                <div className="text-xs text-zinc-500">{t('{verbo} suyas en tu Plex', { verbo: roleVerb(role) })}</div>
              </div>
              <div className="card p-3">
                <div className="text-xl font-bold text-orange-300">{anyComputed ? totalGaps : '—'}</div>
                <div className="text-xs text-zinc-500">{t('huecos por rellenar')}</div>
              </div>
              <div className="card p-3">
                <div className="text-xl font-bold text-emerald-400">{anyComputed ? completeCount : '—'}</div>
                <div className="text-xs text-zinc-500">{t('filmografías completas')}</div>
              </div>
            </div>
          )}

          {roleFavs.length === 0 ? (
            <Empty>
              {t('Aún no sigues a nadie como {faceta}. Usa', { faceta: roleSingular(role) })}{' '}
              <button className="text-gold-400 hover:underline" onClick={irAAnadir}>{t('Añadir {faceta}', { faceta })}</button>.
            </Empty>
          ) : (
            <>
              <div className="flex gap-2 mb-3 flex-wrap items-center">
                <input
                  className="input !py-1.5 text-sm !w-auto flex-1 min-w-48"
                  placeholder={t('Filtrar {faceta}…', { faceta })}
                  value={favSearch}
                  onChange={(e) => setFavSearch(e.target.value)}
                />
                {/* rótulo «Ordenar:» común: el select solo no decía qué era */}
                <SortSelect value={favSort} onChange={setFavSort}
                  options={Object.entries(FAV_SORTS).map(([k, s]) => [k, s.label])} />
                <button
                  onClick={() => { setPruneMode((v) => !v); setSelected(new Set()); }}
                  className={`btn-ghost !py-1.5 text-xs inline-flex items-center gap-1.5 ${pruneMode ? '!border-gold-400 text-gold-400' : ''}`}
                >
                  <Scissors size={13} strokeWidth={2} /> {t('Podar')}
                </button>
                {deceasedCount > 0 && (
                  <button className="btn-ghost !py-1.5 text-xs" onClick={clearDeceased}>
                    {t('† Quitar fallecidos/as')} ({deceasedCount})
                  </button>
                )}
                <button className="btn-ghost !py-1.5 text-xs !border-red-500/40 text-red-400" onClick={clearAll}>
                  {confirmClear ? t('¿Seguro? Vaciar {n}', { n: shownFavs.length }) : t('Vaciar')}
                </button>
                {hayFiltros() && (
                  <button className="btn-ghost !py-1.5 text-xs" onClick={limpiarFiltros}>{t('✕ Limpiar filtros')}</button>
                )}
                <button
                  className="btn-ghost !py-1.5 text-xs"
                  onClick={exportarTxt}
                  title={t('Un nombre por línea, listo para pegarlo en «añadir por nombres» de otra instalación')}
                >
                  {t('⬇ Exportar .txt')}
                </button>
              </div>

              {pruneMode && (
                <div className="card p-3 mb-3 flex gap-2 flex-wrap items-center text-xs">
                  <span className="text-zinc-400">{t('Poda rápida:')}</span>
                  <button
                    className="btn-ghost !py-1 text-xs"
                    onClick={() => setSelected(new Set(shownFavs.filter((t) => t.deathday && noContribution(t)).map((t) => t.id)))}
                  >
                    {t('Fallecidos/as con filmografía completa')}
                  </button>
                  <button
                    className="btn-ghost !py-1 text-xs"
                    onClick={() => setSelected(new Set(shownFavs.filter(noContribution).map((t) => t.id)))}
                  >
                    {t('Sin huecos ni proyectos')}
                  </button>
                  <button className="btn-gold !py-1 text-xs ml-auto" onClick={pruneSelected} disabled={!selected.size}>
                    {t('Quitar seleccionados')} ({selected.size})
                  </button>
                </div>
              )}

              {!anyComputed && (
                <p className="text-[11px] text-zinc-500 mb-3">
                  {t('Los huecos y el completismo se calculan al visitar')}{' '}
                  <Link to="/descubrir" className="text-gold-400 hover:underline">{t('Descubrir huecos')}</Link>
                  {t(', o con «Actualizar todo» en')} <Link to="/ajustes" className="text-gold-400 hover:underline">{t('Ajustes')}</Link>.
                </p>
              )}

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
                {shownFavs.map((p) => (
                  <FavoriteCard
                    key={p.id}
                    p={p}
                    role={role}
                    faceta={faceta}
                    verbo={roleVerb(role)}
                    crossFacet={info(role).principal}
                    alsoOther={idsOtraFaceta.has(p.id)}
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
              Personas tiene la ★ y el alta top-N, y aquí queda el puente. Solo
              para los oficios que Plex acredita: los demás no tienen ranking */}
          {info(role).rankable && (
            <div className="card p-4 flex items-center justify-between flex-wrap gap-2 text-sm">
              <span className="text-zinc-400">
                {t('¿Buscas el ranking de {faceta} por títulos en tu Plex? Vive en Personas, con la ★ para seguir y el alta de «los N primeros».', { faceta })}
              </span>
              <Link to={`/personas?role=${role}`} className="btn-ghost !py-1.5 text-xs shrink-0 inline-flex items-center gap-1.5">
                <Star size={13} strokeWidth={2} /> {t('Ir a Personas')}
              </Link>
            </div>
          )}
        </>
            ),
          },
          {
            clave: 'discover',
            icono: Search,
            etiqueta: t('Añadir {faceta}', { faceta }),
            render: () => (
              <CargaAnadir cache={cacheAnadir}>
                {(datos) => (
        <>
          <p className="text-xs text-zinc-500 mb-4">
            {t('Lo que añadas aquí se sigue como')} <b>{roleSingular(role)}</b>
            {t('. Cambia la faceta arriba si quieres seguir a alguien por la otra.')}
          </p>

          {/* La puerta grande, y por eso LA PRIMERA. Aquí había cuatro
              paquetes escritos a mano —«españoles», «premiados en festivales»,
              «emergentes», «taquilleros»— de veinte nombres fijos cada uno.
              Las cuatro ideas siguen ahí, pero ahora salen de un catálogo de
              680 con datos de verdad: un filtro y un orden en vez de una lista
              congelada. El catálogo entero vive AQUÍ (plegado): añadir
              directores en activo a favoritos es exactamente para lo que sirve. */}
          {role === 'director' && (
            <div className="card p-4 mb-6">
              <button
                onClick={() => setCatalogoAbierto((v) => !v)}
                className="w-full flex items-center gap-4 text-left cursor-pointer"
              >
                <div className="text-2xl w-11 h-11 rounded-lg flex items-center justify-center shrink-0 bg-gold-400/15">🎬</div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-zinc-100">{t('Añadir directores en activo · el catálogo')}</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {t('680 directores y directoras con obra reciente, de Wikidata. Filtra por región, país o género y ordena por importancia, premios, número de largometrajes o taquilla: españoles, premiados, emergentes o taquilleros salen de aquí con dos clics, con la ☆ para seguirlos.')}
                  </p>
                </div>
                <span className="text-gold-400 shrink-0 text-sm">{catalogoAbierto ? t('Plegar ▴') : t('Explorar ▾')}</span>
              </button>
              {catalogoAbierto && (
                <div className="mt-4 border-t border-ink-700 pt-4">
                  <Suspense fallback={<Progreso label={t('Abriendo el catálogo de directores en activo…')} />}>
                    <Directors embedded />
                  </Suspense>
                </div>
              )}
            </div>
          )}

          <div className="card p-4 mb-6">
            <h2 className="font-semibold text-zinc-100 mb-1">{t('Añadir una lista de nombres')}</h2>
            <p className="text-xs text-zinc-500 mb-3 max-w-2xl">
              {t('Pega nombres')} <b>{t('separados por comas o uno por línea')}</b>
              {t('. PowaFlex los busca en TMDB y los añade a')}{' '}
              {faceta}.
            </p>
            <textarea
              className="input !h-28 font-mono text-xs leading-relaxed"
              placeholder={'Pedro Almodóvar, Céline Sciamma\nHirokazu Kore-eda\nGreta Gerwig'}
              value={bulkNames}
              onChange={(e) => setBulkNames(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button className="btn-gold shrink-0 inline-flex items-center gap-2" onClick={addByNames} disabled={bulkBusy || !bulkNames.trim()}>
                {bulkBusy ? t('Añadiendo…') : <><Star size={13} strokeWidth={2} /> {t('Añadir a {faceta}', { faceta })}</>}
              </button>
            </div>
            {bulkResult && (
              <div className="text-xs text-zinc-400 mt-2">
                {t('✓ {n} añadidos de {total}.', { n: bulkResult.added, total: bulkResult.total })}
                {bulkResult.notFound?.length > 0 && (
                  <span className="text-orange-300"> {t('No encontrados en TMDB: {lista}.', { lista: bulkResult.notFound.join(', ') })}</span>
                )}
              </div>
            )}
          </div>

          <div className="card p-4 mb-6">
            <form onSubmit={searchPeople} className="flex gap-2 max-w-xl">
              <input className="input" placeholder={t('Buscar por nombre en TMDB…')} value={pq} onChange={(e) => setPq(e.target.value)} />
              <button className="btn-gold shrink-0" disabled={searching}>{searching ? t('Buscando…') : t('Buscar')}</button>
              {presults && <button type="button" className="btn-ghost shrink-0" onClick={() => { setPresults(null); setPq(''); }}>✕</button>}
            </form>
            {presults && (
              presults.length === 0 ? (
                <div className="text-sm text-zinc-500 mt-3">{t('Nadie con ese nombre en TMDB.')}</div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                  {presults.map((p) => <SuggestionCard key={p.tmdb_id} person={p} trackedIds={trackedTmdb} onAdd={addTmdb} onRemove={removeTmdb} />)}
                </div>
              )
            )}
          </div>

          {/* los cánones son listas de películas: sus nombres se resuelven como
              quien las dirige o las interpreta, no como su montador/a */}
          {info(role).principal && (
            <CanonPacks
              role={role}
              faceta={faceta}
              canons={Array.isArray(datos.canones) ? datos.canones : []}
              enMarcha={datos.enMarcha}
              onDone={loadTracked}
            />
          )}

          {/* los cuadros de festivales y los curados son de gente que dirige o
              interpreta: fuera de esas dos facetas no vienen a cuento */}
          {info(role).principal && (datos.festivales?.packs?.length > 0 || datos.sugerencias?.packs) && (
            <div className="mb-8 space-y-5">
              {/* primero los habituales de Cannes/Venecia/Berlín, luego los curados */}
              {[...(datos.festivales?.packs || []), ...(datos.sugerencias?.packs || [])].map((pack) => {
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
                        title={pending ? t('Añade los {n} que aún no sigues', { n: pending }) : t('Ya los sigues a todos')}
                      >
                        {packBusy === pack.key ? t('Añadiendo…') : pending ? <><Star size={12} strokeWidth={2} /> {t('Añadir todos')} ({pending})</> : t('✓ Todos añadidos')}
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
              </CargaAnadir>
            ),
          },
        ]}
      />
    </div>
  );
}
