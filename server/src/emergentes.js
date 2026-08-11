/**
 * DETECTOR DE DIRECTORES EMERGENTES
 *
 * Quién puede ser un grande dentro de diez años, hoy que todavía no lo es.
 *
 * LA VENTAJA INJUSTA de PowaFlex es que ya tiene parseadas y cacheadas las
 * tablas de selección oficial de dieciocho festivales, premios y cánones. Ahí
 * es exactamente donde aparecen los grandes ANTES de serlo, así que el detector
 * se apoya en eso y no en notas agregadas: una nota alta la tiene cualquier
 * película con una comunidad entregada detrás, pero una plaza en la competición
 * de Cannes la da un comité.
 *
 * LAS CINCO SEÑALES, por orden de peso:
 *
 *  1. CONSAGRACIÓN INSTITUCIONAL. Estar seleccionado, y sobre todo ganar. La
 *     SEGUNDA selección vale más que la primera: repetir es lo que separa a
 *     quien va a más del fogonazo de un año. Sale de ediciones ya cacheadas.
 *  2. CONSENSO CRÍTICO. Metacritic, RT crítica, Σ de MDBList.
 *  3. TRACCIÓN REAL. Letterboxd es la métrica reina del autor joven —nota Y
 *     volumen de marcas—, con los votos de IMDb del volcado local como umbral
 *     de ruido (gratis, sin gastar API).
 *  4. ACELERACIÓN. Lo que de verdad predice: ¿la segunda película sube respecto
 *     a la primera en nota, en volumen y en nivel de festival? La señal negativa
 *     también cuenta.
 *  5. AFINIDAD CONTIGO. Cómo puntúas en Letterboxd el cine de esa procedencia.
 *     Es lo que hace que esto sea PowaFlex y no un ranking genérico.
 *
 * DOS REGLAS QUE NO SE NEGOCIAN, las dos aprendidas a golpes en este proyecto:
 *
 *  - **Sin dato ≠ cero.** Un debut sin Metacritic no puede penalizar: la señal
 *    que no tiene datos SALE del reparto y las demás se reparten su peso. Si no,
 *    el detector premiaría lo más documentado, que es lo anglosajón.
 *  - **La ficha ENSEÑA el desglose.** Un número de 0 a 100 sin explicación es un
 *    oráculo, y de un oráculo no te fías. Cada señal deja constancia de con qué
 *    datos puntuó, y el cliente lo pinta en su idioma (por eso el desglose viaja
 *    ESTRUCTURADO y no como una frase ya redactada en castellano).
 *
 * Las dos tablas son RECONSTRUIBLES ENTERAS: nada que el usuario haya decidido
 * vive en ellas. Lo suyo —a quién sigue, a quién ha descartado— vive aparte, en
 * tracked_people y en emerging_dismissed.
 */
import { db, getSetting, setSetting } from './db.js';
import { today } from './dates.js';
import { normName } from './names.js';
import { REGISTRY, editionRowsLight, winnersRowsLight, awardRowsLight, splitDirectors } from './festivals.js';
import {
  resolveCatalogDirector, personDetails, personCredits, enrichRuntimes,
  classifyGenres, featureRule, latinPersonName, geoDeLugar,
} from './tmdb.js';
import { creditsForRole } from './roles.js';
import { enrichWithScores } from './mdblist.js';
import { DIRECTORS_2026 } from './data/directors-2026.js';

// --- qué mira el radar y cuánto pesa cada sitio -------------------------------

/**
 * El prestigio de cada plaza, de 0 a 40. NO es un ranking de festivales: es
 * cuánto dice de alguien que le hayan seleccionado AHÍ.
 *
 * Las secciones de debut pesan casi como las competiciones grandes a propósito.
 * La competición principal de Cannes la pisa quien ya llegó; el primer largo de
 * quien va a llegar se estrena en la Semana de la Crítica o en Orizzonti. Para
 * detectar emergentes, una plaza en la Semaine dice MÁS que una en la
 * competición de Busan.
 */
export const PESO_FESTIVAL = {
  cannes: 40,
  venecia: 38,
  berlinale: 34,
  uncertainregard: 34, // la segunda competición oficial de Cannes
  semaine: 32,
  quinzaine: 30,
  sansebastian: 28,
  orizzonti: 28,
  sundance: 26,
  sundanceus: 26, // la competición estadounidense, la que ganó CODA
  tiff: 26,
  perspectives: 26,
  busan: 20,
  ssnuevos: 20,
  horizontes: 18,
};

