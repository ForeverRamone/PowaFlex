import { api } from './api.js';

/**
 * Mandar una tanda de películas a Radarr.
 *
 * Estaba copiado casi carácter a carácter en seis páginas (Descubrir,
 * Festivales, Calidad, la ficha de persona, Cine venidero y Listas), y ya había
 * empezado a divergir: unas decían «añadidas a Radarr», otra «pedidas», otra se
 * dejaba el «a Radarr», y Cine venidero era la única que NO recortaba a 300 —
 * con más de 300 pendientes el servidor rechazaba la tanda ENTERA por pasarse
 * del tope, así que no se añadía ninguna. Aquí se recorta como en el resto.
 *
 * Devuelve siempre `summary` ya redactado, porque unas páginas lo enseñan con
 * un toast y otras en su propia caja; `error` va aparte para quien quiera
 * distinguirlo.
 */
export const RADARR_BULK_MAX = 300;

export async function addBulkToRadarr(tmdbIds, { onAdded, verb = 'añadidas', target = ' a Radarr' } = {}) {
  const ids = (tmdbIds || []).filter(Boolean).slice(0, RADARR_BULK_MAX);
  if (!ids.length) return { summary: null, empty: true };

  const res = await api('/radarr/add-bulk', { method: 'POST', body: { tmdbIds: ids } });
  if (res.error) return { error: res.error, summary: `⚠️ ${res.error}` };

  // «ya estaba en Radarr» no es un fallo: la película está pedida igual, así
  // que su botón tiene que quedarse en verde como el de las nuevas
  for (const r of res.results || []) if (r.ok || r.alreadyExists) onAdded?.(r.tmdbId);

  return {
    res,
    summary:
      `✓ ${res.added} ${verb}${target}` +
      (res.alreadyInRadarr ? ` · ${res.alreadyInRadarr} ya estaban` : '') +
      (res.failed ? ` · ⚠️ ${res.failed} fallaron` : ''),
  };
}
