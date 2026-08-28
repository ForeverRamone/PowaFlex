import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'powaflex-sindir-'));

const { elegirCandidato } = await import('../src/festivals.js');

const dirsFijos = (mapa) => async (id) => (id in mapa ? mapa[id] : []);
const enFijos = (mapa) => async (id) => mapa[id] ?? null;
const SIN_LIB = new Set();

/**
 * EL CASO «FLOW», que es el que destapó todo esto.
 *
 * La tabla del Óscar de animación no tiene columna de dirección, así que la
 * única prueba es el título. En TMDB hay cuatro películas de 2024 llamadas
 * «Flow» y la buena —la letona de Gints Zilbalodis— es justo la que NO clava:
 * de original se llama «Straume» y en castellano «Flow, un mundo que salvar»,
 * porque a TMDB se le pregunta en castellano. Su título internacional sí es
 * «Flow». Los votos son lo que las separa: 2.997 contra 25, 0 y 0.
 */
test('entre homónimas sin dirección manda el volumen de votos, no el orden', async () => {
  const row = { title: 'Flow', original_title: 'Flow', director: null };
  const cands = [
    { id: 1, title: 'FLOW', original_title: 'FLOW', date: '2024-02-01', votes: 25 },
    { id: 2, title: 'Flow', original_title: 'Flow', date: '2024-11-09', votes: 0 },
    { id: 3, title: 'Flow', original_title: 'Flow', date: '2024-05-03', votes: 0 },
    { id: 4, title: 'Flow, un mundo que salvar', original_title: 'Straume', date: '2024-08-29', votes: 2997 },
  ];
  const { tmdbId } = await elegirCandidato(
    row, 2024, cands, SIN_LIB,
    dirsFijos({ 1: ['Nadie'], 2: ['Alex Bai'], 3: ['Otro'], 4: ['Gints Zilbalodis'] }),
    enFijos({ 4: 'Flow' }) // el título internacional de la letona
  );
  assert.equal(tmdbId, 4, 'tenía que ganar la que tiene 2.997 votos, no la primera de la lista');
});

test('sin el título internacional se queda sin ficha antes que coger la equivocada', async () => {
  const row = { title: 'Flow', original_title: 'Flow', director: null };
  const cands = [
    { id: 1, title: 'FLOW', original_title: 'FLOW', date: '2024-02-01', votes: 25 },
    { id: 2, title: 'Flow', original_title: 'Flow', date: '2024-11-09', votes: 0 },
  ];
  // sin `tituloEnDe` no hay forma de llegar a la buena: ninguna de las dos
  // homónimas tiene cuerpo suficiente para ganar
  const { tmdbId } = await elegirCandidato(row, 2024, cands, SIN_LIB, dirsFijos({ 1: ['Nadie'], 2: ['Otro'] }));
  assert.equal(tmdbId, null);
});

test('una sola candidata que clave el título entra aunque tenga pocos votos', async () => {
  // el desempate por votos es SOLO para desempatar: un palmarés viejo está
  // lleno de películas que nadie ha votado y siguen siendo la correcta
  const row = { title: 'Una Rareza De 1975', original_title: 'Una Rareza De 1975', director: null };
  const cands = [{ id: 7, title: 'Una Rareza De 1975', original_title: 'Una Rareza De 1975', date: '1975-01-01', votes: 3 }];
  const { tmdbId } = await elegirCandidato(row, 1975, cands, SIN_LIB, dirsFijos({ 7: ['Alguien'] }));
  assert.equal(tmdbId, 7);
});

/**
 * El título CLAVADO y el que solo CONTIENE al de la fila no son la misma
 * prueba. Mezclados, «All In: The Story of Auburn's Undefeated 2010 Season»
 * empataba con la «Undefeated» que ganó el Óscar de documental y bloqueaba el
 * desempate: dos candidatas, ninguna dominante, ninguna ficha.
 */
test('el título clavado gana al que solo lo contiene, sin mirar votos', async () => {
  const row = { title: 'Undefeated', original_title: 'Undefeated', director: null };
  const cands = [
    { id: 1, title: 'Undefeated (Imbatidos)', original_title: 'Undefeated', date: '2011-12-12', votes: 84 },
    { id: 2, title: "All In: The Story of Auburn's Undefeated 2010 Season", original_title: "All In: The Story of Auburn's Undefeated 2010 Season", date: '2011-01-12', votes: 0 },
  ];
  const { tmdbId } = await elegirCandidato(row, 2011, cands, SIN_LIB, dirsFijos({ 1: ['Daniel Lindsay'], 2: ['Drew Walker'] }));
  assert.equal(tmdbId, 1);
});