/**
 * LOS PALMARESES, que son la otra mitad del radar.
 *
 * `PESO_FESTIVAL` mira SELECCIONES: quién fue programado. Pero hay premios cuya
 * lista de ganadoras y nominadas está llena de gente que acaba de llegar, y el
 * detector no los miraba porque no tienen tabla de selección por año. El caso
 * sangrante es la **Cámara de Oro**, que es literalmente el premio a la mejor
 * ópera prima de Cannes: no había señal más pura de «emergente» en toda la app
 * y se estaba tirando.
 *
 * El criterio para entrar aquí es ese: premios que ALCANZAN primeras y segundas
 * películas. Las academias nacionales nominan al debut del año en su país
 * (Goya, César, Guldbagge, Lola, Donatello), los festivales de clase A de fuera
 * del eje descubren cine que Europa aún no ha visto (Mar del Plata, Seminci,
 * Sitges), y el Óscar internacional recoge lo que cada país manda. Se quedan
 * FUERA los que coronan carreras hechas —Óscar, Globos, los círculos de crítica
 * de EE UU— y los cánones: ahí no hay emergentes que detectar, y meterlos solo
 * subiría la puntuación de quien ya está consagrado.
 *
 * Pesan menos que una plaza en competición porque llegan más tarde: cuando un
 * premio nacional te nombra, el festival ya te vio.
 */
export const PESO_PREMIO = {
  camaradeoro: 36, // la ópera prima de TODO Cannes: la señal más pura que hay
  efa: 22,
  mardelplata: 22,
  oscarint: 20,
  goya: 20,
  cesar: 20,
  seminci: 20,
  lola: 18,
  sitges: 18,
  bafta: 14,
};

/**
 * Y los que se quedan fuera aunque sean premios de los que descubren, porque su
 * tabla NO dice quién dirige:
 *
 *  - **Guldbagge**: su columna se titula «Director(s)» y en los años recientes
 *    lista PRODUCTORES (por eso existe la última vuelta de `elegirCandidato`).
 *    Metido aquí, el radar fichaba a Mattias Nohrborg —productor— como
 *    promesa de la dirección sueca.
 *  - **David di Donatello**: directamente no tiene columna de dirección
 *    (`awardSinDirector`), así que sus filas llegan con el nombre en blanco y
 *    no aportarían un solo candidato.
 *
 * Sitges tampoco la tiene, pero ahí no hay riesgo de confundir a nadie: sus
 * filas llegan sin nombre y, cuando el palmarés ya está construido, la
 * dirección viene de TMDB (que es de donde tiene que venir).
 */
export const PREMIOS_SIN_DIRECCION_FIABLE = ['guldbagge', 'donatello'];

/** Los cánones y los premios que coronan carreras no son radar de emergentes. */
export const RADAR = Object.keys(PESO_FESTIVAL);
export const RADAR_PREMIOS = Object.keys(PESO_PREMIO);

/** El peso de una plaza, venga de una selección o de un palmarés. */
export const pesoDe = (key) => PESO_FESTIVAL[key] || PESO_PREMIO[key] || 0;

// Ventana del radar y de la elegibilidad. Ocho años es el horizonte del plan:
// más atrás ya no es una promesa, es una carrera.
const VENTANA_AÑOS = 8;
/**
 * Y hasta cuándo se le sigue llamando promesa a alguien.
 *
 * Eran el mismo número, y con el límite de largos en cinco eso dejaba fuera
 * justo a quien Ramón pedía: alguien con cuatro o cinco películas RARA VEZ las
 * ha hecho en ocho años, así que el filtro de la obra no llegaba ni a
 * aplicarse —lo echaba antes la fecha del debut—. Separados, el radar sigue
 * mirando ocho años de ediciones (la presencia tiene que ser RECIENTE, ahí no
 * se afloja nada) y la carrera puede haber empezado hasta doce atrás mientras
 * quepa en cinco largos. Un ritmo así —cinco películas en doce años, y todavía
 * en la competición de Cannes— es exactamente el perfil que se buscaba.
 */
const VENTANA_DEBUT = 12;
// Cuántos largos caben todavía en «promesa». El plan puso tres; Ramón lo subió
// a cinco al ampliar el radar a los palmareses, y encaja: quien ha hecho cinco
// películas en menos de ocho años y sigue apareciendo en festivales grandes
// está en plena subida, no consagrado. La otra mitad del filtro —haber debutado
// dentro de la ventana— es la que impide que entre una carrera hecha.
const MAX_LARGOS = 5;

/**
 * Cuántos candidatos se resuelven contra TMDB por pasada.
 *
 * Recolectar los nombres no cuesta nada (las tablas están cacheadas), pero cada
 * candidato son una búsqueda, un par de fichas de persona, su filmografía y la
 * duración de sus películas. Mil nombres serían miles de peticiones cada noche.
 * Se ordenan por su puntuación institucional —que se calcula SIN tocar TMDB— y
 * se resuelven los mejores; el resto queda anotado en el informe, porque un
 * tope silencioso se lee como «no había nadie más».
 */
const TOPE_POR_PASADA = 90;

// --- pesos de las señales, editables -----------------------------------------

export const PESOS_POR_DEFECTO = {
  institucional: 45,
  critica: 18,
  traccion: 17,
  aceleracion: 12,
  afinidad: 8,
};

export const CLAVES_PESO = Object.keys(PESOS_POR_DEFECTO).map((k) => `emerg_w_${k}`);

