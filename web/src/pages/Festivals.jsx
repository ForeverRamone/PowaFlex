import { useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  Spinner, ErrorBox, TmdbCard, RadarrButton, Empty, StatusLegend, PageHeader, useRadarrIds,
} from '../components.jsx';
import { toast } from '../toast.js';

/**
 * Secciones oficiales de los seis festivales de la «vía festival» al Óscar
 * internacional: ganar su premio gordo clasifica una película no inglesa sin
 * pasar por el comité nacional. Datos de Wikipedia, casados contra TMDB.
 */
export default function Festivals() {
  const [index, setIndex] = useState(null);
  const [fest, setFest] = useState(() => localStorage.getItem('festival_key') || 'cannes');
  const [year, setYear] = useState(() => Number(localStorage.getItem('festival_year')) || new Date().getFullYear());
  const [view, setView] = useState(() => localStorage.getItem('festival_view') || 'seleccion'); // seleccion | palmares
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [followedDirs, setFollowedDirs] = useState(new Set());
  const [dirBusy, setDirBusy] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [followAllBusy, setFollowAllBusy] = useState(false);

  useEffect(() => {
    api('/festivals').then((r) => !r.error && setIndex(r));
    // directores ya seguidos, para pintar la estrella llena junto a su nombre
    api('/tracked?role=director').then(
      (list) => Array.isArray(list) && setFollowedDirs(new Set(list.map((t) => t.name)))
    );
  }, []);

  const load = (k = fest, y = year, v = view, refresh = false) => {
    setLoading(true);
    setError(null);
    setData(null);
    const path = v === 'palmares' ? `/festivals/${k}/palmares` : `/festivals/${k}/${y}`;
    api(`${path}${refresh ? '?refresh=1' : ''}`).then((r) => {
      setLoading(false);
      if (r.error) setError(r.error);
      else setData(r);
    });
  };
  useEffect(() => {
    localStorage.setItem('festival_key', fest);
    localStorage.setItem('festival_year', String(year));
    localStorage.setItem('festival_view', view);
    load(fest, year, view);
  }, [fest, year, view]);

  const info = index?.festivals?.find((f) => f.key === fest);
  const films = data?.films || [];
  const missingIds = films.filter((f) => f.tmdb_id && !f.owned && !radarrIds.has(f.tmdb_id)).map((f) => f.tmdb_id);

  const bulkAdd = async () => {
    setBulkBusy(true);
    const res = await api('/radarr/add-bulk', { method: 'POST', body: { tmdbIds: missingIds.slice(0, 300) } });
    setBulkBusy(false);
    if (res.error) { toast(`⚠️ ${res.error}`, 'error'); return; }
    for (const r of res.results || []) if (r.ok || r.alreadyExists) addRadarrId(r.tmdbId);
    toast(`✓ ${res.added} añadidas a Radarr${res.alreadyInRadarr ? ` · ${res.alreadyInRadarr} ya estaban` : ''}${res.failed ? ` · ⚠️ ${res.failed} fallaron` : ''}`);
  };

  // el nombre viene de la tabla de Wikipedia («A, B» si son varios): by-names
  // ya sabe partirlo y resolver cada uno contra TMDB como director/a
  const followDirector = async (name) => {
    setDirBusy(name);
    const r = await api('/tracked/by-names', { method: 'POST', body: { names: name, role: 'director' } });
    setDirBusy(null);
    if (r.error) { toast(`⚠️ ${r.error}`, 'error'); return; }
    setFollowedDirs((prev) => new Set(prev).add(name));
    toast(r.added ? `⭐ ${name} en favoritos (directores/as)` : `${name} ya estaba en favoritos`, 'success');
  };

  // para las ediciones venideras: en cuanto se anuncie la sección oficial,
  // seguir de un golpe a toda su dirección y que entren en el calendario
  const pendingDirs = [...new Set(films.map((f) => f.director).filter((d) => d && !followedDirs.has(d)))];
  const followAll = async () => {
    setFollowAllBusy(true);
    const r = await api('/tracked/by-names', { method: 'POST', body: { names: pendingDirs.join('\n'), role: 'director' } });
    setFollowAllBusy(false);
    if (r.error) { toast(`⚠️ ${r.error}`, 'error'); return; }
    setFollowedDirs((prev) => new Set([...prev, ...pendingDirs]));
    toast(`⭐ ${r.added} directores/as añadidos a favoritos${r.notFound?.length ? ` · ${r.notFound.length} sin resolver` : ''}`, 'success');
  };

  return (
    <div>
      <PageHeader
        eyebrow="La caza"
        title="Festivales"
        subtitle="Las secciones oficiales de los grandes festivales: los seis de la vía directa al Óscar internacional (reglas del 99.º Óscar) más San Sebastián y sus Horizontes Latinos."
      />

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {(index?.festivals || []).map((f) => (
          <button key={f.key} onClick={() => setFest(f.key)} className={fest === f.key ? 'btn-gold' : 'btn-ghost'} title={`Premio que clasifica: ${f.award}`}>
            {f.name}
          </button>
        ))}
        {view === 'seleccion' && (
          <div className="flex items-center gap-1 ml-auto">
            <button className="btn-ghost !py-1" onClick={() => setYear((y) => y - 1)} title="Edición anterior">←</button>
            <input
              type="number"
              className="input !w-24 text-center !py-1 tabular"
              value={year}
              min={info?.sinceYear || 1946}
              max={(index?.currentYear || new Date().getFullYear()) + 1}
              onChange={(e) => Number(e.target.value) > 1900 && setYear(Number(e.target.value))}
            />
            <button className="btn-ghost !py-1" onClick={() => setYear((y) => y + 1)} title="Edición siguiente">→</button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="flex gap-2">
          <button onClick={() => setView('seleccion')} className={`${view === 'seleccion' ? 'btn-gold' : 'btn-ghost'} !py-1 text-xs`}>
            Sección oficial por año
          </button>
          <button onClick={() => setView('palmares')} className={`${view === 'palmares' ? 'btn-gold' : 'btn-ghost'} !py-1 text-xs`}>
            🏆 Palmarés histórico
          </button>
        </div>
        {info && (
          <span className="text-xs text-zinc-500">
            Premio que clasifica: <b className="text-zinc-300">{info.award}</b>
            {view === 'seleccion' && info.sinceYear > 1990 && ` · esta sección existe desde ${info.sinceYear}`}
          </span>
        )}
      </div>

      {error && <ErrorBox error={error} />}
      {loading && <Spinner label="Leyendo la selección en Wikipedia y casándola con TMDB…" />}

      {data && (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span className="text-sm text-zinc-400">
              <b className="text-gold-400">
                {data.name} {data.year ?? ''}
              </b>{' '}
              · {data.section || `todas las ganadoras (${data.award})`} · {films.length} películas
              {data.unresolved > 0 && (
                <span className="text-zinc-500"> · {data.unresolved} sin casar con TMDB</span>
              )}
            </span>
            <a href={data.source} target="_blank" rel="noreferrer" className="text-[11px] text-zinc-500 hover:text-gold-400 underline">
              fuente: Wikipedia
            </a>
            <button className="btn-ghost !py-1 text-xs" onClick={() => load(fest, year, view, true)}>↻ Recargar</button>
            <div className="flex gap-2 ml-auto flex-wrap">
              {pendingDirs.length > 1 && (
                <button className="btn-ghost" disabled={followAllBusy} onClick={followAll}
                  title="Sus estrenos futuros entrarán en el calendario de cine venidero">
                  {followAllBusy ? 'Añadiendo…' : `⭐ Seguir a sus ${pendingDirs.length} directores/as`}
                </button>
              )}
              {missingIds.length > 0 && (
                <button className="btn-gold" disabled={bulkBusy} onClick={bulkAdd}>
                  {bulkBusy ? 'Añadiendo…' : `➕ Mandar a Radarr las ${missingIds.length} que te faltan`}
                </button>
              )}
            </div>
          </div>
          {data.note && (
            <p className="text-xs text-sky-300 mb-3 max-w-3xl">ℹ️ {data.note}</p>
          )}
          <StatusLegend className="mb-4" />

          {films.length === 0 ? (
            <Empty>Sin películas en esta edición.</Empty>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {films.map((f, i) => (
                <div key={f.tmdb_id || `${f.title}-${i}`}>
                  {f.tmdb_id ? (
                    <TmdbCard item={f}>
                      {f.mdb?.score != null && (
                        <div className="text-[11px] text-gold-400/90 tabular">
                          Σ {f.mdb.score}
                          {f.mdb.imdb != null ? ` · IMDb ${Number(f.mdb.imdb).toFixed(1)}` : ''}
                        </div>
                      )}
                      {!f.owned && (
                        <RadarrButton tmdbId={f.tmdb_id} small alreadyInRadarr={radarrIds.has(f.tmdb_id)} onAdded={addRadarrId} />
                      )}
                    </TmdbCard>
                  ) : (
                    <div className="poster flex items-center justify-center text-center p-2 text-[11px] text-zinc-400" title="Sin ficha en TMDB (todavía)">
                      {f.title}
                    </div>
                  )}
                  {f.director && (
                    <button
                      onClick={() => followDirector(f.director)}
                      disabled={dirBusy === f.director || followedDirs.has(f.director)}
                      className="mt-1 text-[11px] text-zinc-400 hover:text-gold-400 text-left leading-tight cursor-pointer disabled:cursor-default"
                      title={followedDirs.has(f.director) ? 'Ya en favoritos' : `Seguir a ${f.director} como director/a`}
                    >
                      {followedDirs.has(f.director) ? '⭐' : dirBusy === f.director ? '…' : '☆'} {f.director}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
