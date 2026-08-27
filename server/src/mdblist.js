import { db, getSetting, setSetting } from './db.js';
import { today } from './dates.js';
import { UNWATCHED } from './queries.js';

const BASE = process.env.MDBLIST_BASE || 'https://api.mdblist.com';
const WEEK = 7 * 24 * 3600 * 1000;

function apiKey() {
  const k = getSetting('mdblist_key') || '';
  if (!k) throw new Error('MDBList no configurado (falta API key)');
  return k;
}

async function mdbFetch(path, { method = 'GET', body = null, params = {} } = {}) {
  const qs = new URLSearchParams({ apikey: apiKey(), ...params });
  const res = await fetch(`${BASE}${path}?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : null,
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 429) {
    // flagged so callers can stop the whole batch loop instead of hammering a
    // rate-limited API and reporting success
    const err = new Error('MDBList: límite de peticiones alcanzado (429). Inténtalo más tarde.');
    err.rateLimited = true;
    throw err;
  }
  if (!res.ok) throw new Error(`MDBList ${res.status} en ${path}`);
  // La cuenta se lleva AQUÍ, que es lo único que ellos cobran: UNA petición
  // HTTP, lleve dentro un título o cien. El 429 no se apunta porque no se
  // sirvió nada, pero cualquier otra respuesta sí: un 404 les cuenta igual.
  addUsage(1);
  return res.json();
}

export async function mdbTest() {
  const u = await mdbFetch('/user');
  return {
    ok: true,
    user: u.user_name || u.username || null,
    patron: u.patron_status || u.patreon_status || (u.is_supporter ? 'supporter' : null),
    limit: u.api_requests ?? null,
    usedToday: u.api_requests_count ?? null,
  };
}

// --- daily budget by account tier ---------------------------------------------

/**
 * LA RESERVA que se deja sin gastar, y por qué no es cero.
 *
 * Nuestra cuenta y la de MDBList pueden desfasarse: aquí se apunta lo que se
 * pide, pero un lote que muere a medias, otro cliente con la misma clave o un
 * reintento suyo cuentan allí y no aquí. Apurar al 100% es comprarse un 429 en
 * mitad de un pase largo, que es justo cuando más duele.
 *
 * Estaba en el 20% y era demasiado prudente para lo que se hace ahora:
 * construir un país son unas cuatro mil peticiones, así que ese margen valía un
 * país entero al día. Con el 5% quedan 1.250 de colchón sobre una cuenta
 * Supporter, que sigue siendo holgado.
 */
const RESERVA = 0.05;

function dailyBudget() {
  const tier = getSetting('mdblist_tier') || 'auto';
  if (tier === 'free') return 900;
  if (tier === 'supporter') return Math.floor(25000 * (1 - RESERVA));
  // auto: el límite que declara /user, guardado por `asegurarLimiteDiario`
  const cached = Number(getSetting('mdblist_detected_limit') || 0);
  return cached > 1000 ? Math.floor(cached * (1 - RESERVA)) : 900;
}

/**
 * AVERIGUAR EL CUPO DE VERDAD, sin que nadie tenga que pulsar nada.
 *
 * El modo «auto» decide el presupuesto diario con `mdblist_detected_limit`… que
 * hasta aquí solo se escribía al pulsar «Probar» en Ajustes. Quien no lo
 * pulsara nunca —que es lo normal— se quedaba con el suelo de 900 peticiones al
 * día TENIENDO una cuenta supporter de 25.000: el barrido de notas de una
 * biblioteca grande se lo come entero, y a partir de ahí todo lo demás (las
 * reglas, Estrenos, los festivales) contestaba «agotado el cupo diario» el
 * resto de la jornada. Desde fuera, eso se ve como que las notas «no funcionan».
 *
 * Se pregunta UNA vez al día, en el primer sitio que vaya a gastar. Si falla se
 * reintenta mañana y mientras tanto sigue valiendo el suelo conservador.
 */
async function asegurarLimiteDiario() {
  if ((getSetting('mdblist_tier') || 'auto') !== 'auto' || !hayClaveMdblist()) return;
  const hoy = today();
  if (getSetting('mdblist_limit_at') === hoy) return;
  setSetting('mdblist_limit_at', hoy); // aunque falle: una vez al día, no una por petición
  try {
    const u = await mdbFetch('/user');
    const limite = Number(u.api_requests ?? 0);
    if (limite > 0) setSetting('mdblist_detected_limit', String(limite));
  } catch {
    // sin respuesta hoy, el suelo de 900 sigue en pie
  }
}

function usage() {
  const hoy = today(); // el día cambia a tu medianoche
  try {
    const u = JSON.parse(getSetting('mdblist_usage') || '{}');
    if (u.date === hoy) return u;
  } catch {}
  return { date: hoy, count: 0 };
}

function addUsage(n) {
  const u = usage();
  u.count += n;
  setSetting('mdblist_usage', JSON.stringify(u));
}

/** Peticiones que quedan hoy. */
export function remainingBudget() {
  return Math.max(0, dailyBudget() - usage().count);
}

// Cuántos títulos caben en un lote. Es el tamaño con el que se trocea en todos
// los sitios que piden notas, y lo que convierte peticiones en títulos.
export const POR_LOTE = 100;

/**
 * Cuántos TÍTULOS se pueden pedir todavía hoy. Que no es lo mismo que peticiones:
 * cien títulos viajan en una sola, y confundirlo es lo que tenía a la aplicación
 * racionándose a sí misma.
 */
export const titulosQueCaben = () => remainingBudget() * POR_LOTE;

/** ¿Hay clave de MDBList? Sin ella no hay Σ, y las reglas con umbral no pueden
 *  decidir nada: tienen que poder decirlo en vez de callar. */
export const hayClaveMdblist = () => !!getSetting('mdblist_key');

/**
 * Notas para las REGLAS automáticas, que es un caso distinto al de las páginas.
 *
 * `enrichWithScores` solo pide lo que NO tiene fila en `mdb_ratings`, y eso
 * incluye la caché negativa: una película que el día que se miró aún no tenía
 * Σ se queda con su fila vacía PARA SIEMPRE. Para una pantalla da igual —hoy no
 * tiene nota y punto—, pero para una regla con umbral era letal: la promesa de
 * «cada noche se vuelve a mirar» no se cumplía nunca, porque la nota no se
 * volvía a pedir jamás. Aquí se vuelven a pedir las que siguen sin Σ y llevan
 * más de `caducaMs` sin comprobarse.
 *
 * Devuelve por qué no se pudo mirar, si no se pudo: un «esperando nota» eterno
 * sin explicación es indistinguible de una avería.
 */
export async function refrescarNotasDeReglas(items, { maxFetch = 200, caducaMs = 3 * 24 * 3600 * 1000 } = {}) {
  await asegurarLimiteDiario();
  const ids = [...new Set(items.map((i) => i.tmdb_id).filter(Boolean))];
  // La forma es SIEMPRE la misma —con `pendientes` y `recibidas`— aunque no se
  // pida nada: quien llama distingue así «no había nada que pedir» de «se pidió
  // y no vino», que para la persona que pulsa el botón son cosas distintas y
  // hasta ahora salían con el mismo mensaje.
  const vacío = (motivo = null) => ({ pedidas: 0, recibidas: 0, pendientes: 0, motivo });
  if (!ids.length) return vacío();
  if (!hayClaveMdblist()) return vacío('sin_api_key');

  const marcador = ids.map(() => '?').join(',');
  const frescas = new Set(
    db
      .prepare(`SELECT tmdb_id FROM mdb_ratings WHERE tmdb_id IN (${marcador})
                AND (score IS NOT NULL OR fetched_at >= ?)`)
      .all(...ids, Date.now() - caducaMs)
      .map((r) => r.tmdb_id)
  );
  const pendientes = ids.filter((id) => !frescas.has(id));
  if (!pendientes.length) return vacío();
  const presupuesto = titulosQueCaben();
  if (presupuesto <= 0) return { ...vacío('sin_presupuesto'), pendientes: pendientes.length };

  const aPedir = pendientes.slice(0, Math.min(maxFetch, presupuesto));
  // `recibidas` es la diferencia entre «se pidieron cuatro» y «vinieron cuatro».
  // Sin ella, una clave que ya no vale devuelve exactamente lo mismo que cuatro
  // películas que MDBList todavía no conoce: cero notas y ningún aviso.
  let recibidas = 0;
  try {
    for (let i = 0; i < aPedir.length; i += 100) {
      recibidas += (await fetchRatingsBatch(aPedir.slice(i, i + 100))).length;
    }
  } catch (err) {
    return { ...vacío(err.rateLimited ? 'sin_presupuesto' : String(err.message || err)), pendientes: pendientes.length };
  }
  return {
    pedidas: aPedir.length,
    recibidas,
    pendientes: pendientes.length,
    motivo: pendientes.length > aPedir.length ? 'quedan_para_manana' : null,
  };
}

// --- ratings ------------------------------------------------------------------

const upsertRating = db.prepare(`
INSERT INTO mdb_ratings (tmdb_id, imdb, imdb_votes, rt_critic, rt_audience, metacritic, letterboxd, lb_votes, trakt, score, json, fetched_at)
VALUES (@tmdb_id, @imdb, @imdb_votes, @rt_critic, @rt_audience, @metacritic, @letterboxd, @lb_votes, @trakt, @score, @json, @fetched_at)
ON CONFLICT(tmdb_id) DO UPDATE SET imdb=excluded.imdb, imdb_votes=excluded.imdb_votes,
  rt_critic=excluded.rt_critic, rt_audience=excluded.rt_audience, metacritic=excluded.metacritic,
  letterboxd=excluded.letterboxd, lb_votes=excluded.lb_votes, trakt=excluded.trakt, score=excluded.score,
  json=excluded.json, fetched_at=excluded.fetched_at`);

function parseItem(item) {
  const tmdbId = item?.ids?.tmdb ?? item?.tmdbid ?? item?.id;
  if (!tmdbId) return null;
  const src = {};
  for (const r of item.ratings || []) {
    if (r?.source) src[r.source] = r;
  }
  const val = (name) => (src[name]?.value ?? null);
  return {
    tmdb_id: Number(tmdbId),
    imdb: val('imdb'),
    imdb_votes: src.imdb?.votes ?? null,
    rt_critic: val('tomatoes'),
    rt_audience: val('tomatoesaudience'),
    metacritic: val('metacritic'),
    // MDBList hands Letterboxd over already doubled to 0–10 (its 4.2 stars = 8.4),
    // so it is stored and displayed as-is: never scale it again.
    letterboxd: val('letterboxd'),
    // el volumen de votos de Letterboxd: la señal de popularidad fiable (en
    // TMDB apenas vota nadie), usada por el umbral de ruido de Descubrir
    lb_votes: src.letterboxd?.votes ?? null,
    trakt: val('trakt'),
    score: item.score_average ?? item.score ?? null,
    json: JSON.stringify(item.ratings || []),
    fetched_at: Date.now(),
  };
}

/**
 * Fetch ratings for up to ~100 TMDB ids. Tries the batch endpoint first and
 * falls back to per-title GETs if the instance doesn't accept it. A 429
 * propagates (it is not a per-title failure: the whole sync has to stop), and
 * only the requests actually issued are charged to the daily budget.
 */
/**
 * UN LOTE DE CIEN TÍTULOS CUESTA UNA PETICIÓN, NO CIEN.
 *
 * Aquí se apuntaba `used = tmdbIds.length` con el comentario «the batch endpoint
 * is billed per title», y era falso. Medido contra su propio contador
 * (`/user` → `api_requests_count`): un lote de veinte títulos movió el contador
 * UNA unidad. La app se creía a 22.369 peticiones de las 25.000 cuando ellos
 * habían contado 388 — un factor de casi sesenta.
 *
 * La consecuencia no era teórica: con esa cuenta, la aplicación se declaraba sin
 * cupo teniendo el 98% del día libre, y a partir de ahí las notas «no
 * funcionaban» para todo lo demás. Ahora la cuenta la lleva `mdbFetch`, que es
 * quien hace la petición: una por llamada, que es lo que ellos cobran.
 */
export async function fetchRatingsBatch(tmdbIds) {
  apiKey(); // no key = no request leaves: must not spend budget either
  let items = null;
  let parsed = [];
  try {
    try {
      const res = await mdbFetch('/tmdb/movie', { method: 'POST', body: { ids: tmdbIds } });
      items = Array.isArray(res) ? res : res.movies || res.results || null;
    } catch (err) {
      if (err.rateLimited) throw err;
      items = null; // endpoint not supported here: fall back to per-title GETs
    }
    if (!items) {
      items = [];
      for (const id of tmdbIds) {
        try {
          items.push(await mdbFetch(`/tmdb/movie/${id}`));
        } catch (err) {
          if (err.rateLimited) throw err;
        }
      }
    }
  } finally {
    // Guardar va en el finally a propósito: un 429 a mitad de lote se lleva por
    // delante el resto, pero las que YA se descargaron están pagadas del
    // presupuesto del día y tirarlas obligaba a volver a pedirlas mañana.
    if (items?.length) {
      parsed = items.map(parseItem).filter(Boolean); // una sola pasada: el return lo reutiliza
      db.transaction(() => {
        for (const p of parsed) upsertRating.run(p);
        // MDBList no conoce todas las películas (las raras y las antiguas se le
        // escapan), y de las que no conoce no quedaba ni rastro: como «lo que
        // falta» se calcula mirando qué ids NO están en la tabla, esos volvían
        // a pedirse en CADA visita, para siempre. Un canon viejo como Sight &
        // Sound se comía 50 peticiones del presupuesto diario cada vez que lo
        // abrías. Dejando una fila vacía con la fecha, el id deja de pedirse; y
        // como el barrido semanal reintenta lo más viejo, si MDBList la añade
        // algún día se acaba recogiendo igual.
        const vinieron = new Set(parsed.map((p) => p.tmdb_id));
        for (const id of tmdbIds) {
          if (vinieron.has(id)) continue;
          upsertRating.run({
            tmdb_id: id, imdb: null, imdb_votes: null, rt_critic: null, rt_audience: null,
            metacritic: null, letterboxd: null, lb_votes: null, trakt: null, score: null,
            json: null, fetched_at: Date.now(),
          });
        }
      })();
    }
  }
  return parsed;
}

export const mdbSyncStatus = {
  running: false,
  total: 0,
  done: 0,
  error: null,
  rateLimited: false,
  finishedAt: null,
};

/**
 * Sync ratings for the library: first movies without ratings, then the stalest
 * (older than a week), bounded by the tier's remaining daily budget.
 */
export async function syncRatings() {
  if (mdbSyncStatus.running) return mdbSyncStatus;
  Object.assign(mdbSyncStatus, { running: true, total: 0, done: 0, error: null, rateLimited: false, finishedAt: null });
  try {
    apiKey();
    await asegurarLimiteDiario();
    const cutoff = Date.now() - WEEK;
    const pending = db
      .prepare(
        `SELECT DISTINCT m.tmdb_id FROM movies m
         LEFT JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
         WHERE m.tmdb_id IS NOT NULL AND (r.tmdb_id IS NULL OR r.fetched_at < ?)
         ORDER BY r.fetched_at IS NOT NULL, r.fetched_at`
      )
      .all(cutoff)
      .map((r) => r.tmdb_id);

    const budget = titulosQueCaben();
    const work = pending.slice(0, budget);
    mdbSyncStatus.total = work.length;

    for (let i = 0; i < work.length; i += 100) {
      await fetchRatingsBatch(work.slice(i, i + 100));
      mdbSyncStatus.done = Math.min(i + 100, work.length);
    }
  } catch (err) {
    // a 429 aborts the remaining batches: the loop dies here on purpose and the
    // interface shows the reason instead of a silent "listo"
    mdbSyncStatus.error = String(err.message || err);
    mdbSyncStatus.rateLimited = !!err.rateLimited;
  } finally {
    mdbSyncStatus.running = false;
    mdbSyncStatus.finishedAt = Date.now();
  }
  return mdbSyncStatus;
}

export function ratingsCoverage() {
  const total = db.prepare('SELECT COUNT(DISTINCT tmdb_id) n FROM movies WHERE tmdb_id IS NOT NULL').get().n;
  // «Tiene al menos una nota» distingue una ficha de verdad de la fila vacía
  // que se deja cuando MDBList no conoce la película; sin esto, la cobertura
  // que enseña Salud contaría como «con notas» justo las que no las tienen.
  // Se mira nota a nota y no el JSON crudo, que en bases antiguas puede venir
  // vacío aun teniendo notas.
  const withRatings = db
    .prepare(
      `SELECT COUNT(DISTINCT m.tmdb_id) n FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE COALESCE(r.score, r.imdb, r.rt_critic, r.rt_audience, r.metacritic, r.letterboxd, r.trakt) IS NOT NULL`
    )
    .get().n;
  // las dos unidades, porque no son lo mismo: cien títulos caben en UNA petición
  return {
    total,
    withRatings,
    remainingBudget: remainingBudget(),
    titulosQueCaben: titulosQueCaben(),
    usedToday: usage().count,
  };
}

/**
 * Attach cached mdblist scores to arbitrary TMDB items (used by Descubrir);
 * fetches uncached ones if budget allows.
 */
export async function enrichWithScores(items, { fetchMissing = true, maxFetch = 300 } = {}) {
  const ids = [...new Set(items.map((i) => i.tmdb_id).filter(Boolean))];
  if (!ids.length) return items;
  const rows = new Map(
    db
      .prepare(`SELECT tmdb_id, imdb, rt_critic, letterboxd, lb_votes, score FROM mdb_ratings
                WHERE tmdb_id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids)
      .map((r) => [r.tmdb_id, r])
  );
  if (fetchMissing) {
    try {
      apiKey();
      await asegurarLimiteDiario();
      const missing = ids.filter((id) => !rows.has(id)).slice(0, Math.min(maxFetch, titulosQueCaben()));
      for (let i = 0; i < missing.length; i += 100) {
        for (const p of await fetchRatingsBatch(missing.slice(i, i + 100))) {
          rows.set(p.tmdb_id, p);
        }
      }
    } catch {}
  }
  for (const item of items) {
    const r = rows.get(item.tmdb_id);
    if (r) {
      item.mdb = { imdb: r.imdb, rt_critic: r.rt_critic, letterboxd: r.letterboxd, lb_votes: r.lb_votes, score: r.score };
    }
  }
  return items;
}

