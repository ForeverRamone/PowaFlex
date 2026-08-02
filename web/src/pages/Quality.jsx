import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';
import { api, fmtBytes } from '../api.js';
import { Spinner, Section, MovieCard, MovieModal, Empty, RadarrButton, useRadarrIds, JustWatchCheck, PageHeader, ProgressBar } from '../components.jsx';
import { toast } from '../toast.js';
import { useChartTheme } from '../charts.js';

export default function Quality() {
  const ch = useChartTheme();
  const [ov, setOv] = useState(null);
  const [upgrades, setUpgrades] = useState(null);
  const [dups, setDups] = useState(null);
  const [selected, setSelected] = useState(null);
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [jw, setJw] = useState({ busy: false, done: 0, total: 0, checked: 0, upgradeable: 0, results: {} });
  const [jwFilter, setJwFilter] = useState('todas');
  const [bulkBusy, setBulkBusy] = useState(false);
  const navigate = useNavigate();

  // the resolutions donut lives here (its natural home) and keeps the
  // click-to-filter the Dashboard copy used to have
  const openResolution = (name) => {
    if (!name || name === 'desconocida') return navigate('/biblioteca');
    navigate(`/biblioteca?resolution=${encodeURIComponent(name)}`);
  };

  useEffect(() => {
    api('/quality/overview').then(setOv);
    api('/quality/upgrades?limit=60').then((r) => setUpgrades(Array.isArray(r) ? r : []));
    api('/quality/duplicates').then(setDups);
  }, []);

  // Ask JustWatch about every candidate at once, so the list can be filtered by
  // "there really is something better out there". Answers are cached 3 days
  // server-side, so re-running is cheap.
  const checkAllJw = async () => {
    const ids = (upgrades || []).map((m) => m.tmdb_id).filter(Boolean);
    if (!ids.length) return;
    setJw((j) => ({ ...j, busy: true, done: 0, total: ids.length }));
    const poll = setInterval(() => {
      api('/build-progress').then((p) => {
        if (p?.active && p.job === 'justwatch') setJw((j) => ({ ...j, done: p.done, total: p.total }));
      });
    }, 900);
    const r = await api('/justwatch/batch', { method: 'POST', body: { tmdbIds: ids } });
    clearInterval(poll);
    if (r.error) {
      setJw((j) => ({ ...j, busy: false }));
      toast(`⚠️ ${r.error}`, 'error');
      return;
    }
    setJw({ busy: false, done: ids.length, total: ids.length, checked: r.checked, upgradeable: r.upgradeable, results: r.results || {} });
    setJwFilter(r.upgradeable > 0 ? 'mejor' : 'todas');
    toast(`${r.upgradeable} de ${r.checked} tienen mejor versión disponible`);
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
    const res = await api('/radarr/add-bulk', { method: 'POST', body: { tmdbIds: pendingUpgradeIds.slice(0, 300) } });
    setBulkBusy(false);
    if (res.error) return toast(`⚠️ ${res.error}`, 'error');
    for (const r of res.results || []) if (r.ok || r.alreadyExists) addRadarrId(r.tmdbId);
    toast(
      `✓ ${res.added} pedidas a Radarr${res.alreadyInRadarr ? ` · ${res.alreadyInRadarr} ya estaban` : ''}${res.failed ? ` · ⚠️ ${res.failed} fallaron` : ''}`
    );
  };

  if (!ov) return <Spinner />;

  const sizeByDecade = ov.sizeByDecade.map((d) => ({ ...d, gb: +(d.size / 1073741824).toFixed(1) }));

  return (
    <div>
      <PageHeader eyebrow="Colección" title="Calidad y disco" />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {[
          ['Resolución', ov.byResolution, 0, (p) => `${p.payload.n} pelis · ${fmtBytes(p.payload.size)}`, true],
          ['Códecs de vídeo', ov.byCodec, 2, (p) => `${p.payload.n} películas`, false],
          ['HDR / Dolby Vision', ov.hdr, 4, (p) => `${p.payload.n} películas`, false],
        ].map(([title, data, shift, fmt, clickable]) => (
          <Section
            key={title}
            title={title}
            action={clickable && <span className="text-[11px] text-zinc-500">clic para filtrar</span>}
          >
            <div className="card p-4 h-80">
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

      <Section title="Espacio en disco por década">
        <div className="card p-4 h-64 mb-8">
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

      <Section title="Candidatas a upgrade (bien valoradas, por debajo de 1080p)">
        {!upgrades ? (
          <Spinner />
        ) : upgrades.length === 0 ? (
          <Empty>Todo está al menos en 1080p.</Empty>
        ) : (
          <>
            <div className="card p-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
              <button className="btn-ghost !py-1.5 text-xs" onClick={checkAllJw} disabled={jw.busy}>
                {jw.busy ? `Consultando… ${jw.done}/${jw.total}` : '¿Cuáles tienen mejor versión?'}
              </button>

              {jw.checked > 0 && (
                <>
                  <span className="text-[11px] text-zinc-500">
                    {jw.upgradeable} de {jw.checked} con mejor versión en el mercado
                  </span>
                  <span className="mx-1 text-ink-600">·</span>
                  {[
                    ['todas', `Todas (${upgrades.length})`],
                    ['mejor', `Con mejor versión (${upgradeableCount})`],
                    ['sin', `Sin mejor versión (${jw.checked - upgradeableCount})`],
                  ].map(([k, label]) => (
                    <button key={k} onClick={() => setJwFilter(k)} className={`chip ${jwFilter === k ? 'chip-on' : ''}`}>
                      {label}
                    </button>
                  ))}
                </>
              )}

              {shownUpgrades.length > 0 && (
                <button className="btn-gold !py-1.5 text-xs ml-auto" onClick={requestAllUpgrades} disabled={bulkBusy}>
                  {bulkBusy
                    ? 'Pidiendo…'
                    : `Pedir ${pendingUpgradeIds.length} a Radarr${jwFilter === 'mejor' ? '' : ' (todas las visibles)'}`}
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
                    <div className="mt-auto pt-1.5 flex items-center justify-between gap-1">
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

      {dups && (dups.multiVersion.length > 0 || dups.sameTmdb.length > 0) && (
        <Section title="Duplicados y versiones múltiples">
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Con varias versiones/archivos ({dups.multiVersion.length})</h3>
              <div className="max-h-80 overflow-y-auto text-sm">
                {dups.multiVersion.map((m) => (
                  <div key={m.rating_key} className="flex justify-between py-1 border-b border-ink-800 gap-2">
                    <button className="text-zinc-200 hover:text-gold-400 text-left truncate" onClick={() => setSelected(m.rating_key)}>
                      {m.title} ({m.year})
                    </button>
                    <span className="text-zinc-500 shrink-0">{m.media_count} versiones · {fmtBytes(m.size_bytes)}</span>
                  </div>
                ))}
                {dups.multiVersion.length === 0 && <Empty>Ninguna.</Empty>}
              </div>
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Mismo TMDB ID repetido ({dups.sameTmdb.length})</h3>
              <div className="max-h-80 overflow-y-auto text-sm">
                {dups.sameTmdb.map((d) => (
                  <div key={d.tmdb_id} className="py-1 border-b border-ink-800 text-zinc-300">
                    {d.titles} <span className="text-zinc-500">({d.n} entradas)</span>
                  </div>
                ))}
                {dups.sameTmdb.length === 0 && <Empty>Ninguno.</Empty>}
              </div>
            </div>
          </div>
        </Section>
      )}

      <Section title="Los 30 archivos más pesados">
        <div className="card p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-left border-b border-ink-700">
                <th className="py-2">Título</th><th>Año</th><th>Resolución</th><th>Códec</th><th className="text-right">Tamaño</th>
              </tr>
            </thead>
            <tbody>
              {ov.largest.map((m) => (
                <tr key={m.rating_key} className="border-b border-ink-800">
                  <td className="py-1.5">
                    <button className="text-zinc-200 hover:text-gold-400" onClick={() => setSelected(m.rating_key)}>{m.title}</button>
                  </td>
                  <td className="text-zinc-500">{m.year}</td>
                  <td className="text-zinc-400">{m.resolution}</td>
                  <td className="text-zinc-400">{m.video_codec}</td>
                  <td className="text-right text-gold-400">{fmtBytes(m.size_bytes)}</td>
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
