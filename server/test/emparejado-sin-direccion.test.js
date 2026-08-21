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
