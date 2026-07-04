import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import {
  Spinner, ErrorBox, TmdbCard, RadarrButton, ProgressBar, Empty, useRadarrIds,
} from '../components.jsx';

function SagaDetail({ id, radarrIds, addRadarrId }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    api(`/sagas/${id}`).then((d) => (d.error ? setError(d.error) : setDetail(d)));
  }, [id]);

  if (error) return <ErrorBox error={error} />;
  if (!detail) return <Spinner label="Consultando TMDB…" />;

  return (
    <div className="card p-5 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h2 className="text-lg font-semibold text-slate-100">{detail.name}</h2>
        <span className="text-gold-400 font-semibold text-sm">
          {detail.stats.owned} / {detail.stats.released} estrenadas
          {detail.stats.upcoming > 0 && <span className="text-sky-300"> · {detail.stats.upcoming} por estrenar</span>}
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
                <span className="absolute top-1.5 right-1.5 bg-emerald-600/90 text-white text-[10px] px-1.5 py-0.5 rounded">✓</span>
              ) : !p.released ? (
                <span className="absolute top-1.5 right-1.5 bg-sky-600/90 text-white text-[10px] px-1.5 py-0.5 rounded">
                  {p.date ? fmtDate(p.date) : 'Anunciada'}
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

export default function Collections() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [scan, setScan] = useState(null);
  const [radarrIds, addRadarrId] = useRadarrIds();

  const load = () => api('/sagas').then(setData);
  useEffect(() => {
    load();
  }, []);

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

  if (!data) return <Spinner />;

  const { state, sagas } = data;
  const pendingScan = state.totalMovies - state.scanned;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Sagas</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Franquicias detectadas cruzando cada película de tu biblioteca con su colección real de TMDB (no con las
        etiquetas manuales de Plex). Abre cualquiera para ver qué partes te faltan y mandarlas a Radarr.
      </p>

      {/* scan control */}
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-3 text-sm">
        {scan?.running || state.running ? (
          <div className="w-full">
            <div className="text-slate-300 mb-2">
              Escaneando colecciones en TMDB… {scan?.done ?? state.done} de {scan?.total ?? state.total}
            </div>
            <ProgressBar pct={(scan?.total ?? state.total) ? ((scan?.done ?? state.done) / (scan?.total ?? state.total)) * 100 : 0} />
          </div>
        ) : (
          <>
            <span className="text-slate-400">
              {state.scanned.toLocaleString('es-ES')} / {state.totalMovies.toLocaleString('es-ES')} películas
              analizadas · <b className="text-gold-400">{state.collections}</b> franquicias
            </span>
            {pendingScan > 0 ? (
              <button className="btn-gold" onClick={() => startScan(false)}>
                Analizar {pendingScan.toLocaleString('es-ES')} pendientes
              </button>
            ) : (
              <button className="btn-ghost" onClick={() => startScan(true)} title="Volver a analizar todo">
                ↻ Re-analizar
              </button>
            )}
          </>
        )}
      </div>

      {sagas.length === 0 ? (
        <Empty>
          {state.scanned === 0
            ? 'Pulsa «Analizar» para detectar tus franquicias a partir de TMDB.'
            : 'No se han detectado franquicias con más de una película tuya.'}
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {sagas.map((s) => (
            <section key={s.collection_id} className="card p-4">
              <button
                className="flex items-center justify-between w-full gap-3 text-left"
                onClick={() => setOpen(open === s.collection_id ? null : s.collection_id)}
              >
                <span className="font-semibold text-slate-100 hover:text-gold-400">
                  {open === s.collection_id ? '▾' : '▸'} {s.name}
                </span>
                <span className="text-xs text-slate-400 shrink-0">
                  <b className="text-gold-400">{s.owned}</b> {s.owned === 1 ? 'película tuya' : 'películas tuyas'}
                </span>
              </button>
              {open === s.collection_id && (
                <SagaDetail id={s.collection_id} radarrIds={radarrIds} addRadarrId={addRadarrId} />
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
