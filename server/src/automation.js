import { db, getSetting } from './db.js';
import { today } from './dates.js';
import { resolvePerson, personCredits, enrichRuntimes, isCameoCredit } from './tmdb.js';
import { creditsForRole, isRankable, asRole } from './roles.js';

const DAY = 24 * 3600 * 1000;

/**
 * Lo que el pase automático NO debe tocar, por decisión explícita tuya:
 *
 *  - `auto_radarr_vetoed`: el 🚫 de una ficha de Cine venidero. La película se
 *    sigue viendo y se puede mandar a Radarr a mano; solo el robot la ignora.
 *  - `dismissed_movies`: el ✕ «no me interesa» de Descubrir y Estrenos. Antes
 *    el automático NO lo miraba, así que algo que habías descartado a mano
 *    podía aparecerte descargado esa misma noche.
 *
 * Devuelve un Map id → motivo para poder decir en el log POR QUÉ se saltó cada
 * una: un «0 candidatas» sin explicación es indistinguible de una avería.
 */
export function autoRadarrExcluidas() {
  const out = new Map();
  for (const r of db.prepare('SELECT tmdb_id FROM dismissed_movies').all()) out.set(r.tmdb_id, 'descartada');
  // el veto manda sobre el descarte: es el motivo más específico
  for (const r of db.prepare('SELECT tmdb_id FROM auto_radarr_vetoed').all()) out.set(r.tmdb_id, 'vetada');
  return out;
}

/**
 * Los favoritos VIVOS seguidos en ese oficio, para el pase automático.
 *
 * El filtro por faceta es imprescindible desde la 1.04: sin él, la rama de
 * «favoritos sin créditos en Plex» recogía a TODO favorito sin títulos en la
 * biblioteca, que es justo la única forma de seguir a un director de
 * fotografía, un compositor o un montador. Si esa persona había dirigido algo
 * alguna vez, el pase nocturno te lo descargaba sin que hubieras seguido a
 * nadie como director.
 *
 * La segunda condición solo tiene sentido en los oficios que Plex guarda
 * (`isRankable`): en fotografía, música y montaje NO hay créditos en
 * movie_people jamás, así que exigir «o dirige en tu biblioteca, o no tiene
 * ningún crédito» dejaba fuera a quien además sale como actor en algo tuyo.
 */
export function favoritosDeOficio(role) {
  const rol = asRole(role, 'director');
  if (!isRankable(rol)) {
    return db
      .prepare(
        `SELECT DISTINCT p.id, p.name FROM tracked_people t
         JOIN people p ON p.id = t.person_id
         WHERE p.deathday IS NULL AND t.role = ?`
      )
      .all(rol);
  }
  return db
    .prepare(
      `SELECT DISTINCT p.id, p.name FROM tracked_people t
       JOIN people p ON p.id = t.person_id
       WHERE p.deathday IS NULL
         AND t.role = ?
         AND (EXISTS (SELECT 1 FROM movie_people mp WHERE mp.person_id = p.id AND mp.role = ?)
              OR NOT EXISTS (SELECT 1 FROM movie_people mp WHERE mp.person_id = p.id))`
    )
    .all(rol, rol);
}

/**
 * Las películas venideras de tus favoritos de ese oficio, SIN decidir nada:
 * ni descarta por tipo, ni por nota, ni las manda a Radarr. Devuelve
 * candidatas con sus banderas (`isShort`, `isDocumentary`…) para que el
 * evaluador de reglas —que es puro y testeable— haga el filtrado y pueda
 * explicar cada descarte.
 *
 * `errors` no se traga: sin él, «0 candidatas» podía significar «TMDB estaba
 * caído» y parecía que la regla no encontraba nada.
 */
export async function candidatasDeFavoritos({ role = 'director', months = 6, lookbackDays = 0 } = {}) {
  const rol = asRole(role, 'director');
  const gente = favoritosDeOficio(rol);
  const now = today();
  // TMDB often dates small/festival films only after release; a lookback
  // window catches those instead of skipping them forever
  const floor = lookbackDays > 0 ? new Date(Date.now() - lookbackDays * DAY).toISOString().slice(0, 10) : now;
  const horizon = new Date(Date.now() + months * 30 * DAY).toISOString().slice(0, 10);

  const porId = new Map();
  const errors = [];
  for (const d of gente) {
    try {
      const resolved = await resolvePerson(d.id);
      if (!resolved?.tmdb_id) continue;
      const credits = await personCredits(resolved.tmdb_id);
      for (const c of creditsForRole(credits, rol)) {
        if (c.video) continue;
        const date = c.release_date || null;
        if (!date || date < floor || date > horizon) continue; // only dated, within window
        if (!porId.has(c.id)) {
          porId.set(c.id, {
            tmdb_id: c.id,
            title: c.title,
            date,
            year: Number(String(date).slice(0, 4)) || null,
            person: d.name,
            // Un puesto muy abajo en el reparto o un personaje tipo «Self» es
            // un cameo, no una película que seguir a alguien signifique querer.
            // Sin esto, seguir a un actor te descargaba cada documental en el
            // que sale tres segundos: mismo criterio que los huecos.
            isCameo: rol === 'actor' && isCameoCredit(c),
            genre_ids: c.genre_ids || [],
            isDocumentary: (c.genre_ids || []).includes(99),
            isTvMovie: (c.genre_ids || []).includes(10770),
          });
        }
      }
    } catch (err) {
      errors.push(`${d.name}: ${String(err.message || err)}`);
    }
  }

  // runtime is not in credit lists: one cached pass to drop known shorts, y de
  // paso enrichRuntimes relee los géneros de verdad (los conciertos afloran ahí)
  const candidates = [...porId.values()];
  await enrichRuntimes(candidates);
  return { candidates, errors, people: gente.length };
}

/** Horizonte por defecto del pase de favoritos, heredado de los ajustes viejos. */
export function autoRadarrDefaults() {
  return {
    months: Number(getSetting('auto_radarr_months') || 6),
    lookbackDays: Number(getSetting('auto_radarr_lookback_days') || 0),
    includeDocs: getSetting('auto_radarr_include_docs') === '1',
  };
}
