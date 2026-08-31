/**
 * EL RANKING DE FILMAFFINITY, PAÍS A PAÍS.
 *
 * La segunda opinión, y la que corrige el sesgo de la primera. Letterboxd vota
 * en inglés y en presente: su top español empieza por «Todo sobre mi madre»,
 * «La sociedad de la nieve» y «Klaus». FilmAffinity vota desde España y el suyo
 * empieza por «El verdugo», «Los santos inocentes», «Plácido» y «Surcos». No es
 * que una tenga razón: es que dicen cosas distintas, y tener las dos delante
 * vale más que promediarlas hasta que no digan ninguna.
 *
 * VIAJA EMPAQUETADO. El servidor no puede bajarlo: FilmAffinity está detrás de
 * Cloudflare y contesta 403 a Node —distingue por la huella TLS del cliente, no
 * por las cabeceras— mientras que a curl le contesta 200. Perseguir esa
 * diferencia sería pelearse con su detección de bots, y dejaría la función
 * colgando de que mañana siga colando en el Beelink. Así que la descarga y el
 * emparejado con TMDB pasan UNA vez, en la máquina de desarrollo, y lo que
 * viaja al contenedor es `data/filmaffinity-2026.js`: el mismo trato que los
 * palmareses de Wikipedia. Se refresca con `npm run snapshot:fa`.
 *
 * NO todos los países tienen ranking: Islandia, India, Dinamarca, Irán y Suiza
 * no lo tienen. Eso se dice, en vez de enseñar una pestaña vacía sin explicar
 * por qué está vacía.
 */
import { db } from './db.js';
import { setBuildProgress, clearBuildProgress, movieDetail, classifyGenres } from './tmdb.js';
import { esLargometraje } from './releases.js';
import { enrichWithScores } from './mdblist.js';
import { conteoAvales } from './avales.js';
import { mapPool } from './pool.js';
import { PAISES, esPaisConocido, notaValida } from './paises.js';
import { noEsCine } from './data/paises/no-es-cine.js';
import { FA_RANKINGS } from './data/filmaffinity-2026.js';

export const FA_VERSION = 1;

/**
 * Los países que TIENEN ranking en FilmAffinity, con el código de su lista.
 *
 * Va escrito y comprobado uno a uno porque el código NO es el ISO en
 * minúsculas: Reino Unido es `uk` (no `gb`) e Italia es `italy` (no `it`). Y
 * ojo con darlo por bueno mirando el código HTTP: un ranking que no existe
 * responde 200 igual, con una página sin una sola ficha dentro.
 *
 * EL CASO QUE HAY QUE MIRAR DOS VECES: `ranking_movies_ch` es CHINA, no Suiza.
 * En ISO, `CH` es Suiza y China es `CN`; en FilmAffinity el código de la lista
 * no es ISO, es su abreviatura. Su lista empieza por «La linterna roja», «¡Vivir!»
 * y «El camino a casa», así que no hay duda de cuál es. Mapearlo por su parecido
 * habría metido el cine chino en Suiza —que también está entre los 72 países y
 * sigue sin ranking— sin que nada lo dijera.
 *
 * Y Hong Kong tiene el suyo aparte: comparte cinco títulos con el chino entre
 * los veinte primeros (coproducciones), pero el suyo va por «Deseando amar»,
 * «Chungking Express» e «Infernal Affairs».
 */
export const RANKINGS = {
  ES: 'ranking_movies_es',
  US: 'ranking_movies_us',
  GB: 'ranking_movies_uk',
  FR: 'ranking_movies_fr',
  IT: 'ranking_movies_italy',
  JP: 'ranking_movies_jp',
  DE: 'ranking_movies_de',
  SE: 'ranking_movies_se',
  KR: 'ranking_movies_kr',
  MX: 'ranking_movies_mx',
  AR: 'ranking_movies_ar',
  BR: 'ranking_movies_br',
  PL: 'ranking_movies_pl',
  RU: 'ranking_movies_ru',
  CN: 'ranking_movies_ch', // China, no Suiza: ver arriba
  HK: 'ranking_movies_hk',
  CA: 'ranking_movies_ca',
  AU: 'ranking_movies_au',
  CZ: 'ranking_movies_cz',
  NZ: 'ranking_movies_nz',
  PT: 'ranking_movies_pt',
};

