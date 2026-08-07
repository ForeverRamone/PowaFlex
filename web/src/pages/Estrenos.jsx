import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Ticket, Flag, MonitorPlay, Tv, Plus, RotateCw } from 'lucide-react';
import {
  ErrorBox, TmdbCard, RadarrButton, Empty, BuildProgress, PageHeader, Select,
  useRadarrIds, useTypeFilters, TypeFilterBar, matchesTypeFilters, MinScoreBar, passesScore,
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
  score: { label: 'Nota media Σ', fn: (a, b) => (b.mdb?.score ?? -1) - (a.mdb?.score ?? -1) },
  popularidad: { label: 'Popularidad TMDB', fn: (a, b) => (b.popularity || 0) - (a.popularity || 0) },
  votos: { label: 'Más votadas', fn: (a, b) => (b.votes || 0) - (a.votes || 0) },
};

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
  const [minScore, setMinScoreState] = useState(() => Number(localStorage.getItem('rel_min_score') || 0));
  const setMinScore = (v) => { setMinScoreState(v); localStorage.setItem('rel_min_score', String(v)); };
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
  const load = (refresh = false) => {
    const id = ++reqId.current;
    setError(null);
    if (refresh) setRefreshing(true);
    else setData(null);
    api(`/releases?kind=${tab}&window=${win}${refresh ? '&refresh=1' : ''}`).then((d) => {
      if (id !== reqId.current) return;
      setRefreshing(false);
      if (d.error) setError(d.error);
      else setData(d);
    });
  };
  useEffect(() => { load(); setProvider(''); }, [tab, win]);

  const limpiarFiltros = () => { setMinScore(0); setOwn(''); setSort('fecha'); setProvider(''); resetTypes(); };
  const hayFiltros = minScore > 0 || own || sort !== 'fecha' || provider;

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

  const counts = (() => {
    const all = [...(data?.recent || []), ...(data?.upcoming || [])];
    return {
      shorts: 0, // el servidor ya echó a los cortos: el chip no pinta nada
      docs: all.filter((f) => f.isDocumentary).length,
      music: all.filter((f) => f.isMusic).length,
      tv: 0,
      coral: 0,
      cameos: 0,
    };
  })();

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
        <b>{t('plataformas y VOD de España y de EE UU')}</b>{t(' (fecha de estreno digital de TMDB, con dónde verla en cada país). Solo cine largometraje. El listón Σ separa el estreno que importa del relleno de cartelera; lo aún sin nota no se oculta.')}
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
          <div className="flex items-center gap-2 flex-wrap text-sm">
            {[['', 'Todas'], ['missing', 'Me faltan'], ['owned', 'Las tengo']].map(([v, label]) => (
              <button key={v} onClick={() => setOwn(v)} className={`btn-ghost !py-1 text-xs ${own === v ? '!border-gold-400 text-gold-400' : ''}`}>
                {t(label)}
              </button>
            ))}
          </div>
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
        <BuildProgress label={t('Consultando los estrenos en TMDB…')} />
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <p className="text-sm text-zinc-500">
              {t('Actualizado {date}.', { date: new Date(data.generatedAt).toLocaleString(locale()) })}
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
              <button className="btn-ghost !py-1 shrink-0 inline-flex items-center gap-1.5" onClick={() => load(true)} disabled={refreshing}>
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