/**
 * Los pesos actuales. Un valor sin poner o ilegible cae en el de fábrica.
 *
 * OJO con el ajuste vacío: `Number(null)` es CERO y cero es finito, así que sin
 * la comprobación de que hay algo escrito, una instalación recién estrenada se
 * quedaba con las cinco señales a peso cero y TODO el mundo puntuaba 0. Es el
 * mismo `Number('') === 0` que vació el tope de las reglas.
 */
export function pesosEmergentes() {
  const out = {};
  for (const k of Object.keys(PESOS_POR_DEFECTO)) {
    const bruto = getSetting(`emerg_w_${k}`);
    const v = Number(bruto);
    const puesto = bruto != null && String(bruto).trim() !== '';
    out[k] = puesto && Number.isFinite(v) && v >= 0 && v <= 100 ? v : PESOS_POR_DEFECTO[k];
  }
  return out;
}

// --- las señales, todas PURAS ------------------------------------------------

const acotar = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));

/**
 * SEÑAL 1 — consagración institucional.
 *
 * La primera selección abre la puerta; las siguientes valen MÁS que la primera,
 * que es la regla del plan: repetir competición es lo que separa a quien va a
 * más del fogonazo. Ganar dobla el valor de esa plaza.
 */
export function puntosInstitucionales(apariciones = []) {
  const ps = apariciones
    .map((a) => pesoDe(a.festival) * (a.winner ? 2 : 1))
    .filter((p) => p > 0)
    .sort((a, b) => b - a);
  if (!ps.length) return 0;
  return ps[0] + ps.slice(1).reduce((n, p) => n + p * 1.6, 0);
}

/** 90 puntos institucionales = señal al máximo (p. ej. Cannes + Orizzonti). */
export const senalInstitucional = (apariciones = []) => {
  const puntos = puntosInstitucionales(apariciones);
  if (!puntos) return null;
  return {
    valor: acotar(puntos / 90),
    detalle: {
      puntos: Math.round(puntos),
      apariciones: apariciones
        .slice()
        .sort((a, b) => b.year - a.year)
        .map((a) => ({ festival: a.festival, year: a.year, winner: !!a.winner, title: a.title })),
    },
  };
};

/**
 * SEÑAL 2 — consenso crítico. Por película, la fuente más exigente que tenga:
 * Metacritic manda (es crítica agregada de verdad), luego RT crítica, y la Σ de
 * MDBList como último recurso. Sin ninguna de las tres, la película no vota; sin
 * ninguna película con datos, la señal entera se ausenta.
 *
 * El suelo son 50 puntos y el techo 85: por debajo de 50 la crítica no acompaña,
 * y por encima de 85 ya no hay más que demostrar.
 */
export function senalCritica(pelis = []) {
  const notas = [];
  for (const p of pelis) {
    const r = p.ratings || {};
    const fuente = r.metacritic != null ? 'metacritic' : r.rt_critic != null ? 'rt_critic' : r.score != null ? 'score' : null;
    if (!fuente) continue;
    notas.push({ fuente, valor: Number(r[fuente]), title: p.title });
  }
  if (!notas.length) return null;
  const media = notas.reduce((n, x) => n + x.valor, 0) / notas.length;
  const mejor = notas.slice().sort((a, b) => b.valor - a.valor)[0];
  return { valor: acotar((media - 50) / 35), detalle: { media: Math.round(media), mejor } };
}

/**
 * SEÑAL 3 — tracción real.
 *
 * Letterboxd es la métrica del autor joven: allí una ópera prima búlgara tiene
 * público antes que en ningún otro sitio. Se mira la nota (0-5) Y el volumen de
 * marcas, porque un 4,3 con doscientas marcas no dice nada. Los votos de IMDb
 * entran solo como umbral de ruido —salen del volcado local y no cuestan API—:
 * cuatro cifras de votos confirman que la película existe fuera del circuito.
 */
export function senalTraccion(pelis = []) {
  const conLb = pelis.filter((p) => p.ratings?.letterboxd != null);
  if (!conLb.length) return null;
  const nota = conLb.reduce((n, p) => n + Number(p.ratings.letterboxd), 0) / conLb.length;
  const marcas = conLb.reduce((n, p) => n + (Number(p.ratings.lb_votes) || 0), 0);
  const votosImdb = pelis.reduce((n, p) => n + (Number(p.imdbVotes) || 0), 0);
  // 3,2 es la media de Letterboxd; 3,9 es «esto le está gustando a la gente»
  const porNota = acotar((nota - 3.2) / 0.7);
  // 30.000 marcas es un fenómeno de autor joven; 2.000 es el suelo de existir
  const porVolumen = acotar((Math.log10(Math.max(marcas, 1)) - Math.log10(2000)) / (Math.log10(30000) - Math.log10(2000)));
  // el ruido de fondo: sin votos en IMDb, el volumen de Letterboxd vale menos
  const confianza = votosImdb >= 1000 ? 1 : 0.7;
  return {
    valor: acotar(((porNota * 0.6 + porVolumen * 0.4) * confianza)),
    detalle: { letterboxd: Math.round(nota * 100) / 100, marcas, votosImdb },
  };
}

