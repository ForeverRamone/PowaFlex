import { getSetting } from './db.js';

/**
 * Cliente de Bazarr, solo para lo que hace falta: comprobar la conexión y
 * pedirle que busque los subtítulos de una película.
 *
 * OJO con la identidad: Bazarr indexa las películas por el **id de Radarr**,
 * no por el de TMDB. Por eso el snapshot `radarr_movies` guarda desde la 1.04
 * la columna `radarr_id`: sin ella no se le puede pedir nada concreto.
 */

const base = () => (getSetting('bazarr_url') || '').replace(/\/+$/, '');
const key = () => getSetting('bazarr_key') || '';

export const bazarrConfigured = () => !!(base() && key());

async function pedir(path, { method = 'GET', params = {} } = {}) {
  if (!bazarrConfigured()) throw new Error('Bazarr no está configurado');
  const url = new URL(`${base()}/api${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.append(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: { 'X-API-KEY': key(), accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Bazarr respondió ${res.status}`);
  const texto = await res.text();
  if (!texto) return {};
  try {
    return JSON.parse(texto);
  } catch {
    return {}; // varios endpoints contestan vacío o con texto suelto al mutar
  }
}

/** Prueba de conexión para el botón de Ajustes. */
export async function testBazarr() {
  try {
    const data = await pedir('/system/status');
    const version = data?.data?.bazarr_version || data?.bazarr_version || null;
    return { ok: true, version };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

/**
 * Que Bazarr busque los subtítulos de esa película. `radarrId` es el id de
 * Radarr, no el de TMDB: si no lo tienes, sincroniza Radarr primero.
 */
export async function buscarSubtitulos(radarrId) {
  if (!Number(radarrId)) throw new Error('Sin id de Radarr: sincroniza Radarr y vuelve a intentarlo');
  await pedir('/movies', { method: 'PATCH', params: { radarrid: Number(radarrId), action: 'search-missing' } });
  return { ok: true };
}
