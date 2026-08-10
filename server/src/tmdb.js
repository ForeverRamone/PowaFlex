import { db, getSetting, setSetting, cacheRead, cacheWrite } from './db.js';
import { today } from './dates.js';
import { creditsForRole, ROLES, roleInfo, asRole } from './roles.js';
import { mapPool } from './pool.js';
import { watchedIndex, isWatched, normTitle } from './letterboxd.js';
import { needsLatin, readableTitle } from './titles.js';
import { cachePrefix } from './cache-versions.js';
import { enrichWithScores } from './mdblist.js';

const DAY = 24 * 3600 * 1000;

function apiKey() {
  const k = getSetting('tmdb_key') || '';
  if (!k) throw new Error('TMDB no configurado (falta API key)');
  return k;
}

function lang() {
  return getSetting('language') || 'es-ES';
}

// --- global concurrency gate ------------------------------------------------
// Every feature (calendar, sagas, gaps, life-sync…) throttles itself, but two
// running at once could still stack up and trip TMDB's 429. A single shared
// limiter caps total in-flight requests across the whole process.
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      pump();
    });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    pump();
  });
}

// Exportada porque el pool de resolveFilms (festivals.js) debe ir al MISMO
// ritmo: con menos workers que este límite, la carga en frío de un canon de
// 1.001 fichas tarda el doble sin proteger a TMDB de nada.
export const TMDB_CONCURRENCY = Number(process.env.TMDB_CONCURRENCY) || 10;
const tmdbLimit = createLimiter(TMDB_CONCURRENCY);

// Shared progress for long TMDB-building pages (calendar, descubrir), polled by
// the frontend to show a real progress bar instead of a mute spinner (#5).
export const buildProgress = { active: false, job: '', label: '', done: 0, total: 0, at: 0 };
export function setBuildProgress(job, label, done, total) {
  Object.assign(buildProgress, { active: true, job, label, done, total, at: Date.now() });
}
export function clearBuildProgress(job) {
  if (buildProgress.job === job) buildProgress.active = false;
}
// Caduca sola. Ninguno de los constructores protege su clearBuildProgress con un
// finally, así que cualquier excepción que se escape dejaba la barra de progreso
// girando para siempre. Si nadie la toca en un minuto, es que ya no hay nadie.
const PROGRESS_TTL = 60 * 1000;
export function currentProgress() {
  if (buildProgress.active && Date.now() - buildProgress.at > PROGRESS_TTL) {
    return { ...buildProgress, active: false, stale: true };
  }
  return buildProgress;
}

// Cuántas veces se reintenta un 429 antes de rendirse. Sin tope, un TMDB que
// corta el grifo dejaba la promesa sin resolver NUNCA: el refresco se quedaba
// con la marca de «en marcha» puesta y el cron nocturno no volvía a arrancar.
const MAX_429_RETRIES = 3;

// Un resultado construido con fallos se sirve, pero solo un rato: pasado esto se
// reconstruye aunque su caché siga «fresca».
const PARCIAL_MS = 20 * 60 * 1000;
export const esParcialCaducado = (hit) =>
  !!(hit?.partial && hit.generatedAt && Date.now() - hit.generatedAt > PARCIAL_MS);

export async function tmdbGet(path, params = {}, { cacheKey = null, cacheMs = DAY, attempt = 0 } = {}) {
  if (cacheKey) {
    const hit = cacheRead(cacheKey, cacheMs);
    if (hit) return hit;
  }
  const key = apiKey();
  const qs = new URLSearchParams({ language: lang(), ...params });
  // v4 read-access tokens are long JWTs; v3 keys are short hex strings
  const isV4 = key.length > 60;
  if (!isV4) qs.set('api_key', key);
  const res = await tmdbLimit(() =>
    fetch(`https://api.themoviedb.org/3${path}?${qs}`, {
      headers: isV4 ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(20000),
    })
  );
  if (res.status === 429) {
    if (attempt >= MAX_429_RETRIES) throw new Error(`TMDB 429 en ${path} (reintentos agotados)`);
    // espera creciente: si los cinco trabajadores reintentan a la vez y a la
    // misma hora, el siguiente 429 está garantizado
    const retryAfter = Number(res.headers.get('retry-after')) || 2;
    await new Promise((r) => setTimeout(r, retryAfter * 1000 * (attempt + 1)));
    return tmdbGet(path, params, { cacheKey, cacheMs, attempt: attempt + 1 });
  }
  if (!res.ok) throw new Error(`TMDB ${res.status} en ${path}`);
  const data = await res.json();
  if (cacheKey) cacheWrite(cacheKey, data);
  return data;
}

export async function tmdbTest() {
  const data = await tmdbGet('/configuration', {}, { cacheKey: null });
  return { ok: true, imageBase: data.images?.secure_base_url };
}

// --- person matching --------------------------------------------------------

export async function findPersonInfo(name, knownForHint = null) {
  // La faceta ENTRA en la clave: sin ella, buscar «Richard Brooks» como actor
  // dejaba cacheado al actor treinta días, y el canon de directores se lo creía.
  const cacheKey = `person_search:${name.toLowerCase()}:${knownForHint || ''}`;
  const cached = cacheRead(cacheKey, 30 * DAY);
  if (cached) return cached;

  const data = await tmdbGet('/search/person', { query: name }, { cacheKey: null });
  const results = data.results || [];
  if (!results.length) {
    const miss = { id: null };
    cacheWrite(cacheKey, miss);
    return miss;
  }
  let best = results[0];
  if (knownForHint && results.length > 1) {
    const hinted = results.find((r) => r.known_for_department === knownForHint);
    if (hinted && hinted.popularity > best.popularity * 0.3) best = hinted;
  }
  const info = { id: best.id, name: best.name, profile_path: best.profile_path };
  cacheWrite(cacheKey, info);
  return info;
}

export async function findPersonId(name, knownForHint = null) {
  return (await findPersonInfo(name, knownForHint)).id;
}

/**
 * VARIOS candidatos de persona, no solo el mejor.
 *
 * `findPersonInfo` devuelve uno y decide por popularidad, y con nombres muy
 * repetidos eso falla: buscando «Wang Bing» devuelve a un director chino de los
 * años sesenta, no al de «West of the Tracks». Quien llama aquí tiene con qué
 * desambiguar —el título de la película que busca— y necesita la lista entera
 * para poder probar.
 *
 * Los que dirigen van primero, que es lo que se busca en el 99 % de los casos.
 * Comparte caché con `resolveCatalogDirector`: es la misma consulta.
 */
export async function searchPersonCandidates(name, { limit = 5 } = {}) {
  if (!name) return [];
  try {
    const data = await tmdbGet(
      '/search/person',
      { query: name },
      { cacheKey: `person_search_all:${String(name).toLowerCase()}`, cacheMs: 30 * DAY }
    );
    return (data.results || [])
      .slice()
      .sort((a, b) => (b.known_for_department === 'Directing') - (a.known_for_department === 'Directing'))
      .slice(0, limit)
      .map((r) => ({ id: r.id, name: r.name, profile_path: r.profile_path || null }));
  } catch {
    return [];
  }
}

/**
 * Emparejar un director/a del catálogo con su ficha de TMDB, VERIFICANDO que es
 * la persona correcta.
 *
 * `findPersonInfo` decide por popularidad, y con eso el homónimo famoso gana
 * siempre: buscando «Steve McQueen» salía el actor de Bullitt (muerto en 1980)
 * en vez del director de *12 años de esclavitud*, porque el actor es mucho más
 * popular y el director no llegaba al umbral que le habría dado preferencia.
 * Lo mismo pasaría con Michael Bay, Richard Brooks o cualquier otro par de
 * tocayos.
 *
 * Aquí sí hay con qué comprobarlo: el catálogo trae el año de nacimiento (o la
 * edad, que lo da). Un candidato solo vale si su fecha de nacimiento en TMDB
 * cuadra con la del catálogo (±1 año, que los dos datos vienen de sitios
 * distintos). Y si NADIE cuadra, se devuelve vacío: mejor una inicial que la
 * cara de otra persona, que es la misma regla que ya rige el emparejado de
 * películas en Festivales.
 */
