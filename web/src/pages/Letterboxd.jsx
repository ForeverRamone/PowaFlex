import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Spinner, Section, Empty, StatCard, Dropzone, PageHeader } from '../components.jsx';

export default function Letterboxd() {
  const [summary, setSummary] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [rssUser, setRssUser] = useState('');
  const [rssBusy, setRssBusy] = useState(false);
  const [rssResult, setRssResult] = useState(null);

  const load = () => api('/letterboxd/summary').then((s) => { setSummary(s); if (s.rssUser != null) setRssUser(s.rssUser || ''); });
  useEffect(() => {
    load();
  }, []);

  // try/finally everywhere: a network error used to leave the spinner spinning
  // and the dropzone blocked until a reload
  const upload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const res = await fetch('/api/letterboxd/import', { method: 'POST', body: fd });
      setResult(await res.json());
    } catch (err) {
      setResult({ error: `No se pudo subir: ${err.message || err}` });
    } finally {
      setUploading(false);
      load();
    }
  };

  const syncRss = async (user = rssUser.trim()) => {
    setRssBusy(true);
    setRssResult(null);
    try {
      const res = await api('/letterboxd/rss', { method: 'POST', body: { user, save: true } });
      setRssResult(res);
    } catch (err) {
      setRssResult({ error: String(err.message || err) });
    } finally {
      setRssBusy(false);
      load();
    }
  };

  // clearing the user is what stops the nightly pull; the endpoint saves the
  // empty value and then complains there's nothing to sync, which is expected
  const stopRss = async () => {
    setRssBusy(true);
    setRssUser('');
    try {
      await api('/letterboxd/rss', { method: 'POST', body: { user: '', save: true } });
      setRssResult({ stopped: true });
    } finally {
      setRssBusy(false);
      load();
    }
  };

  if (!summary) return <Spinner />;

  const counts = summary.counts || {};
  const hasData = Object.keys(counts).length > 0;

  return (
    <div>
      <PageHeader eyebrow="Cuenta" title="Letterboxd" />
      <p className="text-sm text-zinc-500 mb-5">
        Exporta tus datos en letterboxd.com → Settings → Data → Export y sube aquí <b>el .zip completo</b> tal cual
        (sin descomprimir): PowaFlex extrae diario, notas, vistas, watchlist y tus listas. También acepta CSV sueltos
        y el formato Letterboxd de WebTools-NG.
      </p>

      <div className="card p-4 mb-6">
        <Dropzone
          accept=".csv,.zip"
          busy={uploading}
          onFiles={upload}
          label="Arrastra aquí el .zip de Letterboxd (o CSV sueltos), o haz clic para elegir"
          hint="Acepta el export completo sin descomprimir · también CSV en formato WebTools-NG"
        />
        {hasData && (
          <div className="mt-3">
            <button
              type="button"
              className="btn-ghost"
              onClick={async () => { await api('/letterboxd', { method: 'DELETE' }); setResult(null); load(); }}
            >
              Vaciar datos importados
            </button>
          </div>
        )}
        {result?.results && (
          <div className="text-xs text-zinc-400 space-y-0.5 mt-3">
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
      </div>

      {/* RSS feed */}
      <div className="card p-4 mb-8">
        <h2 className="font-semibold text-zinc-100 mb-1">Feed RSS de tu perfil</h2>
        <p className="text-xs text-zinc-500 mb-3 max-w-3xl">
          Guarda tu usuario de Letterboxd y PowaFlex irá recogiendo tus últimas películas vistas automáticamente
          (cada noche, y cuando pulses aquí). Aparecerán en el Dashboard y se emparejan con tu biblioteca.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-500 text-sm">letterboxd.com/</span>
          <input
            className="input !w-48"
            placeholder="tu-usuario"
            value={rssUser}
            onChange={(e) => setRssUser(e.target.value)}
          />
          <button className="btn-gold" disabled={rssBusy || !rssUser.trim()} onClick={() => syncRss()}>
            {rssBusy ? 'Sincronizando…' : 'Guardar y sincronizar'}
          </button>
          {summary.rssUser && (
            <button className="btn-ghost" disabled={rssBusy} onClick={stopRss} title="Deja de recoger tus vistas cada noche">
              Dejar de sincronizar
            </button>
          )}
          {rssResult && (
            <span className={`text-xs ${rssResult.error ? 'text-red-400' : 'text-emerald-400'}`}>
              {rssResult.stopped
                ? '✓ Sincronización detenida'
                : rssResult.error
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
                    <span className="text-zinc-200">
                      {m.title} <span className="text-zinc-500">({m.year ?? '¿?'})</span>
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
                <div key={i} className="py-1 border-b border-ink-800 text-sm text-zinc-300">
                  ✓ {m.title} <span className="text-zinc-500">({m.year})</span>
                </div>
              ))}
              {summary.watchlistOwned.length === 0 && <Empty>Ninguna aún.</Empty>}
            </div>
          </Section>

          <Section title="Tus notas de Letterboxd vs. la comunidad">
            {summary.ratingCompare.length === 0 ? (
              <Empty>No hay valoraciones emparejadas.</Empty>
            ) : (
              <div className="card p-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-left border-b border-ink-700">
                      <th className="py-2">Título</th><th>Año</th>
                      <th className="text-right">Tu nota /10</th>
                      <th className="text-right">Comunidad LB /10</th>
                      <th className="text-right">Σ MDBList</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.ratingCompare.slice(0, 200).map((m) => (
                      <tr key={m.rating_key} className="border-b border-ink-800">
                        <td className="py-1.5 text-zinc-200">{m.title}</td>
                        <td className="text-zinc-500">{m.year}</td>
                        <td className="text-right text-gold-400">{m.lb?.toFixed(1)}</td>
                        <td className="text-right text-orange-300">{m.community != null ? m.community.toFixed(1) : '—'}</td>
                        <td className="text-right text-zinc-400">{m.mdb_score ?? '—'}</td>
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
