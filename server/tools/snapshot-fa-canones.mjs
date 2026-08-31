/**
 * GENERADOR DE LOS CÁNONES DE FILMAFFINITY, EMPAQUETADOS.
 *
 *   npm run snapshot:facanones                  # los cinco
 *   npm run snapshot:facanones -- --canon=faxxi # uno suelto
 *
 * Baja los rankings temáticos de FilmAffinity, los empareja con TMDB y escribe
 * `server/src/data/fa-canones-2026.js`. A partir de ahí la aplicación los sirve
 * como cánones (Festivales y premios) sin salir a internet, igual que Sight &
 * Sound, las 1001 o el Top 1000.
 *
 * El porqué de que esto viaje empaquetado y no se baje en caliente, y el de que
 * la descarga vaya por `curl`, están en `fa-comun.mjs` y en la cabecera de
 * `snapshot-filmaffinity.mjs`. En resumen: FilmAffinity contesta 403 a Node.
 *
 * QUÉ ENTRA Y QUÉ NO. De los 162 rankings del índice, aquí están los cinco que
 * son un CANON y no un cajón: una lista con historiografía detrás, no la nota
 * media filtrada por etiqueta. Los treinta y tantos rankings de género de mil
 * filas (drama, comedia, terror, acción…) se quedan fuera a propósito: entre
 * ellos se repiten las mismas películas y no separan nada — cualquiera con nota
 * alta sale en tres o cuatro a la vez. Fuera también todo lo que no es
 * largometraje (series, cortos, videoclips, conciertos), como en el resto de la
 * aplicación.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearFichas, esSerieFA } from '../src/filmaffinity.js';
import { FA_CANONES } from '../src/data/fa-canones-2026.js';
import { resolveFilms } from '../src/festivals.js';
import { bajarRanking, esSospechosa, esperar, rescatarPorDireccion, TOPE_POR_TANDA } from './fa-comun.mjs';

/**
 * Los cinco, con su tamaño real medido el 2026-08-31. `limite` es un tope de
 * seguridad, no una previsión: el recorrido para cuando FilmAffinity devuelve
 * una tanda corta, que es donde de verdad se acaba la lista.
 */
const CANONES = {
  faxxi: { rankingId: 'ranking_fa_xxi_movies', nombre: 'Siglo XXI de FilmAffinity', limite: 1000 },
  fadocs: { rankingId: 'ranking_fa_documentaries', nombre: 'Documentales de FilmAffinity', limite: 1000 },
  famudo: { rankingId: 'ranking_silent', nombre: 'Cine mudo de FilmAffinity', limite: 1000 },
  fanegro: { rankingId: 'ranking_filmnoir', nombre: 'Cine negro de FilmAffinity', limite: 1000 },
  fawestern: { rankingId: 'ranking_western', nombre: 'Western de FilmAffinity', limite: 1000 },
};

/**
 * LAS QUE HAY QUE EMPAREJAR A MANO, con el porqué de cada una.
 *
 * El rescate por dirección deja el emparejado en el 98%, y lo que queda no es
 * oscuro: son fichas que TMDB fecha en otro año («Hamilton» la data en su
 * reestreno de 2025 y FilmAffinity en el estreno de 2020), listas que escriben
 * el número de parte a su manera («Gangs of Wasseypur I» contra «Parte 1») o
 * títulos que ninguna búsqueda va a cruzar («The Horse Ate the Hat» por «Un
 * chapeau de paille d’Italie»).
 *
 * Cada una se comprobó UNA A UNA contra TMDB —año, duración y dirección— antes
 * de escribirla aquí, y por eso la corrección SALTA la verificación automática:
 * es la mano la que manda, como en el Top 1000.
 *
 * La clave es canon|título|año y no el puesto: los puestos se mueven en cuanto
 * FilmAffinity reordena su ranking, y una corrección apuntando al puesto de al
 * lado es peor que no tenerla.
 */
