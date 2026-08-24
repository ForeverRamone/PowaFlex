import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';
import { api, fmtBytes, fmtDate } from '../api.js';
import { Spinner, Progreso, useCargaProgresiva, Section, MovieCard, MovieModal, Empty, RadarrButton, useRadarrIds, JustWatchCheck, PageHeader, ProgressBar, ErrorBox} from '../components.jsx';
import { toast } from '../toast.js';
import { addBulkToRadarr } from '../radarr.js';
import { useChartTheme } from '../charts.js';
import { t } from '../i18n.js';

export default function Quality({ embedded = false }) {
  const pollRef = useRef(null);
  useEffect(() => () => clearInterval(pollRef.current), []);
  const ch = useChartTheme();
  const [selected, setSelected] = useState(null);
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [jw, setJw] = useState({ busy: false, done: 0, total: 0, checked: 0, upgradeable: 0, results: {} });
  const [jwFilter, setJwFilter] = useState('todas');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(null);
  const navigate = useNavigate();

  // the resolutions donut lives here (its natural home) and keeps the
  // click-to-filter the Dashboard copy used to have
  const openResolution = (name) => {
    // el hueco sin resolución llega como «?» desde qualityOverview; la guarda
    // decía «desconocida», que es la etiqueta de OTRA consulta (la del
    // Dashboard), así que pulsar ese sector llevaba a una biblioteca vacía
    // filtrada por «?»
    if (!name || name === '?') return navigate('/biblioteca');
    navigate(`/biblioteca?resolution=${encodeURIComponent(name)}`);
  };

  // Las cuatro salen a la vez y la página se pinta con el resumen, sin esperar
  // a las demás. Importa el orden de espera, no el de llegada: las dos de
  // Radarr salen a la red del usuario y en su servidor pueden tardar segundos,
  // y no pueden retener por delante lo que ya está calculado en local.
  const carga = useCargaProgresiva([
    { clave: 'resumen', etiqueta: t('Midiendo la calidad de tus archivos…'), carga: () => api('/quality/overview') },
    { clave: 'upgrades', etiqueta: t('Buscando las que pedirían una copia mejor…'), carga: () => api('/quality/upgrades?limit=60') },
    { clave: 'duplicados', etiqueta: t('Buscando duplicados en el disco…'), carga: () => api('/quality/duplicates') },
    {
      clave: 'radarr',
      etiqueta: t('Preguntando a Radarr qué le debe a tu colección…'),
      // sin Radarr configurado las dos fallan y sus secciones simplemente no se
      // pintan, igual que antes
      carga: () => Promise.all([api('/radarr/wanted'), api('/radarr/cutoff')]).then(([w, c]) => ({
        wanted: w.error ? { error: w.error } : w.items || [],
        cutoff: c.error ? { error: c.error } : c.items || [],
      })),
    },
  ], []);
  const ov = carga.datos.resumen ?? null;
  const upgrades = carga.datos.upgrades ? (Array.isArray(carga.datos.upgrades) ? carga.datos.upgrades : []) : null;
  const dups = carga.datos.duplicados ?? null;
  const wanted = carga.datos.radarr?.wanted ?? null;
  const cutoff = carga.datos.radarr?.cutoff ?? null;

  const searchAgain = async (m) => {
    setSearchBusy(m.tmdb_id);
    const r = await api('/radarr/search-again', { method: 'POST', body: { tmdbId: m.tmdb_id } });
    setSearchBusy(null);
    if (r.error) toast(`⚠️ ${t(r.error)}`, 'error');
    else toast(t('🔍 Radarr vuelve a buscar «{title}»', { title: m.title }));
  };
  const antiguedad = (added) => {
    if (!added) return null;
    const dias = Math.floor((Date.now() - Date.parse(added)) / 86400000);
    return dias >= 365 ? t('{n} a', { n: Math.floor(dias / 365) }) : dias >= 30 ? t('{n} m', { n: Math.floor(dias / 30) }) : t('{n} d', { n: dias });
  };
  // la fase de estreno explica POR QUÉ una pedida no aparece
  const hoy = new Date().toLocaleDateString('en-CA');
  const FasePill = ({ phases }) => {
    if (!phases) return null;
    if (phases.digital) {
      const ya = phases.digital <= hoy;
      return (
        <span className={`text-[11px] shrink-0 ${ya ? 'text-emerald-400' : 'text-sky-300'}`}
          title={ya ? t('Ya existe copia digital: debería poder conseguirse') : t('Aún no ha salido en digital')}>
          💿 {ya ? t('en digital') : t('digital {date}', { date: fmtDate(phases.digital) })}
        </span>
      );
    }
    if (phases.theatrical) {
      return (
        <span className="text-[11px] text-zinc-500 shrink-0" title={t('Estrenada en salas, sin fecha digital anunciada: normal que no aparezca todavía')}>
          🎬 {t('solo cines')}
        </span>
      );
    }
    return <span className="text-[11px] text-zinc-600 shrink-0" title={t('Sin fechas de estreno en TMDB')}>{t('sin fecha')}</span>;
  };

  // Ask JustWatch about every candidate at once, so the list can be filtered by
  // "there really is something better out there". Answers are cached 3 days
  // server-side, so re-running is cheap.
  const checkAllJw = async () => {
    const ids = (upgrades || []).map((m) => m.tmdb_id).filter(Boolean);
    if (!ids.length) return;
    setJw((j) => ({ ...j, busy: true, done: 0, total: ids.length }));
    // el clearInterval va en un finally: si la petición larga fallaba o te ibas
    // de la página, el temporizador se quedaba vivo
    const poll = setInterval(() => {
      api('/build-progress').then((p) => {
        if (p?.active && p.job === 'justwatch') setJw((j) => ({ ...j, done: p.done, total: p.total }));
      });
    }, 900);
    pollRef.current = poll;
    let r;
    try {
      r = await api('/justwatch/batch', { method: 'POST', body: { tmdbIds: ids } });
    } finally {
      clearInterval(poll);
    }
    if (r.error) {
      setJw((j) => ({ ...j, busy: false }));
      toast(`⚠️ ${t(r.error)}`, 'error');
      return;
    }
    setJw({ busy: false, done: ids.length, total: ids.length, checked: r.checked, upgradeable: r.upgradeable, results: r.results || {} });
    setJwFilter(r.upgradeable > 0 ? 'mejor' : 'todas');
    toast(t('{a} de {b} tienen mejor versión disponible', { a: r.upgradeable, b: r.checked }));
  };

  const upgradeList = upgrades || [];
  const upgradeableCount = upgradeList.filter((m) => jw.results[m.tmdb_id]?.upgradeable).length;
  const shownUpgrades = upgradeList.filter((m) => {
    if (jwFilter === 'mejor') return jw.results[m.tmdb_id]?.upgradeable;
    if (jwFilter === 'sin') return jw.results[m.tmdb_id] && !jw.results[m.tmdb_id].upgradeable;
    return true;
  });
  const pendingUpgradeIds = shownUpgrades.map((m) => m.tmdb_id).filter((id) => id && !radarrIds.has(id));

  // these films are already in the library: sending them to Radarr means
  // "monitor for a better version"
  const requestAllUpgrades = async () => {
    if (!pendingUpgradeIds.length) return;
    setBulkBusy(true);
    // «pedidas», no «añadidas»: aquí ya las tienes y lo que se pide es mejora
    const { error, summary } = await addBulkToRadarr(pendingUpgradeIds, { onAdded: addRadarrId, verb: 'pedidas' });
    setBulkBusy(false);
    if (summary) toast(summary, error ? 'error' : undefined);
  };

  if (ov?.error) return <ErrorBox error={ov.error} />;
  if (!ov) return <Progreso {...carga} />;

  const sizeByDecade = ov.sizeByDecade.map((d) => ({ ...d, gb: +(d.size / 1073741824).toFixed(1) }));

  return (
    <div>
      {!embedded && <PageHeader eyebrow={t('Colección')} title={t('Calidad y disco')} />}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {[
          [t('Resolución'), ov.byResolution, 0, (p) => t('{n} pelis · {size}', { n: p.payload.n, size: fmtBytes(p.payload.size) }), true],
          [t('Códecs de vídeo'), ov.byCodec, 2, (p) => t('{n} películas', { n: p.payload.n }), false],
          ['HDR / Dolby Vision', ov.hdr, 4, (p) => t('{n} películas', { n: p.payload.n }), false],
        ].map(([title, data, shift, fmt, clickable]) => (
          <Section
            key={title}
            title={title}
            className="min-w-0"
            action={clickable && <span className="text-[11px] text-zinc-500">{t('clic para filtrar')}</span>}
          >
            <div className="card p-4 h-80 min-w-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="n"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={68}
                    cy="45%"
                    /* con recharts 3.9 la animación de entrada del donut deja
                       el grupo vacío: se veía la leyenda y ningún sector. Las
                       barras y las líneas sí animan bien, esto es solo la tarta */
                    isAnimationActive={false}
                    onClick={clickable ? (d) => openResolution(d?.name || d?.payload?.name) : undefined}
                    className={clickable ? 'cursor-pointer' : undefined}
                  >
                    {data.map((_, i) => <Cell key={i} fill={ch.ramp[(i + shift) % ch.ramp.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={ch.tooltip}
                    labelStyle={ch.tooltipLabel}
                    itemStyle={ch.tooltipItem}
                    formatter={(v, n, p) => [fmt(p), p.payload.name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    onClick={clickable ? (e) => openResolution(e?.value) : undefined}
                    formatter={(v) =>
                      clickable
                        ? <span className="text-xs text-zinc-300 cursor-pointer hover:text-gold-400">{v}</span>
                        : <span className="text-xs text-zinc-300">{v}</span>
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Section>
        ))}
      </div>

      <Section title={t('Espacio en disco por década')}>
        <div className="card p-4 h-64 mb-8 min-w-0">
          <ResponsiveContainer>
            <BarChart data={sizeByDecade}>
              <XAxis dataKey="decade" stroke={ch.axis} fontSize={12} />
              <YAxis stroke={ch.axis} fontSize={12} unit=" GB" width={64} />
              <Tooltip
                contentStyle={ch.tooltip}
                labelStyle={ch.tooltipLabel}
                itemStyle={ch.tooltipItem}
                cursor={{ fill: ch.cursor }}
                formatter={(v) => [`${v} GB`]}
              />
              <Bar dataKey="gb" name="GB" fill={ch.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title={t('Candidatas a upgrade (bien valoradas, por debajo de 1080p)')}>
        {!upgrades ? (
          <Spinner label={t('Buscando las que pedirían una copia mejor…')} />
        ) : upgrades.length === 0 ? (
          <Empty>{t('Todo está al menos en 1080p.')}</Empty>
        ) : (
          <>
            <div className="card p-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
              <button className="btn-ghost !py-1.5 text-xs" onClick={checkAllJw} disabled={jw.busy}>
                {jw.busy ? t('Consultando… {done}/{total}', { done: jw.done, total: jw.total }) : t('¿Cuáles tienen mejor versión?')}
              </button>

              {jw.checked > 0 && (
                <>
                  <span className="text-[11px] text-zinc-500">
                    {t('{a} de {b} con mejor versión en el mercado', { a: jw.upgradeable, b: jw.checked })}
                  </span>
                  <span className="mx-1 text-zinc-600">·</span>
                  {[
                    ['todas', t('Todas ({n})', { n: upgrades.length })],
                    ['mejor', t('Con mejor versión ({n})', { n: upgradeableCount })],
                    ['sin', t('Sin mejor versión ({n})', { n: jw.checked - upgradeableCount })],
                  ].map(([k, label]) => (
                    <button key={k} onClick={() => setJwFilter(k)} className={`chip ${jwFilter === k ? 'chip-on' : ''}`}>
                      {label}
                    </button>
                  ))}
                </>
              )}

              {/* el `ml-auto` empuja a la derecha en la barra de una sola línea
                  del escritorio; en móvil la barra se parte y ese empujón deja
                  el botón sangrado a media línea, así que ahí va a lo ancho */}
              {shownUpgrades.length > 0 && (
                <button className="btn-gold !py-1.5 text-xs w-full sm:w-auto sm:ml-auto" onClick={requestAllUpgrades} disabled={bulkBusy}>
                  {bulkBusy
                    ? t('Pidiendo…')
                    : t('Pedir {n} a Radarr', { n: pendingUpgradeIds.length }) + (jwFilter === 'mejor' ? '' : t(' (todas las visibles)'))}
                </button>
              )}
            </div>
            {jw.busy && <div className="mb-4 max-w-md"><ProgressBar pct={jw.total ? Math.round((jw.done / jw.total) * 100) : 0} /></div>}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 mb-8">
              {shownUpgrades.map((m) => (
                <div key={m.rating_key} className="card p-2 flex flex-col">
                  <MovieCard movie={m} onClick={() => setSelected(m.rating_key)} />
                  <div className="text-[11px] text-orange-400 mt-1">{(m.resolution || 'SD').toUpperCase()} · {fmtBytes(m.size_bytes)}</div>
                  {m.tmdb_id && (
                    <div className="mt-auto pt-1.5 flex items-center justify-between gap-1 flex-wrap">
                      <JustWatchCheck tmdbId={m.tmdb_id} result={jw.results[m.tmdb_id]} />
                      <RadarrButton tmdbId={m.tmdb_id} small alreadyInRadarr={radarrIds.has(m.tmdb_id)} onAdded={addRadarrId} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* la deuda de Radarr: qué pediste que nunca llegó, y qué llegó peor que tu perfil */}
      {Array.isArray(wanted) && wanted.length > 0 && (
        <Section title={t('Pedidas a Radarr que siguen sin aparecer ({n})', { n: wanted.length })}>
          <p className="text-xs text-zinc-500 mb-2 max-w-3xl">
            {t('Monitorizadas sin archivo, las más antiguas primero: piden una decisión —volver a buscar, esperar al digital o quitarlas de Radarr.')}
          </p>
          <div className="card divide-y divide-ink-800 max-h-96 overflow-y-auto">
            {wanted.map((m) => (
              <div key={m.tmdb_id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="text-zinc-200 truncate flex-1">
                  {m.title} <span className="text-zinc-500">({m.year ?? t('¿?')})</span>
                </span>
                <FasePill phases={m.phases} />
                {antiguedad(m.added) && (
                  <span className="text-[11px] text-zinc-500 shrink-0 tabular" title={t('Tiempo en Radarr sin conseguirse')}>
                    {t('hace {t}', { t: antiguedad(m.added) })}
                  </span>
                )}
                <button
                  className="btn-ghost !py-0.5 text-xs shrink-0"
                  disabled={searchBusy === m.tmdb_id}
                  onClick={() => searchAgain(m)}
                >
                  {searchBusy === m.tmdb_id ? '…' : t('🔍 Buscar de nuevo')}
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}
      {Array.isArray(cutoff) && cutoff.length > 0 && (
        <Section title={t('Por debajo del corte de tu perfil de Radarr ({n})', { n: cutoff.length })}>
          <p className="text-xs text-zinc-500 mb-2 max-w-3xl">
            {t('Tienen archivo, pero por debajo de tu perfil. Radarr las mejorará si aparece algo mejor, y puedes forzar la búsqueda ya.')}
          </p>
          <div className="card divide-y divide-ink-800 max-h-96 overflow-y-auto">
            {cutoff.map((m) => (
              <div key={m.tmdb_id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="text-zinc-200 truncate flex-1">
                  {m.title} <span className="text-zinc-500">({m.year ?? t('¿?')})</span>
                </span>
                {m.quality && <span className="badge-quiet shrink-0">{m.quality}</span>}
                <button
                  className="btn-ghost !py-0.5 text-xs shrink-0"
                  disabled={searchBusy === m.tmdb_id}
                  onClick={() => searchAgain(m)}
                >
                  {searchBusy === m.tmdb_id ? '…' : t('🔍 Buscar mejor')}
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {dups && (dups.multiVersion.length > 0 || dups.sameTmdb.length > 0) && (
        <Section title={t('Duplicados y versiones múltiples')}>
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">{t('Con varias versiones/archivos ({n})', { n: dups.multiVersion.length })}</h3>
              <div className="max-h-80 overflow-y-auto text-sm">
                {dups.multiVersion.map((m) => (
                  <div key={m.rating_key} className="flex justify-between py-1 border-b border-ink-800 gap-2">
                    <button className="text-zinc-200 hover:text-gold-400 text-left truncate" onClick={() => setSelected(m.rating_key)}>
                      {m.title} ({m.year})
                    </button>
                    <span className="text-zinc-500 shrink-0">{t('{n} versiones · {size}', { n: m.media_count, size: fmtBytes(m.size_bytes) })}</span>
                  </div>
                ))}
                {dups.multiVersion.length === 0 && <Empty>{t('Ninguna.')}</Empty>}
              </div>
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">{t('Mismo TMDB ID repetido ({n})', { n: dups.sameTmdb.length })}</h3>
              <div className="max-h-80 overflow-y-auto text-sm">
                {dups.sameTmdb.map((d) => (
                  <div key={d.tmdb_id} className="py-1 border-b border-ink-800 text-zinc-300">
                    {d.titles} <span className="text-zinc-500">{t('({n} entradas)', { n: d.n })}</span>
                  </div>
                ))}
                {dups.sameTmdb.length === 0 && <Empty>{t('Ninguno.')}</Empty>}
              </div>
            </div>
          </div>
        </Section>
      )}

      <Section title={t('Los 30 archivos más pesados')}>
        {/* Una tabla de cinco columnas NO cabe en 375 px: con `w-full` a secas
            se encoge hasta que el año se pega a la resolución («20041080») y el
            códec al tamaño. El ancho mínimo la deja desbordar DENTRO de su
            propio scroll horizontal, que es justo para lo que está el
            overflow-x-auto del contenedor. */}
        <div className="card p-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-zinc-500 text-left border-b border-ink-700">
                <th className="py-2 pr-3">{t('Título')}</th><th className="pr-3">{t('Año')}</th><th className="pr-3">{t('Resolución')}</th><th className="pr-3">{t('Códec')}</th><th className="text-right">{t('Tamaño')}</th>
              </tr>
            </thead>
            <tbody>
              {ov.largest.map((m) => (
                <tr key={m.rating_key} className="border-b border-ink-800">
                  <td className="py-1.5 pr-3">
                    <button className="text-zinc-200 hover:text-gold-400 text-left" onClick={() => setSelected(m.rating_key)}>{m.title}</button>
                  </td>
                  <td className="text-zinc-500 pr-3 whitespace-nowrap">{m.year}</td>
                  <td className="text-zinc-400 pr-3 whitespace-nowrap">{m.resolution}</td>
                  <td className="text-zinc-400 pr-3 whitespace-nowrap">{m.video_codec}</td>
                  <td className="text-right text-gold-400 whitespace-nowrap">{fmtBytes(m.size_bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {selected && <MovieModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
