/**
 * LO QUE COMPARTEN LAS TRES HERRAMIENTAS DE FILMAFFINITY: cómo se baja un
 * ranking y cómo se comprueba que la ficha emparejada es LA PELÍCULA.
 *
 * Vivía por triplicado —el ranking por países, el Top 1000 y los cánones— y las
 * tres copias decían lo mismo con dos palabras de diferencia. Eso no es una
 * repetición cosmética: `esSospechosa` es la que aplica la regla de la casa
 * («mejor sin ficha que la ficha de otra») y la que ya salvó once emparejados
 * falsos. Una regla de corrección con tres copias es una regla que dentro de
 * dos versiones dirá tres cosas distintas.
 *
 * No es código de servidor: se ejecuta solo al generar los paquetes, en la
 * máquina de desarrollo. Al contenedor viajan los ficheros de datos.
 */
import { execFileSync } from 'node:child_process';
import { movieDetail, englishTitle, findPersonInfo, personCredits, personDetails } from '../src/tmdb.js';
import { normName } from '../src/names.js';
import { needsLatin } from '../src/titles.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/**
 * Una tanda del ranking, pedida como la pide su propia página: el POST que
 * dispara la flecha de «ver más».
 *
 * Va por `curl` y no por `fetch` porque FilmAffinity está detrás de Cloudflare
 * y responde 403 a Node —distingue por la huella TLS del cliente, no por las
 * cabeceras— mientras que a curl le responde 200. El porqué largo de que todo
 * esto sea un paquete y no una descarga en caliente está en la cabecera de
 * `snapshot-filmaffinity.mjs`.
 *
 * `count` está TOPADO EN 100 por su servidor: con 200 o con 500 devuelve una
 * página vacía, no un error. Mil filas son diez llamadas.
 */
export const TOPE_POR_TANDA = 100;

