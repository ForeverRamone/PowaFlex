import { db, cacheRead, cacheWrite } from './db.js';
import { today } from './dates.js';
import { tmdbGet, enrichRuntimes, esParcialCaducado, classifyGenres } from './tmdb.js';
import { enrichWithScores, refrescarNotasDeReglas } from './mdblist.js';
import { matchMovie, watchedIndex, isWatched } from './letterboxd.js';
import { mapPool } from './pool.js';
import { cachePrefix } from './cache-versions.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/**
 * Estrenos: qué llega (y qué acaba de llegar) a los cines y a las plataformas
 * y VOD de España y de EE UU. La lista sale del discover de TMDB acotado por
 * región y tipo de estreno —la única fuente consistente de fechas por país—;
 * el «dónde verla» sale de los watch providers de TMDB (datos de JustWatch
 * licenciados) de esa misma región. Solo largometrajes: fuera cortos,
 * telefilmes y vídeos, que discover también lista.
 */
export const RELEASE_KINDS = {
  // 3 = estreno en salas, 2 = salas limitado, 4 = digital
  'cine-es': { region: 'ES', types: '3|2' },
  'cine-us': { region: 'US', types: '3|2' },
  'plataformas-es': { region: 'ES', types: '4', providers: true },
  'plataformas-us': { region: 'US', types: '4', providers: true },
};