export const tieneRanking = (iso) => Object.hasOwn(RANKINGS, String(iso || '').toUpperCase());

/** Si además está empaquetado y listo para servir. */
export const hayPaqueteFA = (iso) => !!FA_RANKINGS[String(iso || '').toUpperCase()]?.rows?.length;

/** Cuándo se bajó el paquete de ese país (para poder decirlo en la página). */
export const paqueteHasta = (iso) => FA_RANKINGS[String(iso || '').toUpperCase()]?.hasta || null;

/**
 * Las fichas de un trozo de HTML del ranking. Vive aquí y no en la herramienta
 * porque es lo único que hay que rehacer si FilmAffinity cambia su plantilla, y
 * porque así se puede probar con un fragmento guardado, sin red.
 *
 * Se parte por `data-movie-id` en vez de montar un árbol: cada ficha es un
 * bloque plano con cuatro datos y no hace falta más.
 */
export function parsearFichas(html) {
  const out = [];
  for (const bloque of String(html || '').split('data-movie-id="').slice(1)) {
    const id = (bloque.match(/^(\d+)/) || [])[1];
    const title = (bloque.match(/class="fs-6 mc-title">\s*<a[^>]*>([^<]+)</) || [])[1];
    const year = (bloque.match(/class="mc-year[^"]*">(\d{4})</) || [])[1];
    const director = (bloque.match(/mc-director[\s\S]{0,300}?title="([^"]+)"/) || [])[1];
    if (!id || !title) continue;
    const { titulo, original, marca } = partirTitulo(decodificar(title.trim()));
    out.push({
      fa_id: Number(id),
      title: titulo,
      original_title: original,
      year: Number(year) || null,
      director: director ? decodificar(director.trim()) : null,
      // «(TV)», «(S)», «(TV Series)»…: dice qué es la ficha, y lo que es una
      // serie no tiene película que buscar
      marca: marca || null,
    });
  }
  return out;
}

/**
 * «Butterfly Tongues (La lengua de las mariposas)» → los dos títulos por
 * separado.
 *
 * La edición inglesa escribe entre paréntesis el título original cuando el
 * traducido no es de dominio común, y buscar la cadena ENTERA no casa con
 * ninguna ficha: así se perdían «La lengua de las mariposas», «¿Quién puede
 * matar a un niño?» y «La vida en un hilo». Partido, `resolveFilms` busca con
 * los dos —que es exactamente lo que ya hace con las filas de los palmareses—
 * y los tres aparecen.
 *
 * Solo se parte cuando el paréntesis está AL FINAL y tiene pinta de título: un
 * «(1998)» o un «(TV)» no son un título original.
 */
export function partirTitulo(bruto) {
  // `{1,}` y no `{2,}`: las marcas de una sola letra —«(S)» de cortometraje,
  // «(V)» de vídeo, «(C)»— nunca llegaban a mirarse, y se quedaban pegadas al
  // título. Lo que sí exige dos letras es tomarlo por un TÍTULO original.
  const m = String(bruto || '').match(/^(.+?)\s*\(([^()]{1,})\)\s*$/);
  if (!m) return { titulo: String(bruto || '').trim(), original: null, marca: null };
  const dentro = m[2].trim();
  // Lo que va entre paréntesis no siempre es un título: puede ser el año o una
  // marca de formato. La guarda cubre las formas que usan de verdad —«TV»,
  // «TV Series», «S» de cortometraje, «V» de vídeo— y no solo las de una
  // palabra, que era lo que dejaba pasar «(TV Series)» como si fuera un título.
  if (/^(19|20)\d{2}$/.test(dentro)) return { titulo: String(bruto || '').trim(), original: null, marca: null };
  if (MARCA.test(dentro)) {
    // LA MARCA SE QUITA DEL TÍTULO, y ese es el arreglo: antes se quedaba
    // pegada y se buscaba en TMDB «Queen: Days of Our Lives (TV)», que no
    // existe. Con el paréntesis fuera aparece a la primera. La marca se
    // devuelve aparte porque también dice qué es la ficha: `TV Series` y
    // `Serie de TV` no tienen ficha de película y no vale la pena buscarlas.
    return { titulo: m[1].trim(), original: null, marca: dentro.toUpperCase() };
  }
  // una sola letra que no es marca conocida no es un título original: se deja
  // donde estaba en vez de inventarse un «título» de un carácter
  if (dentro.length < 2) return { titulo: String(bruto || '').trim(), original: null, marca: null };
  return { titulo: m[1].trim(), original: dentro, marca: null };
}

// Las marcas de formato de FilmAffinity, pegadas al final del título.
const MARCA = /^(TV|S|V|C|TV Series|TV Movie|Serie de TV|Miniserie de TV)$/i;

/** Lo que no es una película y por tanto no tiene ficha que buscar en TMDB. */
export const esSerieFA = (marca) => /^(TV SERIES|SERIE DE TV|MINISERIE DE TV)$/.test(String(marca || ''));

// Las entidades que salen en títulos y nombres. No hace falta más: la página
// viene en UTF-8 y solo escapa lo que rompería el HTML.
const ENTIDADES = { '&amp;': '&', '&quot;': '"', '&#039;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' };
const decodificar = (s) => String(s).replace(/&(amp|quot|#039|apos|lt|gt);/g, (m) => ENTIDADES[m] ?? m);

/**
 * Vuelca el ranking empaquetado de un país a la tabla, como fuente `fa`.
 *
 * El puesto NO se recalcula: el orden es el de FilmAffinity, que es justamente
 * lo que se viene a consultar aquí. Las filas sin `tmdb_id` se quedan fuera de
 * la parrilla —sin ficha no hay cartel, ni cruce con tu Plex, ni botón de
 * Radarr— pero SÍ se cuentan, para poder decir cuántas faltan en vez de servir
 * una lista que encoge en silencio.
 */
export async function construirPaisFA(iso) {
  const ISO = String(iso || '').toUpperCase();
  if (!esPaisConocido(ISO)) throw new Error(`País desconocido: ${iso}`);
  if (!tieneRanking(ISO)) throw new Error(`FilmAffinity no tiene ranking de ${PAISES[ISO].es}`);
  const paquete = FA_RANKINGS[ISO];
  if (!paquete?.rows?.length) {
    throw new Error(`El ranking de ${PAISES[ISO].es} no está empaquetado: hay que pasar «npm run snapshot:fa»`);
  }

  const t0 = Date.now();
  const job = `paises-fa:${ISO}`;
  try {
    setBuildProgress(job, `Cargando el ranking de ${PAISES[ISO].es}`, 0, paquete.rows.length);
    // Las correcciones a mano mandan TAMBIÉN aquí. Sin esto, un ✎ sobre una
    // película del ranking de FilmAffinity la borraba en el acto y la
    // reconstrucción la devolvía: la corrección parecía aplicada y se deshacía
    // sola, que es peor que no poder corregir.
    const overrides = new Map(
      db.prepare('SELECT tmdb_id, modo FROM country_overrides WHERE iso = ?').all(ISO).map((r) => [r.tmdb_id, r.modo])
    );
    const admitidas = [];
    const vistos = new Set();
    for (const r of paquete.rows) {
      if (!r.i || vistos.has(r.i) || overrides.get(r.i) === 'drop') continue;
      vistos.add(r.i);
      admitidas.push({
        iso: ISO,
        fuente: 'fa',
        tmdb_id: r.i,
        title: r.t,
        original_title: null,
        year: r.y ?? null,
        poster: null,
        lb: null,
        lb_votes: null,
        sigma: null,
        imdb: null,
        avales: 0,
        ganados: 0,
        director: r.d || null,
        director_iso: null,
        origen: '',
        motivo: 'filmaffinity',
        rank_global: r.p,
        rank_anio: null,
      });
    }
    // El cartel y el título salen de TMDB y no del paquete: guardar imágenes
    // ajenas no toca, y el id no caduca mientras que todo lo demás sí. Son
    // llamadas gratis y cacheadas, y para entonces media lista ya está en la
    // caché de películas por el pase de Letterboxd.
    let hechas = 0;
    setBuildProgress(job, 'Buscando carteles en TMDB', 0, admitidas.length);
    await mapPool(admitidas, 6, async (a) => {
      try {
        const d = await movieDetail(a.tmdb_id);
        a.poster = d.poster_path || null;
        a.title = d.title || a.title;
        a.original_title = d.original_title || null;
        a.year = Number(String(d.release_date || '').slice(0, 4)) || a.year;
        // Aquí NO había filtro ninguno, y por eso entraban un screen test de
        // Marlene Dietrich de 4 minutos, un corto de Zulueta de 5 y el
        // making-of de «Sonata de otoño». La misma vara que en la lista
        // nuestra: solo largometraje de cine, y los conciertos fuera.
        const clasificada = classifyGenres({ ...d }, (d.genres || []).map((g) => g.id));
        if (!esLargometraje(clasificada) || clasificada.isMusic) a.fuera = true;
        // la misma lista que en el índice por Letterboxd: lo que no es cine no
        // lo es tampoco cuando lo trae el ranking de FilmAffinity
        if (noEsCine(a.tmdb_id)) a.fuera = true;
      } catch {
        /* sin ficha se queda sin cartel, que es mejor que no salir */
      }
      setBuildProgress(job, 'Buscando carteles en TMDB', ++hechas, admitidas.length);
    });

    // Las notas que YA estén pedidas se enseñan; no se gasta cupo en pedirlas,
    // que aquí ordena FilmAffinity y la nota es solo una referencia al lado.
    await enrichWithScores(admitidas, { fetchMissing: false });
    for (const a of admitidas) {
      a.lb = notaValida(a.mdb?.letterboxd);
      a.lb_votes = a.mdb?.lb_votes ?? null;
      a.sigma = a.mdb?.score ?? null;
      a.imdb = a.mdb?.imdb ?? null;
      delete a.mdb;
    }

    // y los avales, que son los mismos premios y cánones de siempre
    const avales = conteoAvales(admitidas.map((a) => a.tmdb_id));
    for (const a of admitidas) {
      a.avales = avales[a.tmdb_id]?.total || 0;
      a.ganados = avales[a.tmdb_id]?.ganados || 0;
    }

    const buenas = admitidas.filter((a) => !a.fuera);
    for (const a of buenas) delete a.fuera;

    const guardar = db.transaction((lista) => {
      db.prepare("DELETE FROM country_films WHERE iso = ? AND fuente = 'fa'").run(ISO);
      const ins = db.prepare(
        `INSERT INTO country_films (iso, fuente, tmdb_id, title, original_title, year, poster, lb, lb_votes,
           sigma, imdb, avales, ganados, director, director_iso, origen, motivo, rank_global, rank_anio)
         VALUES (@iso, @fuente, @tmdb_id, @title, @original_title, @year, @poster, @lb, @lb_votes,
           @sigma, @imdb, @avales, @ganados, @director, @director_iso, @origen, @motivo, @rank_global, @rank_anio)`
      );
      for (const f of lista) ins.run(f);
    });
    guardar(buenas);

    const resumen = {
      iso: ISO,
      fuente: 'fa',
      at: Date.now(),
      candidatos: paquete.rows.length,
      // aquí «con nota» son las que tienen nota de Letterboxd de verdad (las
      // que ya estaban pedidas: este pase no gasta cupo). Contar las fichas
      // emparejadas en su lugar hacía que la página prometiera notas que nadie
      // había pedido.
      con_nota: buenas.filter((a) => a.lb != null).length,
      guardadas: buenas.length,
      del_palmares: 0,
      segundos: Math.round((Date.now() - t0) / 1000),
      error: null,
    };
    db.prepare(
      `INSERT INTO country_builds (iso, fuente, at, candidatos, con_nota, guardadas, del_palmares, segundos, error)
       VALUES (@iso, @fuente, @at, @candidatos, @con_nota, @guardadas, @del_palmares, @segundos, @error)
       ON CONFLICT(iso, fuente) DO UPDATE SET at = @at, candidatos = @candidatos, con_nota = @con_nota,
         guardadas = @guardadas, del_palmares = @del_palmares, segundos = @segundos, error = @error`
    ).run(resumen);
    return resumen;
  } finally {
    clearBuildProgress(job);
  }
}
