import { useEffect, useState } from 'react';
import { api, UI_THEMES, applyTheme, currentTheme } from '../api.js';
import { Spinner, ProgressBar, PageHeader } from '../components.jsx';
import { toast } from '../toast.js';

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

function TestBadge({ result }) {
  if (!result) return null;
  return result.ok ? (
    <span className="text-emerald-400 text-xs">✓ Conectado {result.name || result.version || ''}</span>
  ) : (
    <span className="text-red-400 text-xs">✗ {result.error}</span>
  );
}

export default function Settings() {
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

  const loadSections = () =>
    api('/plex/sections').then((r) => Array.isArray(r) && setSections(r)).catch(() => {});

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
  }, []);

  // poll sync status while running
  useEffect(() => {
    if (!sync?.running) return;
    const t = setInterval(() => api('/sync/status').then(setSync), 1500);
    return () => clearInterval(t);
  }, [sync?.running]);

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
    if (r.error && !r.started) { toast(`⚠️ ${r.error}`, 'error'); return; }
    setRefresh({ ...(refresh || {}), running: true, steps: [], step: 'Preparando…' });
  };

  const save = async () => {
    const r = await api('/settings', { method: 'PUT', body: s });
    // antes decía «✓ Guardado» pasara lo que pasara, incluso con el servidor caído
    if (r?.error) { toast(`⚠️ No se ha podido guardar: ${r.error}`, 'error'); return r; }
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

  const importarAjustes = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // que se pueda reelegir el mismo fichero
    if (!file) return;
    let body;
    try {
      body = JSON.parse(await file.text());
    } catch {
      toast('⚠️ El fichero no es un JSON válido', 'error');
      return;
    }
    const r = await api('/backup/settings', { method: 'POST', body });
    if (r.error) {
      toast(`⚠️ ${r.error}`, 'error');
      return;
    }
    toast(`✓ ${r.aplicadas} ajustes importados${r.ignoradas ? ` · ${r.ignoradas.length} ignorados` : ''}`);
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
      <PageHeader eyebrow="Cuenta" title="Ajustes" />

      {/* ACTUALIZAR TODO */}
      <section className="card-raised p-5 mb-6 border-l-4 !border-l-yellow-500 !bg-yellow-500/8">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-zinc-100">Actualizar todo</h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
              Una sola rutina con todo lo que PowaFlex necesita, en orden: biblioteca de Plex, emparejado de
              Letterboxd, títulos en otros idiomas, notas de MDBList, lo que ya tienes en Radarr, calendario, huecos
              de tus favoritos y sagas. Es exactamente lo mismo que se ejecuta solo cada noche. Lo que no tengas
              configurado se salta.
            </p>
          </div>
          <button className="btn-gold shrink-0" onClick={startFullRefresh} disabled={refresh?.running}>
            {refresh?.running ? 'Actualizando…' : '↻ Actualizar todo'}
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
                  {sync.phase === 'listing' && `Listando «${sync.section || ''}»… ${sync.done}`}
                  {sync.phase === 'details' && `Detalles ${sync.detailDone} / ${sync.detailTotal}`}
                  {sync.phase === 'cleanup' && 'Limpiando eliminadas…'}
                </div>
              </div>
            )}
          </div>
        )}

        {!refresh?.running && refresh?.finishedAt && (
          <p className={`text-xs mt-3 ${refresh.lastError ? 'text-red-400' : 'text-emerald-400'}`}>
            {refresh.lastError
              ? `Terminada con avisos: ${refresh.lastError}`
              : `✓ Todo actualizado · ${new Date(refresh.finishedAt).toLocaleString('es-ES')}`}
          </p>
        )}
        {!refresh?.running && !refresh?.finishedAt && refresh?.lastRun && (
          <p className="text-xs text-zinc-500 mt-3">
            Última actualización completa: {new Date(refresh.lastRun).toLocaleString('es-ES')}
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
            <label className="text-xs text-zinc-400">URL del servidor (con puerto)</label>
            <input className="input mt-1" placeholder="http://192.168.1.50:32400" value={s.plex_url || ''} onChange={set('plex_url')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400">X-Plex-Token</label>
            <input className="input mt-1" type="password" autoComplete="off" placeholder="Pega aquí tu token" value={s.plex_token || ''} onChange={set('plex_token')} />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost" onClick={() => test('plex')}>Probar conexión</button>
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
                Bibliotecas de películas a sincronizar
                <span className="text-zinc-600"> (las de series no aparecen: PowaFlex solo gestiona cine)</span>
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
                Guarda los ajustes y sincroniza: las películas de bibliotecas desmarcadas se retiran de
                PowaFlex en la siguiente sincronización (en Plex no se toca nada).
              </p>
            </div>
          );
        })()}
        <Guide title="¿Cómo consigo mi X-Plex-Token?">
          <p>1. Abre <b>app.plex.tv</b> en el navegador y entra en tu servidor.</p>
          <p>2. Abre cualquier película y pulsa en <b>⋯ → Obtener información → Ver XML</b>.</p>
          <p>3. Se abre una pestaña con XML: mira la URL, al final verás <b>X-Plex-Token=XXXXXXXX</b>. Copia ese valor.</p>
          <p>4. La URL del servidor es la IP local de tu N100 con el puerto 32400, p. ej. <b>http://192.168.1.50:32400</b>.</p>
        </Guide>
      </section>

      {/* TMDB */}
      <section className="card p-5 mb-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">2 · TMDB</h2>
          <TestBadge result={tests.tmdb} />
        </div>
        <div className="mt-3">
          <label className="text-xs text-zinc-400">API key (v3) o token de lectura (v4)</label>
          <input className="input mt-1" type="password" autoComplete="off" placeholder="Pega aquí tu API key de TMDB" value={s.tmdb_key || ''} onChange={set('tmdb_key')} />
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost" onClick={() => test('tmdb')}>Probar conexión</button>
        </div>
        <Guide title="¿Cómo consigo una API key de TMDB (gratis)?">
          <p>1. Crea cuenta en <b>themoviedb.org</b> (gratuita).</p>
          <p>2. Ve a <b>Ajustes → API → Crear → Developer</b>.</p>
          <p>3. Rellena el formulario (uso personal) y copia la <b>API Key (v3 auth)</b> o el <b>Token de acceso de lectura (v4)</b>. Ambos valen.</p>
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
            <label className="text-xs text-zinc-400">URL de Radarr</label>
            <input className="input mt-1" placeholder="http://192.168.1.50:7878" value={s.radarr_url || ''} onChange={set('radarr_url')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400">API key</label>
            <input className="input mt-1" type="password" autoComplete="off" placeholder="Radarr → Settings → General" value={s.radarr_key || ''} onChange={set('radarr_key')} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-zinc-400">Etiqueta para lo añadido desde PowaFlex</label>
            <input
              className="input mt-1"
              placeholder="PowaFlex"
              value={s.radarr_tag ?? 'PowaFlex'}
              onChange={set('radarr_tag')}
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Se crea en Radarr si no existe y se aplica a cada película añadida. Déjalo vacío para no etiquetar.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2 items-center flex-wrap">
          <button className="btn-ghost" onClick={() => test('radarr')}>Probar y cargar perfiles</button>
        </div>
        {radarrCtx && (
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-xs text-zinc-400">Perfil de calidad al añadir</label>
              <select className="input mt-1" value={s.radarr_quality_profile || ''} onChange={set('radarr_quality_profile')}>
                <option value="">— elige —</option>
                {radarrCtx.profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400">Carpeta raíz</label>
              <select className="input mt-1" value={s.radarr_root_folder || ''} onChange={set('radarr_root_folder')}>
                <option value="">— elige —</option>
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
              Sincronizar lo ya añadido a Radarr
            </button>
            {radarrSync?.busy && <span className="text-xs text-zinc-400">Sincronizando…</span>}
            {radarrSync?.error && <span className="text-xs text-red-400">✗ {radarrSync.error}</span>}
            {radarrSync?.count != null && !radarrSync.busy && (
              <span className="text-xs text-zinc-400">
                {radarrSync.count.toLocaleString('es-ES')} películas en Radarr
                {radarrSync.syncedAt ? ` · ${new Date(radarrSync.syncedAt).toLocaleString('es-ES')}` : ''}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Guarda un listado local de lo que ya tienes en Radarr para que las fichas muestren el recuadro verde
            «✓ en Radarr» en vez de intentar añadirlo y fallar con «ya existe».
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
            Lanzar a Radarr automáticamente cada noche los estrenos de mis directores/as favoritos/as vivos
          </label>
          <div className="flex flex-wrap items-center gap-2 mt-2 ml-6">
            <span className="text-xs text-zinc-400">de los próximos</span>
            <input
              type="number"
              min="1"
              max="24"
              className="input !w-20 text-center"
              value={s.auto_radarr_months ?? '6'}
              onChange={set('auto_radarr_months')}
            />
            <span className="text-xs text-zinc-400">meses, mirando también</span>
            <input
              type="number"
              min="0"
              max="365"
              className="input !w-20 text-center"
              value={s.auto_radarr_lookback_days ?? '0'}
              onChange={set('auto_radarr_lookback_days')}
              title="TMDB a veces pone fecha a las películas pequeñas después del estreno; con 0 esas se pierden"
            />
            <span className="text-xs text-zinc-400">días hacia atrás</span>
            <button
              className="btn-ghost !py-1"
              onClick={async () => {
                await save();
                setAuto({ ...auto, running: true });
                const r = await api('/radarr/auto/run', { method: 'POST', body: { months: Number(s.auto_radarr_months || 6), dryRun: true } });
                setAuto({ ...r, preview: true });
              }}
            >
              Previsualizar
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
              Ejecutar ahora
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer mt-2 ml-6">
            <input
              type="checkbox"
              className="accent-gold-500"
              checked={s.auto_radarr_include_docs === '1'}
              onChange={(e) => setS({ ...s, auto_radarr_include_docs: e.target.checked ? '1' : '0' })}
            />
            Incluir documentales (por defecto, cortos, documentales y películas de TV se descartan)
          </label>
          {auto && (auto.considered != null || auto.added != null) && (
            <div className="ml-6 mt-2 text-xs text-zinc-400">
              {auto.preview
                ? `${auto.considered} estrenos entrarían en Radarr`
                : `✓ ${auto.added} añadidas de ${auto.considered} candidatas`}
              {auto.error && <span className="text-red-400"> · {auto.error}</span>}
              {auto.log?.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer hover:text-zinc-200">ver detalle</summary>
                  <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                    {auto.log.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </details>
              )}
            </div>
          )}
          <p className="text-[11px] text-zinc-500 mt-2 ml-6">
            Solo directores/as <b>vivos</b> marcados como favoritos. Los fallecidos se ignoran (no tendrán estrenos).
          </p>
        </div>

        <Guide title="¿Dónde está la API key de Radarr?">
          <p>En Radarr: <b>Settings → General → Security → API Key</b>. La URL es la misma con la que abres Radarr en el navegador, típicamente el puerto <b>7878</b>.</p>
          <p>Tras probar la conexión, elige el <b>perfil de calidad</b> y la <b>carpeta raíz</b> que usará PowaFlex al añadir películas.</p>
        </Guide>
      </section>

      {/* MDBLIST */}
      <section className="card p-5 mb-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">4 · MDBList <span className="text-zinc-500 text-xs font-normal">(opcional: notas multi-plataforma y listas)</span></h2>
          <TestBadge result={tests.mdblist} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-zinc-400">API key</label>
            <input className="input mt-1" type="password" autoComplete="off" placeholder="mdblist.com → Preferences → API Access" value={s.mdblist_key || ''} onChange={set('mdblist_key')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Tipo de cuenta</label>
            <select className="input mt-1" value={s.mdblist_tier || 'auto'} onChange={set('mdblist_tier')}>
              <option value="auto">Detectar automáticamente</option>
              <option value="free">Gratuita (1.000 peticiones/día)</option>
              <option value="supporter">Supporter (25.000/día)</option>
            </select>
            <p className="text-[11px] text-zinc-500 mt-1">
              Define cuántas notas se refrescan al día: con cuenta gratuita el llenado inicial se reparte en
              varios días; con Supporter cabe la biblioteca entera de una tanda.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2 items-center flex-wrap">
          <button className="btn-ghost" onClick={() => test('mdblist')}>Probar conexión</button>
          {tests.mdblist?.ok && tests.mdblist.limit != null && (
            <span className="text-xs text-zinc-400">
              Límite {Number(tests.mdblist.limit).toLocaleString('es-ES')}/día
              {tests.mdblist.usedToday != null && ` · usadas hoy ${tests.mdblist.usedToday}`}
            </span>
          )}
          <button
            className="btn-gold"
            onClick={async () => {
              await save();
              await api('/mdblist/sync', { method: 'POST' });
              const poll = setInterval(async () => {
                const st = await api('/mdblist/status');
                setMdbStatus(st);
                if (!st.running) clearInterval(poll);
              }, 2000);
            }}
          >
            Sincronizar notas ahora
          </button>
          {mdbStatus && (
            <span className="text-xs text-zinc-400">
              {mdbStatus.running
                ? `Notas ${mdbStatus.done} / ${mdbStatus.total}…`
                : mdbStatus.error
                  ? `✗ ${mdbStatus.error}`
                  : `${mdbStatus.withRatings?.toLocaleString('es-ES')} de ${mdbStatus.total?.toLocaleString('es-ES')} películas con notas`}
            </span>
          )}
        </div>
        <Guide title="¿Cómo consigo la API key de MDBList?">
          <p>1. Cuenta en <b>mdblist.com</b> (puedes entrar con Trakt).</p>
          <p>2. Ve a <b>Preferences → API Access</b> y copia la key.</p>
          <p>3. La cuenta gratuita da 1.000 peticiones/día; las Supporter, bastantes más. PowaFlex respeta el límite y reparte el trabajo.</p>
        </Guide>
      </section>

      {/* LOOK */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100 mb-1">Aspecto</h2>
        <p className="text-xs text-zinc-500 mb-3 max-w-2xl">
          Cambia el lenguaje visual de toda la app. Se aplica al instante y se guarda en el servidor, así que te sigue
          en cualquier navegador.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {UI_THEMES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setThemeState(applyTheme(t.key)); setS({ ...s, ui_theme: t.key }); }}
              className={`btn-ghost !py-2 text-left ${theme === t.key ? '!border-gold-400' : ''}`}
            >
              <span className={`block text-sm ${theme === t.key ? 'text-gold-400' : 'text-zinc-200'}`}>
                {theme === t.key ? '✓ ' : ''}{t.label}
              </span>
              <span className="block text-[11px] text-zinc-500 mt-0.5">{t.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">
          «Clásico» recupera la paleta y la tipografía anteriores al rediseño. Los iconos y la agrupación del menú son
          comunes a los dos.
        </p>
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
            <h2 className="font-semibold text-zinc-100 mb-1">Notas y puntuaciones que mostrar</h2>
            <p className="text-xs text-zinc-500 mb-3">
              Elige de qué webs aparecen las notas en las fichas de película (necesita MDBList para tenerlas). Desmarca las que no te interesen.
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL.map(([k, label]) => (
                <label key={k} className={`btn-ghost !py-1.5 flex items-center gap-2 select-none cursor-pointer ${enabled.includes(k) ? '!border-gold-400 text-gold-400' : 'opacity-60'}`}>
                  <input type="checkbox" className="accent-gold-500" checked={enabled.includes(k)} onChange={() => toggle(k)} />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-ink-700">
              <label className="text-xs text-zinc-400">Nota principal en las portadas (junto al título)</label>
              <select className="input mt-1 !w-auto" value={s.primary_rating || 'score'} onChange={set('primary_rating')}>
                <option value="score">Nota combinada MDBList (Σ)</option>
                <option value="imdb">IMDb</option>
                <option value="letterboxd">Letterboxd</option>
              </select>
              <p className="text-[11px] text-zinc-500 mt-1">
                Es la nota que aparece en la vista de portada pequeña. Si una película no tiene esa nota, se usa la
                primera disponible. Necesita MDBList sincronizado.
              </p>
            </div>
          </section>
        );
      })()}

      {/* CALENDAR */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100">5 · Calendario de cine venidero</h2>
        <p className="text-xs text-zinc-500 mt-1 mb-3 max-w-2xl">
          El calendario lo mandan <b>tus favoritos</b>, cada uno en la faceta por la que le sigues: de un director/a
          se vigila lo que dirige, de un actor/actriz lo que interpreta. Si además quieres vigilar a los más
          presentes en tu biblioteca aunque no les sigas, sube estos números (0 = solo tus favoritos).
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400">Extra: directores/as top de tu biblioteca</label>
            <input className="input mt-1" type="number" min="0" max="100" placeholder="0" value={s.cal_top_directors || ''} onChange={set('cal_top_directors')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Extra: actores/actrices top de tu biblioteca</label>
            <input className="input mt-1" type="number" min="0" max="100" placeholder="0" value={s.cal_top_actors || ''} onChange={set('cal_top_actors')} />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-ink-700 flex flex-wrap items-center gap-3">
          <button
            className="btn-ghost"
            onClick={async () => {
              setLifeMsg('Consultando fechas de nacimiento/fallecimiento en TMDB…');
              const r = await api('/people/life-sync', { method: 'POST' });
              setLifeMsg(r.error ? `✗ ${r.error}` : `✓ ${r.done} personas actualizadas · ${r.deceased} fallecidas detectadas`);
            }}
          >
            Actualizar estado vital (vivos/muertos)
          </button>
          {lifeMsg && <span className="text-xs text-zinc-400">{lifeMsg}</span>}
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">
          Marca quién ha fallecido para no vigilar sus estrenos ni incluirlos en el auto-Radarr. En Favoritos puedes
          quitar de golpe a los fallecidos.
        </p>
      </section>

      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100">6 · Descubrir huecos: umbral de ruido</h2>
        <p className="text-xs text-zinc-500 mt-1 mb-3 max-w-2xl">
          Una película cuenta como hueco si llega al umbral de votos en TMDB <b>o</b> en Letterboxd (vía
          MDBList, donde la haya): en TMDB apenas vota nadie y el listón solo descartaba cine de verdad.
          Sube el umbral si los huecos te traen demasiada morralla; baja a 0 para el completismo absoluto.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400">Votos mínimos · huecos de directores/as</label>
            <input className="input mt-1" type="number" min="0" max="5000" placeholder="20" value={s.gaps_min_votes_director || ''} onChange={set('gaps_min_votes_director')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Votos mínimos · huecos de actores/actrices</label>
            <input className="input mt-1" type="number" min="0" max="5000" placeholder="100" value={s.gaps_min_votes_actor || ''} onChange={set('gaps_min_votes_actor')} />
          </div>
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">
          La nota mínima Σ y los filtros de cortos/documentales/TV/cameos se ajustan directamente en la página de Descubrir.
        </p>
      </section>

      <div className="flex gap-3 items-center mb-8">
        <button className="btn-gold" onClick={save}>Guardar ajustes</button>
        {saved && <span className="text-emerald-400 text-sm">✓ Guardado</span>}
      </div>


      {/* SYNC */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100 mb-2">Sincronización con Plex</h2>
        <p className="text-xs text-zinc-500 mb-3">
          La primera sincronización descarga los detalles de cada película (reparto completo, pistas de vídeo, HDR…):
          con ~12.000 películas puede tardar varios minutos. Después es incremental y además se ejecuta sola cada
          noche a las 03:30.
        </p>
        {sync?.running ? (
          <div>
            <div className="text-sm text-zinc-300 mb-2">
              {sync.phase === 'listing' && `Listando biblioteca «${sync.section || ''}»… ${sync.done}`}
              {sync.phase === 'details' && `Detalles ${sync.detailDone} / ${sync.detailTotal}`}
              {sync.phase === 'cleanup' && 'Limpiando eliminadas…'}
            </div>
            <ProgressBar pct={syncPct} />
          </div>
        ) : (
          <div className="flex gap-2 items-center flex-wrap">
            <button className="btn-gold" onClick={() => startSync(false)}>Sincronizar ahora</button>
            <button className="btn-ghost" onClick={() => startSync(true)} title="Vuelve a descargar los detalles de todas las películas">
              Re-sincronización completa
            </button>
            {sync?.phase === 'error' && <span className="text-red-400 text-sm">✗ {sync.error}</span>}
            {sync?.last?.status === 'ok' && (
              <span className="text-zinc-500 text-xs">
                Última: {new Date(sync.last.finished_at).toLocaleString('es-ES')}
              </span>
            )}
          </div>
        )}
      </section>

      {/* COPIA DE SEGURIDAD */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-zinc-100 mb-1">Copia de seguridad</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Para reinstalar el contenedor sin empezar de cero. La base de datos lo incluye todo
          (biblioteca, notas, favoritos, ajustes…); el fichero de ajustes solo guarda la
          configuración (claves API, conexiones, umbrales) y se puede importar aquí mismo.
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <a className="btn-gold" href="/api/backup/database" download>
            ⬇ Descargar base de datos
          </a>
          <a className="btn-ghost" href="/api/backup/settings" download>
            ⬇ Exportar ajustes (.json)
          </a>
          <label className="btn-ghost cursor-pointer">
            ⬆ Importar ajustes
            <input type="file" accept="application/json,.json" className="hidden" onChange={importarAjustes} />
          </label>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2">
          Ambos ficheros contienen tus claves API y token de Plex: guárdalos en un sitio seguro.
          Para restaurar la base de datos entera, copia el <code>.db</code> como{' '}
          <code>powaflex.db</code> en la carpeta de datos del contenedor (parado) y arráncalo.
        </p>
      </section>
    </div>
  );
}
