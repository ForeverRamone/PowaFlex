import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { Spinner, ErrorBox, TmdbCard, RadarrButton, ProgressBar, Empty } from '../components.jsx';

export default function Collections() {
  const [list, setList] = useState(null);
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/collections').then((r) => setList(Array.isArray(r) ? r : []));
  }, []);

  const open = async (name) => {
    setActive(name);
    setDetail(null);
    setError(null);
    const d = await api(`/collections/complete?name=${encodeURIComponent(name)}`);
    if (d.error) setError(d.error);
    else setDetail(d);
  };

  if (!list) return <Spinner />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Sagas y colecciones</h1>
      <p className="text-sm text-slate-500 mb-5">
        Colecciones de tu Plex. Haz clic en una para cruzarla con TMDB y ver qué partes te faltan.
      </p>

      {list.length === 0 && <Empty>Tu Plex no tiene colecciones etiquetadas.</Empty>}

      <div className="flex flex-wrap gap-2 mb-6">
        {list.map((c) => (
          <button
            key={c.id}
            onClick={() => open(c.name)}
            className={active === c.name ? 'btn-gold' : 'btn-ghost'}
          >
            {c.name} <span className="opacity-60">({c.n})</span>
          </button>
        ))}
      </div>

      {active && error && <ErrorBox error={error} />}
      {active && !detail && !error && <Spinner label="Consultando TMDB…" />}
      {detail && !detail.matched && <Empty>TMDB no encuentra una colección llamada «{active}».</Empty>}
      {detail?.matched && (
        <div className="card p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <h2 className="text-lg font-semibold text-slate-100">{detail.name}</h2>
            <span className="text-gold-400 font-semibold text-sm">
              {detail.stats.owned} / {detail.stats.released} estrenadas
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
                {!p.owned && p.released && <RadarrButton tmdbId={p.tmdb_id} small />}
              </TmdbCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
