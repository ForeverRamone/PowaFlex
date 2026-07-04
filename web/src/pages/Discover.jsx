import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import { Spinner, ErrorBox, TmdbCard, RadarrButton, ProgressBar, Empty } from '../components.jsx';

const TABS = [
  ['director', 'Tus directores top'],
  ['actor', 'Tus actores top'],
  ['absent', 'Grandes ausentes'],
];

function GapsView({ role, radarrIds }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api(`/discover/gaps?role=${role}`).then((d) => {
      if (d.error) setError(d.error);
      else setData(d);
    });
  }, [role]);

  if (error) return <ErrorBox error={`${error} — comprueba la API key de TMDB en Ajustes.`} />;
  if (!data) return <Spinner label="Cruzando tus filmografías top con TMDB (la primera vez tarda un poco)…" />;
  if (data.people.length === 0)
    return <Empty>Nada que rellenar: tienes completas las filmografías de tus {role === 'director' ? 'directores' : 'actores'} principales. 🏆</Empty>;

  return (
    <div>
      <p className="text-sm text-slate-500 mb-5">
        Qué te falta (ya estrenado) de las {data.people.length} filmografías más presentes en tu biblioteca,
        ordenado por relevancia en TMDB. Actualizado {new Date(data.generatedAt).toLocaleString('es-ES')}.
      </p>
      {data.people.map((p) => (
        <section key={p.id} className="card p-4 mb-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <Link to={`/personas/${p.id}?role=${role}`} className="font-semibold text-slate-100 hover:text-gold-400">
              {p.name} →
            </Link>
            <span className="text-xs text-slate-400">
              Tienes <b className="text-gold-400">{p.owned}</b> de {p.released} estrenadas ({p.pct}%) ·{' '}
              {p.missingTotal} te faltan
            </span>
          </div>
          <div className="max-w-sm mb-4">
            <ProgressBar pct={p.pct} />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {p.missing.map((f) => (
              <TmdbCard key={f.tmdb_id} item={f}>
                {f.mdb?.score != null && (
                  <div className="text-[11px] text-gold-400">Σ {f.mdb.score}{f.mdb.imdb != null ? ` · IMDb ${Number(f.mdb.imdb).toFixed(1)}` : ''}</div>
                )}
                <RadarrButton tmdbId={f.tmdb_id} small alreadyInRadarr={radarrIds.has(f.tmdb_id)} />
              </TmdbCard>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AbsentView({ radarrIds }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/discover/absent').then((d) => {
      if (d.error) setError(d.error);
      else setData(d);
    });
  }, []);

  if (error) return <ErrorBox error={`${error} — comprueba la API key de TMDB en Ajustes.`} />;
  if (!data)
    return <Spinner label="Comprobando el canon de grandes directores contra tu Plex (la primera vez tarda un par de minutos)…" />;

  return (
    <div>
      <p className="text-sm text-slate-500 mb-5">
        De un canon de {data.checked} grandes directores del cine mundial,{' '}
        <b className="text-gold-400">{data.absent.length} no tienen ni una película en tu Plex</b>
        {' '}({data.present.length} sí están). Sus películas esenciales, listas para Radarr:
      </p>
      {data.absent.length === 0 ? (
        <Empty>Están todos. Eres un completista de verdad. 🏆</Empty>
      ) : (
        data.absent.map((d) => (
          <section key={d.tmdb_id} className="card p-4 mb-5">
            <div className="flex items-center gap-3 mb-3">
              {d.profile_path ? (
                <img src={tmdbImg(d.profile_path, 'w185')} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-ink-700 flex items-center justify-center">🎬</div>
              )}
              <div>
                <div className="font-semibold text-slate-100">{d.name}</div>
                <div className="text-xs text-slate-500">{d.filmCount} películas dirigidas · 0 en tu Plex</div>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {d.top.map((f) => (
                <TmdbCard key={f.tmdb_id} item={f}>
                  <RadarrButton tmdbId={f.tmdb_id} small alreadyInRadarr={radarrIds.has(f.tmdb_id)} />
                </TmdbCard>
              ))}
            </div>
          </section>
        ))
      )}
      {data.present.length > 0 && (
        <details className="mt-6">
          <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-200">
            Ver los {data.present.length} del canon que sí tienes
          </summary>
          <div className="flex flex-wrap gap-2 mt-3">
            {data.present.map((p) => (
              <span key={p.name} className="text-xs bg-ink-800 border border-ink-600 rounded-full px-3 py-1 text-slate-300">
                {p.name} <span className="text-gold-400">({p.inLibrary})</span>
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function Discover() {
  const [tab, setTab] = useState('director');
  const [radarrIds, setRadarrIds] = useState(new Set());

  useEffect(() => {
    api('/radarr/context').then((c) => {
      if (c.tmdbIds) setRadarrIds(new Set(c.tmdbIds));
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Descubrir huecos</h1>
      <p className="text-sm text-slate-500 mb-4">
        Lo que le falta a tu colección: filmografías incompletas de tu propia biblioteca y grandes nombres
        que aún no han entrado en ella.
      </p>
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'btn-gold' : 'btn-ghost'}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'absent' ? <AbsentView radarrIds={radarrIds} /> : <GapsView role={tab} radarrIds={radarrIds} />}
    </div>
  );
}