/**
 * SEÑAL 4 — aceleración: ¿la segunda sube respecto a la primera?
 *
 * Es la que de verdad predice, y también la única que puede restar: si la
 * segunda película baja en las tres dimensiones, eso es información. `pelis`
 * llega ordenada de la más antigua a la más nueva.
 */
export function senalAceleracion(pelis = []) {
  if (pelis.length < 2) return null; // con un solo largo no hay nada que comparar
  const primera = pelis[0];
  const ultima = pelis[pelis.length - 1];
  const sube = [];
  const baja = [];
  const comparar = (clave, a, b) => {
    if (a == null || b == null) return;
    if (b > a) sube.push(clave);
    else if (b < a) baja.push(clave);
  };
  comparar('nota', primera.ratings?.letterboxd, ultima.ratings?.letterboxd);
  comparar('volumen', primera.ratings?.lb_votes, ultima.ratings?.lb_votes);
  comparar('festival', primera.nivelFestival, ultima.nivelFestival);
  if (!sube.length && !baja.length) return null; // no había con qué comparar
  const neto = (sube.length - baja.length) / (sube.length + baja.length);
  // de −1 (baja en todo) a +1 (sube en todo), llevado a 0..1
  return { valor: acotar((neto + 1) / 2), detalle: { sube, baja } };
}

/**
 * SEÑAL 5 — afinidad contigo.
 *
 * Cómo puntúas TÚ en Letterboxd el cine dirigido por gente de ese país y de ese
 * continente, comparado con tu media. Las dos partes de la comparación salen
 * del mismo sitio (`placeToGeo` sobre el lugar de nacimiento de TMDB), así que
 * los nombres casan por construcción y no hay que traducir países.
 *
 * OJO, lo que NO cubre: el plan hablaba también de género y década. El género
 * no entra porque las etiquetas de tu biblioteca son las de Plex, en el idioma
 * de su agente, y no casan con los géneros de TMDB de una película que aún no
 * tienes; es el mismo bloqueo que tiene pendiente el ranking de fotografía y
 * montaje. La década no aporta: aquí todo el mundo es de esta.
 */
export function senalAfinidad({ country, continent }, gustos) {
  if (!gustos) return null;
  const partes = [];
  const porPais = country ? gustos.paises.get(country) : null;
  const porCont = continent ? gustos.continentes.get(continent) : null;
  if (porPais) partes.push({ ambito: 'pais', nombre: country, ...porPais });
  if (porCont) partes.push({ ambito: 'continente', nombre: continent, ...porCont });
  if (!partes.length) return null;
  // el país manda sobre el continente cuando hay muestra suficiente de los dos
  const elegida = partes[0];
  const delta = elegida.media - gustos.media;
  // media punto de Letterboxd arriba o abajo es un gusto claro
  return {
    valor: acotar(0.5 + delta),
    detalle: { ambito: elegida.ambito, nombre: elegida.nombre, media: Math.round(elegida.media * 100) / 100, tuya: Math.round(gustos.media * 100) / 100, n: elegida.n },
  };
}

/**
 * La puntuación de 0 a 100 y su desglose.
 *
 * Aquí vive la regla de «sin dato ≠ cero»: las señales sin datos no puntúan
 * cero, salen del reparto y su peso se reparte entre las que sí tienen. Un
 * debut sin Metacritic no puede quedar por detrás de una película mediana solo
 * porque de la mediana haya más datos.
 */
export function puntuar(senales, pesos = PESOS_POR_DEFECTO) {
  const vivas = Object.entries(senales).filter(([, s]) => s && Number.isFinite(s.valor));
  const total = vivas.reduce((n, [k]) => n + (pesos[k] || 0), 0);
  if (!total) return { score: 0, desglose: [], ausentes: Object.keys(senales) };
  const desglose = vivas.map(([clave, s]) => ({
    clave,
    // el peso EFECTIVO, ya repartido: es el número que la ficha enseña, y tiene
    // que sumar 100 con los demás o el desglose no explica la puntuación
    peso: Math.round((pesos[clave] || 0) / total * 100),
    puntos: Math.round(((pesos[clave] || 0) / total) * 100 * s.valor),
    detalle: s.detalle,
  }));
  const score = Math.min(100, desglose.reduce((n, d) => n + d.puntos, 0));
  const ausentes = Object.keys(senales).filter((k) => !vivas.some(([v]) => v === k));
  return { score, desglose, ausentes };
}

// --- recolección: los nombres, sin tocar TMDB ---------------------------------

/**
 * Todas las apariciones en el radar de los últimos `years` años, y quién ganó.
 * No toca TMDB: solo las tablas de Wikipedia, que ya están cacheadas 180 días
 * por la página de Festivales y por las reglas.
 */