// --- insights (B) ---------------------------------------------------------------

export function insights() {
  const all = (sql) => db.prepare(sql).all();
  // "Your rating" is your Letterboxd rating (0–5) scaled to 0–10 — the Plex
  // personal rating was removed in v0.5.
  const MINE = `(SELECT MAX(rating) * 2 FROM lb_entries WHERE movie_id = m.rating_key AND rating IS NOT NULL)`;
  return {
    // you love them, critics don't
    hiddenGems: all(
      `SELECT m.rating_key, m.title, m.year, m.thumb, ${MINE} AS my_rating, r.rt_critic, r.imdb, r.letterboxd, r.score AS mdb_score
       FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE ${MINE} >= 8 AND r.rt_critic IS NOT NULL AND r.rt_critic <= 55
       ORDER BY my_rating DESC, r.rt_critic ASC LIMIT 24`
    ),
    // el listón «Must-See» de Metacritic (metascore ≥ 81) con volumen de votos
    // de IMDb como aval de que no son cuatro reseñas: consenso crítico exigente
    // que aún no has visto, sin gastar ni una petición (todo está en la tabla)
    mustSee: all(
      `SELECT m.rating_key, m.title, m.year, m.thumb, r.metacritic, r.imdb, r.letterboxd, r.score AS mdb_score
       FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE ${UNWATCHED} AND r.metacritic >= 81 AND COALESCE(r.imdb_votes, 0) >= 5000
       ORDER BY r.metacritic DESC, COALESCE(r.imdb_votes, 0) DESC LIMIT 24`
    ),
    // critical consensus you haven't watched — "watched" means Plex views OR a
    // Letterboxd diary/watched/ratings entry, same as everywhere else in the app
    consensusUnwatched: all(
      `SELECT m.rating_key, m.title, m.year, m.thumb, r.rt_critic, r.metacritic, r.imdb, r.letterboxd, r.score AS mdb_score, r.score
       FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE ${UNWATCHED} AND r.score IS NOT NULL
       ORDER BY r.score DESC LIMIT 24`
    ),
    // the world loves them, you don't
    overrated: all(
      `SELECT m.rating_key, m.title, m.year, m.thumb, ${MINE} AS my_rating, r.score, r.imdb, r.letterboxd, r.score AS mdb_score, r.rt_audience
       FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE ${MINE} IS NOT NULL AND ${MINE} <= 5 AND r.score >= 75
       ORDER BY r.score DESC LIMIT 24`
    ),
    // your taste vs the letterboxd community — both sides on 0–10: yours is the
    // 0–5 star rating doubled, theirs already arrives 0–10 from MDBList
    letterboxdDivergence: all(
      `SELECT m.rating_key, m.title, m.year, m.thumb, ${MINE} AS my_rating, r.letterboxd, r.imdb, r.score AS mdb_score,
              ABS(${MINE} - r.letterboxd) AS diff
       FROM movies m JOIN mdb_ratings r ON r.tmdb_id = m.tmdb_id
       WHERE ${MINE} IS NOT NULL AND r.letterboxd IS NOT NULL AND ABS(${MINE} - r.letterboxd) >= 3
       ORDER BY diff DESC LIMIT 24`
    ),
  };
}