const RECENT_PAGES = 3; // 60 títulos por popularidad bastan: el resto es cola
const UPCOMING_PAGES = 2;
const UPCOMING_DAYS = 60;

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`); // mediodía: a salvo de saltos de DST
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Solo cine largometraje. Puro y exportado para poder testearlo: descarta lo
 * marcado como vídeo, los cortos DEMOSTRADOS (<40 min con duración conocida;
 * un próximo estreno sin duración aún no puede condenarse) y los telefilmes.
 */
export const esLargometraje = (i) => !i.video && !(i.runtime && i.runtime < 40) && !i.isTvMovie;

/** Parte una lista en ya estrenadas (recientes primero) y venideras (próximas primero). */
export function partirPorFecha(items, hoy) {
  const recent = items.filter((i) => i.date && i.date <= hoy).sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = items.filter((i) => !i.date || i.date > hoy).sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
  return { recent, upcoming };
}

const libraryTmdbIds = () =>
  new Set(db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id));

async function discoverWindow(kind, gte, lte, pages) {
  const k = RELEASE_KINDS[kind];
  const out = [];
  const errors = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const data = await tmdbGet(
        '/discover/movie',
        {
          region: k.region,
          with_release_type: k.types,
          'release_date.gte': gte,
          'release_date.lte': lte,
          sort_by: 'popularity.desc',
          page,
        },
        { cacheKey: `rel_disc:${kind}:${gte}:${lte}:${page}`, cacheMs: 6 * HOUR }
      );
      out.push(...(data.results || []));
      if (page >= (data.total_pages || 1)) break;
    } catch (err) {
      errors.push(`página ${page}: ${err.message}`);
      break; // sin red no hay más páginas que pedir
    }
  }
  return { results: out, errors };
}

/**
 * Reparte los proveedores de una región de TMDB en las dos formas de ver una
 * película, que para el bolsillo NO son lo mismo: `providers` es lo que ya
 * tienes pagado (suscripción o gratis con anuncios) y `vod` lo que se paga por
 * título (alquiler o compra). Antes el alquiler era un sí/no sin nombres, así
 * que una película solo alquilable ponía «alquiler/compra» y no se podía
 * filtrar por dónde. Pura y exportada para poder testearla.
 */
export function providersDeRegion(reg = {}) {
  const incluido = [...(reg.flatrate || []), ...(reg.ads || [])].map((p) => p.provider_name);
  const vod = [...(reg.rent || []), ...(reg.buy || [])].map((p) => p.provider_name);
  return { providers: [...new Set(incluido)], vod: [...new Set(vod)] };
}

// Dónde está disponible en ESA región, para los chips y el filtro. La caché es
// por película y guarda la respuesta entera de TMDB (todas las regiones), así
// que servir también EE UU no cuesta ni una llamada más.
async function attachProviders(items, region, { concurrency = 6 } = {}) {
  await mapPool(items, concurrency, async (i) => {
    try {
      const data = await tmdbGet(`/movie/${i.tmdb_id}/watch/providers`, {}, { cacheKey: `movie_prov:${i.tmdb_id}`, cacheMs: 3 * DAY });
      Object.assign(i, providersDeRegion(data?.results?.[region]));
    } catch {
      i.providers = [];
      i.vod = [];
    }
  });
}

/**
 * LAS NOTAS QUE FALTAN, en una lista de estrenos.
 *
 * Aquí está el caso peor de la caché negativa de MDBList: un estreno se mira el
 * día que se anuncia, cuando todavía no lo ha votado nadie, y `enrichWithScores`
 * le deja su fila vacía. Como esa función solo pide lo que NO tiene fila, esa
 * película se quedaba sin Σ PARA SIEMPRE — justo en la página donde la Σ es el
 * filtro principal, y justo con las películas más nuevas, que son las que
 * estrenan la nota semanas después.
 *
 * `refrescarNotasDeReglas` ya sabe volver a preguntar por las que siguen sin Σ:
 * con `caducaMs` de tres días se reintenta solo lo que lleva tres días parado,
 * así que la petición se paga una vez cada tres días y no en cada visita.
 * `forzar` (el botón «Actualizar notas») lo reintenta todo ya.
 *
 * Devuelve si algo cambió, para no reescribir la caché sin motivo.
 */
async function ponerNotas(films, { forzar = false } = {}) {
  // El punto de partida es lo que HAY EN LA TABLA ahora, no lo que traía la
  // copia cacheada de la página: si no, pulsar «Actualizar notas» dos veces
  // seguidas cantaba «3 notas nuevas» las dos veces, cuando la segunda no había
  // pedido nada. Un «hecho» que no es verdad es peor que no decir nada.
  await enrichWithScores(films, { fetchMissing: false });
  const antes = films.filter((f) => f.mdb?.score != null).length;
  const notas = await refrescarNotasDeReglas(films, {
    maxFetch: forzar ? 400 : 120,
    caducaMs: forzar ? 0 : 3 * DAY,
  });
  // lo recién descargado ya está en la tabla: se relee sin gastar nada más
  await enrichWithScores(films, { fetchMissing: false });
  const ahora = films.filter((f) => f.mdb?.score != null).length;
  // se pidieron y no vino NI UNA: o MDBList aún no las tiene, o la clave ya no
  // vale. Callarlo dejaba las dos cosas con la misma cara («0 notas nuevas»).
  const motivo = notas.motivo || (notas.pedidas > 0 && notas.recibidas === 0 ? 'sin_respuesta' : null);
  return {
    pedidas: notas.pedidas,
    recibidas: notas.recibidas ?? 0,
    // cuántas de las visibles siguen sin Σ después de la pasada: es lo que
    // convierte un «no ha pasado nada» en una respuesta
    sinNota: films.filter((f) => f.mdb?.score == null).length,
    motivo,
    nuevas: ahora - antes,
  };
}

export async function releases({ kind = 'cine-es', window = 30, refresh = false, refrescarNotas = false } = {}) {
  if (!RELEASE_KINDS[kind]) throw new Error(`kind desconocido: ${kind}`);
  const win = [7, 30, 90].includes(Number(window)) ? Number(window) : 30;
  const cacheKey = `${cachePrefix('releases')}:${kind}:${win}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 12 * HOUR);
    if (hit && !esParcialCaducado(hit)) {
      // La lista cacheada se sirve tal cual, pero las NOTAS se repasan: son lo
      // que envejece de verdad de un estreno (la lista de qué se estrena no
      // cambia en doce horas; su Σ sí, porque aparece días después del estreno).
      // La caché NO se reescribe: hacerlo le renovaría el plazo de doce horas y
      // la lista no se reconstruiría nunca. Repasar cuesta una consulta a la
      // tabla de notas, que ya está descargada.
      const films = [...(hit.recent || []), ...(hit.upcoming || [])];
      const notas = await ponerNotas(films, { forzar: refrescarNotas });
      return { ...hit, notas };
    }
  }

  const hoy = today();
  const errors = [];
  const recientes = await discoverWindow(kind, addDays(hoy, -win), hoy, RECENT_PAGES);
  const proximas = await discoverWindow(kind, addDays(hoy, 1), addDays(hoy, UPCOMING_DAYS), UPCOMING_PAGES);
  errors.push(...recientes.errors, ...proximas.errors);

  // dedup: una película con estreno limitado y general puede salir dos veces
  const seen = new Set();
  const items = [];
  for (const r of [...recientes.results, ...proximas.results]) {
    if (!r.id || seen.has(r.id) || r.video) continue;
    seen.add(r.id);
    items.push(classifyGenres({
      tmdb_id: r.id,
      title: r.title,
      original_title: r.original_title,
      date: r.release_date || null,
      poster_path: r.poster_path,
      vote: r.vote_average,
      votes: r.vote_count,
      popularity: r.popularity,
    }, r.genre_ids || []));
  }

  // duración real (cacheada) para poder echar a los cortos, y títulos latinos
  await enrichRuntimes(items, { concurrency: 5 });
  const features = items.filter(esLargometraje);

  // tu Plex: en propiedad (por id o por título+año, como en huecos) y vistas
  const inLib = libraryTmdbIds();
  const widx = watchedIndex();
  for (const i of features) {
    const year = i.date ? Number(i.date.slice(0, 4)) : null;
    i.owned = inLib.has(i.tmdb_id) || !!matchMovie({ title: i.title, year, tmdbId: i.tmdb_id });
    i.watched = isWatched({ tmdb_id: i.tmdb_id, title: i.title, year }, widx);
  }

  if (RELEASE_KINDS[kind].providers) await attachProviders(features, RELEASE_KINDS[kind].region);
  await enrichWithScores(features, { maxFetch: 250 });
  // y las que sigan sin Σ, otra vuelta: ver `ponerNotas`. En una construcción
  // nueva casi todas las nuevas caen aquí, porque `enrichWithScores` solo pide
  // las que no tienen ni fila.
  const notas = await ponerNotas(features, { forzar: refrescarNotas });

  const { recent, upcoming } = partirPorFecha(features, hoy);
  const result = { generatedAt: Date.now(), kind, window: win, recent, upcoming, notas, errors: errors.slice(0, 5) };
  // ver buildCalendar: un resultado con fallos de red se sirve pero caduca antes
  cacheWrite(cacheKey, errors.length ? { ...result, partial: true } : result);
  return result;
}
