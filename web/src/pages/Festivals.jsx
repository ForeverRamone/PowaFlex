import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  Spinner, ErrorBox, TmdbCard, RadarrButton, Empty, StatusLegend, PageHeader, useRadarrIds,
  MatchCorrector, MinScoreBar, passesScore, EnlacePersona, OwnFilterBar, useMinScore,
} from '../components.jsx';
import { toast } from '../toast.js';
import { addBulkToRadarr } from '../radarr.js';
import { t } from '../i18n.js';

// La celda de dirección de Wikipedia puede traer varios nombres («Javier Calvo
// and Javier Ambrossi»): se parte aquí para pintar UNA estrella por persona —
// seguirlos juntos como una sola cadena no resolvía a nadie. Con apellido
// compartido («Joel and Ethan Coen»), al nombre suelto se le pega el apellido
// del último.
//
// Copia EXACTA de splitDirectors de server/src/festivals.js, filtro incluido:
// el servidor no puede importar de web/ ni al revés, así que la única defensa
// es que sean idénticas. Y tienen que serlo, porque quien decide si un nombre
// se sigue de verdad es el servidor: cuando el filtro del cliente era más
// permisivo, se pintaba una estrella para nombres que el servidor iba a
// descartar y el clic no hacía nada.
export function splitDirectors(s) {
  const normName = (x) =>
    String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const parts = String(s || '')
    .split(/,|;|&| and | y /i)
    .map((x) => x.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const apellido = last.includes(' ') ? last.slice(last.indexOf(' ') + 1) : '';
  return parts
    .map((p) => (p !== last && !p.includes(' ') && apellido ? `${p} ${apellido}` : p))
    .filter((x) => normName(x).length >= 4);
}

/**
 * Una tarjeta de la parrilla, en memo: los cánones pintan 1001 a la vez y
 * cualquier cambio de estado de la página (abrir el corrector, seguir a una
 * persona) re-renderizaba las 1001. Las props son primitivas o de referencia
 * estable —nada de pasar los Sets de Radarr o de seguidos: un Set nuevo
 * repintaría todo—, así que un cambio solo repinta las tarjetas afectadas.
 */
const FestivalCard = memo(function FestivalCard({ f, dirs, inRadarr, followedStr, busyDir, onFollow, onEdit, onAdded, label, labelTitle }) {
  // los seguidos de ESTA tarjeta llegan unidos con \n (un salto de línea no
  // puede aparecer dentro de un nombre): primitivo, estable mientras no cambie
  const followed = followedStr ? followedStr.split('\n') : [];
  return (
    <div>
      {/* en «Lo mejor del año» la tarjeta llega sin contexto: lo que dice de
          qué premio es esta película va ENCIMA del cartel, que es donde se lee
          antes de mirar la foto */}
      {label && (
        <div className="text-[11px] font-semibold text-gold-400 uppercase tracking-wide leading-tight mb-1 truncate" title={labelTitle || label}>
          {label}
        </div>
      )}
      {f.tmdb_id ? (
        <TmdbCard
          item={f}
          badge={
            f.winner ? (
              <span className="absolute top-1.5 right-1.5 on-art bg-black/70 text-[11px] px-1.5 py-0.5 rounded">{t('🏆 Ganadora')}</span>
            ) : undefined
          }
        >
          {f.mdb?.score > 0 && (
            <div className="text-[11px] text-gold-400/90 tabular">
              Σ {f.mdb.score}
              {f.mdb.imdb != null ? ` · IMDb ${Number(f.mdb.imdb).toFixed(1)}` : ''}
            </div>
          )}
          {!f.owned && (
            <RadarrButton tmdbId={f.tmdb_id} small alreadyInRadarr={inRadarr} onAdded={onAdded} />
          )}
        </TmdbCard>
      ) : (
        <div className="poster flex items-center justify-center text-center p-2 text-[11px] text-zinc-400" title={t('Sin ficha en TMDB (todavía)')}>
          {f.title}
        </div>
      )}
      <div className="flex items-baseline gap-1.5">
        <button
          onClick={() => onEdit(f)}
          title={t('Corregir el emparejado con TMDB a mano')}
          className="text-[11px] text-zinc-600 hover:text-gold-400 shrink-0 cursor-pointer"
        >
          ✎
        </button>
        {f.rank && (
          <span className="text-[11px] text-gold-400 font-semibold tabular shrink-0" title={f.tied ? t('Puesto {n} (empate)', { n: f.rank }) : t('Puesto {n}', { n: f.rank })}>
            #{f.rank}
          </span>
        )}
        {/* no todo lo que está en un canon es cine: Sight & Sound
            metió «Twin Peaks: The Return» en 2022 y es una serie.
            Decirlo evita que su hueco parezca un emparejado roto. */}
        {f.tv && (
          <span className="badge-quiet text-zinc-500 mt-1" title={t('Es una serie de televisión: no tiene ficha de película en TMDB')}>
            {t('serie de televisión')}
          </span>
        )}
        {dirs.length > 0 && (
          /* una estrella POR persona: una película con dos
             directores tiene dos perfiles que seguir por separado */
          <div className="flex flex-col items-start">
            {dirs.map((d) => (
              /* la estrella sigue siendo el botón de seguir; el
                 NOMBRE lleva a su ficha, la tengas fichada o no */
              <span key={d} className="mt-1 text-[11px] leading-tight flex items-baseline gap-1">
                <button
                  onClick={() => onFollow(d)}
                  disabled={busyDir === d || followed.includes(d)}
                  className="text-zinc-400 hover:text-gold-400 cursor-pointer disabled:cursor-default shrink-0"
                  title={followed.includes(d) ? t('Ya en favoritos') : t('Seguir a {name} como director/a', { name: d })}
                >
                  {followed.includes(d) ? '⭐' : busyDir === d ? '…' : '☆'}
                </button>
                <EnlacePersona nombre={d} className="text-zinc-400 text-left" />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// La parrilla entra por tramos de este tamaño: 1001 tarjetas de golpe eran
// ~15.000 nodos DOM en el primer pintado. Con filtros o ediciones normales
// (menos de un tramo) no cambia nada visible.
const TRAMO = 120;

/**
 * Las entradas del menú, con cada «hija» pegada a su padre.
 *
 * Un premio puede colgar de otro (`parent`): el Grand Prix de Cannes, el Óscar
 * a la dirección del Óscar. Al pasar de 40 a 62 entradas, dejarlas en el orden
 * del fichero convertía la categoría de Premios en un muro de botones donde no
 * se veía qué tenía que ver con qué. Las huérfanas conservan su orden.
 */
function ordenaPorPadre(lista) {
  const hijas = new Map();
  for (const f of lista) {
    if (!f.parent) continue;
    if (!hijas.has(f.parent)) hijas.set(f.parent, []);
    hijas.get(f.parent).push(f);
  }
  const out = [];
  for (const f of lista) {
    if (f.parent && lista.some((x) => x.key === f.parent)) continue; // ya irá detrás de su padre
    // el ↳ solo cuando el padre está a la vista: el Óscar a la animación vive
    // en el grupo de Animación, donde el Óscar a la mejor película no está, y
    // una flecha que no cuelga de nada se lee como un fallo de pintado
    out.push(f, ...(hijas.get(f.key) || []).map((h) => ({ ...h, colgada: true })));
  }
  return out;
}

/**
 * DE DÓNDE SALE ESTA LISTA, dicho de verdad.
 *
 * El enlace de la fuente ponía «fuente: Wikipedia» pase lo que pase, y ya no
 * era cierto ni antes: el Óscar viene de Wikidata, Sight & Sound del BFI y el
 * Top 1000 de FilmAffinity. Con los cinco cánones nuevos de FilmAffinity serían
 * siete listas diciendo que las escribió Wikipedia. El nombre sale del enlace,
 * que es el único sitio donde el dato es cierto por construcción.
 */
const SITIOS = [
  [/wikipedia\.org$/, 'Wikipedia'],
  [/wikidata\.org$/, 'Wikidata'],
  [/filmaffinity\.com$/, 'FilmAffinity'],
  [/bfi\.org\.uk$/, 'BFI'],
];
function nombreDeFuente(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return SITIOS.find(([re]) => re.test(host))?.[1] || host;
  } catch {
    return null;
  }
}

// Los grupos de «Lo mejor del año», en el orden en que se leen: primero quién
// ganó dónde, luego quién premió qué. Mismos rótulos que el menú.
const GRUPOS_ANUARIO = [
  ['festival', 'Festivales'],
  ['debut', 'Secciones de debut'],
  ['premio', 'Premios'],
  ['critica', 'Asociaciones de críticos'],
  ['canon', 'Cánones'],
];

/**
 * Secciones oficiales de los seis festivales de la «vía festival» al Óscar
 * internacional: ganar su premio gordo clasifica una película no inglesa sin
 * pasar por el comité nacional. Datos de Wikipedia, casados contra TMDB.
 */
export default function Festivals() {
  // deep-link desde Novedades: /festivales?f=venecia&y=2027 abre esa edición
  const [params] = useSearchParams();
  const [index, setIndex] = useState(null);
  const [fest, setFest] = useState(() => params.get('f') || localStorage.getItem('festival_key') || 'cannes');
  const [year, setYear] = useState(
    () => Number(params.get('y')) || Number(localStorage.getItem('festival_year')) || new Date().getFullYear()
  );
  const [view, setView] = useState(() =>
    params.get('f') ? 'seleccion' : localStorage.getItem('festival_view') || 'seleccion'
  ); // seleccion | palmares
  // «Lo mejor del año» es un modo aparte, no una vista de un premio: corta los
  // treinta y tantos palmareses por un año en vez de recorrer uno entero. Un
  // deep-link a un premio concreto (?f=…) manda sobre lo que hubiera guardado.
  const [anuario, setAnuario] = useState(() => !params.get('f') && localStorage.getItem('festival_anuario') === '1');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [followedDirs, setFollowedDirs] = useState(new Set());
  const [dirBusy, setDirBusy] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [followAllBusy, setFollowAllBusy] = useState(false);
  // corrector manual de emparejado: película en edición (el diálogo es el
  // MatchCorrector compartido, que aquí busca con el endpoint de festivales)
  const [editar, setEditar] = useState(null);
  // el menú arranca PLEGADO en tres categorías (debut va dentro de Festivales):
  // desplegado entero se comía dos pantallas de móvil antes de la primera
  // película. Acordeón sin memoria: cada visita vuelve a empezar plegada.
  const [openCat, setOpenCat] = useState(null);
  // filtros de contenido, como en Descubrir: nota mínima Σ (compartida entre
  // páginas) y posesión
  const [minScore, setMinScore] = useMinScore();
  const [own, setOwnState] = useState(() => localStorage.getItem('festival_own') || '');
  const setOwn = (v) => { setOwnState(v); localStorage.setItem('festival_own', v); };
  // cuántos tramos de la parrilla están pintados; vuelve a 1 con cada lista
  const [tramos, setTramos] = useState(1);

  useEffect(() => {
    api('/festivals').then((r) => !r.error && setIndex(r));
    // directores ya seguidos, para pintar la estrella llena junto a su nombre
    api('/tracked?role=director').then(
      (list) => Array.isArray(list) && setFollowedDirs(new Set(list.map((t) => t.name)))
    );
  }, []);

  // Pulsar ← o → varias veces seguidas lanza varias peticiones a la vez, y sin
  // este testigo ganaba la última en LLEGAR, no la última pedida: como una
  // edición sin cachear tarda mucho más que una cacheada, la parrilla podía
  // acabar enseñando un año distinto del que marca el desplegable.
  const peticion = useRef(0);
  const load = (k = fest, y = year, v = view, refresh = false, anu = anuario) => {
    const mia = ++peticion.current;
    setLoading(true);
    setError(null);
    setData(null);
    // las entradas de solo-palmarés (cánones, premios) no tienen ediciones:
    // se clique desde la vista que se clique, siempre va al palmarés
    const soloP = index?.festivals?.find((f) => f.key === k)?.onlyWinners;
    const path = anu
      ? `/festivals/anuario/${y}`
      : soloP || v === 'palmares'
        ? `/festivals/${k}/palmares`
        : `/festivals/${k}/${y}`;
    api(`${path}${refresh ? '?refresh=1' : ''}`).then((r) => {
      if (mia !== peticion.current) return; // llegó tarde: ya se pidió otra cosa
      setLoading(false);
      if (r.error) setError(r.error);
      else setData(r);
    });
  };
  useEffect(() => {
    localStorage.setItem('festival_key', fest);
    localStorage.setItem('festival_year', String(year));
    localStorage.setItem('festival_view', view);
    localStorage.setItem('festival_anuario', anuario ? '1' : '0');
    load(fest, year, view, false, anuario);
  }, [fest, year, view, anuario]);

  const info = index?.festivals?.find((f) => f.key === fest);
  // las entradas de solo-palmarés (Sight & Sound) no tienen ediciones por año
  const soloPalmares = !!info?.onlyWinners;
  useEffect(() => {
    if (soloPalmares && view !== 'palmares') setView('palmares');
  }, [soloPalmares, view]);

  // años del desplegable, de la edición que viene a la primera; al cambiar a
  // un festival más joven (Busan), el año se recoloca solo dentro de su rango.
  // En «Lo mejor del año» el rango es el de TODOS los palmareses juntos, que
  // llega hasta 1927 por el Óscar.
  const añoMax = (index?.currentYear || new Date().getFullYear()) + 1;
  const añoMin = anuario ? index?.anuario?.sinceYear || 1927 : info?.sinceYear || 1946;
  const años = [];
  for (let y = añoMax; y >= añoMin; y--) años.push(y);
  useEffect(() => {
    if (!anuario && (soloPalmares || !info)) return;
    if (year < añoMin) setYear(añoMin);
    else if (year > añoMax) setYear(añoMax);
  }, [fest, info, soloPalmares, year, añoMin, añoMax, anuario]);
  // El modo cambia en el acto y la respuesta del modo nuevo llega un render
  // después: mientras tanto, lo que hay en `data` es lo del modo ANTERIOR. Con
  // eso se pintaba el anuario con la lista de un premio (y reventaba) o la
  // parrilla de un premio con la lista del anuario, donde la misma película
  // gana tres premios y las claves de React se repetían. No se pinta nada hasta
  // que los datos son los del modo que se está mirando.
  const datosDelModo = data && (anuario ? !!data.entries : !data.entries) ? data : null;
  // «Lo mejor del año» llega agrupado por premio: se aplana conservando de
  // cuál viene cada película, que es lo que hay que pintar sobre el cartel
  const films = useMemo(
    () =>
      datosDelModo?.entries
        ? datosDelModo.entries.flatMap((e) =>
            e.films.map((f) => ({ ...f, awardName: e.name, awardTitle: e.award, awardGroup: e.group, galaYear: e.galaYear }))
          )
        : datosDelModo?.films || [],
    [datosDelModo]
  );
  // la dirección partida UNA vez por lista: splitDirectors son varios regex
  // por película y antes se recalculaba para las 1001 en cada render
  const dirsDe = useMemo(() => new Map(films.map((f) => [f, splitDirectors(f.director)])), [films]);
  // lo que se enseña es lo que cuentan los botones masivos: mismo criterio que
  // en Descubrir («las N visibles»). Las sin ficha TMDB no se filtran por nota.
  const shown = films.filter(
    (f) => (!f.tmdb_id || passesScore(f, minScore)) && (own === '' || (own === 'missing' ? !f.owned : !!f.owned))
  );
  const hidden = films.length - shown.length;
  const missingIds = shown.filter((f) => f.tmdb_id && !f.owned && !radarrIds.has(f.tmdb_id)).map((f) => f.tmdb_id);
  // la parrilla pinta por tramos; el resto entra cuando el sentinel asoma
  const pintadas = shown.slice(0, tramos * TRAMO);
  const sentinel = useRef(null);
  useEffect(() => { setTramos(1); }, [data]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    // margen generoso: el tramo siguiente entra antes de que el hueco se vea
    const io = new IntersectionObserver(
      (entradas) => entradas.some((e) => e.isIntersecting) && setTramos((n) => n + 1),
      { rootMargin: '600px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown.length, tramos]);

  const bulkAdd = async () => {
    setBulkBusy(true);
    const { error, summary } = await addBulkToRadarr(missingIds, { onAdded: addRadarrId });
    setBulkBusy(false);
    if (summary) toast(summary, error ? 'error' : undefined);
  };

  // cada estrella sigue a UNA persona: el nombre llega ya partido de la celda.
  // Referencia estable (solo cierra sobre setters): si cambiara en cada render,
  // el memo de las 1001 tarjetas no serviría de nada.
  const followDirector = useCallback(async (name) => {
    setDirBusy(name);
    const r = await api('/tracked/by-names', { method: 'POST', body: { names: name, role: 'director' } });
    setDirBusy(null);
    if (r.error) { toast(`⚠️ ${t(r.error)}`, 'error'); return; }
    setFollowedDirs((prev) => new Set(prev).add(name));
    toast(r.added ? t('⭐ {name} en favoritos (directores/as)', { name }) : t('{name} ya estaba en favoritos', { name }), 'success');
  }, []);
  const abrirEditor = useCallback((f) => setEditar(f), []);
  // addRadarrId se recrea en cada render pero solo cierra sobre su setter:
  // capturar la primera instancia da la referencia estable que pide el memo
  const onAdded = useCallback((id) => addRadarrId(id), []);

  // para las ediciones venideras: en cuanto se anuncie la sección oficial,
  // seguir de un golpe a toda su dirección (ya por personas) y que entren en
  // el calendario
  const pendingDirs = [...new Set(shown.flatMap((f) => dirsDe.get(f) || []).filter((d) => !followedDirs.has(d)))];
  const followAll = async () => {
    setFollowAllBusy(true);
    const r = await api('/tracked/by-names', { method: 'POST', body: { names: pendingDirs.join('\n'), role: 'director' } });
    setFollowAllBusy(false);
    if (r.error) { toast(`⚠️ ${t(r.error)}`, 'error'); return; }
    setFollowedDirs((prev) => new Set([...prev, ...pendingDirs]));
    toast(t('⭐ {n} directores/as añadidos a favoritos', { n: r.added }) + (r.notFound?.length ? t(' · {n} sin resolver', { n: r.notFound.length }) : ''), 'success');
  };

  const fijarMatch = async (tmdbId) => {
    // la clave de la corrección lleva el año con el que se EMPAREJÓ, que en el
    // palmarés y en «Lo mejor del año» es el de la fila, no el de la página
    const keyYear = view === 'palmares' || anuario ? editar.matchYear ?? editar.year : data?.year;
    const r = await api('/festivals/match', {
      method: 'POST',
      body: { title: editar.title, year: keyYear, director: editar.director, tmdbId },
    });
    if (r.error) {
      toast(`⚠️ ${t(r.error)}`, 'error');
      return;
    }
    toast(tmdbId ? t('✓ Emparejado corregido') : t('✓ Corrección quitada'));
    setEditar(null);
    load(fest, year, view);
  };

  // qué se está construyendo mientras se espera: el palmarés completo de un
  // premio o de un canon no se lee igual que la sección oficial de un año
  const pintaAnuario = anuario && !!datosDelModo;

  const etiquetaCarga = anuario
    ? t('Reuniendo los palmareses de {y} en Wikipedia…', { y: year })
    : soloPalmares || view === 'palmares'
      ? t('Reconstruyendo el palmarés de {nombre}…', { nombre: t(info?.name || 'este premio') })
      : t('Leyendo la selección de {festival} {y} en Wikipedia…', { festival: t(info?.name || 'este festival'), y: year });

  return (
    <div>
      <PageHeader
        eyebrow={t('La caza')}
        title={t('Festivales y premios')}
        subtitle={t('Setenta y una fuentes: secciones oficiales, palmareses y nominadas, crítica gremial, animación y documental, y los cánones (Sight & Sound, las 1001, los seis de FilmAffinity, el AFI, Criterion y el registro estadounidense).')}
      />

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {[
          // donde estrena quien empieza (debut) vive DENTRO de Festivales como
          // subgrupo con su propio rótulo: son tres categorías a la vista, pero
          // sin mezclar las secciones de debut con la competición principal
          { key: 'festivales', label: 'Festivales', groups: [['festival', null], ['debut', 'Secciones de debut']] },
          // los premios de la crítica gremial van DENTRO de Premios con su
          // rótulo, como las secciones de debut dentro de Festivales: son
          // premios, pero no los vota una academia de la industria
          { key: 'premios', label: 'Premios', groups: [['premio', null], ['critica', 'Asociaciones de críticos']] },
          // animación y documental son dos circuitos aparte, no una categoría
          // más de los premios generalistas: quien completa animación no se
          // guía por el Óscar, se guía por Annecy
          { key: 'generos', label: 'Animación y documental', groups: [['animacion', 'Animación'], ['documental', 'Documental']] },
          { key: 'canones', label: 'Cánones', groups: [['canon', null]] },
        ].map((cat) => {
          const del = (index?.festivals || []).filter((f) => cat.groups.some(([g]) => g === f.group));
          if (!del.length) return null;
          const abierta = openCat === cat.key;
          const activa = !anuario && del.find((f) => f.key === fest);
          return (
            <div key={cat.key} className={`flex gap-2 items-center flex-wrap ${abierta ? 'w-full' : ''}`}>
              <button
                onClick={() => setOpenCat(abierta ? null : cat.key)}
                aria-expanded={abierta}
                className={`btn-cat ${abierta || activa ? 'btn-cat-on' : ''}`}
              >
                {abierta ? '▾' : '▸'} {t(cat.label)}
              </button>
              {/* plegada, la selección actual sigue a la vista; clicarla abre */}
              {!abierta && activa && (
                <button onClick={() => setOpenCat(cat.key)} className="btn-gold" title={t(activa.award)}>
                  {t(activa.name)}
                </button>
              )}
              {abierta && cat.groups.map(([g, sub]) => {
                // cada entrada, justo detrás de aquella de la que cuelga: el
                // Grand Prix pegado a Cannes, el Óscar a la dirección pegado al
                // Óscar. Sin esto, sesenta botones en orden de fichero.
                const propias = ordenaPorPadre(del.filter((f) => f.group === g));
                if (!propias.length) return null;
                return (
                  <div key={g} className="flex gap-2 items-center flex-wrap">
                    {sub && <span className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(sub)}:</span>}
                    {propias.map((f) => (
                      <button
                        key={f.key}
                        onClick={() => {
                          setAnuario(false);
                          setFest(f.key);
                          if (f.onlyWinners) setView('palmares');
                        }}
                        className={`${!anuario && fest === f.key ? 'btn-gold' : 'btn-ghost'} ${f.colgada ? '!text-xs opacity-80' : ''}`}
                        title={t(f.award)}
                      >
                        {f.colgada ? '↳ ' : ''}{t(f.name)}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
        {/* el cuarto rótulo no despliega nada: cambia de modo. Corta los treinta
            y tantos palmareses por un año en vez de recorrer un premio entero */}
        <button
          onClick={() => { setAnuario(true); setOpenCat(null); }}
          className={`btn-cat ${anuario ? 'btn-cat-on' : ''}`}
          title={t('La ganadora de cada festival y cada premio, en un solo año')}
        >
          🏆 {t('Lo mejor del año')}
        </button>
        {(anuario || view === 'seleccion') && (
          <div className="flex items-center gap-1 ml-auto">
            <button className="btn-ghost !py-1" onClick={() => setYear((y) => y - 1)} title={t('Edición anterior')}>←</button>
            {/* desplegable en vez de campo numérico: el centro es clicable y
                fuera las flechitas de arriba/abajo (ya están ← →) */}
            <select
              className="input !w-24 text-center !py-1 tabular cursor-pointer"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              title={t('Elegir edición')}
            >
              {años.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button className="btn-ghost !py-1" onClick={() => setYear((y) => y + 1)} title={t('Edición siguiente')}>→</button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        {anuario && (
          <span className="text-xs text-zinc-500">
            {t('La ganadora de cada festival y cada premio en {y}, de {n} palmareses a la vez.', {
              y: year, n: index?.anuario?.count || 0,
            })}
          </span>
        )}
        {!anuario && !soloPalmares && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setView('seleccion')} className={`${view === 'seleccion' ? 'btn-gold' : 'btn-ghost'} !py-1 text-xs`}>
              {t(info?.editionLabel) || (info?.awardNominees ? t('Nominadas por año') : t('Sección oficial por año'))}
            </button>
            <button onClick={() => setView('palmares')} className={`${view === 'palmares' ? 'btn-gold' : 'btn-ghost'} !py-1 text-xs`}>
              {t('🏆 Palmarés histórico')}
            </button>
          </div>
        )}
        {info && !anuario && (
          <span className="text-xs text-zinc-500">
            {/* «Canon:» solo para los cánones: la Cámara de Oro es solo-palmarés
                pero es un PREMIO, no un canon */}
            {info.group === 'canon' ? t('Canon: ') : t('Premio que clasifica: ')}
            <b className="text-zinc-300">{t(info.award)}</b>
            {view === 'seleccion' && info.sinceYear > 1990 && t(' · esta sección existe desde {y}', { y: info.sinceYear })}
          </span>
        )}
      </div>

      {error && <ErrorBox error={error} />}
      {/* una edición sin cachear son entre cuatro y nueve segundos de Wikipedia
          más el emparejado contra TMDB. La etiqueta nombra la edición CONCRETA
          porque el desplegable de arriba se puede haber movido tres veces
          mientras esta llegaba, y con el texto genérico no había forma de saber
          cuál se estaba esperando. Barra indeterminada a propósito: el
          emparejado de una edición no publica {done,total} en
          /api/build-progress —solo lo hacen el calendario, Descubrir y los
          packs de personas—, así que un porcentaje aquí sería inventado. */}
      {loading && <Spinner label={etiquetaCarga} />}

      {datosDelModo && (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span className="text-sm text-zinc-400">
              <b className="text-gold-400">
                {pintaAnuario ? t('Lo mejor de {y}', { y: data.year }) : `${t(data.name)} ${data.year ?? ''}`}
              </b>{' '}
              {pintaAnuario
                ? t('{n} premios fallados', { n: data.entries.length })
                : `· ${t(data.section) || t('todas las ganadoras ({award})', { award: t(data.award) })}`} · {t('{n} películas', { n: films.length })}
              {data.unresolved > 0 && (
                <span className="text-zinc-500"> · {t('{n} sin casar con TMDB', { n: data.unresolved })}</span>
              )}
              {data.resolveErrors > 0 && (
                <span className="text-orange-300" title={t('TMDB cortó el grifo a mitad de comprobación; este resultado no se guarda en caché')}>
                  {' '}· {t('{n} sin comprobar por fallos de red — recarga en un rato', { n: data.resolveErrors })}
                </span>
              )}
            </span>
            {data.source && nombreDeFuente(data.source) && (
              <a href={data.source} target="_blank" rel="noreferrer" className="text-[11px] text-zinc-500 hover:text-gold-400 underline">
                {t('fuente: {sitio}', { sitio: nombreDeFuente(data.source) })}
              </a>
            )}
            <button className="btn-ghost !py-1 text-xs" onClick={() => load(fest, year, view, true, anuario)}>{t('↻ Recargar')}</button>
            <div className="flex gap-2 ml-auto flex-wrap">
              {pendingDirs.length > 1 && (
                <button className="btn-ghost" disabled={followAllBusy} onClick={followAll}
                  title={t('Sus estrenos futuros entrarán en el calendario de cine venidero')}>
                  {followAllBusy ? t('Añadiendo…') : t('⭐ Seguir a sus {n} directores/as', { n: pendingDirs.length })}
                </button>
              )}
              {missingIds.length > 0 && (
                <button className="btn-gold" disabled={bulkBusy} onClick={bulkAdd}>
                  {bulkBusy ? t('Añadiendo…') : t('➕ Mandar a Radarr las {n} que te faltan', { n: missingIds.length })}
                </button>
              )}
            </div>
          </div>
          {data.note && (
            <p className="text-xs text-sky-300 mb-3 max-w-3xl">ℹ️ {t(data.note)}</p>
          )}
          {/* lo que TODAVÍA no ha fallado ese año (o que Wikipedia aún no ha
              escrito) se dice con nombres y apellidos: en el año en curso es
              media lista, y sin decirlo el hueco parece un fallo */}
          {pintaAnuario && data.pendientes?.length > 0 && (
            <p className="text-xs text-zinc-500 mb-3 max-w-3xl">
              {t('Sin fallar todavía en {y}:', { y: data.year })}{' '}
              {data.pendientes.map((p) => t(p.name)).join(' · ')}
            </p>
          )}
          {pintaAnuario && data.fallos?.length > 0 && (
            <p className="text-xs text-orange-300 mb-3 max-w-3xl">
              ⚠️ {data.fallos.map((f) => `${t(f.name)}: ${t(f.error)}`).join(' · ')}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap mb-2">
            <OwnFilterBar own={own} setOwn={setOwn} />
            <MinScoreBar minScore={minScore} setMinScore={setMinScore} />
            {(own || minScore > 0) && (
              <button className="btn-ghost !py-1 text-xs" onClick={() => { setOwn(''); setMinScore(0); }}>
                {t('✕ Limpiar filtros')}
              </button>
            )}
            {hidden > 0 && <span className="text-xs text-zinc-500">{t('{n} ocultas por tus filtros', { n: hidden })}</span>}
          </div>
          <StatusLegend className="mb-4" />

          {shown.length === 0 ? (
            <Empty>{films.length === 0 ? t('Sin películas en esta edición.') : t('Nada que enseñar con estos filtros.')}</Empty>
          ) : pintaAnuario ? (
            /* por grupos y con el nombre del premio sobre cada cartel: la
               gracia de esta vista es saber QUIÉN premió qué, y una parrilla
               plana de treinta carteles no lo dice */
            GRUPOS_ANUARIO.map(([g, titulo]) => {
              const suyas = shown.filter((f) => f.awardGroup === g);
              if (!suyas.length) return null;
              return (
                <section key={g} className="mb-6">
                  <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
                    {t(titulo)} <span className="text-zinc-600">({suyas.length})</span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {suyas.map((f, i) => {
                      const dirs = dirsDe.get(f) || [];
                      return (
                        <FestivalCard
                          key={`${f.awardName}-${f.tmdb_id || f.title}-${i}`}
                          f={f}
                          dirs={dirs}
                          label={t(f.awardName)}
                          /* el César va por año de gala: se dice aquí en vez de
                             dejar que parezca que la ficha trae otro año */
                          labelTitle={f.galaYear ? `${t(f.awardTitle)} · ${t('gala de {y}', { y: f.galaYear })}` : t(f.awardTitle)}
                          inRadarr={!!f.tmdb_id && radarrIds.has(f.tmdb_id)}
                          followedStr={dirs.filter((d) => followedDirs.has(d)).join('\n')}
                          busyDir={dirs.includes(dirBusy) ? dirBusy : null}
                          onFollow={followDirector}
                          onEdit={abrirEditor}
                          onAdded={onAdded}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {pintadas.map((f, i) => {
                  const dirs = dirsDe.get(f) || [];
                  return (
                    <FestivalCard
                      key={f.tmdb_id || `${f.title}-${i}`}
                      f={f}
                      dirs={dirs}
                      inRadarr={!!f.tmdb_id && radarrIds.has(f.tmdb_id)}
                      followedStr={dirs.filter((d) => followedDirs.has(d)).join('\n')}
                      busyDir={dirs.includes(dirBusy) ? dirBusy : null}
                      onFollow={followDirector}
                      onEdit={abrirEditor}
                      onAdded={onAdded}
                    />
                  );
                })}
              </div>
              {pintadas.length < shown.length && (
                <div ref={sentinel} className="py-6 text-center text-xs text-zinc-500">
                  {t('{n} más…', { n: shown.length - pintadas.length })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {editar && (
        /* el diálogo compartido de toda la app; los candidatos se buscan con el
           endpoint de festivales, acotado al año de la edición que miras */
        <MatchCorrector
          kind="movie"
          title={`${editar.title}${editar.director ? ` — ${editar.director}` : ''}`}
          initialQuery={editar.title || ''}
          searchPath={(term) =>
            `/festivals/match-candidates?q=${encodeURIComponent(term)}&year=${(view === 'palmares' || anuario ? editar.matchYear ?? editar.year : data?.year) || ''}`}
          subtitle={t('Busca en TMDB y elige la ficha correcta. Se recuerda y manda sobre el emparejado automático.')}
          onPick={fijarMatch}
          onClear={editar.tmdb_id ? () => fijarMatch(null) : null}
          onClose={() => setEditar(null)}
        />
      )}
    </div>
  );
}