export async function resolveCatalogDirector({ name, birth = null, age = null, last = null }) {
  const esperado = birth || (age ? new Date().getFullYear() - age : null);
  const clave = `dir_match:v1:${String(name).toLowerCase()}:${esperado || ''}`;
  const hit = cacheRead(clave, 30 * DAY);
  if (hit) return hit;

  let candidatos = [];
  try {
    const data = await tmdbGet(
      '/search/person',
      { query: name },
      { cacheKey: `person_search_all:${String(name).toLowerCase()}`, cacheMs: 30 * DAY }
    );
    candidatos = (data.results || []).slice(0, 6);
  } catch {
    return { id: null, profile_path: null }; // fallo de red: no se cachea
  }
  if (!candidatos.length) {
    const vacio = { id: null, profile_path: null };
    cacheWrite(clave, vacio);
    return vacio;
  }

  // quien dirige primero: casi siempre es el bueno y ahorra comprobaciones
  candidatos.sort((a, b) => (b.known_for_department === 'Directing') - (a.known_for_department === 'Directing'));

  // Dos pasadas. La fecha solo sirve para DESCARTAR a quien la contradice, no
  // para exigirla: TMDB no tiene fecha de nacimiento de muchísimos cineastas
  // fuera del circuito anglosajón, y pedirla dejaba sin foto a gente que TMDB
  // conoce de sobra y sin ningún homónimo que la dispute.
  let elegido = null;
  let fallosRed = false;
  const sinFecha = [];
  for (const c of candidatos) {
    let det;
    try {
      det = await personDetails(c.id);
    } catch {
      fallosRed = true;
      break; // como en el emparejado de películas: nadie gana por incomparecencia
    }
    const nacido = det.birthday ? Number(det.birthday.slice(0, 4)) : null;
    const muerto = det.deathday ? Number(det.deathday.slice(0, 4)) : null;
    const retrato = det.profile_path ?? c.profile_path;
    // muerto antes de su última película: no puede ser
    if (muerto && last && muerto < last) continue;
    if (esperado && nacido) {
      // la fecha cuadra: es la prueba más fuerte que hay, se corta aquí
      if (Math.abs(nacido - esperado) <= 1) { elegido = { ...c, profile_path: retrato }; break; }
      continue; // la fecha lo DESMIENTE: es otra persona, por popular que sea
    }
    // nadie a quien contradecir: queda como suplente para la segunda pasada
    if (c.known_for_department === 'Directing') sinFecha.push({ ...c, profile_path: retrato });
  }
  // nadie confirmado por fecha: vale quien dirige y no contradice nada. Sigue
  // fuera el homónimo famoso, porque ese SÍ tiene fecha y no cuadra.
  if (!elegido && !fallosRed && sinFecha.length) elegido = sinFecha[0];

  const info = elegido
    ? { id: elegido.id, name: elegido.name, profile_path: elegido.profile_path || null }
    : { id: null, profile_path: null };
  if (!fallosRed) cacheWrite(clave, info);
  return info;
}

// Siete días de caché en vez de uno: la partida más cara de TMDB era re-pedir
// TODAS las filmografías de tus favoritos cada noche. syncPersonChanges (abajo)
// invalida cada día las de quien de verdad cambió, y los 7 días son la
// re-pasada completa de seguridad por si el feed de cambios omite algo.
export async function personCredits(tmdbPersonId) {
  return tmdbGet(
    `/person/${tmdbPersonId}/movie_credits`,
    {},
    { cacheKey: `person_credits:${tmdbPersonId}:${lang()}`, cacheMs: 7 * DAY }
  );
}

/**
 * El feed GLOBAL de cambios de personas de TMDB (quién ha cambiado desde la
 * última pasada), cruzado con TU gente: solo se invalida la caché de créditos
 * de quien cambió, y personCredits re-pide únicamente esas. Ventana máxima del
 * endpoint: 14 días.
 */
export async function syncPersonChanges() {
  const nuestras = new Set(
    db.prepare('SELECT tmdb_id FROM people WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id)
  );
  if (!nuestras.size) return { changed: 0, invalidated: 0 };
  const since = Number(getSetting('person_changes_since') || 0);
  const start = new Date(Math.max(since || Date.now() - DAY, Date.now() - 13 * DAY)).toISOString().slice(0, 10);
  const del = db.prepare('DELETE FROM tmdb_cache WHERE key LIKE ?');
  let changed = 0;
  let invalidated = 0;
  let page = 1;
  for (;;) {
    const data = await tmdbGet('/person/changes', { start_date: start, page }, { cacheKey: null });
    for (const r of data.results || []) {
      changed++;
      if (r.id && nuestras.has(r.id)) {
        if (del.run(`person_credits:${r.id}:%`).changes) invalidated++;
        del.run(`person:${r.id}:%`);
      }
    }
    if (page >= Math.min(data.total_pages || 1, 300)) break;
    page++;
  }
  setSetting('person_changes_since', String(Date.now()));
  return { pages: page, changed, invalidated };
}

export async function personDetails(tmdbPersonId) {
  return tmdbGet(
    `/person/${tmdbPersonId}`,
    {},
    { cacheKey: `person:${tmdbPersonId}:${lang()}`, cacheMs: 7 * DAY }
  );
}

/**
 * Una página del ranking «en boga» de TMDB. La piden dos sitios (los paquetes
 * de Favoritos y el canon «en boga» de Descubrir) y cada uno la cacheaba por su
 * cuenta —uno con el idioma incrustado a mano— así que la misma página se
 * descargaba dos veces y caducaba en momentos distintos.
 */
export async function personPopularPage(page) {
  return tmdbGet('/person/popular', { page }, { cacheKey: `person_popular:${page}:${lang()}`, cacheMs: DAY });
}

// Rough country -> continent map for the people filters (film-producing nations).
const CONTINENTS = {
  'United States': 'Norteamérica', USA: 'Norteamérica', Canada: 'Norteamérica', Mexico: 'Norteamérica',
  México: 'Norteamérica',
  Spain: 'Europa', España: 'Europa', France: 'Europa', Germany: 'Europa', Italy: 'Europa', 'United Kingdom': 'Europa',
  UK: 'Europa', England: 'Europa', Scotland: 'Europa', Ireland: 'Europa', Sweden: 'Europa', Denmark: 'Europa',
  Norway: 'Europa', Finland: 'Europa', Netherlands: 'Europa', Belgium: 'Europa', Portugal: 'Europa', Greece: 'Europa',
  Poland: 'Europa', Russia: 'Europa', 'Soviet Union': 'Europa', 'USSR': 'Europa', Austria: 'Europa', Switzerland: 'Europa',
  Hungary: 'Europa', 'Czech Republic': 'Europa', Czechoslovakia: 'Europa', Romania: 'Europa', Serbia: 'Europa',
  Ukraine: 'Europa', Iceland: 'Europa', Croatia: 'Europa', Turkey: 'Europa',
  Japan: 'Asia', China: 'Asia', 'South Korea': 'Asia', 'Korea': 'Asia', India: 'Asia', 'Hong Kong': 'Asia',
  Taiwan: 'Asia', Thailand: 'Asia', Iran: 'Asia', Israel: 'Asia', Vietnam: 'Asia', Philippines: 'Asia', Indonesia: 'Asia',
  Argentina: 'Sudamérica', Brazil: 'Sudamérica', Chile: 'Sudamérica', Colombia: 'Sudamérica', Peru: 'Sudamérica',
  Uruguay: 'Sudamérica', Venezuela: 'Sudamérica',
  Egypt: 'África', Nigeria: 'África', 'South Africa': 'África', Morocco: 'África', Senegal: 'África', Algeria: 'África',
  Australia: 'Oceanía', 'New Zealand': 'Oceanía',
};

function placeToGeo(place) {
  if (!place) return { country: null, continent: null };
  const country = String(place).split(',').map((s) => s.trim()).pop() || null;
  return { country, continent: country ? CONTINENTS[country] || null : null };
}

/**
 * El continente de un país, con el MISMO mapa que usa la demografía de tu
 * biblioteca. Lo pide el detector de emergentes: su señal de afinidad compara
 * la procedencia de un debutante con la de los directores que ya tienes, y las
 * dos partes de esa comparación tienen que salir del mismo diccionario o no
 * casan nunca.
 */
export const continenteDe = (country) => (country ? CONTINENTS[country] || null : null);

/** El lugar de nacimiento de TMDB, partido en país y continente. */
export const geoDeLugar = (place) => placeToGeo(place);

// Persist life status + demographics for a library person, so the people filters
// and "vivos y muertos" logic work without re-hitting TMDB.
export function persistLife(dbPersonId, details) {
  if (!dbPersonId || !details) return;
  const { country, continent } = placeToGeo(details.place_of_birth);
  db.prepare(
    `UPDATE people SET birthday = ?, deathday = ?, gender = ?, place_of_birth = ?, country = ?, continent = ?,
     details_fetched_at = ? WHERE id = ?`
  ).run(
    details.birthday || null, details.deathday || null, details.gender ?? null,
    details.place_of_birth || null, country, continent, Date.now(), dbPersonId
  );
}

/**
 * Fill birthday/deathday for a set of library people (by DB id). Used by the
 * "actualizar estado vital" button and the nightly job. Returns counts.
 */
export async function enrichPeopleLife(personIds, { concurrency = 5 } = {}) {
  const list = [...new Set(personIds)].filter(Boolean);
  let done = 0;
  let deceased = 0;
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= list.length) return;
      try {
        const person = await resolvePerson(list[i]);
        if (!person?.tmdb_id) continue;
        const det = await personDetails(person.tmdb_id);
        persistLife(person.id, det);
        if (det?.deathday) deceased++;
        done++;
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { requested: list.length, done, deceased };
}

/**
 * Resolve the TMDB person id for a library person (by DB id), persisting it.
 */
// Las películas suyas que YA tienes, por id de TMDB: son la prueba de que un
// candidato de TMDB es la persona correcta y no un homónimo.
const libraryFilmsOf = (personId) =>
  db
    .prepare(
      `SELECT DISTINCT m.tmdb_id FROM movie_people mp
       JOIN movies m ON m.rating_key = mp.movie_id
       WHERE mp.person_id = ? AND m.tmdb_id IS NOT NULL`
    )
    .all(personId)
    .map((r) => r.tmdb_id);

/**
 * Empareja a alguien de tu biblioteca con su ficha de TMDB.
 *
 * Buscar por nombre y quedarse con el primer resultado es lo que hacía que
 * Alberto Rodríguez saliera con «Ozzy» o Richard Brooks con «Johnny B Good»:
 * hay varias personas con el mismo nombre y ganaba la más popular. Ahora el
 * candidato tiene que DEMOSTRARLO — al menos una de las películas suyas que
 * tienes en Plex debe aparecer en su filmografía—, y solo entonces se da por
 * bueno (`tmdb_verified`). Si ninguno lo demuestra se guarda el mejor intento
 * sin marcarlo, para volver a probar más adelante.
 */
export async function resolvePerson(personId, { force = false } = {}) {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!person) return null;
  // lo elegiste tú a mano: no se revisa nunca (ver POST /api/people/:id/match)
  if (person.tmdb_locked) return person;
  if (person.tmdb_id && person.tmdb_verified) return person;
  // se reintenta, pero no todos los días: una semana entre intentos. `force` lo
  // salta, para el botón de comprobar de Salud de los datos.
  if (!force && person.tmdb_id && person.tmdb_checked_at && Date.now() - person.tmdb_checked_at < 7 * DAY) return person;

  const roles = db
    .prepare('SELECT DISTINCT role FROM movie_people WHERE person_id = ?')
    .all(personId)
    .map((r) => r.role);
  const hint = roles.includes('director') ? 'Directing' : roles.includes('actor') ? 'Acting' : null;
  const mine = new Set(libraryFilmsOf(personId));

  const save = (tmdbId, verified) => {
    db.prepare('UPDATE people SET tmdb_id = ?, tmdb_verified = ? WHERE id = ?').run(tmdbId ?? null, verified, personId);
    person.tmdb_id = tmdbId ?? null;
    person.tmdb_verified = verified;
  };

  // Un favorito añadido a mano desde TMDB (o alguien de quien no tienes nada)
  // no tiene con qué contrastarse: se deja como está.
  if (!mine.size) {
    if (!person.tmdb_id) {
      const tmdbId = await findPersonId(person.name, hint);
      if (tmdbId) save(tmdbId, 0);
    }
    return person;
  }

  const candidates = [];
  if (person.tmdb_id) candidates.push(person.tmdb_id);
  try {
    const data = await tmdbGet(
      '/search/person',
      { query: person.name },
      { cacheKey: `person_search_all:${person.name.toLowerCase()}`, cacheMs: 30 * DAY }
    );
    for (const r of (data.results || []).slice(0, 5)) if (!candidates.includes(r.id)) candidates.push(r.id);
  } catch {}

  let best = null;
  for (const id of candidates) {
    try {
      const credits = await personCredits(id);
      const theirs = new Set([...(credits.crew || []), ...(credits.cast || [])].map((c) => c.id));
      let hits = 0;
      for (const t of mine) if (theirs.has(t)) hits++;
      if (!best || hits > best.hits) best = { id, hits };
      if (hits >= 3) break; // tres coincidencias no son casualidad
    } catch {}
  }

  if (best?.hits > 0) {
    save(best.id, 1);
  } else {
    // Nadie lo demostró. Se anota el intento fallido con su fecha para no
    // repetir la búsqueda entera (una consulta + hasta cinco filmografías) en
    // CADA construcción de calendario y de huecos, todos los días.
    save(person.tmdb_id ?? candidates[0] ?? null, 0);
    db.prepare('UPDATE people SET tmdb_checked_at = ? WHERE id = ?').run(Date.now(), personId);
  }
  return person;
}

