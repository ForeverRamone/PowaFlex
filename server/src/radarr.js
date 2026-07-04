import { getSetting } from './db.js';

function radarrConfig() {
  const url = (getSetting('radarr_url') || '').replace(/\/+$/, '');
  const key = getSetting('radarr_key') || '';
  if (!url || !key) throw new Error('Radarr no configurado (URL o API key vacíos)');
  return { url, key };
}

async function radarrFetch(path, { method = 'GET', body = null } = {}) {
  const { url, key } = radarrConfig();
  const res = await fetch(`${url}/api/v3${path}`, {
    method,
    headers: {
      'X-Api-Key': key,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : null,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = Array.isArray(j) ? j[0]?.errorMessage : j.message || '';
    } catch {}
    throw new Error(`Radarr ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function radarrTest() {
  const status = await radarrFetch('/system/status');
  return { ok: true, version: status.version, appName: status.appName };
}

export async function radarrContext() {
  const [profiles, roots, movies] = await Promise.all([
    radarrFetch('/qualityprofile'),
    radarrFetch('/rootfolder'),
    radarrFetch('/movie'),
  ]);
  return {
    profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
    rootFolders: roots.map((r) => ({ path: r.path, freeSpace: r.freeSpace })),
    tmdbIds: movies.map((m) => m.tmdbId),
  };
}

// label -> Promise<id> memo; storing the promise serializes concurrent callers
// so the tag is only looked up/created once (tag ids are stable per instance)
const tagIdCache = new Map();

function ensureTag(label) {
  const key = label.toLowerCase();
  if (!tagIdCache.has(key)) {
    const p = (async () => {
      const tags = await radarrFetch('/tag');
      let tag = tags.find((t) => t.label.toLowerCase() === key);
      if (!tag) tag = await radarrFetch('/tag', { method: 'POST', body: { label } });
      return tag.id;
    })().catch((err) => {
      tagIdCache.delete(key);
      throw err;
    });
    tagIdCache.set(key, p);
  }
  return tagIdCache.get(key);
}

export async function radarrAdd(tmdbId, { qualityProfileId = null, rootFolderPath = null, search = true } = {}) {
  const profileId = qualityProfileId || Number(getSetting('radarr_quality_profile') || 0);
  const rootPath = rootFolderPath || getSetting('radarr_root_folder') || '';
  if (!profileId || !rootPath) {
    throw new Error('Configura el perfil de calidad y la carpeta raíz de Radarr en Ajustes');
  }
  // configurable tag; unset -> "PowaFlex", empty string -> no tag
  const rawTag = getSetting('radarr_tag');
  const tagLabel = (rawTag === null ? 'PowaFlex' : rawTag).trim();
  const tags = tagLabel ? [await ensureTag(tagLabel)] : [];

  // lookup gives Radarr its own metadata object to add
  const results = await radarrFetch(`/movie/lookup/tmdb?tmdbId=${tmdbId}`);
  const movie = Array.isArray(results) ? results[0] : results;
  if (!movie) throw new Error(`Radarr no encuentra tmdb:${tmdbId}`);
  const added = await radarrFetch('/movie', {
    method: 'POST',
    body: {
      ...movie,
      qualityProfileId: profileId,
      rootFolderPath: rootPath,
      monitored: true,
      minimumAvailability: 'announced',
      tags,
      addOptions: { searchForMovie: search, monitor: 'movieOnly' },
    },
  });
  return { ok: true, id: added.id, title: added.title, tmdbId: added.tmdbId };
}

export async function radarrAddBulk(tmdbIds) {
  const results = [];
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= tmdbIds.length) return;
      const tmdbId = tmdbIds[idx];
      try {
        const r = await radarrAdd(tmdbId);
        results.push({ tmdbId, ok: true, title: r.title });
      } catch (err) {
        const msg = String(err.message || err);
        results.push({ tmdbId, ok: false, alreadyExists: /already/i.test(msg), error: msg });
      }
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));
  return {
    added: results.filter((r) => r.ok).length,
    alreadyInRadarr: results.filter((r) => r.alreadyExists).length,
    failed: results.filter((r) => !r.ok && !r.alreadyExists).length,
    results,
  };
}
