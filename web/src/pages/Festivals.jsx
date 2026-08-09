import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  Spinner, ErrorBox, TmdbCard, RadarrButton, Empty, StatusLegend, PageHeader, useRadarrIds,
  MatchCorrector, MinScoreBar, passesScore, EnlacePersona,
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
  // corrector manual de emparejado: película en edición (el diálogo es el
  // MatchCorrector compartido, que aquí busca con el endpoint de festivales)
  const [editar, setEditar] = useState(null);
  // filtros de contenido, como en Descubrir: nota mínima Σ y posesión
  const [minScore, setMinScoreState] = useState(() => Number(localStorage.getItem('festival_min_score') || 0));
  const setMinScore = (v) => { setMinScoreState(v); localStorage.setItem('festival_min_score', String(v)); };
  const [own, setOwnState] = useState(() => localStorage.getItem('festival_own') || '');
  const setOwn = (v) => { setOwnState(v); localStorage.setItem('festival_own', v); };

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
  const load = (k = fest, y = year, v = view, refresh = false) => {
    const mia = ++peticion.current;
    setLoading(true);
    setError(null);
    setData(null);
    // las entradas de solo-palmarés (cánones, premios) no tienen ediciones:
    // se clique desde la vista que se clique, siempre va al palmarés
    const soloP = index?.festivals?.find((f) => f.key === k)?.onlyWinners;
    const path = soloP || v === 'palmares' ? `/festivals/${k}/palmares` : `/festivals/${k}/${y}`;
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
  // lo que se enseña es lo que cuentan los botones masivos: mismo criterio que
  // en Descubrir («las N visibles»). Las sin ficha TMDB no se filtran por nota.
  const shown = films.filter(
    (f) => (!f.tmdb_id || passesScore(f, minScore)) && (own === '' || (own === 'missing' ? !f.owned : !!f.owned))
  );
  const hidden = films.length - shown.length;
  const missingIds = shown.filter((f) => f.tmdb_id && !f.owned && !radarrIds.has(f.tmdb_id)).map((f) => f.tmdb_id);

  const bulkAdd = async () => {
    setBulkBusy(true);
    const { error, summary } = await addBulkToRadarr(missingIds, { onAdded: addRadarrId });
    setBulkBusy(false);
    if (summary) toast(summary, error ? 'error' : undefined);
  };

  // cada estrella sigue a UNA persona: el nombre llega ya partido de la celda
  const followDirector = async (name) => {
    setDirBusy(name);
    const r = await api('/tracked/by-names', { method: 'POST', body: { names: name, role: 'director' } });
    setDirBusy(null);
    if (r.error) { toast(`⚠️ ${t(r.error)}`, 'error'); return; }
    setFollowedDirs((prev) => new Set(prev).add(name));
    toast(r.added ? t('⭐ {name} en favoritos (directores/as)', { name }) : t('{name} ya estaba en favoritos', { name }), 'success');
  };

  // para las ediciones venideras: en cuanto se anuncie la sección oficial,
  // seguir de un golpe a toda su dirección (ya por personas) y que entren en
  // el calendario
  const pendingDirs = [...new Set(shown.flatMap((f) => splitDirectors(f.director)).filter((d) => !followedDirs.has(d)))];
  const followAll = async () => {
    setFollowAllBusy(true);
    const r = await api('/tracked/by-names', { method: 'POST', body: { names: pendingDirs.join('\n'), role: 'director' } });
    setFollowAllBusy(false);
    if (r.error) { toast(`⚠️ ${t(r.error)}`, 'error'); return; }
    setFollowedDirs((prev) => new Set([...prev, ...pendingDirs]));
    toast(t('⭐ {n} directores/as añadidos a favoritos', { n: r.added }) + (r.notFound?.length ? t(' · {n} sin resolver', { n: r.notFound.length }) : ''), 'success');
  };

  const fijarMatch = async (tmdbId) => {
    const keyYear = view === 'palmares' ? editar.year : data?.year;
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

  return (
    <div>
      <PageHeader
        eyebrow={t('La caza')}
        title={t('Festivales y premios')}
        subtitle={t('Las secciones oficiales de los grandes festivales (los seis de la vía Óscar más San Sebastián), el palmarés y las nominadas de los premios de cada año, y los cánones de la crítica.')}
      />

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {[
          ['festival', 'Festivales'],
          // donde estrena quien empieza, y de donde sale el detector de
          // emergentes: van en su propia fila para no mezclarlas con la
          // competición principal, que es otra cosa
          ['debut', 'Secciones de debut'],
          ['premio', 'Premios'],
          ['canon', 'Cánones'],
        ].map(([g, label]) => {
          const del = (index?.festivals || []).filter((f) => f.group === g);
          if (!del.length) return null;
          return (
            <div key={g} className="flex gap-2 items-center flex-wrap">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(label)}:</span>
              {del.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    setFest(f.key);
                    if (f.onlyWinners) setView('palmares');
                  }}
                  className={fest === f.key ? 'btn-gold' : 'btn-ghost'}
                  title={t(f.award)}
                >
                  {t(f.name)}
                </button>
              ))}
              <span className="w-2" />
            </div>
          );
        })}
        {view === 'seleccion' && (
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
        {!soloPalmares && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setView('seleccion')} className={`${view === 'seleccion' ? 'btn-gold' : 'btn-ghost'} !py-1 text-xs`}>
              {t(info?.editionLabel) || (info?.awardNominees ? t('Nominadas por año') : t('Sección oficial por año'))}
            </button>
            <button onClick={() => setView('palmares')} className={`${view === 'palmares' ? 'btn-gold' : 'btn-ghost'} !py-1 text-xs`}>
              {t('🏆 Palmarés histórico')}
            </button>
          </div>
        )}
        {info && (
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
      {loading && <Spinner label={t('Leyendo la selección en Wikipedia y casándola con TMDB…')} />}

      {data && (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span className="text-sm text-zinc-400">
              <b className="text-gold-400">
                {t(data.name)} {data.year ?? ''}
              </b>{' '}
              · {t(data.section) || t('todas las ganadoras ({award})', { award: t(data.award) })} · {t('{n} películas', { n: films.length })}
              {data.unresolved > 0 && (
                <span className="text-zinc-500"> · {t('{n} sin casar con TMDB', { n: data.unresolved })}</span>
              )}
              {data.resolveErrors > 0 && (
                <span className="text-orange-300" title={t('TMDB cortó el grifo a mitad de comprobación; este resultado no se guarda en caché')}>
                  {' '}· {t('{n} sin comprobar por fallos de red — recarga en un rato', { n: data.resolveErrors })}
                </span>
              )}
            </span>
            <a href={data.source} target="_blank" rel="noreferrer" className="text-[11px] text-zinc-500 hover:text-gold-400 underline">
              {t('fuente: Wikipedia')}
            </a>
            <button className="btn-ghost !py-1 text-xs" onClick={() => load(fest, year, view, true)}>{t('↻ Recargar')}</button>
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

          <div className="flex items-center gap-3 flex-wrap mb-2">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              {[['', 'Todas'], ['missing', 'Me faltan'], ['owned', 'Las tengo']].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setOwn(v)}
                  className={`btn-ghost !py-1 text-xs ${own === v ? '!border-gold-400 text-gold-400' : ''}`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
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
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {shown.map((f, i) => (
                <div key={f.tmdb_id || `${f.title}-${i}`}>
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
                        <RadarrButton tmdbId={f.tmdb_id} small alreadyInRadarr={radarrIds.has(f.tmdb_id)} onAdded={addRadarrId} />
                      )}
                    </TmdbCard>
                  ) : (
                    <div className="poster flex items-center justify-center text-center p-2 text-[11px] text-zinc-400" title={t('Sin ficha en TMDB (todavía)')}>
                      {f.title}
                    </div>
                  )}
                  <div className="flex items-baseline gap-1.5">
                    <button
                      onClick={() => setEditar(f)}
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
                    {f.director && (
                      /* una estrella POR persona: una película con dos
                         directores tiene dos perfiles que seguir por separado */
                      <div className="flex flex-col items-start">
                        {splitDirectors(f.director).map((d) => (
                          /* la estrella sigue siendo el botón de seguir; el
                             NOMBRE lleva a su ficha, la tengas fichada o no */
                          <span key={d} className="mt-1 text-[11px] leading-tight flex items-baseline gap-1">
                            <button
                              onClick={() => followDirector(d)}
                              disabled={dirBusy === d || followedDirs.has(d)}
                              className="text-zinc-400 hover:text-gold-400 cursor-pointer disabled:cursor-default shrink-0"
                              title={followedDirs.has(d) ? t('Ya en favoritos') : t('Seguir a {name} como director/a', { name: d })}
                            >
                              {followedDirs.has(d) ? '⭐' : dirBusy === d ? '…' : '☆'}
                            </button>
                            <EnlacePersona nombre={d} className="text-zinc-400 text-left" />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
            `/festivals/match-candidates?q=${encodeURIComponent(term)}&year=${(view === 'palmares' ? editar.year : data?.year) || ''}`}
          subtitle={t('Busca en TMDB y elige la ficha correcta. La corrección se recuerda y manda sobre el emparejado automático.')}
          onPick={fijarMatch}
          onClear={editar.tmdb_id ? () => fijarMatch(null) : null}
          onClose={() => setEditar(null)}
        />
      )}
    </div>
  );
}