// --- ficha de película: UNA puerta para todos los caminos ---------------------

/**
 * La ficha de una película, con o sin créditos.
 *
 * Vivía en dos cachés independientes: `movie_cr:` (con append_to_response=
 * credits) y `movie:` (sin). Como la primera es un superset ESTRICTO de la
 * segunda —trae runtime, genres, poster_path, release_date y títulos—, los
 * caminos que no necesitan créditos estaban pidiendo a TMDB una ficha que otro
 * camino acababa de guardar entera. Pasaba en cadena: en un palmarés,
 * movieDirectors bajaba `movie_cr:` del candidato ganador y acto seguido
 * movieSummary volvía a pedir LA MISMA película bajo `movie:`, una llamada de
 * más por película emparejada, en la misma ráfaga que ya provocaba 429.
 *
 * Ahora quien no necesita créditos mira primero si el superset está en casa.
 * Al revés no vale: `movie:` no lleva créditos y devolverlo rompería a quien
 * los pide.
 */
const MOVIE_TTL = 7 * DAY;

export async function movieDetail(tmdbId, { withCredits = false, cacheMs = MOVIE_TTL } = {}) {
  const conCreditos = `movie_cr:${tmdbId}:${lang()}`;
  if (withCredits) {
    return tmdbGet(`/movie/${tmdbId}`, { append_to_response: 'credits' }, { cacheKey: conCreditos, cacheMs });
  }
  const superset = cacheRead(conCreditos, cacheMs);
  if (superset) return superset;
  return tmdbGet(`/movie/${tmdbId}`, {}, { cacheKey: `movie:${tmdbId}:${lang()}`, cacheMs });
}

// --- filmography / completeness ---------------------------------------------

const libraryTmdbIds = () =>
  new Set(db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id));

/**
 * Enrich TMDB items (with .tmdb_id) with runtime and short/doc/TV flags, using
 * the per-movie cache. Runtime is not in credit lists, so a short (<40 min)
 * can only be detected here. Concurrency-limited and cached, so repeat loads
 * are cheap. Mutates items in place.
 */
export async function enrichRuntimes(items, { concurrency = 6, withCredits = false } = {}) {
  await mapPool(items, concurrency, async (it) => {
    try {
      // With credits we can also count co-directors → "dirección coral" (#7).
      const det = await movieDetail(it.tmdb_id, { withCredits });
      it.runtime = det.runtime || null;
      // el detalle ya lo trae y no cuesta nada: el id de IMDb permite cruzar
      // con el volcado local de notas para el umbral de ruido
      if (det.imdb_id) it.imdb_id = det.imdb_id;
      if (det.genres?.length) classifyGenres(it, det.genres.map((x) => x.id));
      // la gala de lucha libre no tiene género que la delate: la delata quién la produce
      if (esEvento(det)) it.isEvento = true;
      // idioma original y países de producción: los usa la CUARENTENA de las
      // reglas y vienen en la misma ficha, así que no cuestan una petición más
      if (det.original_language) it.original_language = det.original_language;
      if (det.production_countries?.length) it.countries = det.production_countries.map((c) => c.iso_3166_1);
      if (withCredits) {
        const dirs = new Set((det.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.id));
        it.directorCount = dirs.size || 1;
        it.isCoral = dirs.size >= 3;
      }
    } catch {
      it.runtime = it.runtime ?? null;
    }
    it.isShort = !!it.runtime && it.runtime < 40;
  });
  // punto único por el que pasan filmografías, huecos y favoritos: si TMDB no
  // tenía traducción y devolvió el título original en otro alfabeto, aquí se
  // cambia por el internacional
  await latinizeTitles(items, { concurrency });
  return items;
}

/** Pick the best /search/movie result for (title, year): exact normalised
 *  title/original-title match first, then year proximity (±1); with a year and
 *  nothing close, better no match than a wrong film. */
export function pickSearchResult(results, title, year = null) {
  const list = (results || []).filter(Boolean);
  if (!list.length) return null;
  const wanted = normTitle(title);
  const resYear = (r) => (r.release_date ? Number(r.release_date.slice(0, 4)) : null);
  const yearOk = (r) => !year || (resYear(r) != null && Math.abs(resYear(r) - year) <= 1);
  const exact = list.filter((r) => yearOk(r) && (normTitle(r.title) === wanted || normTitle(r.original_title) === wanted));
  if (exact.length) return exact[0];
  const inYear = list.filter(yearOk);
  if (inYear.length) return inYear[0];
  return year ? null : list[0];
}

/** Resolve a TMDB movie id from title (+year), cached. Null if not found.
 *  Hits cache 30 days; misses only 1 day, so a transient failure can't stick. */