test('si solo hay coincidencias por subtítulo, siguen valiendo', async () => {
  // «Personal Velocity: Three Portraits» (Sundance) contra «Personal Velocity»
  const row = { title: 'Personal Velocity: Three Portraits', original_title: 'Personal Velocity: Three Portraits', director: null };
  const cands = [{ id: 9, title: 'Personal Velocity', original_title: 'Personal Velocity', date: '2002-01-01', votes: 40 }];
  const { tmdbId } = await elegirCandidato(row, 2002, cands, SIN_LIB, dirsFijos({ 9: ['Rebecca Miller'] }));
  assert.equal(tmdbId, 9);
});

test('dos homónimas con votos parecidos se quedan las dos fuera', async () => {
  // el registro estadounidense tiene DOS «Dracula» de 1931 (la de Browning y la
  // versión española de Melford): la fila no da con qué separarlas, así que no
  // se elige ninguna en vez de jugársela a cara o cruz
  const row = { title: 'Dracula', original_title: 'Dracula', director: null };
  const cands = [
    { id: 1, title: 'Drácula', original_title: 'Dracula', date: '1931-02-12', votes: 1200 },
    { id: 2, title: 'Drácula', original_title: 'Dracula', date: '1931-03-11', votes: 400 },
  ];
  const { tmdbId } = await elegirCandidato(row, 1931, cands, SIN_LIB, dirsFijos({ 1: ['Tod Browning'], 2: ['George Melford'] }));
  assert.equal(tmdbId, null, '1.200 no le saca un orden de magnitud a 400: no hay ganadora clara');
});

test('con dirección en la fila no cambia nada: sigue mandando el nombre', async () => {
  // la ruta de siempre, intacta: aquí el desempate ya lo da el director y no
  // hace falta contar votos
  const row = { title: 'Bunker', original_title: 'Bunker', director: 'Florian Zeller' };
  const cands = [
    { id: 1, title: 'Bunker', original_title: 'Bunker', date: '2026-03-01', votes: 5000 },
    { id: 2, title: 'Bunker', original_title: 'Bunker', date: '2026-08-01', votes: 2 },
  ];
  const { tmdbId } = await elegirCandidato(row, 2026, cands, SIN_LIB, dirsFijos({ 1: ['Otra Persona'], 2: ['Florian Zeller'] }));
  assert.equal(tmdbId, 2, 'los votos no pueden pisar a la verificación por dirección');
});

test('una ficha sin créditos sigue siendo el último recurso, no el primero', async () => {
  const row = { title: 'Recién Anunciada', original_title: 'Recién Anunciada', director: null };
  const cands = [{ id: 3, title: 'Recién Anunciada', original_title: 'Recién Anunciada', date: '2026-01-01', votes: 0 }];
  const { tmdbId } = await elegirCandidato(row, 2026, cands, SIN_LIB, dirsFijos({ 3: [] }));
  assert.equal(tmdbId, 3, 'sin nadie con créditos que lo demuestre, el título clavado basta');
});

// --- CUANDO TMDB LLAMA DE OTRA MANERA A QUIEN DIRIGE -------------------------
//
// TMDB guarda a John Woo como «Wu Yu-Sheng» —la transcripción mandarina de
// 吳宇森— y «John Woo» vive solo entre sus alias. No es una variante de
// transliteración que se pueda plegar comparando letras: son dos nombres
// distintos de la misma persona. Con «The Killer», «Hard Boiled» y «Last Hurrah
// for Chivalry» de Criterion delante, la ficha correcta estaba ahí y se
// rechazaba por el nombre.

const aliasFijos = (mapa) => async (id) => mapa[id] ?? [];

test('el alias de quien dirige rescata la ficha, con el título clavado', async () => {
  const row = { title: 'Hard Boiled', original_title: 'Hard Boiled', director: 'John Woo' };
  const cands = [{ id: 11782, title: 'Hard Boiled', original_title: '辣手神探', date: '1992-04-16', votes: 971 }];
  const sinAlias = await elegirCandidato(row, 1992, cands, SIN_LIB, dirsFijos({ 11782: ['Wu Yu-Sheng'] }));
  assert.equal(sinAlias.tmdbId, null, 'sin mirar los alias, el nombre no casa y se pierde');

  const conAlias = await elegirCandidato(
    row, 1992, cands, SIN_LIB, dirsFijos({ 11782: ['Wu Yu-Sheng'] }), null, null,
    aliasFijos({ 11782: ['吳宇森', 'Wu Yu-Sheng', 'John Y. Woo', 'John Woo'] })
  );
  assert.equal(conAlias.tmdbId, 11782);
});