export async function recolectarApariciones({ years = VENTANA_AÑOS } = {}) {
  const nowYear = new Date().getFullYear();
  const porNombre = new Map();
  const edicionesLeidas = [];
  const errores = [];

  const anotar = (nombre, ap) => {
    const clave = normName(nombre);
    if (!clave) return;
    const d = porNombre.get(clave) || { clave, name: nombre, apariciones: [] };
    // la misma película en la misma sección no cuenta dos veces
    if (!d.apariciones.some((x) => x.festival === ap.festival && x.year === ap.year && x.title === ap.title)) {
      d.apariciones.push(ap);
    }
    porNombre.set(clave, d);
  };

  for (const key of RADAR) {
    const f = REGISTRY[key];
    if (!f) continue;
    for (let y = nowYear; y > nowYear - years; y--) {
      if (f.sinceYear && y < f.sinceYear) break;
      let rows;
      try {
        rows = await editionRowsLight(key, f, y);
      } catch {
        continue; // sin programa aún, o edición no celebrada: no es un error
      }
      if (!rows?.length) continue;
      edicionesLeidas.push(`${key}:${y}`);
      for (const r of rows) {
        for (const nombre of splitDirectors(r.director)) {
          anotar(nombre, { festival: key, year: y, title: r.title, winner: false });
        }
      }
    }
    // el palmarés marca las ganadoras de lo ya recolectado
    try {
      for (const w of await winnersRowsLight(key)) {
        if (!w.year || w.year <= nowYear - years) continue;
        for (const nombre of splitDirectors(w.director)) {
          const d = porNombre.get(normName(nombre));
          if (!d) continue;
          const ap = d.apariciones.find(
            (x) => x.festival === key && Math.abs(x.year - w.year) <= 1 && normName(x.title) === normName(w.title)
          );
          if (ap) ap.winner = true;
        }
      }
    } catch (err) {
      errores.push(`palmarés de ${key}: ${String(err.message || err)}`);
    }
  }

  // LOS PALMARESES como fuente propia (ver PESO_PREMIO). Estos premios no tienen
  // tabla de selección por año: su lista ES la aparición. Una llamada cacheada
  // por premio, no una por año.
  for (const key of RADAR_PREMIOS) {
    if (!REGISTRY[key]) continue;
    try {
      const filas = await awardRowsLight(key);
      let leidas = 0;
      for (const r of filas) {
        if (!r.year || r.year <= nowYear - years) continue;
        leidas++;
        for (const nombre of splitDirectors(r.director)) {
          anotar(nombre, { festival: key, year: r.year, title: r.title, winner: !!r.winner });
        }
      }
      if (leidas) edicionesLeidas.push(`${key}:palmarés`);
    } catch (err) {
      errores.push(`palmarés de ${key}: ${String(err.message || err)}`);
    }
  }
  return { candidatos: [...porNombre.values()], ediciones: edicionesLeidas, errores };
}

// --- la criba barata, ANTES de gastar una sola petición ----------------------

const CATALOGO = new Map(DIRECTORS_2026.map((d) => [normName(d.name), d]));

/**
 * A quién sigues ya como director/a, por NOMBRE normalizado y por id de TMDB.
 *
 * Las dos formas hacen falta y no son intercambiables: la criba solo tiene el
 * nombre de la tabla de Wikipedia (todavía no ha resuelto a nadie contra TMDB),
 * pero la ★ de la parrilla tiene que casar por ID. Wikipedia y TMDB escriben el
 * mismo nombre distinto más a menudo de lo que parece —transcripciones del
 * japonés y del coreano, sobre todo—, y casando solo por nombre la estrella no
 * se encendía después de seguir a alguien.
 */
function seguidosComoDirector() {
  const filas = db
    .prepare(
      `SELECT p.name, p.tmdb_id FROM tracked_people t JOIN people p ON p.id = t.person_id WHERE t.role = 'director'`
    )
    .all();
  const nombres = new Set(filas.map((r) => normName(r.name)));
  const ids = new Set(filas.map((r) => r.tmdb_id).filter(Boolean));
  // se comporta como el Set de nombres de antes, con los ids colgando al lado
  nombres.tmdbIds = ids;
  return nombres;
}

/** Los que quitaste con la ✕, aquí y en el resto de la app. */
const descartados = () => {
  const out = new Set(db.prepare('SELECT name_key FROM emerging_dismissed').all().map((r) => r.name_key));
  for (const r of db.prepare(`SELECT p.name FROM unfollowed_people u JOIN people p ON p.id = u.person_id`).all()) {
    out.add(normName(r.name));
  }
  return out;
};

/**
 * ¿Merece la pena resolver a esta persona contra TMDB? PURA.
 *
 * Todo lo que se pueda descartar aquí es una búsqueda, dos fichas y una
 * filmografía que no se piden. El catálogo de 680 directores en activo hace de
 * filtro de consolidados gratis: si Wikidata ya le cuenta cuatro largos o un
 * debut de hace quince años, no es una promesa.
 */
/**
 * Los tres premios que dejan de ser una promesa el día que los ganas. Ganar la
 * Palma, el León o el Oso es la consagración, no el camino hacia ella —y el
 * filtro por número de películas no lo ve: Chloé Zhao tiene cinco largos y un
 * León de Oro, y al subir el límite a cinco se colaba en la lista de promesas.
 * La Cámara de Oro, Un Certain Regard o la Semaine NO están aquí a propósito:
 * ganar ahí es justo la señal contraria.
 */
