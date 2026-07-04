import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Spinner, Section, Empty, StatCard } from '../components.jsx';

export default function Letterboxd() {
  const [summary, setSummary] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [rssUser, setRssUser] = useState('');
  const [rssBusy, setRssBusy] = useState(false);
  const [rssResult, setRssResult] = useState(null);
  const fileRef = useRef();

  const load = () => api('/letterboxd/summary').then((s) => { setSummary(s); if (s.rssUser != null) setRssUser(s.rssUser || ''); });
  useEffect(() => {
    load();
  }, []);

  const upload = async (e) => {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (!files?.length) return;
    setUploading(true);
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const res = await fetch('/api/letterboxd/import', { method: 'POST', body: fd });
    setResult(await res.json());
    setUploading(false);
    load();
  };

  const syncRss = async () => {
    setRssBusy(true);
    setRssResult(null);
    const res = await api('/letterboxd/rss', { method: 'POST', body: { user: rssUser.trim(), save: true } });
    setRssBusy(false);
    setRssResult(res);
    load();
  };

  if (!summary) return <Spinner />;

  const counts = summary.counts || {};
  const hasData = Object.keys(counts).length > 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Letterboxd</h1>
      <p className="text-sm text-slate-500 mb-5">
        Exporta tus datos en letterboxd.com → Settings → Data → Export y sube aquí <b>el .zip completo</b> tal cual
        (sin descomprimir): PowaFlex extrae diario, notas, vistas, watchlist y tus listas. También acepta CSV sueltos
        y el formato Letterboxd de WebTools-NG.
      </p>

      <form onSubmit={upload} className="card p-4 mb-6 flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".csv,.zip" multiple className="text-sm text-slate-400" />
        <button className="btn-gold" disabled={uploading}>
          {uploading ? 'Importando…' : 'Importar zip o CSV'}
        </button>
        {hasData && (
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              await api('/letterboxd', { method: 'DELETE' });
              setResult(null);
              load();
            }}
          >
            Vaciar datos importados
          </button>
        )}
        {result?.results && (
          <div className="w-full text-xs text-slate-400 space-y-0.5">
            {result.results.map((r, i) => (
              <div key={i}>
                {r.file}: {r.error ? `⚠️ ${r.error}` : `${r.imported} importadas (${r.matched} emparejadas con tu biblioteca) como «${r.list}»`}
              </div>
            ))}
            {result.lists?.length > 0 && (
              <div className="text-gold-400">
                + {result.lists.length} listas importadas como retos (míralas en «Listas y retos»).
              </div>
            )}
          </div>
        )}
      </form>

      {/* RSS feed */}
      <div className="card p-4 mb-8">
        <h2 className="font-semibold text-slate-100 mb-1">Feed RSS de tu perfil</h2>
        <p className="text-xs text-slate-500 mb-3 max-w-3xl">
          Guarda tu usuario de Letterboxd y PowaFlex irá recogiendo tus últimas películas vistas automáticamente
          (cada noche, y cuando pulses aquí). Aparecerán en el Dashboard y se emparejan con tu biblioteca.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500 text-sm">letterboxd.com/</span>
          <input
            className="input !w-48"
            placeholder="tu-usuario"
            value={rssUser}
            onChange={(e) => setRssUser(e.target.value)}
          />
          <button className="btn-gold" disabled={rssBusy || !rssUser.trim()} onClick={syncRss}>
            {rssBusy ? 'Sincronizando…' : 'Guardar y sincronizar'}
          </button>
          {rssResult && (
            <span className={`text-xs ${rssResult.error ? 'text-red-400' : 'text-emerald-400'}`}>
              {rssResult.error
                ? `⚠️ ${rssResult.error}`
                : `✓ ${rssResult.imported} nuevas (${rssResult.matched} en tu biblioteca) de ${rssResult.seen} del feed`}
            </span>
          )}
        </div>
      </div>

      {!hasData ? (
        <Empty>Sin datos de Letterboxd todavía.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {Object.entries(counts).map(([list, c]) => (
              <StatCard key={list} label={`${list}`} value={c.total} sub={`${c.matched} emparejadas con Plex`} />
            ))}
          </div>

          <Section title={`Watchlist: te faltan en Plex (${summary.watchlistMissing.length})`}>
            {summary.watchlistMissing.length === 0 ? (
              <Empty>Tu watchlist entera está en Plex. 🏆</Empty>
            ) : (
              <div className="card p-4 max-h-96 overflow-y-auto">
                {summary.watchlistMissing.map((m, i) => (
                  <div key={i} className="flex justify-between py-1 border-b border-ink-800 text-sm gap-2">
                    <span className="text-slate-200">
                      {m.title} <span className="text-slate-500">({m.year ?? '¿?'})</span>
                    </span>
                    {m.uri && (
                      <a href={m.uri} target="_blank" rel="noreferrer" className="text-gold-400 text-xs hover:underline shrink-0">
                        Letterboxd ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title={`Watchlist: ya en tu biblioteca (${summary.watchlistOwned.length})`}>
            <div className="card p-4 max-h-64 overflow-y-auto">
              {summary.watchlistOwned.map((m, i) => (
                <div key={i} className="py-1 border-b border-ink-800 text-sm text-slate-300">
                  ✓ {m.title} <span className="text-slate-500">({m.year})</span>
                </div>
              ))}
              {summary.watchlistOwned.length === 0 && <Empty>Ninguna aún.</Empty>}
            </div>
          </Section>

          <Section title="Tus notas de Letterboxd vs. Plex">
            {summary.ratingCompare.length === 0 ? (
              <Empty>No hay valoraciones emparejadas.</Empty>
            ) : (
              <div className="card p-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-left border-b border-ink-700">
                      <th className="py-2">Título</th><th>Año</th>
                      <th className="text-right">Letterboxd</th>
                      <th className="text-right">Plex (tú)</th>
                      <th className="text-right">Audiencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.ratingCompare.slice(0, 200).map((m) => (
                      <tr key={m.rating_key} className="border-b border-ink-800">
                        <td className="py-1.5 text-slate-200">{m.title}</td>
                        <td className="text-slate-500">{m.year}</td>
                        <td className="text-right text-orange-400">{m.lb?.toFixed(1)}</td>
                        <td className="text-right text-gold-400">{m.plex ?? '—'}</td>
                        <td className="text-right text-slate-400">{m.audience ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
