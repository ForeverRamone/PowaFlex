import { db, getSetting, setSetting } from './db.js';
import { runSync, syncStatus } from './plex.js';
import { rematchLetterboxd, resolveUnmatchedLb, importLetterboxdRss } from './letterboxd.js';
import { getCalendarCached, enrichPeopleLife } from './tmdb.js';
import { syncRatings } from './mdblist.js';
import { radarrSyncMovies } from './radarr.js';
import { runAutoRadarr } from './automation.js';
import { scanSagas } from './saga.js';
import { favoritesGaps } from './discover.js';

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
      key: 'radarr',
      label: 'Refrescar lo que ya tienes en Radarr',
      enabled: () => has('radarr_url', 'radarr_key'),
      run: async () => `${(await radarrSyncMovies())?.count ?? 0} películas en Radarr`,
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
      key: 'autoradarr',
      label: 'Auto-añadir estrenos de favoritos a Radarr',
      enabled: () => includeAutoRadarr && getSetting('auto_radarr_enabled') === '1' && has('radarr_url', 'radarr_key'),
      run: async () => {
        const r = await runAutoRadarr({
          months: Number(getSetting('auto_radarr_months') || 6),
          lookbackDays: Number(getSetting('auto_radarr_lookback_days') || 0),
        });
        return `${r.added} añadidas de ${r.considered} candidatas`;
      },
    },
  ];
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
    detail: s.enabled() ? null : 'sin configurar',
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

  let done = 0;
  for (let i = 0; i < all.length; i++) {
    const entry = steps[i];
    if (entry.state === 'skipped') continue;
    const startedAt = Date.now();
    entry.state = 'running';
    refreshStatus.step = entry.label;
    refreshStatus.stepIndex = done;
    try {
      entry.detail = (await all[i].run()) || 'hecho';
      entry.state = 'done';
    } catch (err) {
      entry.state = 'error';
      entry.detail = String(err?.message || err);
    }
    entry.ms = Date.now() - startedAt;
    done++;
  }

  const failed = steps.filter((s) => s.state === 'error');
  Object.assign(refreshStatus, {
    running: false,
    finishedAt: Date.now(),
    step: null,
    stepIndex: done,
    lastError: failed.length ? `${failed.length} paso(s) con error: ${failed.map((s) => s.key).join(', ')}` : null,
  });
  setSetting('full_refresh_last_run', String(Date.now()));
  return refreshStatus;
}