// --- lists (C) --------------------------------------------------------------------

export async function searchLists(query) {
  const res = await mdbFetch('/lists/search', { params: { query } });
  const arr = Array.isArray(res) ? res : res.lists || res.results || [];
  return arr.map((l) => ({
    mdb_id: l.id,
    name: l.name,
    slug: l.slug,
    user_name: l.user_name || l.user || null,
    item_count: l.items ?? l.item_count ?? null,
    likes: l.likes ?? null,
  }));
}

async function fetchListInfoByPath(userName, slug) {
  const res = await mdbFetch(`/lists/${userName}/${slug}`);
  const l = Array.isArray(res) ? res[0] : res;
  if (!l?.id) throw new Error('Lista no encontrada en MDBList');
  return l;
}

async function fetchListItems(mdbId) {
  const items = [];
  let offset = 0;
  const LIMIT = 1000;
  for (;;) {
    const res = await mdbFetch(`/lists/${mdbId}/items`, { params: { limit: LIMIT, offset } });
    const movies = Array.isArray(res) ? res : res.movies || [];
    for (const it of movies) {
      const tmdbId = it?.ids?.tmdb ?? it?.tmdb_id ?? it?.id;
      if (!tmdbId) continue;
      items.push({
        tmdb_id: Number(tmdbId),
        rank: it.rank ?? null,
        title: it.title || '',
        year: it.release_year ?? it.year ?? null,
        imdb_id: it.imdb_id || null,
      });
    }
    if (movies.length < LIMIT) break;
    offset += LIMIT;
    if (offset > 20000) break; // safety
  }
  return items;
}

