import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
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
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [followedDirs, setFollowedDirs] = useState(new Set());
  const [dirBusy, setDirBusy] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [followAllBusy, setFollowAllBusy] = useState(false);
  // corrector manual de emparejado: película en edición + buscador
  const [editar, setEditar] = useState(null);
  const [busca, setBusca] = useState('');
  const [candidatos, setCandidatos] = useState(null);
  const [buscando, setBuscando] = useState(false);

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
    // las entradas de solo-palmarés (cánones, premios) no tienen ediciones:
    // se clique desde la vista que se clique, siempre va al palmarés
    const soloP = index?.festivals?.find((f) => f.key === k)?.onlyWinners;
    const path = soloP || v === 'palmares' ? `/festivals/${k}/palmares` : `/festivals/${k}/${y}`;
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
  // las entradas de solo-palmarés (Sight & Sound) no tienen ediciones por año
  const soloPalmares = !!info?.onlyWinners;
  useEffect(() => {
    if (soloPalmares && view !== 'palmares') setView('palmares');
  }, [soloPalmares, view]);

  // años del desplegable, de la edición que viene a la primera; al cambiar a
  // un festival más joven (Busan), el año se recoloca solo dentro de su rango
  const añoMax = (index?.currentYear || new Date().getFullYear()) + 1;
  const añoMin = info?.sinceYear || 1946;
  const años = [];
  for (let y = añoMax; y >= añoMin; y--) años.push(y);
  useEffect(() => {
    if (soloPalmares || !info) return;
    if (year < añoMin) setYear(añoMin);
    else if (year > añoMax) setYear(añoMax);
  }, [fest, info, soloPalmares, year, añoMin, añoMax]);
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

  const abrirCorrector = (f) => {
    setEditar(f);
    setBusca(f.title || '');
    setCandidatos(null);
  };
  const buscarCandidatos = async () => {
    if (!busca.trim()) return;
    setBuscando(true);
    const keyYear = view === 'palmares' ? editar.year : data?.year;
    const r = await api(`/festivals/match-candidates?q=${encodeURIComponent(busca.trim())}&year=${keyYear || ''}`);
    setBuscando(false);
    setCandidatos(r.error ? [] : r.candidates || []);
  };
  const fijarMatch = async (tmdbId) => {
    const keyYear = view === 'palmares' ? editar.year : data?.year;
    const r = await api('/festivals/match', {
      method: 'POST',
      body: { title: editar.title, year: keyYear, director: editar.director, tmdbId },
    });
    if (r.error) {
      toast(`⚠️ ${r.error}`, 'error');
      return;
    }
    toast(tmdbId ? '✓ Emparejado corregido' : '✓ Corrección quitada');
    setEditar(null);
    load(fest, year, view);
  };

  return (
    <div>
      <PageHeader
        eyebrow="La caza"
        title="Festivales y premios"
        subtitle="Las secciones oficiales de los grandes festivales (los seis de la vía Óscar más San Sebastián), el palmarés y las nominadas de los premios de cada año, y los cánones de la crítica."
      />

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {[
          ['festival', 'Festivales'],
          ['premio', 'Premios'],
          ['canon', 'Cánones'],
        ].map(([g, label]) => {
          const del = (index?.festivals || []).filter((f) => f.group === g);
          if (!del.length) return null;
          return (
            <div key={g} className="flex gap-2 items-center flex-wrap">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wider">{label}:</span>
              {del.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    setFest(f.key);
                    if (f.onlyWinners) setView('palmares');
                  }}
                  className={fest === f.key ? 'btn-gold' : 'btn-ghost'}
                  title={f.award}
                >
                  {f.name}
                </button>
              ))}
              <span className="w-2" />
            </div>
          );
        })}
        {view === 'seleccion' && (
          <div className="flex items-center gap-1 ml-auto">
            <button className="btn-ghost !py-1" onClick={() => setYear((y) => y - 1)} title="Edición anterior">←</button>
            {/* desplegable en vez de campo numérico: el centro es clicable y
                fuera las flechitas de arriba/abajo (ya están ← →) */}
            <select
              className="input !w-24 text-center !py-1 tabular cursor-pointer"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              title="Elegir edición"
            >
              {años.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button className="btn-ghost !py-1" onClick={() => setYear((y) => y + 1)} title="Edición siguiente">→</button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        {!soloPalmares && (
          <div className="flex gap-2">
            <button onClick={() => setView('seleccion')} className={`${view === 'seleccion' ? 'btn-gold' : 'btn-ghost'} !py-1 text-xs`}>
              {info?.awardNominees ? 'Nominadas por año' : 'Sección oficial por año'}
            </button>
            <button onClick={() => setView('palmares')} className={`${view === 'palmares' ? 'btn-gold' : 'btn-ghost'} !py-1 text-xs`}>
              🏆 Palmarés histórico
            </button>
          </div>
        )}
        {info && (
          <span className="text-xs text-zinc-500">
            {soloPalmares ? 'Canon: ' : 'Premio que clasifica: '}
            <b className="text-zinc-300">{info.award}</b>
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
              {data.resolveErrors > 0 && (
                <span className="text-orange-300" title="TMDB cortó el grifo a mitad de comprobación; este resultado no se guarda en caché">
                  {' '}· {data.resolveErrors} sin comprobar por fallos de red — recarga en un rato
                </span>
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
                    <TmdbCard
                      item={f}
                      badge={
                        f.winner ? (
                          <span className="absolute top-1.5 right-1.5 on-art bg-black/70 text-[11px] px-1.5 py-0.5 rounded">🏆 Ganadora</span>
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
                        <RadarrButton tmdbId={f.tmdb_id} small alreadyInRadarr={radarrIds.has(f.tmdb_id)} onAdded={addRadarrId} />
                      )}
                    </TmdbCard>
                  ) : (
                    <div className="poster flex items-center justify-center text-center p-2 text-[11px] text-zinc-400" title="Sin ficha en TMDB (todavía)">
                      {f.title}
                    </div>
                  )}
                  <div className="flex items-baseline gap-1.5">
                    <button
                      onClick={() => abrirCorrector(f)}
                      title="Corregir el emparejado con TMDB a mano"
                      className="text-[11px] text-zinc-600 hover:text-gold-400 shrink-0 cursor-pointer"
                    >
                      ✎
                    </button>
                    {f.rank && (
                      <span className="text-[11px] text-gold-400 font-semibold tabular shrink-0" title={f.tied ? `Puesto ${f.rank} (empate)` : `Puesto ${f.rank}`}>
                        #{f.rank}
                      </span>
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
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editar && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setEditar(null)}>
          <div className="card-raised p-4 w-full max-w-lg mt-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-semibold text-zinc-100 text-sm">
                Corregir emparejado · «{editar.title}»{editar.director ? ` — ${editar.director}` : ''}
              </h3>
              <button className="text-zinc-500 hover:text-zinc-200" onClick={() => setEditar(null)}>✕</button>
            </div>
            <p className="text-[11px] text-zinc-500 mb-3">
              Busca en TMDB y elige la ficha correcta. La corrección se recuerda y manda sobre el
              emparejado automático.
            </p>
            <form
              className="flex gap-2 mb-3"
              onSubmit={(e) => {
                e.preventDefault();
                buscarCandidatos();
              }}
            >
              <input className="input flex-1" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Título a buscar en TMDB…" />
              <button type="submit" className="btn-gold" disabled={buscando}>
                {buscando ? '…' : 'Buscar'}
              </button>
            </form>
            {candidatos && candidatos.length === 0 && <Empty>Nada en TMDB con ese título.</Empty>}
            {candidatos?.length > 0 && (
              <div className="divide-y divide-ink-800 max-h-80 overflow-y-auto">
                {candidatos.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => fijarMatch(c.id)}
                    className="w-full flex items-center gap-3 py-2 text-left hover:bg-ink-800 px-2 cursor-pointer"
                  >
                    {c.poster_path ? (
                      <img src={tmdbImg(c.poster_path, 'w92')} alt="" className="w-10 rounded border border-ink-700 shrink-0" />
                    ) : (
                      <span className="w-10 h-14 shrink-0 border border-ink-700 rounded flex items-center justify-center text-[9px] text-zinc-500">sin cartel</span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm text-zinc-200 truncate">{c.title}</span>
                      <span className="block text-[11px] text-zinc-500 truncate">
                        {c.date ? c.date.slice(0, 4) : 'sin fecha'}
                        {c.original_title && c.original_title !== c.title ? ` · ${c.original_title}` : ''}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {editar.tmdb_id && (
              <button className="btn-ghost !py-1 text-xs mt-3" onClick={() => fijarMatch(null)}>
                Quitar corrección / volver al automático
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
