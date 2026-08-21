import { db, getSetting, setSetting } from './db.js';
import { runSync, syncStatus } from './plex.js';
import { rematchLetterboxd, resolveUnmatchedLb, importLetterboxdRss } from './letterboxd.js';
import { getCalendarCached, enrichPeopleLife, normalizeLibraryTitles, normalizePeopleNames, syncPersonChanges, invalidarFilmografiasSeguidas } from './tmdb.js';
import { syncRatings } from './mdblist.js';
import { radarrSyncMovies, checkDigitalReleases } from './radarr.js';
import { runRadarrRules, hayReglasActivas } from './rules.js';
import { scanSagas } from './saga.js';
import { favoritesGaps } from './discover.js';
import { watchFestivalEditions } from './festivals.js';
import { detectarEmergentes, emergentesNecesitaRefresco } from './emergentes.js';
import { importImdbRatings, imdbNecesitaRefresco } from './imdb.js';
import { hacerCopia, copiasActivadas } from './backup.js';

/**
 * The whole "make PowaFlex current" routine, in dependency order: library first,
 * then everything that reads from it. One implementation shared by the nightly
 * cron and the "Actualizar todo" button, so they can never drift apart.
 *
 * Every step is optional and self-contained: a step whose integration is not
 * configured is skipped, and a step that throws is recorded and does not stop
 * the rest (a TMDB hiccup must not cost you the Radarr snapshot).
 */
export const refreshStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  step: null,
  stepIndex: 0,
  totalSteps: 0,
  steps: [], // { key, label, state: 'pending'|'running'|'done'|'skipped'|'error', detail, ms }
  // NOT called `error`: the API convention is that a top-level `error` means the
  // request itself failed, and clients discard such payloads
  lastError: null,
  trigger: null, // 'manual' | 'nightly'
};

const has = (...keys) => keys.every((k) => !!getSetting(k));

