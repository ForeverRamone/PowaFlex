import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Progreso, useCargaProgresiva, Section, MovieCard, Empty, PageHeader, ErrorBox } from '../components.jsx';
import { MovieModal } from '../components.jsx';
import { useChartTheme } from '../charts.js';
import { t, locale } from '../i18n.js';

// recharts pesa 415 KB y hasta ahora entraba por importación directa: el
// navegador tenía que bajarlo y ejecutarlo ANTES de pintar los contadores y las
// parrillas, que no lo necesitan para nada. En diferido, la página sale primero
// y las gráficas entran cuando llegan.
const WatchCharts = lazy(() => import('./charts/WatchCharts.jsx'));

function InsightGrid({ title, hint, items, caption, onSelect }) {
  if (!items?.length) return null;
  return (
    <Section title={title}>
      {hint && <p className="text-xs text-zinc-500 -mt-2 mb-3 max-w-3xl">{hint}</p>}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-3">
        {items.map((m) => (
          <div key={m.rating_key}>
            <MovieCard movie={m} onClick={() => onSelect(m.rating_key)} />
            <div className="text-[11px] text-zinc-500">{caption(m)}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function WatchStats() {
  const ch = useChartTheme();
  const [selected, setSelected] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState('');

  // Las tres salen a la vez y ninguna espera a otra: son las tres fuentes que
  // se cruzan en esta página (lo reproducido, tus notas y las de la crítica) y
  // no comparten ni un dato. Tus notas vs. la comunidad venía de la antigua
  // página Letterboxd; aquí es donde se compara lo visto, así que es su sitio.
  const carga = useCargaProgresiva([
    { clave: 'watch', etiqueta: t('Leyendo tu historial de visionado…'), carga: () => api('/stats/watch') },
    { clave: 'notas', etiqueta: t('Recogiendo tus notas de Letterboxd…'), carga: () => api('/letterboxd/summary') },
    { clave: 'critica', etiqueta: t('Cruzando con las notas de la crítica…'), carga: () => api('/mdblist/insights') },
  ], []);

  // El emparejado por TMDB cambia los contadores, así que hay que volver a
  // pedirlos; se pide SOLO esa petición porque relanzar las tres devolvería a
  // la pantalla de carga una página que ya está pintada entera.
  const [watchFresco, setWatchFresco] = useState(null);
  const load = () => api('/stats/watch').then(setWatchFresco);
  const data = watchFresco ?? carga.datos.watch ?? null;
  // sin clave de MDBList esto responde con error, y entonces sus cinco
  // secciones sencillamente no se pintan (como antes)
  const ins = carga.datos.critica && !carga.datos.critica.error ? carga.datos.critica : null;
  const lbCompare = Array.isArray(carga.datos.notas?.ratingCompare) ? carga.datos.notas.ratingCompare : null;

  const resolveUnmatched = async () => {
    setResolving(true);
    setResolveMsg(t('Buscando en TMDB las vistas sin emparejar…'));
    const r = await api('/letterboxd/resolve', { method: 'POST' });
    setResolving(false);
    if (r.error) {
      setResolveMsg(`✗ ${t(r.error)}`);
    } else {
      const bits = [t('✓ {n} emparejadas', { n: r.matched })];
      if (r.library?.resolved) bits.push(t('{n} películas de Plex ganaron ficha TMDB', { n: r.library.resolved }));
      if (r.unmatched?.sinTmdb) bits.push(t('{n} sin ficha en TMDB', { n: r.unmatched.sinTmdb }));
      if (r.unmatched?.noEnBiblioteca) bits.push(t('{n} vistas fuera de tu colección', { n: r.unmatched.noEnBiblioteca }));
      if (r.englishPending)
        bits.push(t('completando {n} títulos en inglés en segundo plano — reintenta en unos minutos', { n: r.englishPending.toLocaleString(locale()) }));
      setResolveMsg(bits.join(' · '));
    }
    load();
  };

  if (data?.error) return <ErrorBox error={data.error} />;
  // se pinta en cuanto está el historial: esperar también a las otras dos
  // retrasaría a propósito lo que ya se puede leer
  if (!data) return <Progreso {...carga} />;

  const s = data.summary;

  return (
    <div>
      <PageHeader eyebrow={t('Colección')} title={t('Visionado')} />

      {/* watched counter (#1) */}
      {s && (
        // Los cuatro contadores llevan la misma tipografía que los del
        // Dashboard (.stat-*, index.css): estaban escritos a mano con text-2xl
        // font-bold y quedaban de otra familia que los de la página de entrada,
        // siendo la misma cifra de la misma colección. El color de la cifra sí
        // significa algo y por eso se mantiene encima de la clase.
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="card p-4">
            <div className="stat-cifra text-gold-400">{s.total.toLocaleString(locale())}</div>
            <div className="stat-rotulo">{t('Marcadas como vistas')}</div>
            <div className="stat-nota">{s.library ? t('{pct}% de tu biblioteca', { pct: Math.round((s.total / s.library) * 100) }) : t('sin biblioteca sincronizada')}</div>
          </div>
          <div className="card p-4">
            <div className="stat-cifra">{s.plex.toLocaleString(locale())}</div>
            <div className="stat-rotulo">{t('Vistas en Plex')}</div>
            <div className="stat-nota">{t('con reproducción registrada')}</div>
          </div>
          <div className="card p-4">
            <div className="stat-cifra text-orange-300">{s.lbInLibrary.toLocaleString(locale())}</div>
            <div className="stat-rotulo">{t('Solo por Letterboxd')}</div>
            <div className="stat-nota">{t('en tu biblioteca, sin verlas en Plex')}</div>
          </div>
          <div className="card p-4">
            <div className="stat-cifra">{s.lbTotal.toLocaleString(locale())}</div>
            <div className="stat-rotulo">{t('Total en Letterboxd')}</div>
            <div className="stat-nota">
              {s.lbUnmatched > 0
                ? t('{n} sin emparejar con tu Plex', { n: s.lbUnmatched.toLocaleString(locale()) })
                : t('todas emparejadas')}
            </div>
          </div>
        </div>
      )}

      {s && s.lbUnmatched > 0 && (
        <div className="card p-3 mb-8 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-zinc-400">
            {t('Tienes ')}<b className="text-orange-300">{s.lbUnmatched.toLocaleString(locale())}</b>{t(' películas vistas en Letterboxd que no cuadran con tu biblioteca (a menudo por el idioma del título). Búscalas en TMDB para emparejarlas:')}
          </span>
          <button className="btn-gold !py-1 shrink-0" onClick={resolveUnmatched} disabled={resolving}>
            {resolving ? t('Emparejando…') : t('↻ Reintentar emparejado por TMDB')}
          </button>
          {resolveMsg && <span className="text-xs text-zinc-400">{resolveMsg}</span>}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* el hueco reserva el alto de las dos gráficas para que el resto de la
            página no dé un salto cuando entren */}
        <Suspense fallback={<><div className="card h-72" /><div className="card h-72" /></>}>
          <WatchCharts ch={ch} watchedByDecade={data.watchedByDecade} watchedByGenre={data.watchedByGenre} />
        </Suspense>
      </div>

      <Section title={t('Directores/as con obra pendiente en tu biblioteca')}>
        {data.directorsPending.length === 0 ? (
          <Empty>{t('Nada pendiente. 🏆')}</Empty>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {data.directorsPending.map((d) => (
              <Link key={d.id} to={`/biblioteca?personId=${d.id}&personRole=director&watched=no&personName=${encodeURIComponent(d.name)}`} className="card p-3 hover:border-gold-400 transition-colors">
                <div className="text-sm font-medium text-zinc-200">{d.name}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {t('{w} vistas de {total}', { w: d.watched, total: d.total })} · <span className="text-gold-400">{t('{n} pendientes', { n: d.total - d.watched })}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('Directores/as que más has visto')}>
        {!data.directorsMostWatched?.length ? (
          <Empty>{t('Aún no hay visionados registrados.')}</Empty>
        ) : (
          <>
            <p className="text-xs text-zinc-500 -mt-2 mb-3 max-w-3xl">
              {t('Por número de películas suyas que has visto, contando lo reproducido en Plex y lo que tienes marcado en Letterboxd. Solo entran las que están emparejadas con tu biblioteca: de una entrada de Letterboxd suelta no se sabe quién la dirigió.')}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {data.directorsMostWatched.map((d, i) => (
                <Link
                  key={d.id}
                  to={`/biblioteca?personId=${d.id}&personRole=director&watched=yes&personName=${encodeURIComponent(d.name)}`}
                  className="card p-3 flex items-baseline gap-2 hover:border-gold-400 transition-colors"
                >
                  <span className="text-[11px] text-zinc-600 tabular w-5 shrink-0">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-zinc-200 block truncate">{d.name}</span>
                    <span className="text-xs text-zinc-500">
                      <b className="text-gold-400 tabular">{d.watched}</b> {t('vistas de {total} suyas que tienes', { total: d.total })}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* lo que falta por llegar se anuncia donde va a aparecer: aquí abajo
          entran de golpe cinco secciones de carteles y la tabla de notas, y sin
          este aviso la página parecía terminada y luego pegaba un salto */}
      {!carga.terminado && (
        <div className="card p-3 mb-8 max-w-md"><Progreso {...carga} /></div>
      )}

      {/* «Consenso crítico sin ver» y «Mejor valoradas que aún no has visto»
          eran la MISMA consulta (sin ver + nota combinada, ordenadas por nota):
          una sola sección, con la de MDBList cuando hay notas y la de la
          biblioteca como respaldo. */}
      <InsightGrid
        title={t('🏛️ Lo mejor valorado que tienes sin ver')}
        hint={t('Películas de tu Plex que ni has reproducido ni tienes marcadas en Letterboxd, ordenadas por la nota combinada de MDBList.')}
        items={ins?.consensusUnwatched?.length ? ins.consensusUnwatched : data.unwatchedTopRated}
        caption={(m) => {
          const score = m.score ?? m.mdb_score;
          return [score != null ? `Σ ${score}` : null, m.rt_critic != null ? `🍅 ${m.rt_critic}%` : null]
            .filter(Boolean)
            .join(' · ');
        }}
        onSelect={setSelected}
      />

      {ins && (
        <>
          <InsightGrid
            title={t('🏅 «Must-see» de Metacritic que tienes sin ver (metascore ≥ 81)')}
            hint={t('El listón de consenso crítico más exigente, avalado por volumen de votos en IMDb. Todo sale de las notas de MDBList ya descargadas.')}
            items={ins.mustSee}
            caption={(m) => `MC ${m.metacritic}${m.imdb != null ? ` · IMDb ${Number(m.imdb).toFixed(1)}` : ''}`}
            onSelect={setSelected}
          />
          <InsightGrid
            title={t('💎 Joyas tuyas que la crítica no entendió (tu nota LB ≥ 8, RT ≤ 55%)')}
            items={ins.hiddenGems}
            caption={(m) => t('Tú: {r} · 🍅 {rt}%', { r: Number(m.my_rating).toFixed(1), rt: m.rt_critic })}
            onSelect={setSelected}
          />
          <InsightGrid
            title={t('🎈 El mundo las ama, tú no (tu nota LB ≤ 5, consenso ≥ 75)')}
            items={ins.overrated}
            caption={(m) => t('Tú: {r} · Σ {s}', { r: Number(m.my_rating).toFixed(1), s: m.score })}
            onSelect={setSelected}
          />
          <InsightGrid
            title={t('↔️ Donde más discrepas de la comunidad de Letterboxd')}
            items={ins.letterboxdDivergence}
            caption={(m) => t('Tú: {r}/10 · comunidad {c}/10', { r: Number(m.my_rating).toFixed(1), c: Number(m.letterboxd).toFixed(1) })}
            onSelect={setSelected}
          />
        </>
      )}

      {lbCompare?.length > 0 && (
        <Section title={t('Tus notas de Letterboxd vs. la comunidad')}>
          {/* mismo caso que la tabla de archivos pesados del Taller: cinco
              columnas no caben en 375 px y sin ancho mínimo se aplastan unas
              contra otras en vez de dejar desplazar */}
          <div className="card p-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-zinc-500 text-left border-b border-ink-700">
                  <th className="py-2 pr-3">{t('Título')}</th><th className="pr-3">{t('Año')}</th>
                  <th className="text-right pr-3">{t('Tu nota /10')}</th>
                  <th className="text-right pr-3">{t('Comunidad LB /10')}</th>
                  <th className="text-right">Σ MDBList</th>
                </tr>
              </thead>
              <tbody>
                {lbCompare.slice(0, 200).map((m) => (
                  <tr key={m.rating_key} className="border-b border-ink-800">
                    {/* el relleno vertical lo pone el botón, no la celda: así
                        el título ocupa la fila entera y en el móvil llega a los
                        40 px de alto sin que en el escritorio la tabla de 200
                        filas se estire */}
                    <td className="pr-3 text-zinc-200">
                      <button className="hover:text-gold-400 text-left block w-full py-1.5 max-sm:py-2.5 cursor-pointer" onClick={() => setSelected(m.rating_key)}>{m.title}</button>
                    </td>
                    <td className="text-zinc-500 pr-3 whitespace-nowrap">{m.year}</td>
                    <td className="text-right text-gold-400 pr-3 whitespace-nowrap">{m.lb?.toFixed(1)}</td>
                    <td className="text-right text-orange-300 pr-3 whitespace-nowrap">{m.community != null ? m.community.toFixed(1) : '—'}</td>
                    <td className="text-right text-zinc-400 whitespace-nowrap">{m.mdb_score ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title={t('Vistas recientemente')}>
        {data.recentlyViewed.length === 0 ? (
          <Empty>{t('Plex no registra visionados aún.')}</Empty>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-3">
            {data.recentlyViewed.map((m) => (
              <MovieCard key={m.rating_key} movie={m} onClick={() => setSelected(m.rating_key)} />
            ))}
          </div>
        )}
      </Section>

      {selected && <MovieModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
