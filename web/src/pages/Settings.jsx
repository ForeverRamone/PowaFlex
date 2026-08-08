import { useEffect, useRef, useState } from 'react';
import { api, UI_THEMES, applyTheme, currentTheme } from '../api.js';
import { Spinner, ProgressBar, PageHeader, Dropzone, StatCard, LetterboxdLogo } from '../components.jsx';
import { t, getLang, setLang, locale } from '../i18n.js';
import { toast } from '../toast.js';

/**
 * El importador de Letterboxd vivía en su propia página del menú; como es
 * configuración de una fuente de datos (igual que Plex o Radarr), ahora vive
 * aquí. Lo analítico se mudó: notas vs. comunidad a Visionado y la watchlist a
 * Listas y retos.
 */
function LetterboxdSection() {
  const [summary, setSummary] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [rssUser, setRssUser] = useState('');
  const [rssBusy, setRssBusy] = useState(false);
  const [rssResult, setRssResult] = useState(null);

  const load = () => api('/letterboxd/summary').then((s) => { setSummary(s); if (s.rssUser != null) setRssUser(s.rssUser || ''); });
  useEffect(() => { load(); }, []);

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
      setResult({ error: t('No se pudo subir: {msg}', { msg: err.message || err }) });
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

  const counts = summary?.counts || {};
  const hasData = Object.keys(counts).length > 0;

  return (
    <section className="card p-5 mb-5">
      <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
        <LetterboxdLogo size={7} className="shrink-0" /> Letterboxd
        <span className="text-zinc-500 text-xs font-normal">{t('(opcional: tus vistas, notas y watchlist)')}</span>
      </h2>
      <p className="text-xs text-zinc-500 mt-1 mb-3 max-w-3xl">
        {t('Exporta tus datos en letterboxd.com → Settings → Data → Export y sube aquí ')}<b>{t('el .zip completo')}</b>
        {t(' tal cual (sin descomprimir): PowaFlex extrae diario, notas, vistas, watchlist y tus listas. También acepta CSV sueltos y el formato Letterboxd de WebTools-NG. Tus notas vs. la comunidad se ven en ')}
        <b>{t('Visionado')}</b>{t('; la watchlist, en ')}<b>{t('Listas y retos')}</b>.
      </p>
      {summary?.error ? (
        <p className="text-sm text-red-400">{summary.error}</p>
      ) : !summary ? (
        <Spinner />
      ) : (
        <>
          <Dropzone
            accept=".csv,.zip"
            busy={uploading}
            onFiles={upload}
            label={t('Arrastra aquí el .zip de Letterboxd (o CSV sueltos), o haz clic para elegir')}
            hint={t('Acepta el export completo sin descomprimir · también CSV en formato WebTools-NG')}
          />
          {hasData && (
            <div className="mt-3">
              <button
                type="button"
                className="btn-ghost"
                onClick={async () => { await api('/letterboxd', { method: 'DELETE' }); setResult(null); load(); }}
              >
                {t('Vaciar datos importados')}
              </button>
            </div>
          )}
          {result?.results && (
            <div className="text-xs text-zinc-400 space-y-0.5 mt-3">
              {result.results.map((r, i) => (
                <div key={i}>
                  {r.file}: {r.error ? `⚠️ ${t(r.error)}` : t('{n} importadas ({m} emparejadas con tu biblioteca) como «{list}»', { n: r.imported, m: r.matched, list: r.list })}
                </div>
              ))}
              {result.lists?.length > 0 && (
                <div className="text-gold-400">
                  {t('+ {n} listas importadas como retos (míralas en «Listas y retos»).', { n: result.lists.length })}
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <h3 className="font-semibold text-zinc-100 text-sm mb-1">{t('Feed RSS de tu perfil')}</h3>
            <p className="text-xs text-zinc-500 mb-3 max-w-3xl">
              {t('Guarda tu usuario de Letterboxd y PowaFlex irá recogiendo tus últimas películas vistas automáticamente (cada noche, y cuando pulses aquí). Aparecerán en el Dashboard y se emparejan con tu biblioteca.')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-500 text-sm">letterboxd.com/</span>
              <input
                className="input !w-48"
                placeholder={t('tu-usuario')}
                value={rssUser}
                onChange={(e) => setRssUser(e.target.value)}
              />
              <button className="btn-gold" disabled={rssBusy || !rssUser.trim()} onClick={() => syncRss()}>
                {rssBusy ? t('Sincronizando…') : t('Guardar y sincronizar')}
              </button>
              {summary.rssUser && (
                <button className="btn-ghost" disabled={rssBusy} onClick={stopRss} title={t('Deja de recoger tus vistas cada noche')}>
                  {t('Dejar de sincronizar')}
                </button>
              )}
              {rssResult && (
                <span className={`text-xs ${rssResult.error ? 'text-red-400' : 'text-emerald-400'}`}>
                  {rssResult.stopped
                    ? t('✓ Sincronización detenida')
                    : rssResult.error
                      ? `⚠️ ${rssResult.error}`
                      : t('✓ {n} nuevas ({m} en tu biblioteca) de {s} del feed', { n: rssResult.imported, m: rssResult.matched, s: rssResult.seen })}
                </span>
              )}
            </div>
          </div>

          {hasData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {Object.entries(counts).map(([list, c]) => (
                <StatCard key={list} label={`${list}`} value={c.total} sub={t('{n} emparejadas con Plex', { n: c.matched })} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Guide({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 text-sm">
      <button type="button" onClick={() => setOpen(!open)} className="text-gold-400 hover:underline text-xs">
        {open ? '▾' : '▸'} {title}
      </button>
      {open && <div className="mt-2 text-zinc-400 text-xs leading-relaxed space-y-1">{children}</div>}
    </div>
  );
}

/**
 * Las películas que vetaste al pase automático desde Cine venidero (🚫). Aquí
 * se repasan y se deshacen: una vez estrenada, la ficha desaparece del
 * calendario y el veto se quedaría sin sitio donde tocarlo.
 */
function VetadasList() {
  const [vetadas, setVetadas] = useState(null);
  const load = () => api('/radarr/auto/veto').then((r) => Array.isArray(r) && setVetadas(r));
  useEffect(() => { load(); }, []);
  if (!vetadas?.length) return null;
  return (
    <details className="mt-3 ml-6">
      <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
        {t('🚫 {n} fuera del pase automático', { n: vetadas.length })}
      </summary>
      <p className="text-[11px] text-zinc-500 mt-1 mb-2 max-w-2xl">
        {t('El automático las ignora. Se siguen viendo en Cine venidero y puedes mandarlas a Radarr a mano cuando quieras.')}
      </p>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {vetadas.map((v) => (
          <div key={v.tmdb_id} className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="truncate">{v.title || `TMDB ${v.tmdb_id}`}</span>
            <button
              className="text-gold-400 hover:underline shrink-0"
              onClick={async () => {
                const r = await api(`/radarr/auto/veto/${v.tmdb_id}`, { method: 'DELETE' });
                if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
                load();
              }}
            >
              {t('quitar el veto')}
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}

function TestBadge({ result }) {
  if (!result) return null;
  return result.ok ? (
    <span className="text-emerald-400 text-xs">{t('✓ Conectado')} {result.name || result.version || ''}</span>
  ) : (
    <span className="text-red-400 text-xs">✗ {result.error}</span>
  );
}

export default function Settings() {
  // el sondeo de MDBList vive aquí para poder cortarlo al salir de la página
  const mdbPoll = useRef(null);
  useEffect(() => () => clearInterval(mdbPoll.current), []);
  const [s, setS] = useState(null);
  const [tests, setTests] = useState({});
  const [saved, setSaved] = useState(false);
  const [sync, setSync] = useState(null);
  const [radarrCtx, setRadarrCtx] = useState(null);
  const [sections, setSections] = useState(null);
  const [mdbStatus, setMdbStatus] = useState(null);
  const [radarrSync, setRadarrSync] = useState(null);
  const [auto, setAuto] = useState(null);
  const [lifeMsg, setLifeMsg] = useState(null);
  const [refresh, setRefresh] = useState(null);
  const [theme, setThemeState] = useState(currentTheme);
  const [imdb, setImdb] = useState(null);
  const [imdbBusy, setImdbBusy] = useState(false);
  const [copias, setCopias] = useState(null);
  const [copiaBusy, setCopiaBusy] = useState(false);

  const loadSections = () =>
    api('/plex/sections').then((r) => Array.isArray(r) && setSections(r)).catch(() => {});

  const cargarCopias = () =>
    api('/backup/list').then((r) => Array.isArray(r?.copias) && setCopias(r.copias)).catch(() => {});

  useEffect(() => {
    api('/settings').then((st) => {
      setS(st);
      if (st.plex_url && st.plex_token_set) loadSections();
    });
    api('/sync/status').then(setSync);
    api('/mdblist/status').then((st) => st && !st.error && st.total != null && setMdbStatus(st));
    api('/radarr/ids').then((r) => r.tmdbIds && setRadarrSync({ count: r.tmdbIds.length, syncedAt: r.syncedAt }));
    api('/radarr/auto').then((a) => !a.error && setAuto(a));
    api('/refresh-all').then((r) => !r.error && setRefresh(r));
    api('/imdb/status').then((r) => r && !r.error && setImdb(r));
    cargarCopias();
  }, []);

  // poll sync status while running. Durante «Actualizar todo» NO: ese bucle ya
  // pregunta por /sync/status cada 1,5 s, y con los dos vivos se preguntaba dos
  // veces por lo mismo al mismo ritmo.
  useEffect(() => {
    if (!sync?.running || refresh?.running) return;
    const t = setInterval(() => api('/sync/status').then(setSync), 1500);
    return () => clearInterval(t);
  }, [sync?.running, refresh?.running]);

  // poll the full-refresh routine while it runs (it drives the Plex sync too)
  useEffect(() => {
    if (!refresh?.running) return;
    const t = setInterval(() => {
      api('/refresh-all').then((r) => !r.error && setRefresh(r));
      api('/sync/status').then(setSync);
    }, 1500);
    return () => clearInterval(t);
  }, [refresh?.running]);

  const startFullRefresh = async () => {
    const r = await api('/refresh-all', { method: 'POST' });
    // sin el aviso, pulsabas y no pasaba nada sin saber por qué
    if (r.error && !r.started) { toast(`⚠️ ${t(r.error)}`, 'error'); return; }
    setRefresh({ ...(refresh || {}), running: true, steps: [], step: 'Preparando…' });
  };

  const save = async () => {
    const r = await api('/settings', { method: 'PUT', body: s });
    // antes decía «✓ Guardado» pasara lo que pasara, incluso con el servidor caído
    if (r?.error) { toast(t('⚠️ No se ha podido guardar: {error}', { error: r.error }), 'error'); return r; }
    // mirror the display pref so poster cards can read it synchronously (#5)
    localStorage.setItem('primary_rating', s.primary_rating || 'score');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    return r;
  };

  const test = async (service) => {
    await save();
    setTests((t) => ({ ...t, [service]: { pending: true } }));
    const res = await api(`/settings/test/${service}`, { method: 'POST' });
    setTests((t) => ({ ...t, [service]: res }));
    if (service === 'plex' && res.ok) loadSections();
    if (service === 'radarr' && res.ok) {
      const ctx = await api('/radarr/context');
      if (!ctx.error) setRadarrCtx(ctx);
    }
  };

  const startSync = async (force = false) => {
    await save();
    const st = await api('/sync', { method: 'POST', body: { force } });
    setSync({ ...st, running: true });
  };

  const [historial, setHistorial] = useState(null);
  useEffect(() => {
    api('/refresh-history').then((r) => Array.isArray(r) && setHistorial(r));
  }, []);

  const importarAjustes = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // que se pueda reelegir el mismo fichero
    if (!file) return;
    let body;
    try {
      body = JSON.parse(await file.text());
    } catch {
      toast(t('⚠️ El fichero no es un JSON válido'), 'error');
      return;
    }
    const r = await api('/backup/settings', { method: 'POST', body });
    if (r.error) {
      toast(`⚠️ ${t(r.error)}`, 'error');
      return;
    }
    toast(t('✓ {n} ajustes importados', { n: r.aplicadas }) + (r.ignoradas ? t(' · {n} ignorados', { n: r.ignoradas.length }) : ''));
    api('/settings').then(setS);
  };

  if (!s) return <Spinner />;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });

  const syncPct =
    sync?.phase === 'details' && sync.detailTotal
      ? Math.round((sync.detailDone / sync.detailTotal) * 100)
      : sync?.phase === 'listing' && sync.total
        ? Math.round((sync.done / sync.total) * 100)
        : 0;

  return (
    <div>
      <PageHeader eyebrow={t('Cuenta')} title={t('Ajustes')} />

      {/* ACTUALIZAR TODO */}
      <section className="card-raised p-5 mb-6 border-l-4 !border-l-yellow-500 !bg-yellow-500/8">
        {/* basis-64: sin una base mínima, el flex-1 se estrujaba junto al botón
            y en móvil la descripción quedaba en una columna de una palabra */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="font-semibold text-zinc-100">{t('Actualizar todo')}</h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
              {t('Una sola rutina con todo lo que PowaFlex necesita, en orden: biblioteca de Plex, emparejado de Letterboxd, títulos en otros idiomas, notas de MDBList, lo que ya tienes en Radarr, calendario, huecos de tus favoritos y sagas. Es exactamente lo mismo que se ejecuta solo cada noche. Lo que no tengas configurado se salta.')}
            </p>
          </div>
          <button className="btn-gold shrink-0" onClick={startFullRefresh} disabled={refresh?.running}>
            {refresh?.running ? t('Actualizando…') : t('↻ Actualizar todo')}
          </button>
        </div>

        {refresh?.steps?.length > 0 && (
          <div className="mt-4 space-y-1">
            {refresh.steps.map((st) => {
              const icon = { done: '✓', running: '⟳', error: '✗', skipped: '·', pending: '○' }[st.state] || '○';
              const color = {
                done: 'text-emerald-400', running: 'text-gold-400 animate-pulse',
                error: 'text-red-400', skipped: 'text-zinc-600', pending: 'text-zinc-600',
              }[st.state];
              return (
                <div key={st.key} className="flex items-baseline gap-2 text-sm">
                  <span className={`${color} w-4 shrink-0`}>{icon}</span>
                  <span className={st.state === 'skipped' ? 'text-zinc-600' : 'text-zinc-300'}>{st.label}</span>
                  {st.detail && (
                    <span className={`text-xs ${st.state === 'error' ? 'text-red-400' : 'text-zinc-500'}`}>
                      — {st.detail}
                    </span>
                  )}
                  {st.ms > 1000 && st.state === 'done' && (
                    <span className="text-[11px] text-zinc-600 ml-auto shrink-0">{Math.round(st.ms / 1000)}s</span>
                  )}
                </div>
              );
            })}
            {/* the Plex step drives the sync, so show its inner progress */}
            {refresh.running && sync?.running && (
              <div className="pt-2 max-w-md">
                <ProgressBar pct={syncPct} />
                <div className="text-[11px] text-zinc-500 mt-1">
                  {sync.phase === 'listing' && t('Listando «{section}»… {n}', { section: sync.section || '', n: sync.done })}
                  {sync.phase === 'details' && t('Detalles {a} / {b}', { a: sync.detailDone, b: sync.detailTotal })}
                  {sync.phase === 'cleanup' && t('Limpiando eliminadas…')}
                </div>
              </div>
            )}
          </div>
        )}

        {!refresh?.running && refresh?.finishedAt && (
          <p className={`text-xs mt-3 ${refresh.lastError ? 'text-red-400' : 'text-emerald-400'}`}>
            {refresh.lastError
              ? t('Terminada con avisos: {error}', { error: refresh.lastError })
              : t('✓ Todo actualizado · {date}', { date: new Date(refresh.finishedAt).toLocaleString(locale()) })}
          </p>
        )}
        {!refresh?.running && !refresh?.finishedAt && refresh?.lastRun && (
          <p className="text-xs text-zinc-500 mt-3">
            {t('Última actualización completa: {date}', { date: new Date(refresh.lastRun).toLocaleString(locale()) })}
          </p>
        )}
      </section>

      {/* PLEX */}
      <section className="card p-5 mb-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">1 · Plex</h2>
          <TestBadge result={tests.plex} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-zinc-400">{t('URL del servidor (con puerto)')}</label>
            <input className="input mt-1" placeholder="http://192.168.1.50:32400" value={s.plex_url || ''} onChange={set('plex_url')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400">X-Plex-Token</label>
            <input className="input mt-1" type="password" autoComplete="off" placeholder={t('Pega aquí tu token')} value={s.plex_token || ''} onChange={set('plex_token')} />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost" onClick={() => test('plex')}>{t('Probar conexión')}</button>
        </div>
        {sections?.length > 0 && (() => {
          const selectedCsv = (s.plex_sections || '').split(',').map((x) => x.trim()).filter(Boolean);
          const isChecked = (id) => selectedCsv.length === 0 || selectedCsv.includes(String(id));
          const toggleSection = (id) => {
            let next = sections.filter((sec) => isChecked(sec.id)).map((sec) => String(sec.id));
            next = next.includes(String(id)) ? next.filter((x) => x !== String(id)) : [...next, String(id)];
            if (next.length === 0) return; // at least one library
            setS({ ...s, plex_sections: next.length === sections.length ? '' : next.join(',') });
          };
          return (
            <div className="mt-4">
              <div className="text-xs text-zinc-400 mb-2">
                {t('Bibliotecas de películas a sincronizar')}
                <span className="text-zinc-600"> {t('(las de series no aparecen: PowaFlex solo gestiona cine)')}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sections.map((sec) => (
                  <label
                    key={sec.id}
                    className={`btn-ghost !py-1.5 flex items-center gap-2 select-none ${
                      isChecked(sec.id) ? '!border-gold-400 text-gold-400' : 'opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-gold-500"
                      checked={isChecked(sec.id)}
                      onChange={() => toggleSection(sec.id)}
                    />
                    {sec.title}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                {t('Guarda los ajustes y sincroniza: las películas de bibliotecas desmarcadas se retiran de PowaFlex en la siguiente sincronización (en Plex no se toca nada).')}
              </p>
            </div>
          );
        })()}
        <Guide title={t('¿Cómo consigo mi X-Plex-Token?')}>
          <p>{t('1. Abre ')}<b>app.plex.tv</b>{t(' en el navegador y entra en tu servidor.')}</p>
          <p>{t('2. Abre cualquier película y pulsa en ')}<b>{t('⋯ → Obtener información → Ver XML')}</b>.</p>
          <p>{t('3. Se abre una pestaña con XML: mira la URL, al final verás ')}<b>X-Plex-Token=XXXXXXXX</b>{t('. Copia ese valor.')}</p>
          <p>{t('4. La URL del servidor es la IP local de tu N100 con el puerto 32400, p. ej. ')}<b>http://192.168.1.50:32400</b>.</p>
        </Guide>
      </section>

      {/* TMDB */}
      <section className="card p-5 mb-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">2 · TMDB</h2>
          <TestBadge result={tests.tmdb} />
        </div>
        <div className="mt-3">
          <label className="text-xs text-zinc-400">{t('API key (v3) o token de lectura (v4)')}</label>
          <input className="input mt-1" type="password" autoComplete="off" placeholder={t('Pega aquí tu API key de TMDB')} value={s.tmdb_key || ''} onChange={set('tmdb_key')} />
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost" onClick={() => test('tmdb')}>{t('Probar conexión')}</button>
        </div>
        <Guide title={t('¿Cómo consigo una API key de TMDB (gratis)?')}>
          <p>{t('1. Crea cuenta en ')}<b>themoviedb.org</b>{t(' (gratuita).')}</p>
          <p>{t('2. Ve a ')}<b>{t('Ajustes → API → Crear → Developer')}</b>.</p>
          <p>{t('3. Rellena el formulario (uso personal) y copia la ')}<b>API Key (v3 auth)</b>{t(' o el ')}<b>{t('Token de acceso de lectura (v4)')}</b>{t('. Ambos valen.')}</p>
        </Guide>
      </section>

      {/* RADARR */}
      <section className="card p-5 mb-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">3 · Radarr</h2>
          <TestBadge result={tests.radarr} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-zinc-400">{t('URL de Radarr')}</label>
            <input className="input mt-1" placeholder="http://192.168.1.50:7878" value={s.radarr_url || ''} onChange={set('radarr_url')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400">API key</label>
            <input className="input mt-1" type="password" autoComplete="off" placeholder="Radarr → Settings → General" value={s.radarr_key || ''} onChange={set('radarr_key')} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-zinc-400">{t('Etiqueta para lo añadido desde PowaFlex')}</label>
            <input
              className="input mt-1"
              placeholder="PowaFlex"
              value={s.radarr_tag ?? 'PowaFlex'}
              onChange={set('radarr_tag')}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              {t('Se crea en Radarr si no existe y se aplica a cada película añadida. Déjalo vacío para no etiquetar.')}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2 items-center flex-wrap">
          <button className="btn-ghost" onClick={() => test('radarr')}>{t('Probar y cargar perfiles')}</button>
        </div>
        {radarrCtx && (
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-xs text-zinc-400">{t('Perfil de calidad al añadir')}</label>
              <select className="input mt-1" value={s.radarr_quality_profile || ''} onChange={set('radarr_quality_profile')}>
                <option value="">{t('— elige —')}</option>
                {radarrCtx.profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400">{t('Carpeta raíz')}</label>
              <select className="input mt-1" value={s.radarr_root_folder || ''} onChange={set('radarr_root_folder')}>
                <option value="">{t('— elige —')}</option>
                {radarrCtx.rootFolders.map((r) => (
                  <option key={r.path} value={r.path}>{r.path}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        {/* sync local snapshot of Radarr's library (so the UI shows «✓ en Radarr») */}
        <div className="mt-4 pt-4 border-t border-ink-700">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="btn-ghost"
              onClick={async () => {
                await save();
                setRadarrSync({ ...radarrSync, busy: true });
                const r = await api('/radarr/sync', { method: 'POST' });
                setRadarrSync(r.error ? { error: r.error } : { count: r.count, syncedAt: r.syncedAt });
              }}
            >
              {t('Sincronizar lo ya añadido a Radarr')}
            </button>
            {radarrSync?.busy && <span className="text-xs text-zinc-400">{t('Sincronizando…')}</span>}
            {radarrSync?.error && <span className="text-xs text-red-400">✗ {radarrSync.error}</span>}
            {radarrSync?.count != null && !radarrSync.busy && (
              <span className="text-xs text-zinc-400">
                {t('{n} películas en Radarr', { n: radarrSync.count.toLocaleString(locale()) })}
                {radarrSync.syncedAt ? ` · ${new Date(radarrSync.syncedAt).toLocaleString(locale())}` : ''}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            {t('Guarda un listado local de lo que ya tienes en Radarr para que las fichas muestren el recuadro verde «✓ en Radarr» en vez de intentar añadirlo y fallar con «ya existe».')}
          </p>
        </div>

        {/* daily auto-add for living favorite directors (#3) */}
        <div className="mt-4 pt-4 border-t border-ink-700">
          <label className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
            <input
              type="checkbox"
              className="accent-gold-500"
              checked={s.auto_radarr_enabled === '1'}
              onChange={(e) => setS({ ...s, auto_radarr_enabled: e.target.checked ? '1' : '0' })}
            />
            {t('Lanzar a Radarr automáticamente cada noche los estrenos de mis directores/as favoritos/as vivos')}
          </label>
          <div className="flex flex-wrap items-center gap-2 mt-2 ml-6">
            <span className="text-xs text-zinc-400">{t('de los próximos')}</span>
            <input
              type="number"
              min="1"
              max="24"
              className="input !w-20 text-center"
              value={s.auto_radarr_months ?? '6'}
              onChange={set('auto_radarr_months')}
            />
            <span className="text-xs text-zinc-400">{t('meses, mirando también')}</span>
            <input
              type="number"
              min="0"
              max="365"
              className="input !w-20 text-center"
              value={s.auto_radarr_lookback_days ?? '0'}
              onChange={set('auto_radarr_lookback_days')}
              title={t('TMDB a veces pone fecha a las películas pequeñas después del estreno; con 0 esas se pierden')}
            />
            <span className="text-xs text-zinc-400">{t('días hacia atrás')}</span>
            <button
              className="btn-ghost !py-1"
              onClick={async () => {
                await save();
                setAuto({ ...auto, running: true });
                const r = await api('/radarr/auto/run', { method: 'POST', body: { months: Number(s.auto_radarr_months || 6), dryRun: true } });
                setAuto({ ...r, preview: true });
              }}
            >
              {t('Previsualizar')}
            </button>
            <button
              className="btn-gold !py-1"
              onClick={async () => {
                await save();
                setAuto({ ...auto, running: true });
                const r = await api('/radarr/auto/run', { method: 'POST', body: { months: Number(s.auto_radarr_months || 6) } });
                setAuto(r);
              }}
            >
              {t('Ejecutar ahora')}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer mt-2 ml-6">
            <input
              type="checkbox"
              className="accent-gold-500"
              checked={s.auto_radarr_include_docs === '1'}
              onChange={(e) => setS({ ...s, auto_radarr_include_docs: e.target.checked ? '1' : '0' })}
            />
            {t('Incluir documentales (por defecto, cortos, documentales y películas de TV se descartan)')}
          </label>
          {auto && (auto.considered != null || auto.added != null) && (
            <div className="ml-6 mt-2 text-xs text-zinc-400">
              {auto.preview
                ? t('{n} estrenos entrarían en Radarr', { n: auto.considered })
                : t('✓ {a} añadidas de {c} candidatas', { a: auto.added, c: auto.considered })}
              {auto.error && <span className="text-red-400"> · {auto.error}</span>}
              {auto.log?.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer hover:text-zinc-200">{t('ver detalle')}</summary>
                  <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                    {auto.log.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </details>
              )}
            </div>
          )}
          <p className="text-[11px] text-zinc-500 mt-2 ml-6">
            {t('Solo directores/as ')}<b>{t('vivos')}</b>{t(' marcados como favoritos. Los fallecidos se ignoran (no tendrán estrenos).')}
          </p>
          <VetadasList />
        </div>

        <Guide title={t('¿Dónde está la API key de Radarr?')}>
          <p>{t('En Radarr: ')}<b>Settings → General → Security → API Key</b>{t('. La URL es la misma con la que abres Radarr en el navegador, típicamente el puerto ')}<b>7878</b>.</p>
          <p>{t('Tras probar la conexión, elige el ')}<b>{t('perfil de calidad')}</b>{t(' y la ')}<b>{t('carpeta raíz')}</b>{t(' que usará PowaFlex al añadir películas.')}</p>
        </Guide>
      </section>

      {/* MDBLIST */}
      <section className="card p-5 mb-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">4 · MDBList <span className="text-zinc-500 text-xs font-normal">{t('(opcional: notas multi-plataforma y listas)')}</span></h2>
          <TestBadge result={tests.mdblist} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-zinc-400">API key</label>
            <input className="input mt-1" type="password" autoComplete="off" placeholder="mdblist.com → Preferences → API Access" value={s.mdblist_key || ''} onChange={set('mdblist_key')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400">{t('Tipo de cuenta')}</label>
            <select className="input mt-1" value={s.mdblist_tier || 'auto'} onChange={set('mdblist_tier')}>
              <option value="auto">{t('Detectar automáticamente')}</option>
              <option value="free">{t('Gratuita (1.000 peticiones/día)')}</option>
              <option value="supporter">{t('Supporter (25.000/día)')}</option>
            </select>
            <p className="text-[11px] text-zinc-500 mt-1">
              {t('Define cuántas notas se refrescan al día: con cuenta gratuita el llenado inicial se reparte en varios días; con Supporter cabe la biblioteca entera de una tanda.')}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2 items-center flex-wrap">
          <button className="btn-ghost" onClick={() => test('mdblist')}>{t('Probar conexión')}</button>
          {tests.mdblist?.ok && tests.mdblist.limit != null && (
            <span className="text-xs text-zinc-400">
              {t('Límite {n}/día', { n: Number(tests.mdblist.limit).toLocaleString(locale()) })}
              {tests.mdblist.usedToday != null && t(' · usadas hoy {n}', { n: tests.mdblist.usedToday })}
            </span>
          )}
          <button
            className="btn-gold"
            onClick={async () => {
              await save();
              await api('/mdblist/sync', { method: 'POST' });
              // el intervalo se guarda en la ref para que el efecto de limpieza
              // lo mate al salir de Ajustes: antes seguía preguntando cada dos
              // segundos hasta recargar la página
              clearInterval(mdbPoll.current);
              mdbPoll.current = setInterval(async () => {
                const st = await api('/mdblist/status');
                setMdbStatus(st);
                if (!st.running) clearInterval(mdbPoll.current);
              }, 2000);
            }}
          >
            {t('Sincronizar notas ahora')}
          </button>
          {mdbStatus && (
            <span className="text-xs text-zinc-400">
              {mdbStatus.running
                ? t('Notas {a} / {b}…', { a: mdbStatus.done, b: mdbStatus.total })
                : mdbStatus.error
                  ? `✗ ${t(mdbStatus.error)}`
                  : t('{a} de {b} películas con notas', { a: mdbStatus.withRatings?.toLocaleString(locale()), b: mdbStatus.total?.toLocaleString(locale()) })}
            </span>
          )}
        </div>
        <Guide title={t('¿Cómo consigo la API key de MDBList?')}>
          <p>{t('1. Cuenta en ')}<b>mdblist.com</b>{t(' (puedes entrar con Trakt).')}</p>
          <p>{t('2. Ve a ')}<b>Preferences → API Access</b>{t(' y copia la key.')}</p>
          <p>{t('3. La cuenta gratuita da 1.000 peticiones/día; las Supporter, bastantes más. PowaFlex respeta el límite y reparte el trabajo.')}</p>
        </Guide>
      </section>

      {/* NOTAS DE IMDb */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100">
          {t('Notas de IMDb')} <span className="text-zinc-500 text-xs font-normal">{t('(opcional: el volcado público, sin API)')}</span>
        </h2>
        <p className="text-xs text-zinc-500 mt-1 mb-3 max-w-2xl">
          {t('IMDb publica a diario un fichero con las notas y los votos de todo su catálogo. PowaFlex lo usa para el umbral de ruido de Descubrir sin gastar ni una petición de API.')}
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            className="btn-gold"
            disabled={imdbBusy || imdb?.running}
            onClick={async () => {
              setImdbBusy(true);
              const r = await api('/imdb/sync', { method: 'POST' });
              setImdbBusy(false);
              if (r?.error) toast(`⚠️ ${t(r.error)}`, 'error');
              else toast(t('✓ {n} notas de IMDb descargadas', { n: (r.rows || 0).toLocaleString(locale()) }));
              api('/imdb/status').then((st) => st && !st.error && setImdb(st));
            }}
          >
            {imdbBusy || imdb?.running ? t('Descargando…') : t('Descargar ahora')}
          </button>
          {imdb && (
            <span className="text-xs text-zinc-400">
              {imdb.rows > 0 && imdb.updatedAt
                ? t('{n} títulos guardados · {date}', { n: imdb.rows.toLocaleString(locale()), date: new Date(imdb.updatedAt).toLocaleString(locale()) })
                : t('nunca descargadas')}
            </span>
          )}
          {imdb?.error && <span className="text-xs text-red-400">✗ {imdb.error}</span>}
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">
          {t('La descarga son unos 8 MB comprimidos y tarda un par de minutos. El pase nocturno la repite sola una vez por semana, así que no hace falta que la lances a mano.')}
        </p>
      </section>

      <LetterboxdSection />

      {/* LOOK */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100 mb-1">{t('Aspecto')}</h2>
        <p className="text-xs text-zinc-500 mb-3 max-w-2xl">
          {t('Cambia el lenguaje visual de toda la app. Se aplica al instante y se guarda en el servidor, así que te sigue en cualquier navegador.')}
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {UI_THEMES.map((th) => (
            <button
              key={th.key}
              onClick={() => { setThemeState(applyTheme(th.key)); setS({ ...s, ui_theme: th.key }); }}
              className={`btn-ghost !py-2 text-left ${theme === th.key ? '!border-gold-400' : ''}`}
            >
              <span className={`block text-sm ${theme === th.key ? 'text-gold-400' : 'text-zinc-200'}`}>
                {theme === th.key ? '✓ ' : ''}{t(th.label)}
              </span>
              <span className="block text-[11px] text-zinc-500 mt-0.5">{t(th.hint)}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">
          {t('«Clásico» recupera la paleta y la tipografía anteriores al rediseño. Los iconos y la agrupación del menú son comunes a los dos.')}
        </p>
      </section>

      {/* IDIOMA DE LA INTERFAZ */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100 mb-1">{t('Idioma de la interfaz')} · Language</h2>
        <p className="text-xs text-zinc-500 mb-3 max-w-2xl">
          {t('Solo cambia los textos de PowaFlex. Los datos que llegan de TMDB (sinopsis, títulos traducidos) siguen el idioma de datos del servidor, que es un ajuste aparte.')}
        </p>
        <div className="flex gap-2">
          {[['es', 'Español'], ['en', 'English']].map(([k, label]) => (
            <button
              key={k}
              className={`btn-ghost !py-2 ${getLang() === k ? '!border-gold-400 text-gold-400' : ''}`}
              onClick={async () => {
                if (getLang() === k) return;
                // guardado directo y SOLO de esta clave: mandar el formulario
                // entero bloqueaba el cambio si había una URL a medio teclear
                // (400 del servidor) o persistía campos a medias en silencio
                const r = await api('/settings', { method: 'PUT', body: { ui_language: k } });
                if (r?.error) { toast(`⚠️ ${t(r.error)}`, 'error'); return; }
                setLang(k);
                // recarga completa: t() se resuelve al pintar y así TODA la
                // interfaz cambia de golpe, sin estados a medio traducir
                window.location.reload();
              }}
            >
              {getLang() === k ? '✓ ' : ''}{label}
            </button>
          ))}
        </div>
      </section>

      {/* RATINGS SOURCES */}
      {(() => {
        const ALL = [
          ['imdb', 'IMDb'], ['rt_critic', 'Rotten Tomatoes (crítica)'], ['rt_audience', 'Rotten Tomatoes (público)'],
          ['metacritic', 'Metacritic'], ['letterboxd', 'Letterboxd'], ['score', 'Nota combinada (Σ)'],
        ];
        const enabled = s.ratings_sources == null ? ALL.map(([k]) => k) : s.ratings_sources.split(',').filter(Boolean);
        const toggle = (k) => {
          const next = enabled.includes(k) ? enabled.filter((x) => x !== k) : [...enabled, k];
          setS({ ...s, ratings_sources: next.join(',') });
        };
        return (
          <section className="card p-5 mb-5">
            <h2 className="font-semibold text-zinc-100 mb-1">{t('Notas y puntuaciones que mostrar')}</h2>
            <p className="text-xs text-zinc-500 mb-3">
              {t('Elige de qué webs aparecen las notas en las fichas de película (necesita MDBList para tenerlas). Desmarca las que no te interesen.')}
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL.map(([k, label]) => (
                <label key={k} className={`btn-ghost !py-1.5 flex items-center gap-2 select-none cursor-pointer ${enabled.includes(k) ? '!border-gold-400 text-gold-400' : 'opacity-60'}`}>
                  <input type="checkbox" className="accent-gold-500" checked={enabled.includes(k)} onChange={() => toggle(k)} />
                  {t(label)}
                </label>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-ink-700">
              <label className="text-xs text-zinc-400">{t('Nota principal en las portadas (junto al título)')}</label>
              <select className="input mt-1 !w-auto" value={s.primary_rating || 'score'} onChange={set('primary_rating')}>
                <option value="score">{t('Nota combinada MDBList (Σ)')}</option>
                <option value="imdb">IMDb</option>
                <option value="letterboxd">Letterboxd</option>
              </select>
              <p className="text-[11px] text-zinc-500 mt-1">
                {t('Es la nota que aparece en la vista de portada pequeña. Si una película no tiene esa nota, se usa la primera disponible. Necesita MDBList sincronizado.')}
              </p>
            </div>
          </section>
        );
      })()}

      {/* CALENDAR */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100">{t('5 · Calendario de cine venidero')}</h2>
        <p className="text-xs text-zinc-500 mt-1 mb-3 max-w-2xl">
          {t('El calendario lo mandan ')}<b>{t('tus favoritos')}</b>
          {t(', cada uno en la faceta por la que le sigues: de un director/a se vigila lo que dirige, de un actor/actriz lo que interpreta. Si además quieres vigilar a los más presentes en tu biblioteca aunque no les sigas, sube estos números (0 = solo tus favoritos).')}
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400">{t('Extra: directores/as top de tu biblioteca')}</label>
            <input className="input mt-1" type="number" min="0" max="100" placeholder="0" value={s.cal_top_directors || ''} onChange={set('cal_top_directors')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400">{t('Extra: actores/actrices top de tu biblioteca')}</label>
            <input className="input mt-1" type="number" min="0" max="100" placeholder="0" value={s.cal_top_actors || ''} onChange={set('cal_top_actors')} />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-ink-700 flex flex-wrap items-center gap-3">
          <button
            className="btn-ghost"
            onClick={async () => {
              setLifeMsg(t('Consultando fechas de nacimiento/fallecimiento en TMDB…'));
              const r = await api('/people/life-sync', { method: 'POST' });
              setLifeMsg(r.error ? `✗ ${t(r.error)}` : t('✓ {a} personas actualizadas · {b} fallecidas detectadas', { a: r.done, b: r.deceased }));
            }}
          >
            {t('Actualizar estado vital (vivos/muertos)')}
          </button>
          {lifeMsg && <span className="text-xs text-zinc-400">{lifeMsg}</span>}
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">
          {t('Marca quién ha fallecido para no vigilar sus estrenos ni incluirlos en el auto-Radarr. En Favoritos puedes quitar de golpe a los fallecidos.')}
        </p>
      </section>

      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100">{t('6 · Descubrir huecos: umbral de ruido')}</h2>
        <p className="text-xs text-zinc-500 mt-1 mb-3 max-w-2xl">
          {t('Una película cuenta como hueco si llega al umbral de votos en TMDB ')}<b>{t('o')}</b>
          {t(' en Letterboxd (vía MDBList, donde la haya): en TMDB apenas vota nadie y el listón solo descartaba cine de verdad. Sube el umbral si los huecos te traen demasiada morralla; baja a 0 para el completismo absoluto.')}
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400">{t('Votos mínimos · huecos de directores/as')}</label>
            <input className="input mt-1" type="number" min="0" max="5000" placeholder="20" value={s.gaps_min_votes_director || ''} onChange={set('gaps_min_votes_director')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400">{t('Votos mínimos · huecos de actores/actrices')}</label>
            <input className="input mt-1" type="number" min="0" max="5000" placeholder="100" value={s.gaps_min_votes_actor || ''} onChange={set('gaps_min_votes_actor')} />
          </div>
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">
          {t('La nota mínima Σ y los filtros de cortos/documentales/TV/cameos se ajustan directamente en la página de Descubrir.')}
        </p>
      </section>

      <div className="flex gap-3 items-center mb-8">
        <button className="btn-gold" onClick={save}>{t('Guardar ajustes')}</button>
        {saved && <span className="text-emerald-400 text-sm">{t('✓ Guardado')}</span>}
      </div>


      {/* SYNC */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100 mb-2">{t('Sincronización con Plex')}</h2>
        <p className="text-xs text-zinc-500 mb-3">
          {t('La primera sincronización descarga los detalles de cada película (reparto completo, pistas de vídeo, HDR…): con ~12.000 películas puede tardar varios minutos. Después es incremental y además se ejecuta sola cada noche a las 03:30.')}
        </p>
        {sync?.running ? (
          <div>
            <div className="text-sm text-zinc-300 mb-2">
              {sync.phase === 'listing' && t('Listando biblioteca «{section}»… {n}', { section: sync.section || '', n: sync.done })}
              {sync.phase === 'details' && t('Detalles {a} / {b}', { a: sync.detailDone, b: sync.detailTotal })}
              {sync.phase === 'cleanup' && t('Limpiando eliminadas…')}
            </div>
            <ProgressBar pct={syncPct} />
          </div>
        ) : (
          <div className="flex gap-2 items-center flex-wrap">
            <button className="btn-gold" onClick={() => startSync(false)}>{t('Sincronizar ahora')}</button>
            <button className="btn-ghost" onClick={() => startSync(true)} title={t('Vuelve a descargar los detalles de todas las películas')}>
              {t('Re-sincronización completa')}
            </button>
            {sync?.phase === 'error' && <span className="text-red-400 text-sm">✗ {sync.error}</span>}
            {sync?.last?.status === 'ok' && (
              <span className="text-zinc-500 text-xs">
                {t('Última: {date}', { date: new Date(sync.last.finished_at).toLocaleString(locale()) })}
              </span>
            )}
          </div>
        )}
      </section>

      {/* HISTÓRICO DEL PASE NOCTURNO */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100 mb-1">{t('Histórico de actualizaciones (30 días)')}</h2>
        <p className="text-xs text-zinc-500 mb-3">
          {t('Cada pasada del cron nocturno o de «Actualizar todo», con lo que hizo cada paso. Se guarda paso a paso: si el contenedor se reinicia a mitad, aquí queda hasta dónde llegó.')}
        </p>
        {!historial ? (
          <p className="text-sm text-zinc-500">{t('Cargando…')}</p>
        ) : historial.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('Aún no hay pasadas registradas.')}</p>
        ) : (
          <div className="divide-y divide-ink-800 max-h-96 overflow-y-auto text-sm">
            {historial.map((r) => {
              const hechos = r.steps.filter((s) => s.state === 'done').length;
              const errores = r.steps.filter((s) => s.state === 'error');
              const min = Math.round(r.steps.reduce((n, s) => n + (s.ms || 0), 0) / 60000);
              return (
                <details key={r.id} className="py-1.5">
                  <summary className="cursor-pointer flex items-center gap-2 flex-wrap list-none">
                    <span className={errores.length ? 'text-red-400' : r.finished_at ? 'text-emerald-400' : 'text-orange-300'}>
                      {errores.length ? '✗' : r.finished_at ? '✓' : '⏸'}
                    </span>
                    <span className="text-zinc-200">{new Date(r.started_at).toLocaleString(locale())}</span>
                    <span className="badge-quiet">{r.trigger_kind === 'nightly' ? t('nocturna') : t('manual')}</span>
                    <span className="text-zinc-500 text-xs">
                      {hechos} ✓{errores.length > 0 && ` · ${errores.length} ✗ (${errores.map((s) => s.key).join(', ')})`}
                      {!r.finished_at && t(' · interrumpida')} · {min} min
                    </span>
                  </summary>
                  <div className="mt-1 pl-6 text-xs text-zinc-500 space-y-0.5">
                    {r.steps.filter((s) => s.state !== 'skipped').map((s) => (
                      <div key={s.key}>
                        <span className={s.state === 'error' ? 'text-red-400' : s.state === 'done' ? 'text-emerald-400' : 'text-orange-300'}>
                          {s.state === 'error' ? '✗' : s.state === 'done' ? '✓' : '…'}
                        </span>{' '}
                        {s.label}: {s.detail || '—'} <span className="text-zinc-600">({Math.round((s.ms || 0) / 1000)}s)</span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {/* COPIA DE SEGURIDAD */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100 mb-1">{t('Copia de seguridad')}</h2>
        <p className="text-xs text-zinc-500 mb-3">
          {t('Para reinstalar el contenedor sin empezar de cero. La base de datos lo incluye todo (biblioteca, notas, favoritos, ajustes…); el fichero de ajustes solo guarda la configuración (claves API, conexiones, umbrales) y se puede importar aquí mismo.')}
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <a className="btn-gold" href="/api/backup/database" download>
            {t('⬇ Descargar base de datos')}
          </a>
          <a className="btn-ghost" href="/api/backup/settings" download>
            {t('⬇ Exportar ajustes (.json)')}
          </a>
          <label className="btn-ghost cursor-pointer">
            {t('⬆ Importar ajustes')}
            <input type="file" accept="application/json,.json" className="hidden" onChange={importarAjustes} />
          </label>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2">
          {t('Ambos ficheros contienen tus claves API y token de Plex: guárdalos en un sitio seguro. Para restaurar la base de datos entera, copia el ')}
          <code>.db</code>{t(' como')}{' '}
          <code>powaflex.db</code>{t(' en la carpeta de datos del contenedor (parado) y arráncalo.')}
        </p>

        {/* copia automática al final del pase nocturno */}
        <div className="mt-4 pt-4 border-t border-ink-700">
          <label className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
            <input
              type="checkbox"
              className="accent-gold-500"
              checked={s.backup_auto === '1'}
              onChange={(e) => setS({ ...s, backup_auto: e.target.checked ? '1' : '0' })}
            />
            {t('Hacer una copia automática de la base de datos cada noche')}
          </label>
          <div className="flex flex-wrap items-center gap-2 mt-2 ml-6">
            <span className="text-xs text-zinc-400">{t('guardando las últimas')}</span>
            <input
              type="number"
              min="1"
              max="60"
              className="input !w-20 text-center"
              value={s.backup_keep ?? '7'}
              onChange={set('backup_keep')}
            />
            <span className="text-xs text-zinc-400">{t('copias')}</span>
            <button
              className="btn-ghost !py-1"
              disabled={copiaBusy}
              onClick={async () => {
                setCopiaBusy(true);
                const r = await api('/backup/run', { method: 'POST' });
                setCopiaBusy(false);
                if (r?.error) toast(`⚠️ ${t(r.error)}`, 'error');
                else toast(t('✓ Copia hecha: {file} ({mb} MB)', { file: r.file, mb: (r.bytes / 1048576).toFixed(1) }));
                cargarCopias();
              }}
            >
              {copiaBusy ? t('Copiando…') : t('Hacer una copia ahora')}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2 ml-6">
            {t('Se hace sola al final del pase nocturno, con la base ya al día, y va rotando: al pasar del número que pongas se borra la más vieja. Guarda ahí solo la base de datos; los ajustes se exportan aparte con el botón de arriba.')}
          </p>
          {copias?.length > 0 && (
            <div className="mt-3 ml-6 space-y-0.5 max-h-48 overflow-y-auto text-xs text-zinc-400">
              {copias.map((c) => (
                <div key={c.file} className="flex items-baseline gap-2">
                  <span className="truncate">{c.file}</span>
                  <span className="text-zinc-600">{new Date(c.at).toLocaleString(locale())}</span>
                  <span className="text-zinc-600 ml-auto shrink-0">{(c.bytes / 1048576).toFixed(1)} MB</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