function buildSteps({ includeAutoRadarr }) {
  return [
    {
      key: 'plex',
      label: 'Sincronizar la biblioteca de Plex',
      enabled: () => has('plex_url', 'plex_token'),
      run: async () => {
        const r = await runSync(); // resolves to syncStatus
        if (r?.error) throw new Error(r.error);
        return `${r?.done ?? 0} películas · ${Number(getSetting('last_sync_added') || 0)} nuevas`;
      },
    },
    {
      // justo después de Plex: la sincronización reescribe `title` con lo que
      // diga su agente, así que hay que volver a normalizar cada vez
      key: 'titles',
      label: 'Normalizar títulos y nombres al alfabeto latino',
      enabled: () => has('tmdb_key'),
      run: async () => {
        const t = await normalizeLibraryTitles();
        const n = await normalizePeopleNames();
        const bits = [];
        if (t.renamed) bits.push(`${t.renamed} de ${t.checked} títulos`);
        if (n.renamed) bits.push(`${n.renamed} de ${n.checked} nombres`);
        return bits.length ? `${bits.join(' · ')} traducidos` : 'nada que traducir';
      },
    },
    {
      key: 'rematch',
      label: 'Reemparejar Letterboxd con la biblioteca',
      enabled: () => true,
      run: async () => `${(await rematchLetterboxd()).rematched} reemparejadas`,
    },
    {
      key: 'resolve',
      label: 'Resolver títulos en otros idiomas (TMDB)',
      enabled: () => has('tmdb_key'),
      run: async () => {
        const r = await resolveUnmatchedLb();
        const bits = [`${r.matched} emparejadas`];
        if (r.library?.resolved) bits.push(`${r.library.resolved} fichas TMDB nuevas`);
        if (r.englishPending) bits.push(`${r.englishPending} títulos en inglés en segundo plano`);
        return bits.join(' · ');
      },
    },
    {
      key: 'rss',
      label: 'Importar visionados recientes de Letterboxd',
      enabled: () => !!getSetting('letterboxd_rss'),
      run: async () => {
        const r = await importLetterboxdRss(getSetting('letterboxd_rss'));
        return `${r?.imported ?? 0} importadas`;
      },
    },
    {
      key: 'life',
      label: 'Actualizar estado vital de tus favoritos',
      enabled: () => has('tmdb_key'),
      run: async () => {
        const ids = db.prepare('SELECT person_id FROM tracked_people').all().map((r) => r.person_id);
        if (!ids.length) return 'sin favoritos';
        const r = await enrichPeopleLife(ids);
        return `${r?.done ?? ids.length} revisados · ${r?.deceased ?? 0} fallecidos/as`;
      },
    },
    {
      key: 'ratings',
      label: 'Descargar notas de MDBList',
      enabled: () => has('mdblist_key'),
      run: async () => {
        const r = await syncRatings(); // resolves to mdbSyncStatus
        if (r?.error) throw new Error(r.error);
        return `${r?.done ?? 0} de ${r?.total ?? 0} películas con nota`;
      },
    },
    {
      key: 'imdb',
      label: 'Notas de IMDb (semanal)',
      // 8 MB en streaming; solo cuando toca, no cada noche
      enabled: () => imdbNecesitaRefresco(),
      // Este paso no tiene NADA que configurar: si se salta es porque el
      // volcado semanal ya está fresco. El «sin configurar» genérico aquí
      // mentía, y se leía como una integración a medias (preguntado por Ramón
      // con la captura delante).
      skipNote: () => {
        const at = Number(getSetting('imdb_ratings_at') || 0);
        const dias = Math.max(0, Math.floor((Date.now() - at) / (24 * 3600 * 1000)));
        return `al día: volcado hace ${dias === 1 ? '1 día' : `${dias} días`}, se refresca cada 7`;
      },
      run: async () => {
        const r = await importImdbRatings();
        if (r.running) return 'ya había una importación en marcha';
        return `${(r.rows || 0).toLocaleString('es-ES')} títulos`;
      },
    },
    {
      key: 'radarr',
      label: 'Refrescar lo que ya tienes en Radarr',
      enabled: () => has('radarr_url', 'radarr_key'),
      run: async () => `${(await radarrSyncMovies())?.count ?? 0} películas en Radarr`,
    },
    {
      // detrás del refresco de Radarr: trabaja sobre la lista de pedidas viva
      key: 'digital',
      label: 'Vigilar estrenos digitales de las pedidas',
      enabled: () => has('radarr_url', 'radarr_key', 'tmdb_key'),
      run: async () => {
        const r = await checkDigitalReleases();
        return `${r.wanted} pedidas revisadas · ${r.nuevas} recién en digital`;
      },
    },
    {
      key: 'festivalWatch',
      label: 'Vigilar ediciones nuevas de festivales',
      enabled: () => has('tmdb_key'),
      run: async () => {
        const r = await watchFestivalEditions();
        return r.checked ? `${r.checked} ediciones comprobadas · ${r.found} publicadas` : 'todo visto ya';
      },
    },
    {
      // Justo detrás de la vigía: las ediciones que acaba de mirar son
      // exactamente las que lee el detector, y a esta altura de la noche están
      // en caché. Semanal, no cada noche: un festival no descubre a nadie
      // nuevo entre el martes y el miércoles, y la pasada resuelve decenas de
      // personas contra TMDB.
      key: 'emergentes',
      label: 'Detectar directores emergentes (semanal)',
      enabled: () => has('tmdb_key') && emergentesNecesitaRefresco(),
      // dos motivos de salto distintos: sin clave de TMDB es configuración;
      // con clave, es que la detección semanal ya está fresca
      skipNote: () =>
        has('tmdb_key') ? 'al día: se rehace una vez por semana' : 'sin configurar',
      run: async () => {
        const r = await detectarEmergentes();
        if (r.error) throw new Error(r.error);
        const bits = [`${r.elegidos} emergentes de ${r.candidatos} nombres`];
        // un tope silencioso se lee como «no había nadie más»
        if (r.saltados) bits.push(`${r.saltados} sin mirar por el tope de la pasada`);
        return bits.join(' · ');
      },
    },
    {
      // antes del calendario y los huecos: invalida las filmografías de quien
      // cambió en TMDB para que esos pasos re-pidan SOLO lo que toca
      key: 'personChanges',
      label: 'Detectar filmografías cambiadas en TMDB',
      enabled: () => has('tmdb_key'),
      run: async () => {
        // A TUS FAVORITOS se les tira la filmografía SIEMPRE, sin mirar el feed
        // de cambios: es lo único que garantiza que un estreno recién metido en
        // TMDB aparezca al día siguiente en su ficha y en Cine venidero. El feed
        // se sigue usando para el resto de la biblioteca, que son miles.
        const míos = invalidarFilmografiasSeguidas();
        const r = await syncPersonChanges();
        return `${míos.seguidos} favoritos a releer · ${r.changed} cambios en TMDB · ${r.invalidated} fichas más a refrescar`;
      },
    },
    {
      key: 'calendar',
      label: 'Reconstruir el calendario de cine venidero',
      enabled: () => has('tmdb_key'),
      run: async () => `${(await getCalendarCached({ refresh: true }))?.events?.length ?? 0} estrenos`,
    },
    {
      key: 'gaps',
      label: 'Recalcular los huecos de tus favoritos',
      enabled: () => has('tmdb_key'),
      run: async () => {
        const r = await favoritesGaps({ refresh: true });
        const total = (r.people || []).reduce((n, p) => n + (p.missingTotal || 0), 0);
        return `${r.people?.length ?? 0} favoritos · ${total} huecos`;
      },
    },
    {
      key: 'sagas',
      label: 'Avanzar el escaneo de sagas',
      enabled: () => has('tmdb_key'),
      run: async () => `${(await scanSagas({ budget: 800 }))?.scanned ?? 0} analizadas`,
    },
    {
      // Va detrás de festivalWatch, del calendario y de los huecos a propósito:
      // las reglas de festival leen las mismas páginas ya cacheadas por esos
      // pasos, así que a esta altura de la noche no cuestan casi nada.
      key: 'autoradarr',
      label: 'Aplicar las reglas automáticas de Radarr',
      enabled: () => includeAutoRadarr && has('radarr_url', 'radarr_key') && hayReglasActivas(),
      run: async () => {
        const r = await runRadarrRules();
        // una pasada que revienta entera NO puede quedar registrada como paso
        // correcto con un «0 añadidas de 0 candidatas»: eso se lee como «no
        // había nada nuevo» y es justo lo contrario
        if (r.error) throw new Error(r.error);
        const conError = r.rules.filter((x) => x.error);
        const resumen = `${r.added} añadidas de ${r.considered} candidatas · ${r.rules.length} regla(s)`;
        const bits = [resumen];
        // sin esto la cuarentena era invisible desde el histórico: una noche
        // que aparta diez películas se leía igual que una noche sin novedad
        if (r.cuarentena) bits.push(`${r.cuarentena} en cuarentena, esperan tu ✓`);
        if (conError.length) bits.push(`${conError.length} con error`);
        if (r.aviso) bits.push(r.aviso);
        if (conError.length) throw new Error(bits.join(' · '));
        return bits.join(' · ');
      },
    },
    {
      key: 'backup',
      label: 'Copia de seguridad de la base',
      enabled: () => copiasActivadas(),
      // va la última a propósito: copia el estado ya actualizado de la noche
      run: async () => {
        const r = await hacerCopia();
        return `${r.file} · ${(r.bytes / 1048576).toFixed(0)} MB · ${r.kept} guardadas`;
      },
    },
  ];
}

