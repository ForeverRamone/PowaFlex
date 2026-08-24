import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Ticket, Flag, MonitorPlay, Tv, Plus, RotateCw, Sigma } from 'lucide-react';
import {
  ErrorBox, TmdbCard, RadarrButton, Empty, Spinner, PageHeader, Select,
  useRadarrIds, useTypeFilters, TypeFilterBar, matchesTypeFilters, typeCounts,
  MinScoreBar, passesScore, useMinScore, OwnFilterBar,
} from '../components.jsx';
import { toast } from '../toast.js';
import { addBulkToRadarr } from '../radarr.js';
import { t, locale } from '../i18n.js';

const TABS = [
  ['cine-es', 'Cines · España', Ticket],
  ['cine-us', 'Cines · EE UU', Flag],
  ['plataformas-es', 'Plataformas y VOD · España', MonitorPlay],
  ['plataformas-us', 'Plataformas y VOD · EE UU', Tv],
];
const TAB_KEYS = new Set(TABS.map(([key]) => key));
// las dos pestañas de plataformas traen el «dónde verla» de su región
const esPlataformas = (tab) => tab.startsWith('plataformas-');

const WINDOWS = [
  ['7', 'Esta semana'],
  ['30', 'Último mes'],
  ['90', 'Últimos 3 meses'],
];

const SORTS = {
  fecha: { label: 'Por fecha', fn: null }, // el orden natural del servidor
  score: { label: 'Nota combinada Σ', fn: (a, b) => (b.mdb?.score ?? -1) - (a.mdb?.score ?? -1) },
  popularidad: { label: 'Popularidad TMDB', fn: (a, b) => (b.popularity || 0) - (a.popularity || 0) },
  votos: { label: 'Más votadas', fn: (a, b) => (b.votes || 0) - (a.votes || 0) },
};

// Por qué una tanda de notas puede volver de vacío, en cristiano. Mismos
// motivos que devuelve `refrescarNotasDeReglas` en el servidor.
const MOTIVO_NOTAS = {
  sin_api_key: 'Sin clave de MDBList no hay notas Σ: ponla en Ajustes',
  sin_presupuesto: 'Agotado el cupo diario de MDBList: se completan mañana',
  quedan_para_manana: 'Quedan notas por pedir: pulsa otra vez en un rato',
  // si se llegó a preguntar es que la clave funciona: lo que falla es que
  // MDBList no tiene ficha de esos estrenos todavía
  sin_respuesta: 'MDBList todavía no tiene ficha de esas películas',
};

/**
 * QUÉ DECIR CUANDO NO HA ENTRADO NINGUNA NOTA.
 *
 * «Ninguna nota nueva» a secas mete en el mismo saco tres cosas que no se
 * parecen en nada: que no quedaba nada por pedir, que se preguntó y MDBList no
 * conoce esas películas, y que algo va mal (sin clave, sin cupo). Un botón que
 * contesta lo mismo pase lo que pase se lee como un botón roto.
 */
function resumenDeNotas(notas) {
  if (!notas) return { texto: 'Ninguna nota nueva: MDBList aún no las tiene', tipo: 'info' };
  if (notas.nuevas > 0) return { texto: t('✓ {n} notas nuevas', { n: notas.nuevas }), tipo: 'success' };
  if (MOTIVO_NOTAS[notas.motivo]) return { texto: t(MOTIVO_NOTAS[notas.motivo]), tipo: 'error' };
  if (!notas.sinNota) return { texto: t('Ya tenían nota todas las de esta lista'), tipo: 'info' };
  if (!notas.pedidas) return { texto: t('Nada que pedir: las {n} sin nota se preguntaron hace nada', { n: notas.sinNota }), tipo: 'info' };
  return {
    texto: t('Preguntadas {n}: MDBList las conoce pero aún no les ha puesto nota', { n: notas.pedidas }),
    tipo: 'info',
  };
}

