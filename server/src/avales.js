/**
 * LOS AVALES DE UNA PELÍCULA: en qué palmareses y en qué cánones aparece.
 *
 * PowaFlex sabía ir de un premio a sus películas, pero no al revés. Mirando una
 * ficha no había forma de saber si eso que te falta lo respalda un premio o
 * catorce, y ésa es justo la pregunta del completismo: entre dos huecos, ¿cuál
 * pesa más?
 *
 * Y la respuesta ya estaba pagada. El paquete de palmareses que viaja con la
 * app (`palmares-2026.js`) son 4.794 filas con su `tmdb_id` YA emparejado, más
 * el dataset del Óscar; y de los cánones y de los premios que se han visitado
 * alguna vez, la caché `film_match:` guarda a qué ficha de TMDB corresponde cada
 * fila. Con eso, darle la vuelta al índice no cuesta ni una petición a la red.
 *
 * DE DÓNDE SALE CADA AVAL, y qué implica:
 *
 *  1. **El paquete** (31 premios hasta 2024): siempre disponible, en cualquier
 *     instalación, sin haber abierto nada. Es el suelo.
 *  2. **Los datasets fijos** (Óscar; Sight & Sound y las 1001 vía `film_match`).
 *  3. **Los premios ya consultados**: sus filas quedan cacheadas en
 *     `awardrows:` y su emparejado en `film_match:`. Esto solo SUMA avales —
 *     nunca quita— así que una película puede pasar de 3 a 4 cuando abres el
 *     palmarés que faltaba. Es información nueva, no una corrección.
 *
 * LO QUE NO ESTÁ, y hay que decirlo en la interfaz: los años posteriores al
 * corte del paquete (2024) de un premio que no hayas visitado. Se arregla
 * regenerando el paquete con `npm run snapshot`, o simplemente abriendo ese
 * palmarés una vez.
 */
import { db, cacheRead, getSetting, setSetting } from './db.js';
import {
  REGISTRY, festivalOverrideKey, staticListRows, filasEmpaquetadas, empaquetadoHasta, festivalWinners,
  CLAVE_MATCH,
} from './festivals.js';
import { cachePrefix } from './cache-versions.js';

const AWARD_ROWS_TTL = 30 * 24 * 3600 * 1000;
// El índice entero se rehace de una vez y se guarda en memoria: son ~12.000
// filas y dos consultas a la base, así que rehacerlo en cada ficha de película
// sería tirar el trabajo. Un minuto basta para que abrir el palmarés de Cannes
// y volver a una ficha ya enseñe el aval nuevo.
const MEMO_MS = 60 * 1000;
let memo = null;

/**
 * Mapa clave-de-emparejado → tmdb_id, de UNA consulta.
 *
 * Leer `film_match:` fila a fila serían ~6.000 lecturas puntuales; así es una
 * sola. Las correcciones manuales del usuario (`match_overrides`) se aplican
 * encima, porque mandan sobre el emparejado automático en todas partes.
 */
function mapaDeEmparejados() {
  const prefijo = CLAVE_MATCH;
  const mapa = new Map();
  const corte = Date.now() - 365 * 24 * 3600 * 1000;
  for (const r of db
    .prepare('SELECT key, json, fetched_at FROM tmdb_cache WHERE key LIKE ?')
    .all(`${prefijo}%`)) {
    if (r.fetched_at < corte) continue;
    try {
      const id = JSON.parse(r.json)?.id;
      if (id) mapa.set(r.key.slice(prefijo.length), id);
    } catch {}
  }
  for (const o of db.prepare('SELECT key, tmdb_id FROM match_overrides').all()) {
    if (o.tmdb_id) mapa.set(o.key, o.tmdb_id);
    else mapa.delete(o.key); // corrección a «ninguna»: el aval desaparece
  }
  return mapa;
}

/** Las filas de un premio que estén EN CACHÉ, sin salir a Wikipedia. */
function filasCacheadas(f) {
  for (const sufijo of ['todas', 'ganadoras']) {
    const key = `${cachePrefix('festival')}:awardrows:${sufijo}:${f.awardLang || 'en'}:${f.awardPage}`;
    const hit = cacheRead(key, AWARD_ROWS_TTL);
    if (hit?.rows?.length) return hit.rows;
  }
  return null;
}