// Un paso colgado no puede comerse la ventana nocturna entera. Ojo: el trabajo
// subyacente no se puede abortar (sigue en segundo plano); lo que se corta es
// la ESPERA, y el paso queda registrado como error con su motivo.
const STEP_TIMEOUT_MS = 20 * 60 * 1000;
const conTimeout = (promesa) =>
  Promise.race([
    promesa,
    new Promise((_, rej) => {
      const t = setTimeout(
        () => rej(new Error('agotó los 20 minutos: se salta y seguirá en segundo plano')),
        STEP_TIMEOUT_MS
      );
      t.unref?.();
    }),
  ]);

/** Últimas pasadas (30 días), para el histórico de Ajustes y el aviso lateral. */
export function refreshHistory(days = 30) {
  return db
    .prepare('SELECT * FROM refresh_runs WHERE started_at >= ? ORDER BY started_at DESC LIMIT 60')
    .all(Date.now() - days * 24 * 3600 * 1000)
    .map((r) => ({ ...r, steps: JSON.parse(r.steps || '[]') }));
}

/** Estado de la última pasada para el aviso de la barra lateral. */
export function nightlyHealth() {
  const last = db.prepare('SELECT * FROM refresh_runs ORDER BY started_at DESC LIMIT 1').get();
  if (!last) return { lastRunAt: null, ok: null, stale: false };
  const steps = JSON.parse(last.steps || '[]');
  const errores = steps.filter((s) => s.state === 'error').length;
  return {
    lastRunAt: last.started_at,
    finished: !!last.finished_at,
    ok: !!last.finished_at && errores === 0,
    errores,
    // >26 h sin pasada terminada = el cron nocturno no está corriendo
    stale: Date.now() - (last.finished_at || last.started_at) > 26 * 3600 * 1000,
  };
}

