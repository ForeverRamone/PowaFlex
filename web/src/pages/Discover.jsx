import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import {
  Spinner, ErrorBox, TmdbCard, RadarrButton, ProgressBar, Empty, BuildProgress,
  useRadarrIds, useTypeFilters, TypeFilterBar, matchesTypeFilters,
} from '../components.jsx';

const TABS = [
  ['favorites', '⭐ Tus favoritos'],
  ['director', 'Directores/as top'],
  ['actor', 'Actores/actrices top'],
  ['absent', 'Grandes ausentes'],
];

function PersonGaps({ p, role, show, radarrIds, addRadarrId }) {
  const shown = p.missing.filter((f) => matchesTypeFilters(f, show));
  if (!shown.length) return null;
  return (
    <section className="card p-4 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <Link to={`/personas/${p.id}?role=${p.role || role}`} className="font-semibold text-slate-100 hover:text-gold-400">
          {p.name} →
        </Link>
        <span className="text-xs text-slate-400">
          Tienes <b className="text-gold-400">{p.owned}</b> de {p.released} estrenadas ({p.pct}%) · {p.missingTotal} te faltan
        </span>
      </div>
      <div className="max-w-sm mb-4"><ProgressBar pct={p.pct} /></div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {shown.map((f) => (
          <TmdbCard key={f.tmdb_id} item={f}>
            {f.mdb?.score != null && (
              <div className="text-[11px] text-gold-400">Σ {f.mdb.score}{f.mdb.imdb != null ? ` · IMDb ${Number(f.mdb.imdb).toFixed(1)}` : ''}</div>
            )}
            <RadarrButton tmdbId={f.tmdb_id} small alreadyInRadarr={radarrIds.has(f.tmdb_id)} onAdded={addRadarrId} />
          </TmdbCard>
        ))}
      </div>
    </section>
  );
}

function typeCounts(people) {
  const all = people.flatMap((p) => p.missing);
  return {
    shorts: all.filter((f) => f.isShort).length,
    docs: all.filter((f) => f.isDocumentary).length,
    tv: all.filter((f) => f.isTvMovie).length,
  };
}

function GapsView({ endpoint, role, radarrIds, addRadarrId, show, toggle, intro }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = (refresh = false) => {
    setError(null);
    if (refresh) setRefreshing(true);
    else setData(null);
    api(`${endpoint}${refresh ? (endpoint.includes('?') ? '&' : '?') + 'refresh=1' : ''}`).then((d) => {
      setRefreshing(false);
      if (d.error) setError(d.error);
      else setData(d);
    });
  };
  useEffect(() => { load(); }, [endpoint]);

  if (error) return <ErrorBox error={`${error} — comprueba la API key de TMDB en Ajustes.`} />;
  if (!data) return <BuildProgress label="Cruzando filmografías con TMDB…" />;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-sm text-slate-500">{intro} Actualizado {new Date(data.generatedAt).toLocaleString('es-ES')}.</p>
        <button className="btn-ghost !py-1 shrink-0" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : '↻ Actualizar'}
        </button>
      </div>
      {data.people.length === 0 ? (
        <Empty>Nada que rellenar aquí. 🏆</Empty>
      ) : (
        <>
          <TypeFilterBar show={show} toggle={toggle} counts={typeCounts(data.people)} />
          {data.people.map((p) => (
            <PersonGaps key={p.id} p={p} role={role} show={show} radarrIds={radarrIds} addRadarrId={addRadarrId} />
          ))}
        </>
      )}
    </div>
  );
}

const CANONS = [
  ['alltime', 'Top 250 de siempre', 'https://theyshootpictures.com/gf1000_top250directors.htm'],
  ['21c', 'Top 100 del siglo XXI', 'https://theyshootpictures.com/21stcentury_top100directors.htm'],
];

function AbsentView({ radarrIds, addRadarrId }) {
  const [canon, setCanon] = useState('alltime');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = (refresh = false) => {
    setError(null);
    if (refresh) setRefreshing(true);
    else setData(null);
    api(`/discover/absent?canon=${canon}${refresh ? '&refresh=1' : ''}`).then((d) => {
      setRefreshing(false);
      if (d.error) setError(d.error);
      else setData(d);
    });
  };
  useEffect(() => { load(); }, [canon]);

  const canonUrl = CANONS.find(([k]) => k === canon)?.[2];

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {CANONS.map(([k, label]) => (
          <button key={k} onClick={() => setCanon(k)} className={`btn-ghost !py-1 text-sm ${canon === k ? '!border-gold-400 text-gold-400' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorBox error={`${error} — comprueba la API key de TMDB en Ajustes.`} />
      ) : !data ? (
        <Spinner label="Comprobando el canon de grandes directores/as contra tu Plex…" />
      ) : (
      <>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-sm text-slate-500">
          Del canon de {data.checked} grandes directores/as de{' '}
          <a href={canonUrl} target="_blank" rel="noreferrer" className="underline hover:text-gold-400">They Shoot Pictures</a>,{' '}
          <b className="text-gold-400">{data.absent.length} no tienen ni una película en tu Plex</b> ({data.present.length} sí están).
        </p>
        <button className="btn-ghost !py-1 shrink-0" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : '↻ Actualizar'}
        </button>
      </div>
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
                  <RadarrButton tmdbId={f.tmdb_id} small alreadyInRadarr={radarrIds.has(f.tmdb_id)} onAdded={addRadarrId} />
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
      </>
      )}
    </div>
  );
}

export default function Discover() {
  const [tab, setTab] = useState('favorites');
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [show, toggle] = useTypeFilters('discover_type_filters');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Descubrir huecos</h1>
      <p className="text-sm text-slate-500 mb-4 max-w-3xl">
        Lo que le falta a tu colección. <b>Tus favoritos</b> son los que tú eliges en{' '}
        <Link to="/favoritos" className="text-gold-400 hover:underline">Favoritos</Link>; los <b>top</b> son los más presentes en tu
        biblioteca; y <b>grandes ausentes</b> son nombres del canon que aún no tienes. ¿Buscas a alguien concreto? Ve a su ficha:
      </p>
      <form
        className="flex gap-2 mb-5 max-w-md"
        onSubmit={(e) => { e.preventDefault(); if (search.trim()) navigate(`/personas?search=${encodeURIComponent(search.trim())}`); }}
      >
        <input className="input" placeholder="Buscar director o actor por nombre…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-ghost shrink-0">Ver ficha</button>
      </form>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'btn-gold' : 'btn-ghost'}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'absent' ? (
        <AbsentView radarrIds={radarrIds} addRadarrId={addRadarrId} />
      ) : tab === 'favorites' ? (
        <GapsView
          endpoint="/discover/favorites"
          radarrIds={radarrIds} addRadarrId={addRadarrId} show={show} toggle={toggle}
          intro="Qué te falta (ya estrenado) de las filmografías de tus favoritos, ordenado por relevancia."
        />
      ) : (
        <GapsView
          key={tab}
          endpoint={`/discover/gaps?role=${tab}`}
          role={tab}
          radarrIds={radarrIds} addRadarrId={addRadarrId} show={show} toggle={toggle}
          intro={`Qué te falta de las filmografías de ${tab === 'director' ? 'directores' : 'actores'} más presentes en tu biblioteca.`}
        />
      )}
    </div>
  );
}