function construir() {
  const porPelicula = new Map(); // tmdb_id → [aval]
  const emparejados = mapaDeEmparejados();
  const añadir = (tmdbId, aval) => {
    if (!tmdbId) return;
    const lista = porPelicula.get(tmdbId);
    if (!lista) return void porPelicula.set(tmdbId, [aval]);
    // una misma película puede salir dos veces en el mismo premio (nominada un
    // año, ganadora otro): manda la que gana, y si no, la más reciente
    const previo = lista.find((a) => a.key === aval.key);
    if (!previo) return void lista.push(aval);
    if ((aval.winner && !previo.winner) || (aval.winner === previo.winner && aval.year > previo.year)) {
      Object.assign(previo, aval);
    }
  };

  for (const [key, f] of Object.entries(REGISTRY)) {
    const meta = { key, name: f.name, group: f.group || 'festival' };
    // Las tres procedencias se SUMAN, no se eligen: el paquete llega hasta su
    // año de corte y las filas cacheadas traen lo de después. `añadir` ya
    // resuelve el duplicado cuando una misma película sale por las dos.
    const trozos = [];
    const empaquetadas = filasEmpaquetadas(key, { keepAll: true }); // 1. el paquete, con tmdb_id de origen
    if (empaquetadas?.length) trozos.push(empaquetadas);
    if (f.staticList) trozos.push(staticListRows(f)); // 2. los cánones fijos
    if (f.staticAward) trozos.push(f.staticAward); // el dataset del Óscar
    const cacheadas = filasCacheadas(f); // 3. lo ya consultado alguna vez
    if (cacheadas?.length) trozos.push(cacheadas);

    for (const r of trozos.flat()) {
      if (r.tv) continue; // una serie en un canon no es una película que buscar
      const id = r.tmdb_id || emparejados.get(festivalOverrideKey(r.title, r.year, r.director));
      añadir(id, {
        ...meta,
        year: Number(r.year) || null,
        // En un palmarés de solo ganadoras la bandera no viene: si está en la
        // lista, ganó. En los que traen nominadas, `winner` lo dice la fila.
        // Un CANON no se gana: estar en Sight & Sound no es un trofeo, es un
        // puesto, y contarlo entre los premios ganados inflaría la cuenta.
        winner: meta.group === 'canon' ? false : r.winner !== undefined ? !!r.winner : !f.awardNominees,
        rank: r.rank ?? null,
      });
    }
  }

  // el corte del paquete, para poder decir en la interfaz hasta dónde llega
  const cortes = Object.keys(REGISTRY)
    .map((k) => empaquetadoHasta(k))
    .filter((n) => Number.isFinite(n));
  return {
    porPelicula,
    hasta: cortes.length ? Math.max(...cortes) : null,
    fuentes: new Set([...porPelicula.values()].flat().map((a) => a.key)).size,
    peliculas: porPelicula.size,
    at: Date.now(),
  };
}

/** El índice, construido como mucho una vez por minuto. */
export function indiceAvales({ refresh = false } = {}) {
  if (refresh || !memo || Date.now() - memo.at > MEMO_MS) memo = construir();
  return memo;
}

/** Que una recarga de datos no sirva un índice viejo. */
export const olvidarIndiceAvales = () => { memo = null; };

// El orden en que se leen: primero quién la premió, luego quién la canoniza.
const ORDEN_GRUPO = { festival: 0, debut: 1, premio: 2, critica: 3, animacion: 4, documental: 5, canon: 6 };

/**
 * Los avales de una película, ordenados para pintarlos. Devuelve siempre la
 * misma forma —aunque no tenga ninguno— para que la interfaz no tenga que
 * distinguir «sin avales» de «no lo hemos mirado».
 */
export function avalesDe(tmdbId) {
  const idx = indiceAvales();
  const lista = [...(idx.porPelicula.get(Number(tmdbId)) || [])].sort(
    (a, b) =>
      (ORDEN_GRUPO[a.group] ?? 9) - (ORDEN_GRUPO[b.group] ?? 9) ||
      Number(b.winner) - Number(a.winner) ||
      String(a.name).localeCompare(String(b.name))
  );
  return {
    total: lista.length,
    ganados: lista.filter((a) => a.winner).length,
    canones: lista.filter((a) => a.group === 'canon').length,
    hasta: idx.hasta,
    lista,
  };
}

