import { useEffect, useRef, useState } from 'react';
import { api, fmtDate } from '../api.js';
import {
  Spinner, ErrorBox, TmdbCard, RadarrButton, ProgressBar, Empty, useRadarrIds, PageHeader } from '../components.jsx';
import { t, locale } from '../i18n.js';

function SagaDetail({ id, radarrIds, addRadarrId }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    api(`/sagas/${id}`).then((d) => (d.error ? setError(d.error) : setDetail(d)));
  }, [id]);

  if (error) return <ErrorBox error={error} />;
  if (!detail) return <Spinner label={t('Consultando TMDB…')} />;

  return (
    <div className="card p-5 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h2 className="text-lg font-semibold text-zinc-100">{detail.name}</h2>
        <span className="text-gold-400 font-semibold text-sm">
          {t('{owned} / {released} estrenadas', { owned: detail.stats.owned, released: detail.stats.released })}
          {detail.stats.upcoming > 0 && <span className="text-sky-300"> · {t('{n} por estrenar', { n: detail.stats.upcoming })}</span>}
        </span>
      </div>
      <div className="max-w-md mb-5">
        <ProgressBar pct={detail.stats.released ? (detail.stats.owned / detail.stats.released) * 100 : 0} />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {detail.parts.map((p) => (
          <TmdbCard
            key={p.tmdb_id}
            item={p}
            badge={
              p.owned ? (
                <span className="absolute top-1.5 right-1.5 bg-emerald-600/90 text-white text-[11px] px-1.5 py-0.5 rounded">✓</span>
              ) : !p.released ? (
                <span className="absolute top-1.5 right-1.5 bg-sky-600/90 text-white text-[11px] px-1.5 py-0.5 rounded">
                  {p.date ? fmtDate(p.date) : t('Anunciada')}
                </span>
              ) : null
            }
          >
            {!p.owned && p.released && (
              <RadarrButton tmdbId={p.tmdb_id} small alreadyInRadarr={radarrIds.has(p.tmdb_id)} onAdded={addRadarrId} />
            )}
          </TmdbCard>
        ))}
      </div>
    </div>
  );
}