const CORONAS = new Set(['cannes', 'venecia', 'berlinale']);

export function mereceMirarse(cand, { nowYear, seguidos, fuera, catalogo = CATALOGO }) {
  if (seguidos.has(cand.clave)) return 'ya le sigues';
  if (fuera.has(cand.clave)) return 'descartado';
  if (cand.apariciones.some((a) => a.winner && CORONAS.has(a.festival))) return 'ya consagrado';
  // Una carrera hecha se nota en las PELÍCULAS distintas que pasean por el
  // radar, no en las apariciones: desde que también se leen los palmareses, una
  // sola película puede sumar cinco (Cannes, Cámara de Oro, Goya, Seminci,
  // EFA), y contando apariciones ese debut se descartaba solo por haber
  // gustado. Más de cinco películas distintas en la ventana ya no es una
  // promesa, y es el mismo número que MAX_LARGOS.
  if (new Set(cand.apariciones.map((a) => normName(a.title))).size > MAX_LARGOS) return 'ya consagrado';
  const cat = catalogo.get(cand.clave);
  if (cat) {
    if (cat.features > MAX_LARGOS) return 'ya consagrado';
    if (cat.first && cat.first < nowYear - VENTANA_DEBUT) return 'debutó hace demasiado';
  }
  return null;
}

// --- los gustos del usuario, para la señal de afinidad ------------------------

/**
 * Cómo puntúas en Letterboxd el cine según de dónde sea quien lo dirige. Sale de
 * TU biblioteca: las notas de lb_entries cruzadas con el país y el continente de
 * los directores que ya tienes fichados (people.country / people.continent, que
 * rellena `persistLife` desde TMDB).
 *
 * El mínimo de muestra no es capricho: con tres películas de un país, la media
 * es la de esas tres y no dice nada de tu gusto.
 */
export function gustosPorProcedencia({ minMuestra = 6 } = {}) {
  const filas = db
    .prepare(
      `SELECT p.country, p.continent, le.rating
       FROM lb_entries le
       JOIN movies m ON m.rating_key = le.movie_id
       JOIN movie_people mp ON mp.movie_id = m.rating_key AND mp.role = 'director'
       JOIN people p ON p.id = mp.person_id
       WHERE le.rating IS NOT NULL AND le.movie_id IS NOT NULL`
    )
    .all();
  if (filas.length < minMuestra * 2) return null; // sin notas suficientes, no hay gusto que medir

  const acumular = (campo) => {
    const m = new Map();
    for (const f of filas) {
      const k = f[campo];
      if (!k) continue;
      const a = m.get(k) || { suma: 0, n: 0 };
      a.suma += Number(f.rating);
      a.n++;
      m.set(k, a);
    }
    const out = new Map();
    for (const [k, a] of m) if (a.n >= minMuestra) out.set(k, { media: a.suma / a.n, n: a.n });
    return out;
  };

  return {
    media: filas.reduce((n, f) => n + Number(f.rating), 0) / filas.length,
    paises: acumular('country'),
    continentes: acumular('continent'),
    total: filas.length,
  };
}

// --- resolver a una persona contra TMDB --------------------------------------

/** El nivel de festival más alto al que llegó una película concreta. */
const nivelDe = (apariciones, title) => {
  const suyas = apariciones.filter((a) => normName(a.title) === normName(title));
  if (!suyas.length) return null;
  return Math.max(...suyas.map((a) => (PESO_FESTIVAL[a.festival] || 0) * (a.winner ? 2 : 1)));
};

/**
 * La ficha completa de un candidato, o null si no pasa la elegibilidad.
 *
 * El emparejado va por `resolveCatalogDirector` y NO por la búsqueda a secas:
 * esa elige por popularidad y le pondría al director la cara de su homónimo
 * famoso, que es el fallo que costó tres versiones arreglar. Mejor sin ficha
 * que la cara de otro.
 */