export async function searchMovieId(title, year = null) {
  if (!title) return null;
  const key = `movie_search:${title.toLowerCase()}:${year || ''}`;
  const cached = cacheRead(key, 30 * DAY);
  if (cached?.id) return cached.id;
  if (cached && cacheRead(key, DAY)) return null; // fresh miss
  try {
    let data = await tmdbGet('/search/movie', year ? { query: title, primary_release_year: year } : { query: title }, { cacheKey: null });
    let hit = pickSearchResult(data.results, title, year);
    if (!hit && year) {
      // the year filter can be too strict (festival vs. release year): retry open
      data = await tmdbGet('/search/movie', { query: title }, { cacheKey: null });
      hit = pickSearchResult(data.results, title, year);
    }
    // Última vuelta, en inglés: TMDB no compara la consulta con el título
    // inglés cuando le pides español, y las listas de Letterboxd y los cánones
    // vienen en inglés («The Leopard» no encontraba «Il gattopardo»).
    //
    // Solo cuando NO se ha encontrado nada, a diferencia de
    // `searchMovieCandidates`: aquí no hay verificación de dirección detrás, así
    // que ampliar la lista podría cambiar un acierto por un fallo. Entrando solo
    // donde hoy se devuelve null, lo único que puede hacer es sumar.
    if (!hit && !/^en/i.test(lang())) {
      data = await tmdbGet('/search/movie', { query: title, language: 'en-US' }, { cacheKey: null });
      hit = pickSearchResult(data.results, title, year);
    }
    cacheWrite(key, hit ? { id: hit.id } : {});
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Ordena los candidatos ANTES de cortar la lista. Pura y exportada para poder
 * probarla, porque aquí estaba el fallo que costó tres intentos.
 *
 * TMDB devuelve por POPULARIDAD, y quedarse con los diez primeros es tirar el
 * dato que sí tenemos: el año. Buscando «The Leopard» de 1962, la lista llegaba
 * encabezada por «El hombre leopardo» (1943), «The Leopard Lady» (1928), «The
 * Leopard Woman» (1920) y «The Leopard Son» (1996) —todas más populares— y «Il
 * gattopardo» se caía por el corte sin que nadie llegara a comprobar su
 * dirección. Aquí pasa delante quien cuadra en año y quien clava el título.
 */
export function ordenarCandidatos(list, title, year = null) {
  const wanted = normTitle(title);
  const anyo = (c) => (c.date ? Number(String(c.date).slice(0, 4)) : null);
  const cercaDelAño = (c) => {
    const a = anyo(c);
    if (!Number.isFinite(year) || a == null) return 9; // sin año con que comparar, ni premia ni castiga
    return Math.abs(a - year);
  };
  const clavado = (c) => (normTitle(c.title) === wanted || normTitle(c.original_title) === wanted ? 0 : 1);
  return list
    .map((c, i) => ({ c, i })) // el orden de TMDB desempata al final
    .sort((x, y) => {
      // dentro de la ventana de ±1 primero, y ahí el título clavado manda
      const vx = cercaDelAño(x.c) <= 1 ? 0 : 1;
      const vy = cercaDelAño(y.c) <= 1 ? 0 : 1;
      return vx - vy || clavado(x.c) - clavado(y.c) || cercaDelAño(x.c) - cercaDelAño(y.c) || x.i - y.i;
    })
    .map((x) => x.c);
}

/**
 * Candidatos de /search/movie para el emparejado VERIFICADO de festivales, para
 * que quien llama pueda comprobar la dirección antes de quedarse con ninguno.
 *
 * TRES COSAS QUE HAY QUE HACER A LA VEZ, y hasta ahora se hacía una:
 *
 *  1. **Preguntar también en inglés.** `tmdbGet` manda `language` en todas las
 *     llamadas y buscando en español TMDB no compara contra el título inglés.
 *     Los cánones y las tablas de Wikipedia están en inglés, así que sin esto
 *     ninguna película con título original en otra lengua se encontraba.
 *  2. **Probar el año y sus vecinos.** El BFI y los festivales fechan por
 *     producción o por estreno en festival y TMDB por estreno comercial: «The
 *     Leopard» es 1962 en Sight & Sound y 1963 en TMDB, así que la búsqueda
 *     acotada al año exacto no devolvía NADA y todo el peso caía en la abierta.
 *  3. **Ordenar antes de cortar.** Ver `ordenarCandidatos`.
 *
 * Nada de esto relaja la verificación: los candidatos nuevos pasan por la misma
 * comprobación de dirección que los demás, y sin ella ninguno se acepta.
 */
export async function searchMovieCandidates(title, year = null) {
  if (!title) return [];
  // v4: vuelta en inglés siempre, años vecinos y orden por año antes de cortar
  const key = `movie_cands4:${title.toLowerCase()}:${year || ''}`;
  const cached = cacheRead(key, 30 * DAY);
  if (cached) return cached.list || [];
  try {
    const seen = new Set();
    const list = [];
    const add = (results) => {
      for (const r of results || []) {
        if (!r?.id || seen.has(r.id)) continue;
        seen.add(r.id);
        list.push({ id: r.id, title: r.title, original_title: r.original_title, date: r.release_date || null, poster_path: r.poster_path || null });
      }
    };
    const buscar = async (params) => add((await tmdbGet('/search/movie', { query: title, ...params }, { cacheKey: null })).results);
    // ¿Tenemos ya un candidato CREÍBLE, o hay que seguir insistiendo?
    //
    // Creíble = del año que buscamos Y con el título clavado. Pedir solo el año
    // no basta: buscando «The Leopard» de 1962 puede aparecer cualquier otra
    // película de 1962 y, si nos parásemos ahí, «Il gattopardo» no se buscaría
    // nunca. Y pedir solo el título tampoco: los títulos genéricos se repiten
    // cada década.
    const buscado = normTitle(title);
    const hayCandidatoCreible = () =>
      list.some((c) => {
        const enAño =
          !Number.isFinite(year) ||
          (c.date && Math.abs(Number(String(c.date).slice(0, 4)) - year) <= 1);
        return enAño && (normTitle(c.title) === buscado || normTitle(c.original_title) === buscado);
      });

    // El orden es de más barato a más caro, y cada escalón solo se sube si el
    // anterior se quedó sin nada del año. Un canon de 264 fichas no puede
    // pagar tres búsquedas por título cuando la primera casi siempre acierta.
    const idiomas = /^en/i.test(lang()) ? [{}] : [{}, { language: 'en-US' }];
    for (const idioma of idiomas) {
      if (Number.isFinite(year)) await buscar({ primary_release_year: year, ...idioma });
      if (!hayCandidatoCreible()) await buscar(idioma);
      // los años vecinos: el BFI y los festivales fechan por producción o por
      // estreno en festival, y TMDB por estreno comercial. Solo con año de
      // verdad: con year nulo, year±1 lanzaba búsquedas absurdas con
      // primary_release_year=1 y -1.
      if (Number.isFinite(year)) {
        for (const y of [year + 1, year - 1]) {
          if (hayCandidatoCreible()) break;
          await buscar({ primary_release_year: y, ...idioma });
        }
      }
      if (hayCandidatoCreible()) break; // ya está: no hace falta la vuelta en inglés
    }
    // sin año no hay escalones que valgan: una sola búsqueda abierta
    if (!Number.isFinite(year) && !list.length) await buscar({});
    const out = ordenarCandidatos(list, title, year).slice(0, 12);
    cacheWrite(key, { list: out });
    return out;
  } catch {
    return [];
  }
}

/**
 * Fases de estreno de una película (salas / digital / físico), del endpoint
 * oficial de TMDB. Se toma la fecha MÍNIMA de cada tipo entre todos los
 * países: para saber si EXISTE copia digital, el país da igual. Caché 3 días
 * (una película sin fecha digital hoy puede anunciarla mañana).
 */
export async function movieReleaseInfo(tmdbId) {
  const data = await tmdbGet(`/movie/${tmdbId}/release_dates`, {}, { cacheKey: `movie_rel:${tmdbId}`, cacheMs: 3 * DAY });
  const min = {};
  for (const c of data.results || []) {
    for (const r of c.release_dates || []) {
      const d = (r.release_date || '').slice(0, 10);
      if (!d) continue;
      if (!min[r.type] || d < min[r.type]) min[r.type] = d;
    }
  }
  // tipos TMDB: 1 premiere, 2 salas limitado, 3 salas, 4 digital, 5 físico
  return {
    premiere: min[1] || null,
    theatrical: min[3] || min[2] || null,
    digital: min[4] || null,
    physical: min[5] || null,
  };
}

/**
 * Cuelga `phases` (fases de estreno) a una lista de items con tmdb_id. Lo ya
 * cacheado se lee entero; de lo que falta solo se piden `maxFetch` (el pase
 * nocturno rellena el resto con un tope alto).
 */
export async function enrichReleasePhases(items, { maxFetch = 60, concurrency = 6 } = {}) {
  const conId = items.filter((i) => i.tmdb_id);
  const enCache = conId.filter((i) => cacheRead(`movie_rel:${i.tmdb_id}`, 3 * DAY));
  const sinCache = conId.filter((i) => !cacheRead(`movie_rel:${i.tmdb_id}`, 3 * DAY)).slice(0, maxFetch);
  const targets = [...enCache, ...sinCache];
  let i = 0;
  async function worker() {
    for (;;) {
      const it = targets[i++];
      if (!it) return;
      try {
        it.phases = await movieReleaseInfo(it.tmdb_id);
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return items;
}

/** Directores/as de una película, con la misma caché movie_cr que enrichRuntimes. */
/**
 * Quién dirige, con los nombres EN ALFABETO LATINO.
 *
 * TMDB acredita a mucha gente en su alfabeto: el director de «West of the
 * Tracks» figura como «王兵», no como «Wang Bing». Al verificar el emparejado
 * contra las tablas de Wikipedia —que están en inglés— no había nada que
 * comparar y la película se quedaba sin ficha, aunque estuviera encontrada.
 *
 * La transcripción sale de `also_known_as`, que es de donde ya la saca el resto
 * de la app (`latinPersonName`), y solo se pide para quien la necesita.
 */
export async function movieDirectors(tmdbId) {
  const det = await movieDetail(tmdbId, { withCredits: true });
  const crew = (det.credits?.crew || []).filter((c) => c.job === 'Director');
  return Promise.all(crew.map((c) => (needsLatin(c.name) ? latinPersonName(c.id, c.name) : c.name)));
}

/** Ficha mínima de una película (cartel, fecha, títulos), con la misma caché
 *  de 7 días que usa enrichRuntimes para no pedir dos veces lo mismo. */
export async function movieSummary(tmdbId) {
  const det = await movieDetail(tmdbId);
  return {
    tmdb_id: tmdbId,
    title: det.title || det.original_title || null,
    original_title: det.original_title || null,
    poster_path: det.poster_path || null,
    date: det.release_date || null,
    runtime: det.runtime || null,
  };
}

/** Deterministic TMDB id from an IMDb id (Plex guids carry it), cached. */
export async function findByImdbId(imdbId) {
  if (!imdbId) return null;
  const key = `imdb_find:${imdbId}`;
  const cached = cacheRead(key, 30 * DAY);
  if (cached) return cached.id ?? null;
  try {
    const data = await tmdbGet(`/find/${imdbId}`, { external_source: 'imdb_id' }, { cacheKey: null });
    const id = data.movie_results?.[0]?.id ?? null;
    cacheWrite(key, { id });
    return id;
  } catch {
    return null;
  }
}

// --- library unification ------------------------------------------------------
// Some Plex rows lack a TMDB guid, and the library only knows the Spanish +
// original titles. These backfills give every film a TMDB id (IMDb id first,
// title search as fallback) and the TMDB English title, so any source —
// Letterboxd lists, CSVs, watched entries — can match by id or by title in
// es/original/en.

export async function backfillMovieTmdbIds() {
  const rows = db
    .prepare('SELECT rating_key, title, original_title, year, imdb_id FROM movies WHERE tmdb_id IS NULL')
    .all();
  const upd = db.prepare('UPDATE movies SET tmdb_id = ? WHERE rating_key = ?');
  let resolved = 0;
  await mapPool(rows, 6, async (m) => {
    const id =
      (await findByImdbId(m.imdb_id)) ||
      (m.original_title ? await searchMovieId(m.original_title, m.year) : null) ||
      (await searchMovieId(m.title, m.year));
    if (id) { upd.run(id, m.rating_key); resolved++; }
  });
  return { pending: rows.length, resolved };
}

export async function backfillEnglishTitles({ budget = 3000 } = {}) {
  const rows = db
    .prepare('SELECT rating_key, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL AND english_title IS NULL LIMIT ?')
    .all(budget);
  const pending = db
    .prepare('SELECT COUNT(*) n FROM movies WHERE tmdb_id IS NOT NULL AND english_title IS NULL')
    .get().n;
  // '' when TMDB has no English title, so the row is not retried forever
  const upd = db.prepare('UPDATE movies SET english_title = ? WHERE rating_key = ?');
  let done = 0;
  await mapPool(rows, 6, async (m) => {
    try {
      const data = await tmdbGet(
        `/movie/${m.tmdb_id}`,
        { language: 'en-US' },
        { cacheKey: `movie_en:${m.tmdb_id}`, cacheMs: 30 * DAY }
      );
      upd.run(data.title || '', m.rating_key);
      done++;
      setBuildProgress('english_titles', 'Completando títulos en inglés…', done, rows.length);
    } catch {}
  });
  clearBuildProgress('english_titles');
  return { done, remaining: pending - done };
}

/**
 * Deja legibles los títulos de la biblioteca. Plex guarda lo que le da su
 * agente, así que una película china aparece como «志愿军：雄兵出击» en toda la
 * app; aquí se cambia por el título internacional, que es el que enseñan
 * Letterboxd y Radarr. El de Plex queda intacto en `plex_title`, y como el
 * emparejado va por id (tmdb_id / rating_key), esto no toca nada más.
 *
 * Se vuelve a pasar después de cada sincronización, porque Plex reescribe
 * `title` con el suyo cada vez.
 */
export async function normalizeLibraryTitles({ concurrency = 6 } = {}) {
  const pending = db
    .prepare('SELECT rating_key, tmdb_id, title, english_title FROM movies WHERE title IS NOT NULL')
    .all()
    .filter((r) => needsLatin(r.title));
  if (!pending.length) return { checked: 0, renamed: 0 };

  const upd = db.prepare('UPDATE movies SET title = ?, english_title = ? WHERE rating_key = ?');
  let renamed = 0;
  await mapPool(pending, concurrency, async (row) => {
    // el backfill de títulos en inglés ya puede tenerlo; si no, se pide
    let en = row.english_title || null;
    if (!en && row.tmdb_id) en = await englishTitle(row.tmdb_id);
    if (!en || needsLatin(en)) return;
    upd.run(en, en, row.rating_key);
    renamed++;
    setBuildProgress('titles:movies', 'Normalizando títulos…', renamed, pending.length);
  });
  clearBuildProgress('titles:movies');
  return { checked: pending.length, renamed };
}

/** El título internacional (inglés) de una película, cacheado 30 días. */
export async function englishTitle(tmdbId) {
  if (!tmdbId) return null;
  try {
    const en = await tmdbGet(
      `/movie/${tmdbId}`,
      { language: 'en-US' },
      { cacheKey: `movie_en:${tmdbId}`, cacheMs: 30 * DAY }
    );
    return en.title || null;
  } catch {
    return null;
  }
}

/**
 * Deja legibles los títulos de una tanda de fichas de TMDB: solo pide el título
 * internacional de las que no están en alfabeto latino, así que en una
 * filmografía normal no sale ni una petición de más. Ver `titles.js`.
 */
export async function latinizeTitles(items, { concurrency = 6 } = {}) {
  const pending = items.filter((i) => i?.tmdb_id && needsLatin(i.title));
  if (!pending.length) return items;
  await mapPool(pending, concurrency, async (it) => {
    const en = await englishTitle(it.tmdb_id);
    if (en) {
      it.original_title = it.original_title || it.title;
      it.title = readableTitle(it.title, en);
    }
  });
  return items;
}

/**
 * Lo mismo que con los títulos, pero con la gente: en el calendario salía
 * «Dirige 深田晃司» en vez de «Kôji Fukada». TMDB no traduce el nombre —es un
 * solo campo—, pero guarda las transcripciones en `also_known_as`, así que de
 * ahí se saca la primera que esté en alfabeto latino.
 */
export async function latinPersonName(tmdbId, name) {
  if (!tmdbId || !needsLatin(name)) return name;
  try {
    const det = await personDetails(tmdbId);
    return (det?.also_known_as || []).find((n) => n && !needsLatin(n)) || name;
  } catch {
    return name;
  }
}

/**
 * Arregla en el sitio los nombres de una tanda de personas. Cada una tiene que
 * traer su id de TMDB, con la clave que sea (`tmdb_id` o `tmdbId`).
 */
export async function latinizeNames(entries, { concurrency = 6 } = {}) {
  const pending = entries.filter((e) => e && needsLatin(e.name) && (e.tmdb_id || e.tmdbId));
  if (!pending.length) return entries;
  await mapPool(pending, concurrency, async (e) => {
    e.name = await latinPersonName(e.tmdb_id || e.tmdbId, e.name);
  });
  return entries;
}

/**
 * Los nombres de la gente de tu biblioteca, en alfabeto latino. Mismo trato que
 * `normalizeLibraryTitles`: Plex guarda lo que le da su agente, el nombre
 * original queda en `plex_name` y el emparejado sigue yendo por id.
 */
export async function normalizePeopleNames({ concurrency = 6 } = {}) {
  const pending = db
    .prepare('SELECT id, tmdb_id, name FROM people WHERE name IS NOT NULL AND tmdb_id IS NOT NULL')
    .all()
    .filter((r) => needsLatin(r.name));
  if (!pending.length) return { checked: 0, renamed: 0 };

  const upd = db.prepare('UPDATE people SET name = ? WHERE id = ?');
  let renamed = 0;
  await mapPool(pending, concurrency, async (row) => {
    const latin = await latinPersonName(row.tmdb_id, row.name);
    if (latin === row.name) return;
    upd.run(latin, row.id);
    renamed++;
    setBuildProgress('titles:people', 'Normalizando nombres…', renamed, pending.length);
  });
  clearBuildProgress('titles:people');
  return { checked: pending.length, renamed };
}

/** Full TMDB movie detail with credits (cached). */
export async function tmdbMovieDetail(tmdbId) {
  const det = await movieDetail(tmdbId, { withCredits: true });
  if (!needsLatin(det.title)) return det;
  // la ficha sigue enseñando el original debajo: solo cambia el titular
  return { ...det, title: readableTitle(det.title, await englishTitle(tmdbId)) };
}

/** Poster path for a TMDB movie id (cached). Null if unknown. */
export async function tmdbPoster(tmdbId) {
  if (!tmdbId) return null;
  try {
    // 30 días: un cartel no cambia, y esto solo alimenta miniaturas. Antes ese
    // TTL más largo se escribía sobre la MISMA clave que usa movieSummary con 7
    // días, así que cuál mandaba dependía de quién llegara primero.
    const det = await movieDetail(tmdbId, { cacheMs: 30 * DAY });
    return det.poster_path || null;
  } catch {
    return null;
  }
}

/**
 * One place decides what kind of film a TMDB record is, so the person page, the
 * gaps flow and the calendar can never disagree.
 *
 * «Música» is the concert-film bucket a completist wants out of the way: TMDB
 * tags those with Music (10402) AND Documentary (99). A bare Music genre is a
 * musical (Cabaret, La La Land) and stays a perfectly normal feature. Concert
 * films leave the documentary bucket so they don't inflate the documentarian
 * count either — the categories are mutually exclusive.
 */
/**
 * Lo que NO es cine aunque TMDB lo tenga fichado como película: galas de lucha
 * libre (WWE, NJPW, AEW, AAA), eventos deportivos y conciertos grabados. En la
 * página de Estrenos son la mitad del ruido —un G1 Climax son DOCE «películas»,
 * una por jornada— y no hay género que los distinga: vienen sin géneros o como
 * acción. Lo que sí los delata es la PRODUCTORA, que ya viene en la ficha que
 * `enrichRuntimes` pide de todas formas: coste cero en peticiones.
 */
const PRODUCTORAS_DE_EVENTO =
  /\b(wwe|world wrestling|new japan pro[- ]?wrestling|njpw|all elite wrestling|aew|lucha libre aaa|aaa worldwide|impact wrestling|ring of honor|ufc|zuffa|dwts|major league)\b/i;

/** ¿Esta ficha de TMDB es un evento y no una película? Pura y exportada. */
export function esEvento(det = {}) {
  const companias = (det.production_companies || []).map((c) => c.name || '').join(' · ');
  return PRODUCTORAS_DE_EVENTO.test(companias);
}

export function classifyGenres(item, ids = []) {
  item.genre_ids = ids;
  item.isMusic = ids.includes(10402) && ids.includes(99);
  item.isDocumentary = ids.includes(99) && !item.isMusic;
  item.isTvMovie = ids.includes(10770);
  return item;
}

// Un puesto muy abajo en el reparto o un personaje tipo «Self» es un cameo, no
// un papel que un completista tenga que rellenar. Vive aquí, y no en discover.js,
// porque buildRoleItems lo necesita y discover.js ya importa de este módulo.
const CAMEO_RE = /^(self|himself|herself|uncredited|cameo|archive)/i;
export const isCameoCredit = (c) => (c.order ?? 99) >= 15 || CAMEO_RE.test(c.character || '');

// la selección de créditos por oficio vive en roles.js: aquí solo se usa
const roleRaw = (credits, role) => creditsForRole(credits, role);

export function buildRoleItems(credits, role, inLib, widx) {
  const now = today();
  const seen = new Set();
  const items = [];
  for (const c of roleRaw(credits, role)) {
    if (c.video) continue; // skip music videos / direct-to-video oddities flagged by TMDB
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const date = c.release_date || null;
    items.push(classifyGenres({
      tmdb_id: c.id,
      title: c.title,
      original_title: c.original_title,
      date,
      released: !!date && date <= now,
      owned: inLib.has(c.id),
      watched: isWatched({ tmdb_id: c.id, title: c.title, year: date ? Number(date.slice(0, 4)) : null }, widx),
      poster_path: c.poster_path,
      vote: c.vote_average,
      votes: c.vote_count ?? 0, // vote volume: the gaps flow filters obscure credits by it
      popularity: c.popularity,
      character: c.character || null,
      job: c.job || null,
      isCameo: role === 'actor' ? isCameoCredit(c) : false,
      isShort: false, // set after runtime enrichment
      isCoral: false, // set for directors after credits enrichment
    }, c.genre_ids || []));
  }
  items.sort((a, b) => ((b.date || '9999') < (a.date || '9999') ? -1 : 1));
  return items;
}

// A body of work is somebody's speciality once they have this many titles of a
// kind: below it they are side projects, above it they ARE the filmography.
const SPECIALITY_MIN = 4;

/**
 * Qué cuenta como largometraje de alguien. Una sola respuesta para la barra de
 * completismo y para las películas insignia, que si no acabarían discrepando:
 * fuera cortos, telefilmes, dirección coral y cameos, y fuera documentales y
 * conciertos salvo que sean la especialidad de esa persona.
 *
 * Recibe TODA su obra estrenada, porque «es documentalista» solo se puede
 * decidir mirando la filmografía entera, no un puñado de títulos.
 */
export function featureRule(released) {
  const documentarian = released.filter((i) => i.isDocumentary).length >= SPECIALITY_MIN;
  // quien filma el concierto suelto no se juzga por él; quien vive de ellos, sí
  const concertFilmmaker = released.filter((i) => i.isMusic).length >= SPECIALITY_MIN;
  const isFeature = (i) =>
    !i.isShort && !i.isTvMovie && !i.isCoral && !i.isCameo &&
    (!i.isDocumentary || documentarian) &&
    (!i.isMusic || concertFilmmaker);
  return { isFeature, documentarian, concertFilmmaker };
}

// Completeness bar. For directors it counts features only (#6): no shorts, no
// TV movies, no "coral" 3+ director films (#7), and no documentaries or concert
// films unless that is the person's speciality. Other roles count every release.
export function roleStats(items, role) {
  const released = items.filter((i) => i.released);
  const base = { upcoming: items.filter((i) => !i.released).length };
  if (role !== 'director') {
    const owned = released.filter((i) => i.owned);
    return { ...base, released: released.length, owned: owned.length,
      pct: released.length ? Math.round((owned.length / released.length) * 100) : 0 };
  }
  const { isFeature, documentarian, concertFilmmaker } = featureRule(released);
  const feats = released.filter(isFeature);
  const owned = feats.filter((i) => i.owned);
  return { ...base, released: feats.length, owned: owned.length,
    pct: feats.length ? Math.round((owned.length / feats.length) * 100) : 0,
    documentarian, concertFilmmaker, excludedFromCompletion: released.length - feats.length };
}

/**
 * Full person profile: builds every role they have (director/actor/writer) with
 * its own completeness bar, so a person who both directs and acts shows two bars
 * and you can switch between them (#8). `wantRole` decides which one opens first.
 */
/**
 * El cuerpo de la ficha, a partir de alguien que YA tiene id de TMDB.
 *
 * `persona.id` puede ser null: es el caso de quien no está en tu biblioteca ni
 * en tus favoritos —el director de una película de Cannes que aún no tienes—,
 * y su ficha se construye igual. Lo único que no se puede hacer sin fila local
 * es guardarle el estado vital.
 */
async function perfilDesde(person, wantRole = null) {
  const credits = await personCredits(person.tmdb_id);
  const details = await personDetails(person.tmdb_id);
  if (person.id) persistLife(person.id, details);
  const inLib = libraryTmdbIds();
  const widx = watchedIndex();

  // which roles this person actually has credits in
  const present = ROLES.map((r) => r.key).filter((k) => creditsForRole(credits, k).length > 0);
  // dirección e interpretación se construyen siempre que existan; los demás
  // oficios solo cuando son los que se han pedido (si no, cada ficha de persona
  // arrastraría seis filmografías que casi nunca se miran)
  const build = present.filter((r) => roleInfo(r)?.principal || r === wantRole);
  if (!build.length && present.length) build.push(present[0]);

  const roles = {};
  for (const role of build) {
    const items = buildRoleItems(credits, role, inLib, widx);
    await enrichRuntimes(items, { withCredits: role === 'director' });
    roles[role] = { stats: roleStats(items, role), items };
  }

  // Notas de MDBList sobre cada título (para ordenar/filtrar por calificación).
  // Solo estrenadas: las por venir no tienen nota y gastarían presupuesto.
  await enrichWithScores(
    Object.values(roles).flatMap((r) => r.items.filter((i) => i.released)),
    { maxFetch: 200 }
  );

  // open on the requested role if we built it, else the one with most releases
  const primary =
    (wantRole && roles[wantRole] && wantRole) ||
    Object.keys(roles).sort((a, b) => (roles[b].stats.released || 0) - (roles[a].stats.released || 0))[0] ||
    null;

  return {
    person: {
      id: person.id ?? null,
      name: person.name || details?.name || '',
      tmdb_id: person.tmdb_id,
      profile_path: details?.profile_path || null,
      biography: details?.biography || null,
      birthday: details?.birthday || null,
      deathday: details?.deathday || null,
      // sin esto, el botón de «quitar la corrección» no se pintaba nunca y un
      // emparejado fijado a mano se volvía permanente: la ruta de deshacer
      // existía en el servidor pero era inalcanzable desde la ficha
      tmdb_locked: person.tmdb_locked ?? 0,
      // false = no está en tu biblioteca ni en tus favoritos. La ficha se pinta
      // igual, pero la interfaz sabe que seguirle es un alta, no un cambio.
      enBiblioteca: !!person.id,
    },
    matched: true,
    primary,
    roles,
  };
}

export async function filmographyProfile(personId, wantRole = null) {
  const person = await resolvePerson(personId);
  if (!person?.tmdb_id) return { person, matched: false, roles: {} };
  return perfilDesde(person, wantRole);
}

/**
 * La ficha de cualquier persona de TMDB, esté o no en tu biblioteca.
 *
 * Si resulta que SÍ está, se sirve su ficha local: así siguen funcionando el
 * botón de seguir por faceta, el corrector de emparejado y el enlace a sus
 * películas en Plex, que cuelgan del id local.
 */
export async function filmographyProfileByTmdb(tmdbId, wantRole = null) {
  const id = Number(tmdbId);
  if (!id) return { person: null, matched: false, roles: {} };
  const local = db.prepare('SELECT * FROM people WHERE tmdb_id = ? LIMIT 1').get(id);
  if (local) return perfilDesde(local, wantRole);
  let det = null;
  try {
    det = await personDetails(id);
  } catch {
    return { person: null, matched: false, roles: {} };
  }
  if (!det?.id) return { person: null, matched: false, roles: {} };
  return perfilDesde({ id: null, name: det.name, tmdb_id: id, tmdb_locked: 0 }, wantRole);
}

// --- upcoming calendar -------------------------------------------------------

/**
 * Build calendar of upcoming/recent releases for the library's top + tracked people.
 */
// Cómo se lee el crédito en la ficha de Cine venidero. Los dos primeros los
// entiende también el cliente para decidir a qué faceta enlaza.
const CREDITO_DE_ROL = {
  director: 'Dirige',
  actor: 'Actúa',
  writer: 'Escribe',
  dop: 'Fotografía',
  composer: 'Compone',
  editor: 'Monta',
};

export async function buildCalendar({ topDirectors = 0, topActors = 0, pastDays = 60 } = {}) {
  // Favorites drive the calendar, each in the ONE role you follow them for: a
  // tracked director contributes what they direct, never what they act in.
  // The library "top" lists are opt-in extras (0 = only your favorites).
  const tops = db
    .prepare(
      `SELECT p.id, p.name, ? AS role, COUNT(*) AS n FROM movie_people mp
       JOIN people p ON p.id = mp.person_id
       WHERE mp.role = ? GROUP BY p.id ORDER BY n DESC LIMIT ?`
    );
  const directors = topDirectors > 0 ? tops.all('director', 'director', topDirectors) : [];
  const actors = topActors > 0 ? tops.all('actor', 'actor', topActors) : [];
  const tracked = db
    .prepare(
      `SELECT p.id, p.name, COALESCE(t.role, 'director') AS role, 0 AS n
       FROM tracked_people t JOIN people p ON p.id = t.person_id`
    )
    .all();

  const people = new Map();
  for (const p of [...directors, ...actors, ...tracked]) {
    const prev = people.get(p.id);
    if (prev) prev.roles.add(p.role);
    else people.set(p.id, { ...p, roles: new Set([p.role]) });
  }

  const now = today();
  const cutoff = new Date(Date.now() - pastDays * DAY).toISOString().slice(0, 10);
  const inLib = libraryTmdbIds();
  const events = new Map(); // tmdb_id -> event

  // TMDB person id -> our library person id, so the real director can be linked
  const peopleByTmdb = new Map(
    db.prepare('SELECT id, tmdb_id FROM people WHERE tmdb_id IS NOT NULL').all().map((r) => [r.tmdb_id, r.id])
  );

  const list = [...people.values()];
  setBuildProgress('calendar', 'Analizando filmografías', 0, list.length);
  const CONCURRENCY = 5;
  let idx = 0;
  const errors = [];
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= list.length) return;
      setBuildProgress('calendar', 'Analizando filmografías', i + 1, list.length);
      const p = list[i];
      try {
        const resolved = await resolvePerson(p.id);
        if (!resolved?.tmdb_id) continue;
        const credits = await personCredits(resolved.tmdb_id);
        // Se recorren TODAS las facetas por las que le sigues, no solo dos: al
        // añadirse fotografía, música y montaje en la 1.04, a quien seguías por
        // esos oficios no le salía nunca su próxima película en el calendario
        // —y encima costaba una consulta a TMDB cada noche para tirarla—.
        const candidates = [];
        const vistos = new Set();
        for (const rol of p.roles) {
          const info = roleInfo(rol);
          if (!info) continue;
          for (const c of creditsForRole(credits, rol)) {
            // una misma película puede llegar por dos facetas: manda la primera
            // en el orden de ROLES, donde la dirección va delante
            if (vistos.has(c.id)) continue;
            vistos.add(c.id);
            candidates.push({ ...c, credit: CREDITO_DE_ROL[rol] || info.singular });
          }
        }

        for (const c of candidates) {
          if (c.video) continue;
          const date = c.release_date || null;
          // keep undated (announced) and anything from cutoff forward
          if (date && date < cutoff) continue;
          const ev = events.get(c.id) || {
            tmdb_id: c.id,
            title: c.title,
            original_title: c.original_title,
            date,
            poster_path: c.poster_path,
            overview: c.overview || '',
            genre_ids: c.genre_ids || [],
            followedDirectors: [], // { id, name, tmdb_id } — favorites who direct it
            followedActors: [],    // { id, name, order } — favorites in the cast
            people: [],            // filled in the enrich pass (Dirige first, then Actúa)
            inLibrary: inLib.has(c.id),
          };
          if (c.credit === 'Dirige') {
            if (!ev.followedDirectors.some((x) => x.id === p.id))
              ev.followedDirectors.push({ id: p.id, name: p.name, tmdb_id: resolved.tmdb_id });
          } else if (!ev.followedActors.some((x) => x.id === p.id)) {
            ev.followedActors.push({ id: p.id, name: p.name, tmdb_id: resolved.tmdb_id, order: c.order ?? 999 });
          }
          events.set(c.id, ev);
        }
      } catch (err) {
        errors.push(`${p.name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const out = [...events.values()];

  // enrich with runtime + full credits: the film's real director is always shown
  // (even if not a favorite), followed by the single top-billed favorite actor.
  setBuildProgress('calendar', 'Detallando estrenos', 0, out.length);
  let ei = 0;
  async function enrichWorker() {
    for (;;) {
      const i = ei++;
      if (i >= out.length) return;
      setBuildProgress('calendar', 'Detallando estrenos', i + 1, out.length);
      const ev = out[i];
      let directors = [];
      try {
        const det = await movieDetail(ev.tmdb_id, { withCredits: true });
        ev.runtime = det.runtime || null;
        if (det.genres?.length) ev.genre_ids = det.genres.map((g) => g.id);
        directors = (det.credits?.crew || []).filter((c) => c.job === 'Director');
      } catch {
        ev.runtime = null;
      }
      // Letterboxd/Academy: short = under 40 min (unknown runtime counts as feature)
      ev.isShort = !!ev.runtime && ev.runtime < 40;
      classifyGenres(ev, ev.genre_ids || []);

      // "Dirige X" (real director, always) then "Actúa Y" (top-billed favorite)
      const dirSource = directors.length
        ? directors.map((d) => ({ tmdbId: d.id, name: d.name }))
        : ev.followedDirectors.map((d) => ({ tmdbId: d.tmdb_id, name: d.name }));
      const seenDir = new Set();
      const dirEntries = [];
      for (const d of dirSource) {
        if (seenDir.has(d.name)) continue;
        seenDir.add(d.name);
        dirEntries.push({ id: peopleByTmdb.get(d.tmdbId) ?? null, tmdb_id: d.tmdbId, name: d.name, credit: 'Dirige' });
      }
      const topActor = ev.followedActors
        .filter((a) => !seenDir.has(a.name))
        .sort((a, b) => a.order - b.order)[0];

      ev.people = dirEntries;
      if (topActor) ev.people.push({ id: topActor.id, tmdb_id: topActor.tmdb_id, name: topActor.name, credit: 'Actúa' });
      delete ev.followedDirectors;
      delete ev.followedActors;
    }
  }
  await Promise.all(Array.from({ length: 5 }, enrichWorker));
  await latinizeTitles(out);
  // «Dirige 深田晃司» → «Dirige Kôji Fukada»
  await latinizeNames(out.flatMap((e) => e.people || []));
  clearBuildProgress('calendar');

  out.sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'));
  return {
    generatedAt: Date.now(),
    today: now,
    peopleCount: list.length,
    events: out,
    errors: errors.slice(0, 10),
  };
}

export async function getCalendarCached({ refresh = false } = {}) {
  const topDirectors = Number(getSetting('cal_top_directors') || 0);
  const topActors = Number(getSetting('cal_top_actors') || 0);
  // el tamaño del radar entra en la clave: cambiarlo tenía que notarse ya, no
  // doce horas después
  const key = `${cachePrefix('calendar')}:${topDirectors}:${topActors}`;
  if (!refresh) {
    const hit = cacheRead(key, 12 * 3600 * 1000);
    // el «hoy» se recalcula al servir: uno construido a las 23:00 repartía mal
    // «estrena hoy» a la mañana siguiente
    if (hit && !esParcialCaducado(hit)) return { ...hit, today: today() };
  }
  const cal = await buildCalendar({ topDirectors, topActors });
  // Si TODO fue bien se guarda con su vida normal; si algo falló se guarda
  // igualmente marcado como parcial y con vida corta (20 min). No guardar nada
  // era peor: una sola persona que falle obligaba a reconstruir la página
  // entera en cada visita, con más peticiones y más probabilidad de fallar.
  if (cal.events.length || !cal.errors.length) cacheWrite(key, { ...cal, partial: cal.errors.length > 0 });
  return cal;
}

// --- suggested people (favorites) -------------------------------------------

// Curated "packs" of directors to follow, each surfaced with an "add all"
// button in Favoritos → Descubrir (#9).
// Los cuatro paquetes escritos a mano que había aquí («directores españoles»,
// «premiados en festivales», «emergentes» y «taquilleros») los sustituye el
// catálogo de Directores en activo: 680 nombres de Wikidata con región, país,
// género, obra y premios, donde esas cuatro ideas son un filtro y un orden en
// vez de veinte nombres congelados. Lo que sigue vivo aquí es lo que el
// catálogo NO puede dar: «en boga», que cambia día a día según TMDB.
const DIRECTOR_PACKS = [];


/** Curated director packs + directors "en boga" from TMDB, each with a tracked flag. */
export async function suggestedPeople() {
  // los paquetes son de directores: seguir a alguien como actor no le marca aquí
  const trackedTmdb = new Set(
    db.prepare(`SELECT p.tmdb_id FROM tracked_people t JOIN people p ON p.id = t.person_id
                WHERE p.tmdb_id IS NOT NULL AND t.role = 'director'`)
      .all().map((r) => r.tmdb_id)
  );
  const mapP = (p) => ({
    tmdb_id: p.id,
    name: p.name,
    profile_path: p.profile_path || null,
    tracked: trackedTmdb.has(p.id),
    knownFor: (p.known_for || []).map((k) => k.title || k.name).filter(Boolean).slice(0, 2),
  });

  // popular people, filtered to directors ("en boga" según TMDB/IMDb)
  const popularRaw = [];
  for (const page of [1, 2, 3, 4]) {
    const data = await personPopularPage(page);
    for (const p of data.results || []) if (p.known_for_department === 'Directing') popularRaw.push(p);
  }
  const seen = new Set();
  const trending = [];
  for (const p of popularRaw.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    trending.push(mapP(p));
    if (trending.length >= 20) break;
  }

  // resolve each curated pack (findPersonInfo is cached 30 days)
  const packs = [];
  for (const pack of DIRECTOR_PACKS) {
    const people = [];
    for (const name of pack.names) {
      try {
        const info = await findPersonInfo(name, 'Directing');
        if (info?.id) people.push({ tmdb_id: info.id, name: info.name || name, profile_path: info.profile_path || null, tracked: trackedTmdb.has(info.id) });
      } catch {}
    }
    if (people.length) packs.push({ key: pack.key, title: pack.title, emoji: pack.emoji, description: pack.description, accent: pack.accent, people });
  }
  packs.push({
    key: 'trending', title: 'Directores en boga', emoji: '🔥', accent: 'orange',
    description: 'Los más populares ahora mismo según el ranking de TMDB/IMDb.', people: trending,
  });

  // el nombre principal de TMDB puede venir en su alfabeto original
  await latinizeNames(packs.flatMap((pk) => pk.people));

  // keep `spanish`/`popular` keys for backward compatibility with older clients
  return { packs, spanish: packs.find((p) => p.key === 'spanish')?.people || [], popular: trending };
}

/** Search TMDB people (to add anyone to favorites by typing). With `role`, the
 *  tracked flag refleja SOLO esa faceta: seguido como director sigue siendo
 *  añadible como actor. */
export async function searchPeople(query, role = null) {
  const data = await tmdbGet('/search/person', { query }, { cacheKey: null });
  const trackedTmdb = new Set(
    db.prepare(`SELECT p.tmdb_id FROM tracked_people t JOIN people p ON p.id = t.person_id
                WHERE p.tmdb_id IS NOT NULL AND (? IS NULL OR t.role = ?)`)
      .all(role, role).map((r) => r.tmdb_id)
  );
  return latinizeNames((data.results || []).slice(0, 12).map((p) => ({
    tmdb_id: p.id,
    name: p.name,
    profile_path: p.profile_path || null,
    dept: p.known_for_department || null,
    knownFor: (p.known_for || []).map((k) => k.title || k.name).filter(Boolean).slice(0, 2),
    tracked: trackedTmdb.has(p.id),
  })));
}

// Con cuántas interpretadas en tu biblioteca un director/a seguido gana solo la
// faceta de actor. Más alto que el umbral de director (4): dirigir no pasa por
// accidente, pero el conteo de actor arrastra cameos y papeles menores.
const ACTOR_SPECIALITY_MIN = 8;

/**
 * Sigue una faceta de una persona, y la otra de propina cuando toca (el caso
 * Eastwood): añadido como actor, si dirige 4+ películas de tu biblioteca
 * (SPECIALITY_MIN) entra también en directores; añadido como director/a, si
 * tiene 8+ interpretadas (ACTOR_SPECIALITY_MIN) entra también en actores.
 */
export function followFacets(personId, role = 'director') {
  // Hasta la 1.04 esto colapsaba TODO a director o actor: seguir a alguien como
  // compositor lo guardaba como director y su ficha quedaba absurda. Ahora se
  // respeta el oficio pedido, con «director» como respaldo si llega basura.
  const followRole = asRole(role, 'director');
  const ins = db.prepare('INSERT OR IGNORE INTO tracked_people (person_id, added_at, role) VALUES (?, ?, ?)');
  const added = !!ins.run(personId, Date.now(), followRole).changes;
  const cuenta = db.prepare('SELECT COUNT(*) n FROM movie_people WHERE person_id = ? AND role = ?');
  let directorAlso = false;
  let actorAlso = false;
  // La regla automática de facetas sigue siendo SOLO de dirección e
  // interpretación: extenderla a los oficios nuevos generaría ruido (un
  // montador con cuatro películas dirigidas no es un director al que sigas).
  if (followRole === 'actor' && cuenta.get(personId, 'director').n >= SPECIALITY_MIN) {
    directorAlso = !!ins.run(personId, Date.now(), 'director').changes;
  }
  if (followRole === 'director' && cuenta.get(personId, 'actor').n >= ACTOR_SPECIALITY_MIN) {
    actorAlso = !!ins.run(personId, Date.now(), 'actor').changes;
  }
  return { added, directorAlso, actorAlso, role: followRole };
}

/** Add someone to favorites by TMDB person id, creating a people row if needed. */
export function trackByTmdb({ tmdbId, name, profilePath = null, role = 'director' }) {
  if (!tmdbId || !name) throw new Error('Faltan datos de la persona');
  let row = db.prepare('SELECT id FROM people WHERE tmdb_id = ?').get(tmdbId);
  if (!row) {
    const byName = db.prepare('SELECT id, tmdb_id FROM people WHERE name = ?').get(name);
    if (byName) {
      if (!byName.tmdb_id) db.prepare('UPDATE people SET tmdb_id = ? WHERE id = ?').run(tmdbId, byName.id);
      row = byName;
    } else {
      const thumb = profilePath ? `https://image.tmdb.org/t/p/w185${profilePath}` : null;
      const id = db.prepare('INSERT INTO people (name, thumb, tmdb_id) VALUES (?, ?, ?)').run(name, thumb, tmdbId).lastInsertRowid;
      row = { id };
    }
  }
  const f = followFacets(row.id, role);
  return { ok: true, personId: row.id, role: f.role, directorAlso: f.directorAlso };
}

// --- collections ------------------------------------------------------------


export async function collectionDetails(id) {
  return tmdbGet(`/collection/${id}`, {}, { cacheKey: `coll:${id}:${lang()}`, cacheMs: 7 * DAY });
}