export async function addList({ url = null, mdbId = null, name = null, slug = null, userName = null }) {
  let info;
  if (url) {
    const m = /mdblist\.com\/lists\/([^/]+)\/([^/?#]+)/.exec(url);
    if (!m) throw new Error('URL de lista no reconocida (esperaba mdblist.com/lists/usuario/lista)');
    info = await fetchListInfoByPath(m[1], m[2]);
  } else if (mdbId) {
    info = { id: mdbId, name, slug, user_name: userName, items: null };
  } else {
    throw new Error('Falta url o mdbId');
  }

  const items = await fetchListItems(info.id);
  const listUrl =
    url || (info.user_name && info.slug ? `https://mdblist.com/lists/${info.user_name}/${info.slug}` : null);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO mdb_lists (mdb_id, name, slug, user_name, url, item_count, added_at, refreshed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mdb_id) DO UPDATE SET name=excluded.name, item_count=excluded.item_count, refreshed_at=excluded.refreshed_at`
    ).run(info.id, info.name || name || 'Lista', info.slug || slug, info.user_name || userName, listUrl, items.length, Date.now(), Date.now());
    const listId = db.prepare('SELECT id FROM mdb_lists WHERE mdb_id = ?').get(info.id).id;
    db.prepare('DELETE FROM mdb_list_items WHERE list_id = ?').run(listId);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO mdb_list_items (list_id, tmdb_id, rank, title, year, imdb_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const it of items) ins.run(listId, it.tmdb_id, it.rank, it.title, it.year, it.imdb_id);
    return listId;
  });
  return { listId: tx(), items: items.length };
}

/**
 * REFRESCAR LAS LISTAS GUARDADAS, de noche y a plazos.
 *
 * Una lista de MDBList no es una foto: muchas son dinámicas («lo mejor de este
 * año», «lo más votado del mes») y cambian solas. Hasta aquí solo se
 * refrescaban pulsando el botón de cada una, así que una lista añadida en enero
 * seguía enseñando lo de enero.
 *
 * Se hace a plazos por dos motivos: cada lista cuesta peticiones del cupo
 * diario, y refrescar quince de golpe una noche dejaría a las notas sin
 * presupuesto. Con `dias` se refresca solo lo que lleva parado ese tiempo, y
 * `max` acota cuántas por pasada.
 */
export async function refrescarListasGuardadas({ dias = 7, max = 3 } = {}) {
  if (!hayClaveMdblist()) return { candidatas: 0, hechas: 0, errores: [] };
  const corte = Date.now() - dias * 24 * 3600 * 1000;
  const viejas = db
    .prepare(
      `SELECT mdb_id, name, slug, user_name FROM mdb_lists
       WHERE COALESCE(refreshed_at, 0) < ? ORDER BY COALESCE(refreshed_at, 0) LIMIT ?`
    )
    .all(corte, Math.max(1, max));
  const errores = [];
  let hechas = 0;
  for (const l of viejas) {
    try {
      await addList({ mdbId: l.mdb_id, name: l.name, slug: l.slug, userName: l.user_name });
      hechas++;
    } catch (err) {
      // una lista borrada en MDBList no puede parar a las demás
      errores.push(`${l.name}: ${String(err.message || err)}`);
    }
  }
  const pendientes = db
    .prepare('SELECT COUNT(*) n FROM mdb_lists WHERE COALESCE(refreshed_at, 0) < ?')
    .get(corte).n;
  return { candidatas: viejas.length, hechas, quedan: pendientes, errores };
}

export function savedLists() {
  return db
    .prepare(
      `SELECT l.*, COUNT(i.tmdb_id) AS items,
              SUM(CASE WHEN m.tmdb_id IS NOT NULL THEN 1 ELSE 0 END) AS owned
       FROM mdb_lists l
       LEFT JOIN mdb_list_items i ON i.list_id = l.id
       LEFT JOIN (SELECT DISTINCT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL) m ON m.tmdb_id = i.tmdb_id
       GROUP BY l.id ORDER BY l.added_at DESC`
    )
    .all();
}

export function listDetail(listId) {
  const list = db.prepare('SELECT * FROM mdb_lists WHERE id = ?').get(listId);
  if (!list) return null;
  const items = db
    .prepare(
      `SELECT i.*, m.rating_key, (m.tmdb_id IS NOT NULL) AS owned, mv.view_count,
              r.imdb, r.score
       FROM mdb_list_items i
       LEFT JOIN (SELECT DISTINCT tmdb_id, MIN(rating_key) rating_key FROM movies WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id) m ON m.tmdb_id = i.tmdb_id
       LEFT JOIN movies mv ON mv.rating_key = m.rating_key
       LEFT JOIN mdb_ratings r ON r.tmdb_id = i.tmdb_id
       WHERE i.list_id = ?
       ORDER BY COALESCE(i.rank, 999999), i.title`
    )
    .all(listId);
  return { list, items };
}

export function deleteList(listId) {
  db.prepare('DELETE FROM mdb_list_items WHERE list_id = ?').run(listId);
  db.prepare('DELETE FROM mdb_lists WHERE id = ?').run(listId);
}