test('el alias NO vale sin el título clavado: siguen siendo dos pruebas', async () => {
  const row = { title: 'Una Película Suya', original_title: 'Una Película Suya', director: 'John Woo' };
  const cands = [{ id: 5, title: 'Otra Cosa Distinta', original_title: 'Otra Cosa Distinta', date: '1992-01-01', votes: 900 }];
  const { tmdbId } = await elegirCandidato(
    row, 1992, cands, SIN_LIB, dirsFijos({ 5: ['Wu Yu-Sheng'] }), null, null,
    aliasFijos({ 5: ['John Woo'] })
  );
  assert.equal(tmdbId, null, 'que dirija esa persona no basta si el título no es el que buscamos');
});

test('el título clavado del alias puede estar solo en el internacional', async () => {
  // «The Killer» de John Woo es «The Killer (El asesino)» en castellano y
  // «喋血雙雄» de original: ninguno de los dos clava, y el inglés sí
  const row = { title: 'The Killer', original_title: 'The Killer', director: 'John Woo' };
  const cands = [{ id: 10835, title: 'The Killer (El asesino)', original_title: '喋血雙雄', date: '1989-03-24', votes: 925 }];
  const { tmdbId } = await elegirCandidato(
    row, 1989, cands, SIN_LIB, dirsFijos({ 10835: ['Wu Yu-Sheng'] }),
    enFijos({ 10835: 'The Killer' }), null,
    aliasFijos({ 10835: ['Wu Yu-Sheng', 'John Woo'] })
  );
  assert.equal(tmdbId, 10835);
});

// --- LA OBRA DERIVADA, QUE COMPARTE DIRECCIÓN CON LA PELÍCULA ----------------
//
// La puerta que las dejaba entrar decía
//
//     directorsMatch(...) && (row.director || tituloBastaSinDirector(c))
//
// y con `row.director` puesto el segundo paréntesis era siempre cierto: a las
// filas con dirección no se les miraba el título. El making-of, la prueba de
// cámara y el reportaje están firmados por quien firma la película y se llaman
// casi igual, así que pasaban con la única prueba que se pedía. Once fichas
// falsas en el ranking por países y seis en el Top 1000 salieron de aquí.

test('una prueba de cámara no es la película, aunque la firme el mismo director', async () => {
  const row = { title: 'The Blue Angel', original_title: 'Der blaue Engel', director: 'Josef von Sternberg' };
  const cands = [
    { id: 1, title: 'Marlene Dietrich Screen Test for The Blue Angel', original_title: 'Marlene Dietrich Screen Test for The Blue Angel', date: '1930-01-01', votes: 6 },
  ];
  const { tmdbId } = await elegirCandidato(row, 1930, cands, SIN_LIB, dirsFijos({ 1: ['Josef von Sternberg'] }));
  assert.equal(tmdbId, null, 'mejor sin ficha que la ficha de otra');
});

test('el making-of tampoco, ni cuando es el único candidato', async () => {
  const row = { title: 'Autumn Sonata', original_title: 'Höstsonaten', director: 'Ingmar Bergman' };
  const cands = [
    { id: 2, title: 'The Making of Autumn Sonata', original_title: 'Bakom Höstsonaten', date: '1978-01-01', votes: 30 },
  ];
  const { tmdbId } = await elegirCandidato(row, 1978, cands, SIN_LIB, dirsFijos({ 2: ['Ingmar Bergman'] }));
  assert.equal(tmdbId, null);
});

test('con la película delante, la derivada ya no puede ni empatar', async () => {
  const row = { title: 'Wild Strawberries', original_title: 'Smultronstället', director: 'Ingmar Bergman' };
  const cands = [
    { id: 3, title: 'Bakomfilm Smultronstället', original_title: 'Bakomfilm Smultronstället', date: '1957-01-01', votes: 4 },
    { id: 4, title: 'Fresas salvajes', original_title: 'Smultronstället', date: '1957-12-26', votes: 1400 },
  ];
  const { tmdbId } = await elegirCandidato(row, 1957, cands, SIN_LIB, dirsFijos({ 3: ['Ingmar Bergman'], 4: ['Ingmar Bergman'] }));
  assert.equal(tmdbId, 4);
});