export async function runFullRefresh({ trigger = 'manual', includeAutoRadarr = true } = {}) {
  if (refreshStatus.running) return refreshStatus;
  if (syncStatus.running) {
    refreshStatus.lastError = 'Ya hay una sincronización de Plex en marcha';
    return refreshStatus;
  }

  const all = buildSteps({ includeAutoRadarr });
  const steps = all.map((s) => ({
    key: s.key,
    label: s.label,
    state: s.enabled() ? 'pending' : 'skipped',
    // «sin configurar» solo cuando de verdad falta configuración: los pasos
    // semanales que ya corrieron dicen que están al día
    detail: s.enabled() ? null : s.skipNote ? s.skipNote() : 'sin configurar',
    ms: 0,
  }));

  Object.assign(refreshStatus, {
    running: true,
    startedAt: Date.now(),
    finishedAt: null,
    step: null,
    stepIndex: 0,
    totalSteps: steps.filter((s) => s.state === 'pending').length,
    steps,
    lastError: null,
    trigger,
  });

  // la fila se abre YA y se reescribe tras CADA paso: un crash deja rastro
  const runId = db
    .prepare('INSERT INTO refresh_runs (started_at, trigger_kind, steps) VALUES (?, ?, ?)')
    .run(Date.now(), trigger, JSON.stringify(steps)).lastInsertRowid;
  const persist = db.prepare('UPDATE refresh_runs SET steps = ?, finished_at = ? WHERE id = ?');

  let done = 0;
  for (let i = 0; i < all.length; i++) {
    const entry = steps[i];
    if (entry.state === 'skipped') continue;
    const startedAt = Date.now();
    entry.state = 'running';
    refreshStatus.step = entry.label;
    refreshStatus.stepIndex = done;
    try {
      entry.detail = (await conTimeout(all[i].run())) || 'hecho';
      entry.state = 'done';
    } catch (err) {
      entry.state = 'error';
      entry.detail = String(err?.message || err);
    }
    entry.ms = Date.now() - startedAt;
    done++;
    persist.run(JSON.stringify(steps), null, runId);
  }

  const failed = steps.filter((s) => s.state === 'error');
  Object.assign(refreshStatus, {
    running: false,
    finishedAt: Date.now(),
    step: null,
    stepIndex: done,
    lastError: failed.length ? `${failed.length} paso(s) con error: ${failed.map((s) => s.key).join(', ')}` : null,
  });
  persist.run(JSON.stringify(steps), Date.now(), runId);
  db.prepare('DELETE FROM refresh_runs WHERE started_at < ?').run(Date.now() - 30 * 24 * 3600 * 1000);
  setSetting('full_refresh_last_run', String(Date.now()));
  return refreshStatus;
}