const CORRECCIONES = {
  // TMDB la fecha en su reestreno en salas de 2025; el montaje es el de 2020
  'faxxi|Hamilton|2020': 556574,
  // se estrenó en Toronto en 2004 y TMDB la fecha en 2005
  'faxxi|Crash|2004': 1640,
  // TMDB las titula «Acantilado rojo» y «Acantilado rojo 2»
  'faxxi|The Battle of Red Cliff|2008': 12289,
  'faxxi|Red Cliff: Part II|2009': 15384,
  // FilmAffinity numera las partes con romanos y TMDB con «Parte 1» y «Parte 2»
  'fanegro|Gangs of Wasseypur I|2012': 117691,
  'fanegro|Gangs of Wasseypur II|2012': 126400,
  'fawestern|Blueberry: The Secret Experience|2004': 10046,
  // «El hombre de la cámara»: TMDB acredita a Vertov por su nombre de pila
  'fadocs|The Man with the Movie Camera|1929': 26317,
  'fadocs|Camaron: Flamenco and Revolution|2018': 527664,
  'fadocs|Cuban Rafters|2002': 27915, // «Balseros»
  'fadocs|Havana Suite|2003': 85645, // «Suite Habana»
  'fadocs|The People of Rome|2003': 58089, // «Gente di Roma»
  // mudo: títulos que la búsqueda no cruza en ningún idioma
  'famudo|Each Night I Dream|1933': 126516, // 夜ごとの夢
  'famudo|The Horse Ate the Hat|1928': 99875, // Un chapeau de paille d’Italie
  'famudo|Regeneration|1915': 86081, // TMDB le pone artículo: «The Regeneration»
  'famudo|The Last of the Mohicans|1920': 71065, // TMDB acredita a Tourneur, que la codirige
  'famudo|Jûjiro|1928': 190147, // 十字路
  'famudo|The Moving Image|1920': 115515, // Das wandernde Bild
};

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nombre, pordefecto = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return m ? m.slice(nombre.length + 3) : pordefecto;
};

const destino = path.join(raiz, 'src/data/fa-canones-2026.js');

const CABECERA = [
  '/**',
  ' * CÁNONES DE FILMAFFINITY, EMPAQUETADOS.',
  ' *',
  ' * Generado por server/tools/snapshot-fa-canones.mjs — no se edita a mano.',
  ' *',
  ' * Cada fila: rank = puesto, title, year, director y tmdb_id (ausente cuando no',
  ' * se pudo emparejar con seguridad: mejor sin ficha que la ficha de otra).',
  ' *',
  ' * Las filas cuya ficha de TMDB resulta ser un CORTOMETRAJE no se guardan: en un',
  ' * canon de largometrajes no son una fila sin cartel, son una fila que sobra.',
  ' */',
].join('\n');

/**
 * Se PARTE de lo ya empaquetado y se escribe DESPUÉS DE CADA CANON, por lo
 * mismo que en el ranking por países: un corte a mitad no puede tirar lo que ya
 * estaba bajado, y pasarla para uno suelto no puede borrar los otros cuatro.
 */
const salida = { ...FA_CANONES };
function escribir() {
  const cuerpo = `${CABECERA}\nexport const FA_CANONES = ${JSON.stringify(salida, null, 0)};\n`;
  fs.writeFileSync(destino, cuerpo);
  return cuerpo.length;
}

/** El ranking entero, de cien en cien, hasta que se acaba o hasta el tope. */
function bajarEntero(rankingId, limite) {
  const filas = [];
  const vistos = new Set();
  for (let from = 0; from < limite; from += TOPE_POR_TANDA) {
    const tanda = parsearFichas(bajarRanking(rankingId, from, TOPE_POR_TANDA));
    for (const f of tanda) {
      // el mismo título no puede ocupar dos puestos: si se repite, se ignora
      if (vistos.has(f.fa_id)) continue;
      vistos.add(f.fa_id);
      filas.push(f);
    }
    process.stdout.write(`${filas.length}… `);
    // una tanda corta es el final de la lista; una vacía, también
    if (tanda.length < TOPE_POR_TANDA) break;
  }
  return filas.slice(0, limite);
}