function fmtFecha(iso) {
  if (!iso) return t('sin fecha');
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

/** Dos nombres y «+N»: en una carátula pequeña no cabe más. */
const resumen = (lista) => lista.slice(0, 2).join(' · ') + (lista.length > 2 ? ` +${lista.length - 2}` : '');

function EstrenoCard({ f, radarrIds, addRadarrId, onDismiss, conProviders }) {
  return (
    <TmdbCard item={f}>
      <div className="text-[11px] text-zinc-500">{fmtFecha(f.date)}</div>
      {f.mdb?.score != null && (
        <div className="text-[11px] text-gold-400">
          Σ {f.mdb.score}{f.mdb.imdb != null ? ` · IMDb ${Number(f.mdb.imdb).toFixed(1)}` : ''}
        </div>
      )}
      {/* primero lo que ya tienes pagado; si solo se alquila, el VOD con nombre
          y en tinta más apagada, que no es lo mismo pagar por título */}
      {conProviders && (f.providers?.length > 0 || f.vod?.length > 0) && (
        <div
          className={`text-[11px] truncate ${f.providers?.length ? 'text-zinc-400' : 'text-zinc-500'}`}
          title={[
            ...(f.providers || []),
            ...(f.vod || []).map((v) => `${v} (${t('alquiler/compra')})`),
          ].join(', ')}
        >
          {f.providers?.length
            ? resumen(f.providers)
            : `${t('VOD')}: ${resumen(f.vod)}`}
        </div>
      )}
      <div className="flex items-center gap-1">
        {!f.owned && (
          <RadarrButton tmdbId={f.tmdb_id} small alreadyInRadarr={radarrIds.has(f.tmdb_id)} onAdded={addRadarrId} />
        )}
        <button
          title={t('No me interesa: no volverá a aparecer (compartido con Descubrir)')}
          onClick={() => onDismiss(f)}
          className="text-zinc-500 hover:text-red-400 text-xs px-1 shrink-0"
        >
          ✕
        </button>
      </div>
    </TmdbCard>
  );
}

/**
 * Estrenos: lo que llega a los cines y a las plataformas y VOD de España y de
 * EE UU, recién estrenado y venidero, con los filtros de la casa — el listón Σ
 * de MDBList sobre todo, que es lo que separa el estreno que importa del
 * relleno de cartelera.
 */
export default function Estrenos() {
  const [params, setParams] = useSearchParams();
  const tab = TAB_KEYS.has(params.get('tab')) ? params.get('tab') : 'cine-es';
  const setTab = (t) => setParams(t === 'cine-es' ? {} : { tab: t });
  const [win, setWinState] = useState(() => localStorage.getItem('rel_window') || '30');
  const setWin = (v) => { setWinState(v); localStorage.setItem('rel_window', v); };

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [show, toggle, resetTypes] = useTypeFilters();
  // listón Σ compartido con el resto de páginas (hereda el rel_min_score viejo)
  const [minScore, setMinScore] = useMinScore();
  const [own, setOwnState] = useState(() => localStorage.getItem('rel_own') || '');
  const setOwn = (v) => { setOwnState(v); localStorage.setItem('rel_own', v); };
  const [sort, setSortState] = useState(() => localStorage.getItem('rel_sort') || 'fecha');
  const setSort = (v) => { setSortState(v); localStorage.setItem('rel_sort', v); };
  const [provider, setProvider] = useState(''); // no persiste: depende de la carga

  // descartes compartidos con Descubrir: la misma ✕, la misma tabla
  const [dismissed, setDismissed] = useState(new Set());
  useEffect(() => {
    api('/discover/dismissed').then((r) => Array.isArray(r) && setDismissed(new Set(r.map((d) => d.tmdb_id))));
  }, []);
  const undismiss = async (f) => {
    const r = await api(`/discover/dismiss/${f.tmdb_id}`, { method: 'DELETE' });
    if (r.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    setDismissed((prev) => { const n = new Set(prev); n.delete(f.tmdb_id); return n; });
    toast(t('↩︎ «{title}» vuelve a la lista', { title: f.title }));
  };
  const onDismiss = async (f) => {
    setDismissed((prev) => new Set(prev).add(f.tmdb_id));
    const r = await api('/discover/dismiss', { method: 'POST', body: { tmdbId: f.tmdb_id, title: f.title } });
    if (r.error) {
      setDismissed((prev) => { const n = new Set(prev); n.delete(f.tmdb_id); return n; });
      return toast(t('⚠️ No se ha podido descartar: {error}', { error: r.error }), 'error');
    }
    toast(t('✕ «{title}» descartada', { title: f.title }), 'info', { label: t('Deshacer'), onClick: () => undismiss(f) });
  };

  // como en Descubrir: cada petición lleva su número y solo la última pinta
  const reqId = useRef(0);
  // «notas» no reconstruye la lista: solo vuelve a preguntar por las Σ que
  // MDBList aún no tenía cuando se miró (ver `ponerNotas` en el servidor)
  const [notasBusy, setNotasBusy] = useState(false);
  const load = ({ refresh = false, notas = false } = {}) => {
    const id = ++reqId.current;
    setError(null);
    if (notas) setNotasBusy(true);
    else if (refresh) setRefreshing(true);
    else setData(null);
    api(`/releases?kind=${tab}&window=${win}${refresh ? '&refresh=1' : ''}${notas ? '&notas=1' : ''}`).then((d) => {
      if (id !== reqId.current) return;
      setRefreshing(false);
      setNotasBusy(false);
      if (d.error) return setError(d.error);
      setData(d);
      if (notas) {
        // decir lo que ha pasado: «0 nuevas» con el cupo agotado y «0 nuevas»
        // porque ya estaban todas son cosas MUY distintas
        const { texto, tipo } = resumenDeNotas(d.notas);
        toast(tipo === 'error' ? `⚠️ ${texto}` : texto, tipo);
      }
    });
  };
  useEffect(() => { load(); setProvider(''); }, [tab, win]);

  const limpiarFiltros = () => { setMinScore(0); setOwn(''); setSort('fecha'); setProvider(''); resetTypes(); };
  // los chips de tipo arrancan todos apagados: cualquiera encendido es un
  // filtro activo, y sin mirarlos el botón de limpiar no salía para ellos
  const hayFiltros = minScore > 0 || own || sort !== 'fecha' || provider || Object.values(show).some(Boolean);

  const conProviders = esPlataformas(tab);
  const visibles = (list) => {
    let out = list.filter(
      (f) =>
        !dismissed.has(f.tmdb_id) &&
        matchesTypeFilters(f, show) &&
        passesScore(f, minScore) &&
        (own === '' || (own === 'missing' ? !f.owned : !!f.owned)) &&
        // el filtro mira las dos formas: donde está incluida y donde se alquila
        (!provider || (f.providers || []).includes(provider) || (f.vod || []).includes(provider))
    );
    if (SORTS[sort]?.fn) out = [...out].sort(SORTS[sort].fn);
    return out;
  };
  const recent = visibles(data?.recent || []);
  const upcoming = visibles(data?.upcoming || []);
  const ocultas = (data ? (data.recent?.length || 0) + (data.upcoming?.length || 0) : 0) - recent.length - upcoming.length;
  // el filtro por plataforma se construye con lo que la carga trae de verdad
  const providerOptions = conProviders
    ? [
        ...new Set(
          [...(data?.recent || []), ...(data?.upcoming || [])].flatMap((f) => [...(f.providers || []), ...(f.vod || [])])
        ),
      ].sort()
    : [];

  const pendingIds = [...recent, ...upcoming].filter((f) => !f.owned && !radarrIds.has(f.tmdb_id)).map((f) => f.tmdb_id);
  const sendBulk = async () => {
    const { error: e, summary } = await addBulkToRadarr(pendingIds.slice(0, 300), { onAdded: addRadarrId });
    if (summary) toast(summary, e ? 'error' : undefined);
  };

  // los recuentos van CONTADOS, no a cero: el porqué vive en typeCounts (components.jsx)
  const counts = typeCounts([...(data?.recent || []), ...(data?.upcoming || [])]);
  // cuántas de las visibles siguen sin Σ: es lo que da sentido al botón de notas
  const sinNota = [...recent, ...upcoming].filter((f) => f.mdb?.score == null).length;

  const grid = (films) => (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
      {films.map((f) => (
        <EstrenoCard key={f.tmdb_id} f={f} radarrIds={radarrIds} addRadarrId={addRadarrId} onDismiss={onDismiss} conProviders={conProviders} />
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader eyebrow={t('La caza')} title={t('Estrenos')} />
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        {t('Qué acaba de llegar y qué viene: a los ')}<b>{t('cines de España y de EE UU')}</b>{t(' y a las ')}
        <b>{t('plataformas y VOD de España y de EE UU')}</b>{t(' (fecha digital de TMDB, con dónde verla en cada país). Solo largometraje. El listón Σ separa lo que importa del relleno, sin ocultar lo que aún no tiene nota.')}
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

      <div className="card p-3 mb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs text-zinc-500">{t('Estrenadas en:')}</span>
          {WINDOWS.map(([v, label]) => (
            <button key={v} onClick={() => setWin(v)} className={`btn-ghost !py-1 text-xs ${win === v ? '!border-gold-400 text-gold-400' : ''}`}>
              {t(label)}
            </button>
          ))}
          <span className="text-xs text-zinc-500 ml-2">{t('Ordenar:')}</span>
          <Select className="!py-1 text-xs" value={sort} onChange={setSort}
            options={Object.entries(SORTS).map(([k, s]) => [k, t(s.label)])} />
          {conProviders && providerOptions.length > 0 && (
            <Select className="!py-1 text-xs" value={provider} onChange={setProvider} placeholder={t('Plataforma o VOD')}
              options={providerOptions.map((p) => [p, p])} />
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <OwnFilterBar own={own} setOwn={setOwn} />
          <MinScoreBar minScore={minScore} setMinScore={setMinScore} />
          {hayFiltros && (
            <button className="btn-ghost !py-1 text-xs" onClick={limpiarFiltros}>{t('✕ Limpiar filtros')}</button>
          )}
          {ocultas > 0 && <span className="text-xs text-zinc-500">{t('{n} ocultas por tus filtros', { n: ocultas })}</span>}
        </div>
      </div>

      <TypeFilterBar show={show} toggle={toggle} counts={counts} />

      {error ? (
        <ErrorBox error={`${error}${t(' — comprueba la API key de TMDB en Ajustes.')}`} />
      ) : !data ? (
        /* las dos pestañas de plataformas tardan cinco veces más que las de
           cines porque además del descubrimiento traen el «dónde verla» de cada
           película: la etiqueta lo dice en vez de dejar pensar que se ha colgado.
           Barra indeterminada y no BuildProgress: /api/releases no publica
           {done,total} en /api/build-progress, así que la barra que salía era la
           de OTRA tarea (el calendario, un envío masivo a Radarr) o ninguna. */
        <Spinner
          label={conProviders
            ? t('Buscando novedades en plataformas y mirando dónde se ve cada una…')
            : t('Buscando los estrenos en salas de los últimos {n} días…', { n: win })}
        />
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <p className="text-sm text-zinc-500">
              {t('Actualizado {date}.', { date: new Date(data.generatedAt).toLocaleString(locale()) })}
              {sinNota > 0 && (
                <span className="text-zinc-400"> · {t('{n} aún sin nota Σ', { n: sinNota })}</span>
              )}
              {data.errors?.length > 0 && (
                <span className="text-orange-300"> · {t('TMDB cortó a mitad: lista incompleta, recarga en un rato')}</span>
              )}
            </p>
            <div className="flex gap-2 flex-wrap">
              {pendingIds.length > 1 && (
                <button className="btn-gold !py-1 text-xs inline-flex items-center gap-1.5" onClick={sendBulk}>
                  <Plus size={13} strokeWidth={2.5} /> {t('Añadir {n} visibles a Radarr', { n: Math.min(pendingIds.length, 300) })}
                </button>
              )}
              {/* las dos actualizaciones NO cuestan lo mismo: «notas» solo
                  repregunta las Σ que faltan (MDBList, barato); «actualizar»
                  reconstruye la lista entera desde TMDB */}
              <button
                className="btn-ghost !py-1 shrink-0 inline-flex items-center gap-1.5"
                onClick={() => load({ notas: true })}
                disabled={notasBusy || refreshing}
                title={t('Vuelve a pedir a MDBList las notas que faltan. Un estreno tarda semanas en tener Σ.')}
              >
                {notasBusy ? t('Pidiendo notas…') : <><Sigma size={13} strokeWidth={2} /> {t('Actualizar notas')}</>}
              </button>
              <button className="btn-ghost !py-1 shrink-0 inline-flex items-center gap-1.5" onClick={() => load({ refresh: true })} disabled={refreshing || notasBusy}>
                {refreshing ? t('Actualizando…') : <><RotateCw size={13} strokeWidth={2} /> {t('Actualizar')}</>}
              </button>
            </div>
          </div>

          {recent.length === 0 && upcoming.length === 0 ? (
            <Empty>{t('Nada que enseñar con estos filtros.')}</Empty>
          ) : (
            <>
              {recent.length > 0 && (
                <section className="mb-8">
                  <h2 className="font-semibold text-zinc-100 mb-3">
                    {t('Ya estrenadas')} <span className="text-zinc-500 text-sm font-normal">· {recent.length}</span>
                  </h2>
                  {grid(recent)}
                </section>
              )}
              {upcoming.length > 0 && (
                <section className="mb-8">
                  <h2 className="font-semibold text-zinc-100 mb-3">
                    {t('Próximas')} <span className="text-zinc-500 text-sm font-normal">· {t(conProviders ? '{n} en plataformas y VOD en 60 días' : '{n} en cines en 60 días', { n: upcoming.length })}</span>
                  </h2>
                  {grid(upcoming)}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
