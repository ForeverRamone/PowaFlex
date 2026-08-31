import { db, cacheRead, cacheWrite } from './db.js';
import { today } from './dates.js';
import {
  tmdbGet, movieDetail, esParcialCaducado, classifyGenres, esEvento,
  personCredits, latinizeNames, latinizeTitles, setBuildProgress, clearBuildProgress,
} from './tmdb.js';
import { enrichWithScores } from './mdblist.js';
import { indiceAvales } from './avales.js';
import { matchMovie, watchedIndex, isWatched } from './letterboxd.js';
import { mapPool } from './pool.js';
import { cachePrefix } from './cache-versions.js';
import { esLargometraje, providersDeRegion } from './releases.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/**
 * QUIÉN ESTRENA EN ESPAÑA EN LOS PRÓXIMOS MESES.
 *
 * La página de Estrenos contesta «qué» se estrena; ésta contesta «quién», que
 * es la pregunta con la que se decide ir al cine. La lista sale del mismo
 * discover de TMDB acotado por región (la única fuente consistente de fechas
 * por país), pero se le da la vuelta: en vez de una parrilla de carteles, una
 * ficha por director/a con su estreno, sus mejores películas anteriores y por
 * qué palmareses ha pasado.
 *
 * Los dos canales son los dos de España que ya conocía la casa: la SALA
 * (release_type 3|2) y las PLATAFORMAS Y VOD (release_type 4). Van juntos por
 * defecto y se filtran por separado, porque en el mismo mes conviven el estreno
 * de cartelera y el que sale directo a Filmin.
 */

// Los dos canales de España, con el tipo de estreno de TMDB que los define.
export const CANALES = {
  cine: { types: '3|2', label: 'Cines' },
  plataforma: { types: '4', label: 'Plataformas y VOD' },
};

const REGION = 'ES';
const PAGINAS = 2; // 40 títulos por popularidad y mes: de ahí para abajo es cola
const MESES = 3;
// Cuando al mes en curso le quedan menos de esto, la ventana salta al siguiente:
// abrir la página el 31 de agosto para que el primer mes sea agosto no informa
// de nada. Ver `mesesDeLaVentana`.
const DIAS_MINIMOS_DEL_MES_EN_CURSO = 7;