test('EL TÍTULO ESCRITO DE OTRA MANERA NO SE PIERDE: es el nivel 2', async () => {
  // Medido en producción: exigir el título clavado costaba cinco fichas de 228
  // filas en Locarno, Karlovy Vary y Rotterdam, y las cinco eran CORRECTAS —
  // «Khamosh Pani» es «Silent Waters» en TMDB, «Seryozha» es «Серёжа»—. Una
  // transliteración no es una obra derivada: se llama de otra manera, no de la
  // misma manera más algo.
  const row = { title: 'Khamosh Pani', original_title: 'Khamosh Pani', director: 'Sabiha Sumar' };
  const cands = [{ id: 100086, title: 'El silencio del agua', original_title: 'خاموش پانی', date: '2003-08-15', votes: 14 }];
  const { tmdbId } = await elegirCandidato(row, 2003, cands, SIN_LIB, dirsFijos({ 100086: ['Sabiha Sumar'] }));
  assert.equal(tmdbId, 100086);
});

test('el título internacional sigue siendo el nivel 1, y gana al respaldo', async () => {
  // «West of the Tracks» es 铁西区 de título Y de original en TMDB: su nombre
  // inglés vive solo en la traducción. Con dos candidatas del mismo director,
  // la que clava el internacional gana a la que solo tiene la dirección.
  const row = { title: 'West of the Tracks', original_title: 'West of the Tracks', director: 'Wang Bing' };
  const cands = [
    { id: 8, title: 'Otra suya de esos años', original_title: 'Otra suya de esos años', date: '2003-06-01', votes: 200 },
    { id: 5, title: '铁西区', original_title: '铁西区', date: '2003-01-01', votes: 120 },
  ];
  const { tmdbId } = await elegirCandidato(
    row, 2003, cands, SIN_LIB, dirsFijos({ 5: ['Wang Bing'], 8: ['Wang Bing'] }),
    enFijos({ 5: 'West of the Tracks' })
  );
  assert.equal(tmdbId, 5, 'dos pruebas ganan a una');
});

test('EL ÁNGEL AZUL: con la derivada vetada, se lleva la película', async () => {
  // La fila trae el título en inglés y TMDB lo tiene en alemán y en castellano,
  // así que la ficha BUENA tampoco clava el título. Antes ganaba la prueba de
  // cámara por orden de búsqueda; ahora la prueba de cámara está vetada y el
  // respaldo por dirección se lleva la película, que es el acierto que la
  // versión estricta tampoco conseguía.
  const row = { title: 'The Blue Angel', original_title: 'The Blue Angel', director: 'Josef von Sternberg' };
  const cands = [
    { id: 1, title: 'Marlene Dietrich Screen Test for The Blue Angel', original_title: 'Marlene Dietrich Screen Test for The Blue Angel', date: '1930-01-01', votes: 6 },
    { id: 2, title: 'El ángel azul', original_title: 'Der blaue Engel', date: '1930-04-01', votes: 900 },
  ];
  const { tmdbId } = await elegirCandidato(row, 1930, cands, SIN_LIB, dirsFijos({ 1: ['Josef von Sternberg'], 2: ['Josef von Sternberg'] }));
  assert.equal(tmdbId, 2);
});

test('si la FILA se llama «The Making of…», el veto no la deja sin ficha', async () => {
  // Hay películas que de verdad se titulan así y son la obra, no el reportaje:
  // «Sembène: The Making of African Cinema» es un documental sobre Ousmane
  // Sembène. Barridos los 30.281 títulos empaquetados de Por países, es el
  // único caso — y es justo el que convertiría el veto en un falso negativo.
  const row = {
    title: 'Sembène: The Making of African Cinema',
    original_title: 'Sembène: The Making of African Cinema',
    director: 'Manthia Diawara',
  };
  const cands = [{ id: 364418, title: 'Sembène: The Making of African Cinema', original_title: 'Sembène: The Making of African Cinema', date: '1994-01-01', votes: 245 }];
  const { tmdbId } = await elegirCandidato(row, 1994, cands, SIN_LIB, dirsFijos({ 364418: ['Manthia Diawara'] }));
  assert.equal(tmdbId, 364418);
});