export function bajarRanking(rankingId, from = 0, count = TOPE_POR_TANDA) {
  return execFileSync(
    'curl',
    [
      '-s', '-m', '40', '-A', UA,
      '-X', 'POST', 'https://www.filmaffinity.com/en/ranking.php',
      '--data', `from=${from}&count=${Math.min(count, TOPE_POR_TANDA)}&rankingId=${rankingId}&chv=0`,
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Lo que NUNCA es la película: el making-of, la prueba de cámara, el reportaje.
const DERIVADAS = ['makingof', 'behindthescenes', 'screentest', 'bakom', 'comosehizo', 'elrodajede'];

/**
 * Y las marcas de PARTE, que son otra cosa y piden más cuidado.
 *
 * Una ficha que dice «Parte II» cuando el ranking pedía la película entera es
 * un emparejado falso («Guerra y paz» apuntaba a la Parte II). Pero si el
 * ranking YA pedía una parte —«Ivan the Terrible. Part II»— entonces la ficha
 * con parte es la correcta, y rechazarla es el error contrario.
 *
 * Como el título de la ficha llega en el idioma de la aplicación y el del
 * ranking viene en inglés, no se pueden comparar marca a marca: «Part II» y
 * «segunda parte» son la misma cosa escrita en dos sitios distintos. Así que la
 * pregunta no es cuál coincide, sino si el título de origen habla de partes EN
 * ABSOLUTO.
 *
 * Se comprueba sobre el título CRUDO y con límites de palabra, no sobre el
 * normalizado: normName quita los espacios, y buscando «parti» ahí dentro se
 * rechazaban «Una jornada PARTIcular», «Sin señas PARTIculares» y «Desierto
 * PARTIcular», que son las películas correctas.
 */
const PARTE =
  /\b(part|parte|vol|volume)\.?\s*(i{1,3}|iv|v|one|two|three|dos|tres|\d{1,2})\b|\b(primera|segunda|tercera|first|second|third|fourth)\s+(parte|part)\b/i;

/**
 * ¿ES ESTA FICHA DE TMDB LA PELÍCULA QUE PEDÍA LA FILA?
 *
 * El emparejador de la casa acepta una ficha con el nombre de quien dirige
 * aunque el título no case, y con eso se colaron once películas que eran OTRA:
 * el screen test de Marlene Dietrich de cuatro minutos por «El ángel azul», el
 * making-of de «Sonata de otoño» por la película, un esbozo vacío chino por «El
 * crack» de Garci. Todas comparten la misma pinta —fichas huérfanas: sin votos,
 * sin duración de largometraje, o con un año que no es el que dice
 * FilmAffinity—, así que se comprueban aquí una a una.
 *
 * Devuelve el motivo del rechazo, o null si la ficha vale. `clase` separa el
 * corto del resto porque no es el mismo rechazo: un corto no es un emparejado
 * equivocado, es una fila que no pinta nada en un canon de largometrajes.
 */
export async function esSospechosa(id, fila) {
  try {
    const d = await movieDetail(id);
    const anio = Number(String(d.release_date || '').slice(0, 4)) || null;
    if (!anio) return { clase: 'ficha', motivo: 'sin fecha' };
    if (fila.year && Math.abs(anio - fila.year) > 2) {
      return { clase: 'ficha', motivo: `año ${anio} frente a ${fila.year}` };
    }
    if ((d.runtime || 0) > 0 && d.runtime < 40) {
      return { clase: 'corto', motivo: `${d.runtime} min: no es un largometraje` };
    }
    if ((d.vote_count || 0) === 0 && (d.runtime || 0) === 0) return { clase: 'ficha', motivo: 'ficha vacía' };
    const deLaFicha = `${normName(d.title)} ${normName(d.original_title || '')}`;
    const deOrigen = [fila.title, fila.original_title].filter(Boolean).join(' ');
    const suyo = normName(deOrigen);
    // 1. lo derivado nunca es la película
    for (const marca of DERIVADAS) {
      if (deLaFicha.includes(marca) && !suyo.includes(marca)) {
        return { clase: 'ficha', motivo: `«${d.title}» no es la película` };
      }
    }
    // 2. una parte suelta solo vale si el ranking pedía una parte
    const fichaEsParte = PARTE.test(d.title || '') || PARTE.test(d.original_title || '');
    if (fichaEsParte && !PARTE.test(deOrigen)) return { clase: 'ficha', motivo: `«${d.title}» es solo una parte` };
    // 3. LA PIEZA ACOMPAÑANTE, que no lleva ninguna marca reconocible
    if ((d.runtime || 0) > 0 && d.runtime < DURACION_ACOMPANANTE) {
      const motivo = await ampliaElTitulo(id, fila);
      if (motivo) return { clase: 'ficha', motivo };
    }
    return null;
  } catch {
    return null; // si TMDB no contesta no se condena a nadie
  }
}

/**
 * LA PIEZA ACOMPAÑANTE, o por qué Hong Kong empezaba con la película que no es.
 *
 * El ranking de Hong Kong pedía «In the Mood for Love» (Wong Kar-Wai, 2000) y
 * se quedaba con **«@ in the mood for love»**: un mediometraje de 51 minutos
 * del MISMO director y del año siguiente. Pasaba las tres comprobaciones de
 * arriba —dirección correcta, año dentro de la ventana, más de 40 minutos— y la
 * lista de obras derivadas no lo cazaba porque no dice «making of» por ninguna
 * parte: lo único que hace es AÑADIR una arroba al título de la película.
 *
 * Esa es la firma, y la comparación tiene que ir contra el título INGLÉS: TMDB
 * devuelve el suyo en el idioma de la aplicación, y comparar «Deseando amar»
 * con «In the Mood for Love» no dice nada. Solo se pregunta por las fichas
 * cortas, que son un puñado de cada lista: en las demás no cuesta ni una
 * petición.
 */
const DURACION_ACOMPANANTE = 75;

async function ampliaElTitulo(id, fila) {
  const suyo = normName(fila.title);
  if (!suyo) return null;
  let en;
  try {
    en = normName((await englishTitle(id)) || '');
  } catch {
    return null;
  }
  // añade algo al título que pedía la lista, y es más corta que un largo normal
  if (en && en !== suyo && en.includes(suyo) && en.length > suyo.length) {
    return `«${await englishTitle(id)}» amplía el título: es la pieza acompañante, no la película`;
  }
  return null;
}

/**
 * EL RESCATE POR FILMOGRAFÍA: cuando el título no lleva a ninguna parte, se
 * pregunta por quien firma.
 *
 * FilmAffinity traduce al inglés por su cuenta y TMDB no siempre usa ese
 * título: la lista dice «The Downfall: Hitler and the End of the Third Reich» y
 * TMDB «Downfall»; dice «To Return» y es «Volver»; dice «Love» y es «Amour»;
 * dice «Hell» y es «El infierno». Buscando por título no aparece ninguna, y son
 * de las mejor colocadas de sus listas.
 *
 * Pero la fila trae dos datos más que no se estaban usando: QUIÉN LA DIRIGE y
 * EN QUÉ AÑO. La filmografía de esa persona en TMDB son treinta títulos, y
 * dentro de ella el año casi siempre señala uno solo. Cuesta dos peticiones
 * cacheadas por fila rescatada, y solo se paga por las que se quedaron sin
 * ficha.
 *
 * Devuelve el id, o null cuando el año no señala a UNA sola: entre dos
 * candidatas del mismo año, sin nada más que las separe, manda la regla de la
 * casa — mejor sin ficha que la ficha de otra.
 */
export async function rescatarPorDireccion(fila) {
  if (!fila.director || !fila.year) return null;
  try {
    const persona = await findPersonInfo(fila.director);
    if (!persona?.id) return null;
    if (!(await esLaMismaPersona(persona, fila.director))) return null;
    const credits = await personCredits(persona.id);
    const suyas = (credits?.crew || []).filter((c) => c.job === 'Director' && !c.video && c.release_date);
    const año = (c) => Number(c.release_date.slice(0, 4));
    const suyo = normName(fila.title);
    const clavada = (c) => normName(c.title || '') === suyo || normName(c.original_title || '') === suyo;
    // primero el año clavado; si no, la ventana de dos, que es la que ya usa el
    // resto de la casa (el BFI fecha por producción y TMDB por estreno)
    for (const margen of [0, 1, 2]) {
      const cerca = suyas.filter((c) => Math.abs(año(c) - fila.year) <= margen);
      if (!cerca.length) continue;
      // un título clavado manda sobre la cuenta: entre «Carmen y Lola» y otra
      // del mismo año, no hay nada que dudar
      const clavadas = cerca.filter(clavada);
      if (clavadas.length === 1) return clavadas[0].id;
      if (clavadas.length > 1) return null;
      // y si no hay ninguno clavado, vale la única del año — que es justo el
      // caso que se viene a rescatar: «Volver» por «To Return», «Amour» por
      // «Love», «Birdman or (The Unexpected Virtue of Ignorance)» por «Birdman».
      //
      // OJO con el atajo de descartar aquí las que AMPLÍAN el título: se probó,
      // y con «Birdman» fuera de la lista ganaba por eliminación «El renacido»,
      // que es otra película de Iñárritu del año siguiente. Descartar candidatas
      // no deja la fila sin ficha: se la da a la siguiente. Lo que amplía el
      // título y de verdad no es la película (el especial de la tele alemana por
      // «Leaving Neverland») se corrige a mano en CORRECCIONES.
      if (cerca.length === 1) return cerca[0].id;
      return null; // dos candidatas y nada que las separe: ninguna
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * ¿ES LA MISMA PERSONA? Con cuidado con los nombres que no están en alfabeto latino.
 *
 * `findPersonInfo` busca por ese nombre exacto y devuelve al más popular que se
 * le parezca, así que casi siempre acierta; lo que hace falta es no aceptar al
 * homónimo. Comparar en crudo no vale —TMDB escribe «F. W. Murnau» donde
 * FilmAffinity pone «F.W. Murnau», y «Arantxa Echevarría» con tilde—, así que
 * la comparación va por `normName`.
 *
 * Y OJO con el atajo evidente: TMDB guarda a Edward Yang como «楊德昌» y a Naomi
 * Kawase como «河瀨直美», y `normName` de un nombre en otro alfabeto es la CADENA
 * VACÍA, que casaría con cualquiera. Ahí hay que ir a por su nombre latino
 * (`latinPersonName`, que lo saca de los alias) en vez de dar por bueno el
 * vacío. Eso es exactamente lo que ya le pasó a la casa con los palmareses.
 */
async function esLaMismaPersona(persona, nombre) {
  const buscado = normName(nombre);
  if (!buscado) return false;
  if (normName(persona.name || '') === buscado) return true;
  /**
   * EL NOMBRE QUE NO SE PUEDE COMPARAR.
   *
   * TMDB guarda a Edward Yang como «楊德昌», a Isao Takahata como «高畑勲» y a
   * Naomi Kawase como «河瀨直美» — y su lista de alias NO trae el nombre
   * occidental por el que los conoce FilmAffinity (la de Yang empieza por «Yang
   * Dechang»; la de Takahata son transcripciones al ruso, al coreano y al
   * persa). Comparar ahí no da «distinto»: da «imposible».
   *
   * Lo que sí es un dato: la BÚSQUEDA de TMDB encontró a esta persona pidiéndole
   * ese nombre exacto, o sea que su índice sí conoce la equivalencia aunque la
   * ficha no la publique. Con un nombre en otro alfabeto eso es la mejor prueba
   * que hay, y la alternativa —normalizar «楊德昌» a la cadena vacía y darla por
   * buena— es la que casaba a cualquiera con cualquiera.
   *
   * Con un nombre latino la comparación SÍ vale, y ahí se mantiene estricta:
   * ese es el caso del homónimo, que es de lo que protege esta guarda.
   */
  if (needsLatin(persona.name || '')) return true;
  try {
    const det = await personDetails(persona.id);
    return (det?.also_known_as || []).some((alias) => normName(alias || '') === buscado);
  } catch {
    return false;
  }
}