const claves = arg('canon') ? [arg('canon')] : Object.keys(CANONES);
for (const clave of claves) {
  const canon = CANONES[clave];
  if (!canon) {
    console.error(`  ${clave}: no está en CANONES, se salta`);
    continue;
  }
  process.stdout.write(`${clave} (${canon.nombre}): bajando… `);
  const filas = bajarEntero(canon.rankingId, canon.limite);
  if (!filas.length) {
    // No es un fallo de red: es una página sin fichas. Pasa cuando se le piden
    // muchas tandas seguidas, y pasaría también si cambiaran la plantilla.
    console.log('SIN FICHAS (¿va muy rápido, o cambió la página?)');
    continue;
  }
  process.stdout.write(`\n  ${filas.length} filas · emparejando… `);

  const { films } = await resolveFilms(
    // el título original va aparte cuando lo trae entre paréntesis: sin eso se
    // pierden «La lengua de las mariposas» y las de su clase
    filas.map((f) => ({ title: f.title, original_title: f.original_title, year: f.year, director: f.director })),
    (r) => r.year
  );

  // La ficha emparejada se verifica contra TMDB antes de darla por buena: manda
  // la regla de la casa, MEJOR SIN FICHA QUE LA FICHA DE OTRA. El porqué de cada
  // comprobación está en `esSospechosa` (fa-comun.mjs).
  const rows = [];
  const vistos = new Set();
  let tiradas = 0;
  let cortos = 0;
  let rescatadas = 0;
  let corregidas = 0;
  for (let i = 0; i < films.length; i++) {
    const orig = filas[i];
    let id = films[i]?.tmdb_id && !vistos.has(films[i].tmdb_id) ? films[i].tmdb_id : null;
    // la mano manda sobre el automático, y salta su verificación: cada una de
    // estas se comprobó a ojo contra TMDB (ver CORRECCIONES)
    const aMano = CORRECCIONES[`${clave}|${orig.title}|${orig.year}`];
    if (aMano) {
      vistos.add(aMano);
      corregidas++;
      rows.push({ rank: rows.length + 1, title: orig.title, year: orig.year, director: orig.director, tmdb_id: aMano });
      continue;
    }
    // El emparejado por título no llegó: se pregunta por quien firma. Es de
    // donde salen «Downfall» por «The Downfall: Hitler and…», «Volver» por «To
    // Return» o «Amour» por «Love». Ver `rescatarPorDireccion`.
    if (!id && !esSerieFA(orig.marca)) {
      const rescatado = await rescatarPorDireccion(orig);
      if (rescatado && !vistos.has(rescatado) && !(await esSospechosa(rescatado, orig))) {
        id = rescatado;
        rescatadas++;
        console.log(`    ↳ #${rows.length + 1} «${orig.title}» rescatada por ${orig.director} → tmdb ${id}`);
      }
    }
    if (id) {
      const fallo = await esSospechosa(id, orig);
      // Un CORTO no es un emparejado equivocado: es que esa fila no pinta nada
      // en un canon de largometrajes (`ranking_silent` mezcla los dos). Se cae
      // entera, en vez de quedarse como una fila muda sin cartel.
      if (fallo?.clase === 'corto') {
        cortos++;
        continue;
      }
      if (fallo) {
        console.error(`\n    ✕ #${rows.length + 1} «${orig.title}» → tmdb ${id}: ${fallo.motivo}`);
        tiradas++;
        id = null;
      }
    }
    if (id) vistos.add(id);
    // el puesto se renumera al guardar: si se cae un corto por el camino, la
    // lista no puede quedarse con un hueco en la numeración
    rows.push({ rank: rows.length + 1, title: orig.title, year: orig.year, director: orig.director, ...(id ? { tmdb_id: id } : {}) });
  }

  salida[clave] = { hasta: new Date().toISOString().slice(0, 10), rows };
  escribir();
  console.log(
    `\n  ${rows.filter((r) => r.tmdb_id).length}/${rows.length} con ficha` +
      (rescatadas ? ` · ${rescatadas} rescatadas por dirección` : '') +
      (corregidas ? ` · ${corregidas} a mano` : '') +
      (cortos ? ` · ${cortos} cortos fuera` : '') +
      (tiradas ? ` · ${tiradas} descartadas por no ser la película` : '')
  );

  // Un respiro largo entre cánones. Con segundo y medio, FilmAffinity devolvía
  // páginas vacías a partir del tercero o el cuarto (ver el ranking por países).
  await esperar(6000);
}

const bytes = escribir();
console.log(`\nEscrito ${destino} (${Object.keys(salida).length} cánones, ${(bytes / 1024).toFixed(0)} KB)`);
const faltan = Object.keys(CANONES).filter((k) => !salida[k]?.rows?.length);
if (faltan.length) console.log(`Sin bajar todavía: ${faltan.join(', ')} — vuelve a pasarla con --canon=X`);
