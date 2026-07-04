import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Spinner, ProgressBar } from '../components.jsx';

function Guide({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 text-sm">
      <button type="button" onClick={() => setOpen(!open)} className="text-gold-400 hover:underline text-xs">
        {open ? '▾' : '▸'} {title}
      </button>
      {open && <div className="mt-2 text-slate-400 text-xs leading-relaxed space-y-1">{children}</div>}
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
  }, []);

  // poll sync status while running
  useEffect(() => {
    if (!sync?.running) return;
    const t = setInterval(() => api('/sync/status').then(setSync), 1500);
    return () => clearInterval(t);
  }, [sync?.running]);

  const save = async () => {
    await api('/settings', { method: 'PUT', body: s });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Ajustes</h1>

      {/* PLEX */}
      <section className="card p-5 mb-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-100">1 · Plex</h2>
          <TestBadge result={tests.plex} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-slate-400">URL del servidor (con puerto)</label>
            <input className="input mt-1" placeholder="http://192.168.1.50:32400" value={s.plex_url || ''} onChange={set('plex_url')} />
          </div>
          <div>
            <label className="text-xs text-slate-400">X-Plex-Token</label>
            <input className="input mt-1" placeholder="Pega aquí tu token" value={s.plex_token || ''} onChange={set('plex_token')} />
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
              <div className="text-xs text-slate-400 mb-2">
                Bibliotecas de películas a sincronizar
                <span className="text-slate-600"> (las de series no aparecen: PowaFlex solo gestiona cine)</span>
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
                      className="accent-[#e8b53a]"
                      checked={isChecked(sec.id)}
                      onChange={() => toggleSection(sec.id)}
                    />
                    {sec.title}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
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
          <h2 className="font-semibold text-slate-100">2 · TMDB</h2>
          <TestBadge result={tests.tmdb} />
        </div>
        <div className="mt-3">
          <label className="text-xs text-slate-400">API key (v3) o token de lectura (v4)</label>
          <input className="input mt-1" placeholder="Pega aquí tu API key de TMDB" value={s.tmdb_key || ''} onChange={set('tmdb_key')} />
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
          <h2 className="font-semibold text-slate-100">3 · Radarr</h2>
          <TestBadge result={tests.radarr} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-slate-400">URL de Radarr</label>
            <input className="input mt-1" placeholder="http://192.168.1.50:7878" value={s.radarr_url || ''} onChange={set('radarr_url')} />
          </div>
          <div>
            <label className="text-xs text-slate-400">API key</label>
            <input className="input mt-1" placeholder="Radarr → Settings → General" value={s.radarr_key || ''} onChange={set('radarr_key')} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-slate-400">Etiqueta para lo añadido desde PowaFlex</label>
            <input
              className="input mt-1"
              placeholder="PowaFlex"
              value={s.radarr_tag ?? 'PowaFlex'}
              onChange={set('radarr_tag')}
            />
            <p className="text-[11px] text-slate-500 mt-1">
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
              <label className="text-xs text-slate-400">Perfil de calidad al añadir</label>
              <select className="input mt-1" value={s.radarr_quality_profile || ''} onChange={set('radarr_quality_profile')}>
                <option value="">— elige —</option>
                {radarrCtx.profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">Carpeta raíz</label>
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
            {radarrSync?.busy && <span className="text-xs text-slate-400">Sincronizando…</span>}
            {radarrSync?.error && <span className="text-xs text-red-400">✗ {radarrSync.error}</span>}
            {radarrSync?.count != null && !radarrSync.busy && (
              <span className="text-xs text-slate-400">
                {radarrSync.count.toLocaleString('es-ES')} películas en Radarr
                {radarrSync.syncedAt ? ` · ${new Date(radarrSync.syncedAt).toLocaleString('es-ES')}` : ''}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Guarda un listado local de lo que ya tienes en Radarr para que las fichas muestren el recuadro verde
            «✓ en Radarr» en vez de intentar añadirlo y fallar con «ya existe».
          </p>
        </div>

        {/* daily auto-add for living favorite directors (#3) */}
        <div className="mt-4 pt-4 border-t border-ink-700">
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#e8b53a]"
              checked={s.auto_radarr_enabled === '1'}
              onChange={(e) => setS({ ...s, auto_radarr_enabled: e.target.checked ? '1' : '0' })}
            />
            Lanzar a Radarr automáticamente cada noche los estrenos de mis directores favoritos vivos
          </label>
          <div className="flex flex-wrap items-center gap-2 mt-2 ml-6">
            <span className="text-xs text-slate-400">de los próximos</span>
            <input
              type="number"
              min="1"
              max="24"
              className="input !w-20 text-center"
              value={s.auto_radarr_months ?? '6'}
              onChange={set('auto_radarr_months')}
            />
            <span className="text-xs text-slate-400">meses</span>
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
          {auto && (auto.considered != null || auto.added != null) && (
            <div className="ml-6 mt-2 text-xs text-slate-400">
              {auto.preview
                ? `${auto.considered} estrenos entrarían en Radarr`
                : `✓ ${auto.added} añadidas de ${auto.considered} candidatas`}
              {auto.error && <span className="text-red-400"> · {auto.error}</span>}
              {auto.log?.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer hover:text-slate-200">ver detalle</summary>
                  <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                    {auto.log.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </details>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-2 ml-6">
            Solo directores <b>vivos</b> marcados como favoritos. Los fallecidos se ignoran (no tendrán estrenos).
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
          <h2 className="font-semibold text-slate-100">4 · MDBList <span className="text-slate-500 text-xs font-normal">(opcional: notas multi-plataforma y listas)</span></h2>
          <TestBadge result={tests.mdblist} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-slate-400">API key</label>
            <input className="input mt-1" placeholder="mdblist.com → Preferences → API Access" value={s.mdblist_key || ''} onChange={set('mdblist_key')} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Tipo de cuenta</label>
            <select className="input mt-1" value={s.mdblist_tier || 'auto'} onChange={set('mdblist_tier')}>
              <option value="auto">Detectar automáticamente</option>
              <option value="free">Gratuita (1.000 peticiones/día)</option>
              <option value="supporter">Supporter (25.000/día)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Define cuántas notas se refrescan al día: con cuenta gratuita el llenado inicial se reparte en
              varios días; con Supporter cabe la biblioteca entera de una tanda.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2 items-center flex-wrap">
          <button className="btn-ghost" onClick={() => test('mdblist')}>Probar conexión</button>
          {tests.mdblist?.ok && tests.mdblist.limit != null && (
            <span className="text-xs text-slate-400">
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
            <span className="text-xs text-slate-400">
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
            <h2 className="font-semibold text-slate-100 mb-1">Notas y puntuaciones que mostrar</h2>
            <p className="text-xs text-slate-500 mb-3">
              Elige de qué webs aparecen las notas en las fichas de película (necesita MDBList para tenerlas). Desmarca las que no te interesen.
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL.map(([k, label]) => (
                <label key={k} className={`btn-ghost !py-1.5 flex items-center gap-2 select-none cursor-pointer ${enabled.includes(k) ? '!border-gold-400 text-gold-400' : 'opacity-60'}`}>
                  <input type="checkbox" className="accent-[#e8b53a]" checked={enabled.includes(k)} onChange={() => toggle(k)} />
                  {label}
                </label>
              ))}
            </div>
          </section>
        );
      })()}

      {/* CALENDAR */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-slate-100">5 · Calendario de cine venidero</h2>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-slate-400">Nº de directores top a vigilar</label>
            <input className="input mt-1" type="number" min="5" max="100" placeholder="25" value={s.cal_top_directors || ''} onChange={set('cal_top_directors')} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Nº de actores top a vigilar</label>
            <input className="input mt-1" type="number" min="0" max="100" placeholder="15" value={s.cal_top_actors || ''} onChange={set('cal_top_actors')} />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Además, cualquier persona que marques con «☆ Seguir» en su ficha entra siempre en el calendario.
        </p>
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
          {lifeMsg && <span className="text-xs text-slate-400">{lifeMsg}</span>}
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Marca quién ha fallecido para no vigilar sus estrenos ni incluirlos en el auto-Radarr. En Favoritos puedes
          quitar de golpe a los fallecidos.
        </p>
      </section>

      <div className="flex gap-3 items-center mb-8">
        <button className="btn-gold" onClick={save}>Guardar ajustes</button>
        {saved && <span className="text-emerald-400 text-sm">✓ Guardado</span>}
      </div>

      {/* SYNC */}
      <section className="card p-5 mb-5">
        <h2 className="font-semibold text-slate-100 mb-2">Sincronización con Plex</h2>
        <p className="text-xs text-slate-500 mb-3">
          La primera sincronización descarga los detalles de cada película (reparto completo, pistas de vídeo, HDR…):
          con ~12.000 películas puede tardar varios minutos. Después es incremental y además se ejecuta sola cada
          noche a las 03:30.
        </p>
        {sync?.running ? (
          <div>
            <div className="text-sm text-slate-300 mb-2">
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
              <span className="text-slate-500 text-xs">
                Última: {new Date(sync.last.finished_at).toLocaleString('es-ES')}
              </span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