/** Cuándo se intentó encender cada fuente por última vez. */
function intentos() {
  try {
    return JSON.parse(getSetting('avales_intentos') || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * QUÉ FUENTES NO APORTAN NADA TODAVÍA.
 *
 * Una fuente entra en el índice cuando sus filas están emparejadas con TMDB, y
 * eso pasa la primera vez que se abre su palmarés. Las que vienen empaquetadas
 * con la app aportan desde el minuto cero; las demás —las veintidós entradas
 * nuevas, los catálogos, los cánones fijos— estarían frías hasta que alguien se
 * pasara por cada una, que es exactamente el trabajo manual que no tiene por
 * qué hacer nadie.
 *
 * La definición es la honesta: fría es la que **no aporta ni una película** al
 * índice. Sin listas paralelas que mantener ni banderas que se olviden.
 */
export function fuentesFrias() {
  const idx = indiceAvales({ refresh: true });
  const vivas = new Set([...idx.porPelicula.values()].flat().map((a) => a.key));
  const intentadas = intentos();
  const reintentoMs = 7 * 24 * 3600 * 1000;
  return Object.keys(REGISTRY)
    .filter((k) => {
      const f = REGISTRY[k];
      if (!(f.awardPage || f.staticList || f.staticAward) || vivas.has(k)) return false;
      // Ya se intentó hace poco y sigue sin aportar: o su artículo cambió de
      // molde, o ninguna de sus películas casa con TMDB. Reintentarlo cada
      // noche sería gastar el presupuesto en la única fuente que no puede
      // aprovecharlo, y dejar a las demás sin encender. Se vuelve a probar a la
      // semana, por si lo arreglan en Wikipedia.
      return Date.now() - (intentadas[k] || 0) > reintentoMs;
    })
    // los catálogos tabulados al final: Criterion son 1.176 películas y no
    // tiene sentido que se coma el presupuesto de la primera noche cuando por
    // el mismo precio se encienden seis premios enteros
    .sort((a, b) => (REGISTRY[a].awardParse === 'lista' ? 1 : 0) - (REGISTRY[b].awardParse === 'lista' ? 1 : 0));
}

/**
 * Enciende las fuentes frías, de noche y a plazos.
 *
 * Abrir el palmarés de un premio es lo que empareja sus filas con TMDB, así que
 * esto hace justo eso, sin nadie delante: `festivalWinners` trae las filas,
 * resuelve las fichas y lo deja todo cacheado treinta días. A la mañana
 * siguiente, esas películas ya traen su aval en cualquier parrilla.
 *
 * Va ACOTADO por dos frenos, y los dos importan: `maxFuentes` para no encadenar
 * veinte reconstrucciones en una noche, y `presupuesto` en películas para que
 * un catálogo de mil doscientas no arrastre a los demás detrás. Lo que no entra
 * hoy entra mañana: el paso se salta solo en cuanto no queda nada frío.
 */
export async function calentarAvales({ maxFuentes = 6, presupuesto = 900 } = {}) {
  const frias = fuentesFrias();
  const errores = [];
  const marcadas = intentos();
  let hechas = 0;
  let peliculas = 0;
  for (const key of frias) {
    if (hechas >= maxFuentes || peliculas >= presupuesto) break;
    // se apunta el intento ANTES de hacerlo: si la fuente resulta ser un pozo
    // (artículo movido, nada que case), no vuelve mañana a por lo mismo
    marcadas[key] = Date.now();
    try {
      const r = await festivalWinners(key);
      peliculas += r.films?.length || 0;
      hechas++;
    } catch (err) {
      // un premio con el artículo movido no puede parar a los demás
      errores.push(`${REGISTRY[key].name}: ${String(err.message || err)}`);
    }
  }
  setSetting('avales_intentos', JSON.stringify(marcadas));
  olvidarIndiceAvales();
  return { frias: frias.length, hechas, peliculas, quedan: Math.max(0, frias.length - hechas), errores };
}

/**
 * Cuántos avales tiene cada una de estas películas, para las parrillas. Solo el
 * número: mandar la lista entera de treinta y tantas películas engordaría la
 * respuesta sin que nadie la lea hasta abrir la ficha.
 */
export function conteoAvales(tmdbIds) {
  const idx = indiceAvales();
  const out = {};
  for (const id of tmdbIds) {
    const lista = idx.porPelicula.get(Number(id));
    if (lista?.length) out[id] = { total: lista.length, ganados: lista.filter((a) => a.winner).length };
  }
  return out;
}

/**
 * El resumen de una filmografía: cuántas de sus películas están en cánones y en
 * palmareses. Es la versión por persona de lo mismo, y contesta «¿qué parte de
 * su obra está avalada, y cuánta tengo yo?».
 */
export function avalesDeFilmografia(items = []) {
  const idx = indiceAvales();
  let conAval = 0;
  let tuyasConAval = 0;
  const porFuente = new Map();
  for (const it of items) {
    const lista = idx.porPelicula.get(Number(it.tmdb_id));
    if (!lista?.length) continue;
    conAval++;
    if (it.owned) tuyasConAval++;
    for (const a of lista) {
      const p = porFuente.get(a.key) || { key: a.key, name: a.name, group: a.group, n: 0, ganados: 0 };
      p.n++;
      if (a.winner) p.ganados++;
      porFuente.set(a.key, p);
    }
  }
  return {
    conAval,
    tuyasConAval,
    fuentes: [...porFuente.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
  };
}
