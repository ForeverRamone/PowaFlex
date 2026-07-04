import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { api, fmtBytes } from '../api.js';
import { Spinner, Section, MovieCard, MovieModal, Empty, RadarrButton } from '../components.jsx';

const COLORS = ['#e8b53a', '#38bdf8', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#f87171', '#94a3b8'];
const tooltipStyle = { backgroundColor: '#1a2030', border: '1px solid #35405c', borderRadius: 8, color: '#e2e8f0' };

export default function Quality() {
  const [ov, setOv] = useState(null);
  const [upgrades, setUpgrades] = useState(null);
  const [dups, setDups] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api('/quality/overview').then(setOv);
    api('/quality/upgrades?limit=60').then((r) => setUpgrades(Array.isArray(r) ? r : []));
    api('/quality/duplicates').then(setDups);
  }, []);

  if (!ov) return <Spinner />;

  const sizeByDecade = ov.sizeByDecade.map((d) => ({ ...d, gb: +(d.size / 1073741824).toFixed(1) }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Calidad y disco</h1>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <Section title="Resolución (nº y peso)">
          <div className="card p-4 h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={ov.byResolution} dataKey="n" nameKey="name" outerRadius={80} label={(e) => `${e.name}: ${e.n}`} fontSize={11}>
                  {ov.byResolution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n, p) => [`${v} pelis · ${fmtBytes(p.payload.size)}`, p.payload.name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Códecs de vídeo">
          <div className="card p-4 h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={ov.byCodec} dataKey="n" nameKey="name" outerRadius={80} label={(e) => `${e.name}: ${e.n}`} fontSize={11}>
                  {ov.byCodec.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="HDR / Dolby Vision">
          <div className="card p-4 h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={ov.hdr} dataKey="n" nameKey="name" outerRadius={80} label={(e) => `${e.name}: ${e.n}`} fontSize={11}>
                  {ov.hdr.map((_, i) => <Cell key={i} fill={COLORS[(i + 4) % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <Section title="Espacio en disco por década">
        <div className="card p-4 h-64 mb-8">
          <ResponsiveContainer>
            <BarChart data={sizeByDecade}>
              <XAxis dataKey="decade" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} unit=" GB" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} GB`]} />
              <Bar dataKey="gb" name="GB" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Candidatas a upgrade (bien valoradas, por debajo de 1080p)">
        {!upgrades ? (
          <Spinner />
        ) : upgrades.length === 0 ? (
          <Empty>Todo está al menos en 1080p. 💪</Empty>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3 mb-8">
            {upgrades.map((m) => (
              <div key={m.rating_key}>
                <MovieCard movie={m} onClick={() => setSelected(m.rating_key)} />
                <div className="text-[11px] text-orange-400">{m.resolution || 'SD'} · {fmtBytes(m.size_bytes)}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {dups && (dups.multiVersion.length > 0 || dups.sameTmdb.length > 0) && (
        <Section title="Duplicados y versiones múltiples">
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Con varias versiones/archivos ({dups.multiVersion.length})</h3>
              <div className="max-h-80 overflow-y-auto text-sm">
                {dups.multiVersion.map((m) => (
                  <div key={m.rating_key} className="flex justify-between py-1 border-b border-ink-800 gap-2">
                    <button className="text-slate-200 hover:text-gold-400 text-left truncate" onClick={() => setSelected(m.rating_key)}>
                      {m.title} ({m.year})
                    </button>
                    <span className="text-slate-500 shrink-0">{m.media_count} versiones · {fmtBytes(m.size_bytes)}</span>
                  </div>
                ))}
                {dups.multiVersion.length === 0 && <Empty>Ninguna.</Empty>}
              </div>
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Mismo TMDB ID repetido ({dups.sameTmdb.length})</h3>
              <div className="max-h-80 overflow-y-auto text-sm">
                {dups.sameTmdb.map((d) => (
                  <div key={d.tmdb_id} className="py-1 border-b border-ink-800 text-slate-300">
                    {d.titles} <span className="text-slate-500">({d.n} entradas)</span>
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
              <tr className="text-slate-500 text-left border-b border-ink-700">
                <th className="py-2">Título</th><th>Año</th><th>Resolución</th><th>Códec</th><th className="text-right">Tamaño</th>
              </tr>
            </thead>
            <tbody>
              {ov.largest.map((m) => (
                <tr key={m.rating_key} className="border-b border-ink-800">
                  <td className="py-1.5">
                    <button className="text-slate-200 hover:text-gold-400" onClick={() => setSelected(m.rating_key)}>{m.title}</button>
                  </td>
                  <td className="text-slate-500">{m.year}</td>
                  <td className="text-slate-400">{m.resolution}</td>
                  <td className="text-slate-400">{m.video_codec}</td>
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