export async function resolverCandidato(cand, { nowYear, hoy, gustos }) {
  const cat = CATALOGO.get(cand.clave);
  const ultimoAño = Math.max(...cand.apariciones.map((a) => a.year));
  const info = await resolveCatalogDirector({
    name: cand.name,
    birth: cat?.birth ?? null,
    age: cat?.age ?? null,
    last: ultimoAño,
  });
  if (!info?.id) return { descartado: 'sin ficha en TMDB' };

  const det = await personDetails(info.id);
  if (det?.deathday) return { descartado: 'fallecido/a' };

  const credits = await personCredits(info.id);
  const dirigidas = creditsForRole(credits, 'director').filter((c) => !c.video);
  // el corte barato antes de pedir duraciones: nadie con quince créditos de
  // dirección es un emergente, y cada duración es una petición
  if (dirigidas.length > 12) return { descartado: 'obra demasiado extensa' };
  if (!dirigidas.length) return { descartado: 'sin créditos de dirección' };

  const items = dirigidas.map((c) =>
    classifyGenres(
      {
        tmdb_id: c.id,
        title: c.title,
        original_title: c.original_title,
        date: c.release_date || null,
        poster_path: c.poster_path || null,
        isCameo: false,
      },
      c.genre_ids || []
    )
  );
  // duración, géneros de verdad y dirección coral: sin esto, «tres largos» se
  // cuenta con cortos y telefilmes dentro, que es como un debutante acaba
  // pareciendo prolífico
  await enrichRuntimes(items, { concurrency: 4, withCredits: true });
  const estrenadas = items.filter((i) => i.date && i.date <= hoy);
  const { isFeature } = featureRule(estrenadas);
  const largos = estrenadas.filter(isFeature).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (!largos.length) return { descartado: 'aún sin largometraje estrenado' };
  if (largos.length > MAX_LARGOS) return { descartado: `${largos.length} largos: ya no es un debut` };
  const primerAño = Number(String(largos[0].date).slice(0, 4));
  if (primerAño < nowYear - VENTANA_DEBUT) return { descartado: `debutó en ${primerAño}` };

  // notas: las cacheadas y, si hay presupuesto de MDBList, las que falten
  await enrichWithScores(largos, { maxFetch: 40 });
  const ids = largos.map((l) => l.tmdb_id);
  const notas = new Map(
    db
      .prepare(`SELECT * FROM mdb_ratings WHERE tmdb_id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids)
      .map((r) => [r.tmdb_id, r])
  );
  const votosImdb = db.prepare('SELECT votes FROM imdb_ratings WHERE tconst = ?');
  const pelis = largos.map((l) => ({
    tmdb_id: l.tmdb_id,
    title: l.title,
    year: Number(String(l.date).slice(0, 4)),
    poster_path: l.poster_path,
    ratings: notas.get(l.tmdb_id) || {},
    imdbVotes: l.imdb_id ? votosImdb.get(l.imdb_id)?.votes ?? null : null,
    nivelFestival: nivelDe(cand.apariciones, l.title),
  }));

  // país y continente por el MISMO camino que la demografía de tu biblioteca:
  // la señal de afinidad los compara y no casarían si salieran de otro sitio
  const geo = geoDeLugar(det?.place_of_birth);

  return {
    clave: cand.clave,
    name: (await latinPersonName(info.id, info.name || cand.name)) || info.name || cand.name,
    tmdb_id: info.id,
    profile_path: info.profile_path || det?.profile_path || null,
    birthday: det?.birthday || null,
    gender: det?.gender ?? null,
    place_of_birth: det?.place_of_birth || null,
    country: geo.country,
    continent: geo.continent,
    features: largos.length,
    first_year: primerAño,
    apariciones: cand.apariciones,
    pelis,
    gustos,
  };
}

// --- la pasada completa -------------------------------------------------------

export const emergentesStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  paso: null,
  candidatos: 0,
  mirados: 0,
  elegidos: 0,
  saltados: 0, // los que el tope dejó fuera: NUNCA en silencio
  error: null,
};

const guardarDirector = db.prepare(
  `INSERT OR REPLACE INTO emerging_directors
     (name_key, name, tmdb_id, profile_path, birthday, gender, country, continent,
      features, first_year, last_title, last_year, last_tmdb_id, last_poster,
      score, breakdown, computed_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const guardarSenal = db.prepare(
  `INSERT OR REPLACE INTO emerging_signals (name_key, festival, year, title, winner)
   VALUES (?, ?, ?, ?, ?)`
);

/**
 * Reconstruye la tabla de emergentes. Es idempotente y se puede lanzar tantas
 * veces como se quiera: nada de lo que el usuario decide vive aquí.
 */
export async function detectarEmergentes({ years = VENTANA_AÑOS, tope = TOPE_POR_PASADA } = {}) {
  if (emergentesStatus.running) return emergentesStatus;
  Object.assign(emergentesStatus, {
    running: true, startedAt: Date.now(), finishedAt: null, paso: 'leyendo las ediciones',
    candidatos: 0, mirados: 0, elegidos: 0, saltados: 0, error: null,
  });
  const nowYear = new Date().getFullYear();
  const hoy = today();
  try {
    const { candidatos, ediciones, errores } = await recolectarApariciones({ years });
    emergentesStatus.candidatos = candidatos.length;
    emergentesStatus.paso = 'cribando';

    const seguidos = seguidosComoDirector();
    const fuera = descartados();
    const viables = candidatos.filter((c) => !mereceMirarse(c, { nowYear, seguidos, fuera }));
    // los mejores primero: la puntuación institucional no cuesta ni una petición
    viables.sort((a, b) => puntosInstitucionales(b.apariciones) - puntosInstitucionales(a.apariciones));
    const aMirar = viables.slice(0, tope);
    emergentesStatus.saltados = Math.max(0, viables.length - aMirar.length);

    const gustos = gustosPorProcedencia();
    const pesos = pesosEmergentes();

    const nuevos = [];
    for (const cand of aMirar) {
      emergentesStatus.paso = `mirando a ${cand.name}`;
      emergentesStatus.mirados++;
      let ficha;
      try {
        ficha = await resolverCandidato(cand, { nowYear, hoy, gustos });
      } catch {
        continue; // un fallo de red con uno no puede tumbar la pasada entera
      }
      if (!ficha || ficha.descartado) continue;

      const senales = {
        institucional: senalInstitucional(ficha.apariciones),
        critica: senalCritica(ficha.pelis),
        traccion: senalTraccion(ficha.pelis),
        aceleracion: senalAceleracion(ficha.pelis),
        afinidad: senalAfinidad(ficha, gustos),
      };
      const { score, desglose, ausentes } = puntuar(senales, pesos);
      const ultima = ficha.pelis[ficha.pelis.length - 1];
      nuevos.push({ ficha, score, desglose, ausentes, ultima });
    }

    // se reescribe ENTERA y de golpe: media pasada no puede dejar la página con
    // la mitad de la gente de ayer y la mitad de hoy
    db.transaction(() => {
      db.prepare('DELETE FROM emerging_directors').run();
      db.prepare('DELETE FROM emerging_signals').run();
      for (const { ficha, score, desglose, ausentes, ultima } of nuevos) {
        guardarDirector.run(
          ficha.clave, ficha.name, ficha.tmdb_id, ficha.profile_path,
          ficha.birthday, ficha.gender, ficha.country, ficha.continent,
          ficha.features, ficha.first_year,
          ultima?.title || null, ultima?.year || null, ultima?.tmdb_id || null, ultima?.poster_path || null,
          score, JSON.stringify({ desglose, ausentes, pelis: ficha.pelis }), Date.now()
        );
        for (const a of ficha.apariciones) {
          guardarSenal.run(ficha.clave, a.festival, a.year, a.title || '', a.winner ? 1 : 0);
        }
      }
    })();

    emergentesStatus.elegidos = nuevos.length;
    setSetting('emergentes_last_run', String(Date.now()));
    setSetting('emergentes_last_editions', String(ediciones.length));
    emergentesStatus.paso = null;
    if (errores.length) emergentesStatus.error = errores.slice(0, 3).join(' · ');
  } catch (err) {
    emergentesStatus.error = String(err.message || err);
  } finally {
    emergentesStatus.running = false;
    emergentesStatus.finishedAt = Date.now();
  }
  return emergentesStatus;
}

// --- lectura para la interfaz -------------------------------------------------

/** La parrilla: quién, con qué puntuación y con qué desglose. */
export function listaEmergentes() {
  const seguidos = seguidosComoDirector();
  const filas = db.prepare('SELECT * FROM emerging_directors ORDER BY score DESC, name').all();
  const senales = new Map();
  for (const s of db.prepare('SELECT * FROM emerging_signals').all()) {
    if (!senales.has(s.name_key)) senales.set(s.name_key, []);
    senales.get(s.name_key).push(s);
  }
  return {
    generatedAt: Number(getSetting('emergentes_last_run') || 0) || null,
    ediciones: Number(getSetting('emergentes_last_editions') || 0) || null,
    pesos: pesosEmergentes(),
    pesosPorDefecto: PESOS_POR_DEFECTO,
    status: emergentesStatus,
    directors: filas.map((r) => {
      let extra = {};
      try {
        extra = JSON.parse(r.breakdown || '{}');
      } catch {
        extra = {};
      }
      return {
        ...r,
        breakdown: undefined,
        // el id manda: es el que el detector verificó contra la fecha de
        // nacimiento, y el nombre puede estar escrito de otra forma en TMDB
        tracked: (r.tmdb_id && seguidos.tmdbIds.has(r.tmdb_id)) || seguidos.has(r.name_key),
        desglose: extra.desglose || [],
        ausentes: extra.ausentes || [],
        pelis: extra.pelis || [],
        apariciones: (senales.get(r.name_key) || []).sort((a, b) => b.year - a.year),
      };
    }),
  };
}

/** La ✕: fuera de la parrilla y que no vuelva en la próxima reconstrucción. */
export function descartarEmergente(nameKey) {
  const k = String(nameKey || '');
  db.prepare('INSERT OR REPLACE INTO emerging_dismissed (name_key, at) VALUES (?, ?)').run(k, Date.now());
  db.prepare('DELETE FROM emerging_directors WHERE name_key = ?').run(k);
  db.prepare('DELETE FROM emerging_signals WHERE name_key = ?').run(k);
  return { ok: true };
}

/** Deshacer la ✕. */
export function recuperarEmergente(nameKey) {
  db.prepare('DELETE FROM emerging_dismissed WHERE name_key = ?').run(String(nameKey || ''));
  return { ok: true };
}

/** ¿Hace falta reconstruir? Lo consulta el pase nocturno. */
export function emergentesNecesitaRefresco(dias = 7) {
  const last = Number(getSetting('emergentes_last_run') || 0);
  return !last || Date.now() - last > dias * 24 * 3600 * 1000;
}