export default function Sagas({ embedded = false }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [scan, setScan] = useState(null);
  const [statsBusy, setStatsBusy] = useState(false);
  const [radarrIds, addRadarrId] = useRadarrIds();

  const load = () => api('/sagas').then(setData);
  useEffect(() => {
    load();
  }, []);

  // compute "what you're missing" counts per franchise from TMDB (#H)
  // el temporizador vive en un ref y se limpia al desmontar: si te ibas de la
  // página mientras calculaba, seguía preguntando cada segundo y medio el resto
  // de la sesión
  const pollRef = useRef(null);
  useEffect(() => () => clearInterval(pollRef.current), []);
  const computeStats = async () => {
    setStatsBusy(true);
    const r = await api('/sagas/stats', { method: 'POST' });
    if (r?.error) { setStatsBusy(false); return; }
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const st = await api('/sagas/status');
      if (st?.error || !st.statsStatus?.running) {
        clearInterval(pollRef.current);
        setStatsBusy(false);
        load();
      }
    }, 1500);
  };

  // poll scan progress
  useEffect(() => {
    if (!scan?.running) return;
    const t = setInterval(async () => {
      const st = await api('/sagas/status');
      setScan(st);
      if (!st.running) {
        clearInterval(t);
        load();
      }
    }, 1500);
    return () => clearInterval(t);
  }, [scan?.running]);

  const startScan = async (force = false) => {
    const st = await api('/sagas/scan', { method: 'POST', body: { force } });
    setScan({ ...st, running: true });
  };

  if (data?.error) return <ErrorBox error={data.error} />;
  if (!data) return <Spinner label={t('Repasando tus sagas a medias…')} />;

  const { state, sagas } = data;
  const pendingScan = state.totalMovies - state.scanned;

  return (
    <div>
      {!embedded && <PageHeader eyebrow={t('Colección')} title={t('Sagas')} />}
      <p className="text-sm text-zinc-500 mb-5 max-w-3xl">
        {t('Franquicias detectadas cruzando cada película de tu biblioteca con su colección real de TMDB (no con las etiquetas manuales de Plex). Abre cualquiera para ver qué partes te faltan y mandarlas a Radarr.')}
      </p>

      {/* scan control */}
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-3 text-sm">
        {scan?.running || state.running ? (
          <div className="w-full">
            <div className="text-zinc-300 mb-2">
              {t('Escaneando colecciones en TMDB… {done} de {total}', { done: scan?.done ?? state.done, total: scan?.total ?? state.total })}
            </div>
            <ProgressBar pct={(scan?.total ?? state.total) ? ((scan?.done ?? state.done) / (scan?.total ?? state.total)) * 100 : 0} />
          </div>
        ) : (
          <>
            <span className="text-zinc-400">
              {t('{scanned} / {total} películas analizadas ·', { scanned: state.scanned.toLocaleString(locale()), total: state.totalMovies.toLocaleString(locale()) })} <b className="text-gold-400">{state.collections}</b> {t('franquicias')}
            </span>
            {pendingScan > 0 ? (
              <button className="btn-gold" onClick={() => startScan(false)}>
                {t('Analizar {n} pendientes', { n: pendingScan.toLocaleString(locale()) })}
              </button>
            ) : (
              <button className="btn-ghost" onClick={() => startScan(true)} title={t('Volver a analizar todo')}>
                {t('↻ Re-analizar')}
              </button>
            )}
          </>
        )}
      </div>

      {sagas.length === 0 ? (
        <Empty>
          {state.scanned === 0
            ? t('Pulsa «Analizar» para detectar tus franquicias a partir de TMDB.')
            : t('No se han detectado franquicias con más de una película tuya.')}
        </Empty>
      ) : (
        <>
          {/* compute what's missing per franchise (#H) */}
          {sagas.some((s) => s.missing == null) && (
            <div className="card p-3 mb-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-zinc-400">{t('Calcula cuántas partes te faltan en cada saga (consulta TMDB):')}</span>
              <button className="btn-gold !py-1 shrink-0" onClick={computeStats} disabled={statsBusy}>
                {statsBusy ? t('Calculando…') : t('Calcular lo que falta')}
              </button>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {sagas.map((s) => (
              <section key={s.collection_id} className="card p-4">
                <button
                  className="flex items-center justify-between w-full gap-3 text-left"
                  onClick={() => setOpen(open === s.collection_id ? null : s.collection_id)}
                >
                  <span className="font-semibold text-zinc-100 hover:text-gold-400">
                    {open === s.collection_id ? '▾' : '▸'} {s.name}
                  </span>
                  <span className="text-xs text-zinc-400 shrink-0 flex items-center gap-2">
                    <span><b className="text-gold-400">{s.owned}</b> {s.owned === 1 ? t('tuya') : t('tuyas')}</span>
                    {s.missing != null && s.missing > 0 && (
                      <span className="text-orange-300">· {t('te faltan {n}', { n: s.missing })}</span>
                    )}
                    {s.missing === 0 && <span className="text-emerald-400">· {t('completa ✓')}</span>}
                    {s.upcoming > 0 && <span className="text-sky-300">· {t('{n} por estrenar', { n: s.upcoming })}</span>}
                  </span>
                </button>
                {/* missing titles at a glance, without opening (#H) */}
                {open !== s.collection_id && s.missingTitles?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.missingTitles.slice(0, 8).map((m, i) => (
                      <span key={i} className="text-[11px] bg-ink-800 border border-ink-700 rounded-full px-2 py-0.5 text-zinc-400">
                        {m.title}{m.year ? ` (${m.year})` : ''}
                      </span>
                    ))}
                    {s.missingTitles.length > 8 && (
                      <span className="text-[11px] text-zinc-500 px-1 py-0.5">{t('+{n} más', { n: s.missingTitles.length - 8 })}</span>
                    )}
                  </div>
                )}
                {open === s.collection_id && (
                  <SagaDetail id={s.collection_id} radarrIds={radarrIds} addRadarrId={addRadarrId} />
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