const dosDigitos = (n) => String(n).padStart(2, '0');
const iso = (año, mes, dia) => `${año}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
const ultimoDia = (año, mes) => new Date(año, mes, 0).getDate(); // mes 1-12

/**
 * LOS TRES MESES DE LA VENTANA, y por qué el primero puede no ser el de hoy.
 *
 * La ventana natural es «este mes y los dos siguientes», pero un mes que se
 * acaba mañana no es un mes: el 31 de agosto, «agosto» son cero estrenos y una
 * pestaña vacía. Cuando al mes en curso le quedan menos de siete días la
 * ventana arranca en el siguiente, que es lo que uno quiere ver a finales de
 * mes. El primer mes, si es el de hoy, empieza HOY y no el día 1: lo que ya se
 * estrenó la semana pasada no es «quién estrena pronto».
 *
 * Pura y exportada para poder testearla sin tocar la red.
 */
export function mesesDeLaVentana(hoy, n = MESES) {
  const año = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const dia = Number(hoy.slice(8, 10));
  const quedan = ultimoDia(año, mes) - dia + 1;
  const salto = quedan < DIAS_MINIMOS_DEL_MES_EN_CURSO ? 1 : 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    // Date normaliza el desbordamiento de mes (13 → enero del año siguiente)
    const d = new Date(año, mes - 1 + salto + i, 1);
    const a = d.getFullYear();
    const m = d.getMonth() + 1;
    const primero = iso(a, m, 1);
    out.push({
      clave: `${a}-${dosDigitos(m)}`,
      año: a,
      mes: m,
      // el mes en curso empieza hoy: los estrenos de la semana pasada ya no son noticia
      desde: primero < hoy ? hoy : primero,
      hasta: iso(a, m, ultimoDia(a, m)),
    });
  }
  return out;
}

async function discoverMes({ canal, desde, hasta }) {
  const out = [];
  const errors = [];
  for (let page = 1; page <= PAGINAS; page++) {
    try {
      const data = await tmdbGet(
        '/discover/movie',
        {
          region: REGION,
          with_release_type: CANALES[canal].types,
          'release_date.gte': desde,
          'release_date.lte': hasta,
          sort_by: 'popularity.desc',
          page,
        },
        { cacheKey: `estrenan_disc:${canal}:${desde}:${hasta}:${page}`, cacheMs: 6 * HOUR }
      );
      out.push(...(data.results || []));
      if (page >= (data.total_pages || 1)) break;
    } catch (err) {
      errors.push(`${canal} ${desde}: ${err.message}`);
      break; // sin red no hay más páginas que pedir
    }
  }
  return { results: out, errors };
}

/**
 * La ficha de TMDB de cada estreno, de una sola petición por película: la
 * duración (para echar a los cortos), la productora (para echar a las galas de
 * lucha libre) y, lo que da nombre a la página, QUIÉN LA DIRIGE. La caché es la
 * misma que usa el resto de la app (`movie_cr:`), así que una película que ya
 * se miró en Estrenos no cuesta nada aquí.
 */
async function detallar(items, { concurrency = 6 } = {}) {
  let hechos = 0;
  // el rótulo se pone ANTES de la primera respuesta: si no, la barra se queda
  // con el paso anterior mientras se pide la ficha de ciento y pico películas
  setBuildProgress('directores', 'Mirando quién dirige cada estreno', 0, items.length);
  await mapPool(items, concurrency, async (it) => {
    try {
      const det = await movieDetail(it.tmdb_id, { withCredits: true });
      it.runtime = det.runtime || null;
      if (det.genres?.length) classifyGenres(it, det.genres.map((g) => g.id));
      if (esEvento(det)) it.isEvento = true;
      it.directores = (det.credits?.crew || [])
        .filter((c) => c.job === 'Director' && c.id)
        .map((c) => ({ tmdb_id: c.id, name: c.name, profile_path: c.profile_path || null }));
    } catch {
      it.runtime = it.runtime ?? null;
      it.directores = [];
    }
    setBuildProgress('directores', 'Mirando quién dirige cada estreno', ++hechos, items.length);
  });
  return items;
}

// Nota ponderada al estilo IMDb: sin esto, «lo mejor» de una filmografía es
// siempre el corto de 12 votos con un 9,5. m = votos que hacen falta para que
// la nota propia pese la mitad; C = la media global de TMDB.
const VOTOS_DE_REFERENCIA = 500;
const MEDIA_TMDB = 6.2;
// Y aun ponderando, una película de doce votos vale ~la media global y adelanta
// a otra de novecientos que de verdad es floja. Doce votos no es una nota baja:
// es que nadie la ha visto, y ponerla entre «lo mejor de» es ruido. Las que
// pasan el listón van delante; las demás solo salen si no hay tres que lo pasen.
const VOTOS_MINIMOS = 50;
const ponderada = (v = 0, n = 0) =>
  ((n || 0) / ((n || 0) + VOTOS_DE_REFERENCIA)) * (v || 0) + (VOTOS_DE_REFERENCIA / ((n || 0) + VOTOS_DE_REFERENCIA)) * MEDIA_TMDB;

/** El orden en que se lee un palmarés: primero quién la premió, luego quién la canoniza. */
const ORDEN_GRUPO = { festival: 0, debut: 1, premio: 2, critica: 3, animacion: 4, documental: 5, canon: 6 };

/**
 * SU OBRA ANTERIOR, en tres películas y en un palmarés.
 *
 * Sale de los créditos de dirección de TMDB, que ya vienen cacheados una semana.
 * «Mejores» va por nota PONDERADA (ver `ponderada`) y no por nota pelada: con la
 * nota pelada, la mejor película de casi cualquier director resultaba ser un
 * corto de instituto con catorce votos.
 */
export function obraAnterior(credits, { hoy, excluir }) {
  const dirigidas = (credits?.crew || [])
    .filter((c) => c.job === 'Director' && !c.video && c.id)
    // una misma película sale dos veces cuando también firma el guion
    .filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i);
  const estrenadas = dirigidas.filter((c) => c.release_date && c.release_date <= hoy);
  const idx = indiceAvales();

  const mejores = estrenadas
    .filter((c) => !excluir.has(c.id))
    .map((c) => ({
      tmdb_id: c.id,
      title: c.title || c.original_title,
      year: c.release_date ? Number(c.release_date.slice(0, 4)) : null,
      vote: c.vote_average || null,
      votes: c.vote_count || 0,
      poster_path: c.poster_path || null,
      peso: ponderada(c.vote_average, c.vote_count),
      conocida: (c.vote_count || 0) >= VOTOS_MINIMOS,
    }))
    .sort((a, b) => Number(b.conocida) - Number(a.conocida) || b.peso - a.peso)
    .slice(0, 3);

  // Los premios de TODA su obra, no solo de las tres de arriba: una fuente por
  // línea, quedándose con el año más reciente y dando la cara a las ganadas.
  const porFuente = new Map();
  for (const c of dirigidas) {
    for (const a of idx.porPelicula.get(c.id) || []) {
      const previo = porFuente.get(a.key);
      if (!previo || (a.winner && !previo.winner) || (a.winner === previo.winner && (a.year || 0) > (previo.year || 0))) {
        porFuente.set(a.key, { key: a.key, name: a.name, group: a.group, year: a.year, winner: a.winner });
      }
    }
  }
  const palmares = [...porFuente.values()]
    .sort((a, b) => Number(b.winner) - Number(a.winner) || (ORDEN_GRUPO[a.group] ?? 9) - (ORDEN_GRUPO[b.group] ?? 9) || (b.year || 0) - (a.year || 0))
    .slice(0, 4);

  const años = estrenadas.map((c) => Number(c.release_date.slice(0, 4))).filter(Boolean);
  return {
    mejores,
    palmares,
    dirigidas: estrenadas.length,
    debut: años.length ? Math.min(...años) : null,
  };
}

/**
 * Lo que la base ya sabe de esta gente: tu ficha, si la sigues COMO DIRECCIÓN y
 * cuántas suyas tienes.
 *
 * La faceta importa. Seguir a alguien como actor no lo hace favorito de esta
 * página —va de quién dirige—, y además la ★ desfavoritea con `?role=director`:
 * pintarla encendida por su faceta de reparto habría dado un botón que se apaga
 * en pantalla y no cambia nada en la base.
 */
function contextoLocal(tmdbIds) {
  if (!tmdbIds.length) return new Map();
  const marcas = tmdbIds.map(() => '?').join(',');
  const out = new Map();
  for (const r of db.prepare(`SELECT id, tmdb_id FROM people WHERE tmdb_id IN (${marcas})`).all(...tmdbIds)) {
    out.set(r.tmdb_id, { personId: r.id, favorito: false, enTuPlex: 0 });
  }
  for (const r of db
    .prepare(
      `SELECT p.tmdb_id FROM tracked_people t JOIN people p ON p.id = t.person_id
       WHERE t.role = 'director' AND p.tmdb_id IN (${marcas})`
    )
    .all(...tmdbIds)) {
    const c = out.get(r.tmdb_id);
    if (c) c.favorito = true;
  }
  for (const r of db
    .prepare(
      `SELECT p.tmdb_id, COUNT(*) n FROM people p JOIN movie_people mp ON mp.person_id = p.id
       WHERE mp.role = 'director' AND p.tmdb_id IN (${marcas}) GROUP BY p.tmdb_id`
    )
    .all(...tmdbIds)) {
    const c = out.get(r.tmdb_id);
    if (c) c.enTuPlex = r.n;
  }
  return out;
}

/**
 * LO TUYO NO SE CACHEA: se vuelve a mirar al servir.
 *
 * La lista de quién estrena aguanta doce horas sin despeinarse, pero a quién
 * sigues cambia con un clic —y el clic está en esta misma página—. Con el
 * favorito metido en la caché, darle a la ★ y recargar devolvía la estrella
 * apagada durante medio día. Y como el orden por defecto pone a los tuyos
 * delante, hay que rehacer el peso y volver a ordenar.
 *
 * Son dos consultas a la base, sin red. Mismo trato que las notas de Estrenos.
 */
function refrescarContexto(result) {
  const ids = [...new Set(result.meses.flatMap((m) => m.directores.map((d) => d.tmdb_id)))];
  const contexto = contextoLocal(ids);
  for (const m of result.meses) {
    for (const d of m.directores) {
      Object.assign(d, contexto.get(d.tmdb_id) || { personId: null, favorito: false, enTuPlex: 0 });
      d.peso = peso(d);
    }
    m.directores.sort((a, b) => b.peso - a.peso || a.name.localeCompare(b.name));
    m.favoritos = m.directores.filter((d) => d.favorito).length;
  }
  return result;
}

/**
 * El peso con el que se ordena por defecto («Lo más gordo primero»). No es una
 * nota: es el orden en el que uno quiere leer la lista — primero a quien sigues,
 * luego a quien ha ganado algo, luego lo que suena. El cliente puede reordenar.
 */
export function peso(d) {
  const premios = d.palmares.filter((p) => p.winner).length;
  return (
    (d.favorito ? 1000 : 0) +
    premios * 60 +
    Math.min(d.palmares.length, 6) * 15 +
    Math.min(d.enTuPlex, 10) * 8 +
    Math.min(d.popularidad || 0, 200) / 10
  );
}

/**
 * QUIÉN ESTRENA EN ESPAÑA, mes a mes.
 *
 * Devuelve los tres meses de la ventana, cada uno con la lista de directores y,
 * dentro de cada uno, sus estrenos de ese mes. Un mismo director sale en los
 * tres meses si estrena en los tres; y una película con dos firmas sale en las
 * dos fichas, que es lo correcto: los dos estrenan.
 */
export async function directoresQueEstrenan({ refresh = false } = {}) {
  const hoy = today();
  const meses = mesesDeLaVentana(hoy);
  const cacheKey = `${cachePrefix('estrenan')}:${REGION}:${meses[0].clave}`;
  if (!refresh) {
    const hit = cacheRead(cacheKey, 12 * HOUR);
    // la lista se sirve tal cual; lo TUYO se vuelve a mirar (ver refrescarContexto)
    if (hit && !esParcialCaducado(hit)) return refrescarContexto(hit);
  }

  const errors = [];
  // solo los fallos del DESCUBRIMIENTO truncan la lista: que a un director no se
  // le haya podido leer la filmografía es un hueco en su ficha, no media página
  // que falta, y marcar eso como parcial obligaba a reconstruirlo todo cada
  // veinte minutos por una persona
  let listaIncompleta = false;
  // 1. qué se estrena en cada mes y por cada canal
  setBuildProgress('directores', 'Preguntando a TMDB qué se estrena', 0, meses.length * 2);
  let pedidos = 0;
  const porMes = new Map(); // clave de mes → Map(tmdb_id → item)
  for (const m of meses) {
    const peliculas = new Map();
    for (const canal of Object.keys(CANALES)) {
      const { results, errors: errs } = await discoverMes({ canal, desde: m.desde, hasta: m.hasta });
      errors.push(...errs);
      if (errs.length) listaIncompleta = true;
      setBuildProgress('directores', 'Preguntando a TMDB qué se estrena', ++pedidos, meses.length * 2);
      for (const r of results) {
        if (!r.id || r.video) continue;
        const ya = peliculas.get(r.id);
        if (ya) {
          // el mismo mes en sala Y en plataforma: las dos cosas son verdad
          if (!ya.canales.includes(canal)) ya.canales.push(canal);
          continue;
        }
        peliculas.set(
          r.id,
          classifyGenres(
            {
              tmdb_id: r.id,
              title: r.title,
              original_title: r.original_title,
              date: r.release_date || null,
              poster_path: r.poster_path,
              vote: r.vote_average,
              votes: r.vote_count,
              popularity: r.popularity,
              canales: [canal],
            },
            r.genre_ids || []
          )
        );
      }
    }
    porMes.set(m.clave, peliculas);
  }

  // 2. la ficha de cada película, una sola vez aunque estrene en dos meses
  const unicas = new Map();
  for (const peliculas of porMes.values()) for (const [id, f] of peliculas) if (!unicas.has(id)) unicas.set(id, f);
  await detallar([...unicas.values()]);
  // lo que trae la ficha se reparte a las copias del otro mes
  for (const peliculas of porMes.values()) {
    for (const [id, f] of peliculas) {
      const base = unicas.get(id);
      if (base !== f) Object.assign(f, { runtime: base.runtime, isEvento: base.isEvento, directores: base.directores, genre_ids: base.genre_ids, isDocumentary: base.isDocumentary, isTvMovie: base.isTvMovie, isMusic: base.isMusic });
    }
  }

  // 3. fuera cortos, telefilmes, galas y lo que no tiene dirección conocida:
  //    una ficha de director sin director no es una ficha
  const validas = new Map();
  for (const [clave, peliculas] of porMes) {
    const lista = [...peliculas.values()].filter((f) => esLargometraje(f) && !f.isEvento && f.directores?.length);
    validas.set(clave, lista);
  }

  // 4. tu Plex y tu Letterboxd, para las películas que quedan
  const enBiblioteca = new Set(
    db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id)
  );
  const widx = watchedIndex();
  const todas = [...new Set([...validas.values()].flat())];
  for (const f of todas) {
    const year = f.date ? Number(f.date.slice(0, 4)) : null;
    f.owned = enBiblioteca.has(f.tmdb_id) || !!matchMovie({ title: f.title, year, tmdbId: f.tmdb_id });
    f.watched = isWatched({ tmdb_id: f.tmdb_id, title: f.title, year }, widx);
  }
  await latinizeTitles(todas);
  // la Σ de MDBList: en un estreno tarda semanas en existir, así que muchas
  // volverán vacías. No se pide de nuevo aquí (eso es el botón de Estrenos).
  await enrichWithScores(todas, { maxFetch: 150 });
  // EN QUÉ PLATAFORMA. Solo para lo que sale en digital —un puñado de los
  // ciento y pico— y con la misma caché por película que usa Estrenos, así que
  // no cuesta ninguna petición si ya se miró allí. En una cartelera es «qué
  // día»; en una plataforma la pregunta es «en cuál».
  await mapPool(todas.filter((f) => f.canales.includes('plataforma')), 6, async (f) => {
    try {
      const data = await tmdbGet(`/movie/${f.tmdb_id}/watch/providers`, {}, { cacheKey: `movie_prov:${f.tmdb_id}`, cacheMs: 3 * DAY });
      Object.assign(f, providersDeRegion(data?.results?.[REGION]));
    } catch {
      f.providers = [];
      f.vod = [];
    }
  });

  // 5. la filmografía de cada director/a: una petición cacheada por persona
  const directores = new Map(); // tmdb_id → { name, profile_path }
  for (const f of todas) for (const d of f.directores) if (!directores.has(d.tmdb_id)) directores.set(d.tmdb_id, { ...d });
  const lista = [...directores.values()];
  setBuildProgress('directores', 'Repasando filmografías', 0, lista.length);
  let hechos = 0;
  const idsDeLaVentana = new Set(todas.map((f) => f.tmdb_id));
  await mapPool(lista, 6, async (d) => {
    try {
      Object.assign(d, obraAnterior(await personCredits(d.tmdb_id), { hoy, excluir: idsDeLaVentana }));
    } catch (err) {
      // `fallo` importa: sin él, «no le hemos podido leer la filmografía» y «no
      // ha dirigido nada antes» quedaban iguales (dirigidas = 0) y a un veterano
      // con TMDB caído le salía la etiqueta de «ópera prima»
      Object.assign(d, { mejores: [], palmares: [], dirigidas: 0, debut: null, fallo: true });
      errors.push(`${d.name}: ${err.message}`);
    }
    setBuildProgress('directores', 'Repasando filmografías', ++hechos, lista.length);
  });
  // «深田晃司» → «Kôji Fukada»: el nombre es la mitad de esta página
  await latinizeNames(lista);

  const porTmdb = new Map(lista.map((d) => [d.tmdb_id, d]));

  // 6. darle la vuelta: de películas con directores a directores con películas
  const idx = indiceAvales();
  const salida = meses.map((m) => {
    const fichas = new Map();
    for (const f of validas.get(m.clave) || []) {
      const avales = idx.porPelicula.get(f.tmdb_id) || [];
      const estreno = {
        tmdb_id: f.tmdb_id,
        title: f.title,
        original_title: f.original_title !== f.title ? f.original_title : null,
        date: f.date,
        poster_path: f.poster_path,
        canales: f.canales,
        providers: f.providers?.length ? f.providers : null,
        vod: f.vod?.length ? f.vod : null,
        owned: f.owned,
        watched: f.watched,
        // UNA Σ DE 0 NO ES UN CERO: `score_average` de MDBList vale 0 cuando
        // todavía no la ha puntuado nadie, y en una lista de estrenos eso son
        // más de la mitad. Pintar «Σ 0» junto a la película nueva de Iñárritu se
        // lee como un cero de nota, que es exactamente lo contrario de lo que
        // significa. Sin nota es sin nota.
        mdb: f.mdb && (f.mdb.score > 0 || f.mdb.imdb != null) ? f.mdb : null,
        isDocumentary: !!f.isDocumentary,
        avales: avales.length ? { total: avales.length, ganados: avales.filter((a) => a.winner).length } : null,
      };
      for (const dd of f.directores) {
        const d = porTmdb.get(dd.tmdb_id);
        if (!d) continue;
        const ficha = fichas.get(d.tmdb_id) || {
          tmdb_id: d.tmdb_id,
          name: d.name,
          profile_path: d.profile_path,
          // personId, favorito y enTuPlex los rellena refrescarContexto al
          // servir, que es lo que los mantiene vivos entre reconstrucciones
          personId: null,
          favorito: false,
          enTuPlex: 0,
          dirigidas: d.dirigidas,
          debut: d.debut,
          fallo: !!d.fallo,
          mejores: d.mejores,
          palmares: d.palmares,
          popularidad: 0,
          estrenos: [],
          canales: [],
        };
        ficha.estrenos.push(estreno);
        for (const c of f.canales) if (!ficha.canales.includes(c)) ficha.canales.push(c);
        ficha.popularidad = Math.max(ficha.popularidad, f.popularity || 0);
        fichas.set(d.tmdb_id, ficha);
      }
    }
    // el orden y el recuento de favoritos los pone refrescarContexto, que es
    // quien sabe a quién sigues AHORA
    const directoresDelMes = [...fichas.values()].map((d) => ({
      ...d,
      // sin ninguna película estrenada antes, esto es su ópera prima — pero
      // solo si de verdad se le ha podido leer la filmografía (ver `fallo`)
      esOperaPrima: d.dirigidas === 0 && !d.fallo,
      estrenos: d.estrenos.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999'))),
      peso: 0,
    }));
    return {
      ...m,
      directores: directoresDelMes,
      // los recuentos van del servidor: el cliente filtra sobre ellos y necesita
      // saber cuántos había antes de filtrar
      total: directoresDelMes.length,
      favoritos: 0,
      peliculas: (validas.get(m.clave) || []).length,
    };
  });

  clearBuildProgress('directores');
  const result = {
    generatedAt: Date.now(), hoy, region: REGION, meses: salida,
    listaIncompleta, errors: errors.slice(0, 5),
  };
  // como en Estrenos y en el calendario: lo construido con fallos de red se
  // sirve igual, pero caduca en veinte minutos en vez de en doce horas
  cacheWrite(cacheKey, listaIncompleta ? { ...result, partial: true } : result);
  return refrescarContexto(result);
}
