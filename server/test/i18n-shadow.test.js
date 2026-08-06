import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Que nadie vuelva a tapar la función t() de traducción con una variable local.
 *
 * En la Beta 1.01 tres páginas (Taller, Descubrir y Estrenos) pintaban sus
 * pestañas con `TABS.map(([t, label, Icon]) => … {t(label)} …)`: la clave de la
 * pestaña se llamaba igual que la función de traducción importada, así que
 * `t(label)` intentaba llamar a la cadena 'calidad' y la página entera moría
 * con «t is not a function» — en los dos idiomas, y sin que build ni tests
 * dijeran nada. Aquí se cruza cada variable llamada `t` con su ámbito: si
 * dentro de ese ámbito hay una llamada `t(...)`, es el fallo de nuevo.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_SRC = path.join(raiz, 'web/src');

function ficherosDe(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...ficherosDe(p));
    else if (/\.(jsx?|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Sitios donde se declara una variable llamada exactamente «t». Los de tipo
// «parámetro» viven solo dentro del cuerpo de su función; los demás, hasta que
// se cierra el bloque que los contiene.
const PARAMETRO = [
  /\(\s*t\s*[,)]/g, // (t) => … / (t, i) => …
  /\(\s*\[\s*t\s*[,\]]/g, // ([t, label]) => …
  /\(\s*\{\s*t\s*[,}]/g, // ({ t }) => …
];
const DECLARACION = [
  /\b(?:const|let|var)\s+t\s*=/g, // const t = setInterval(…)
  /\bcatch\s*\(\s*t\s*\)/g,
  /\bfor\s*\(\s*(?:const|let|var)\s+t\s+(?:of|in)\b/g,
];

/**
 * Texto desde `desde` hasta que se cierra el bloque que lo contiene. Con
 * `cortaExpresion`, también para en el primer «;» o «,» a profundidad 0: es lo
 * que acota el cuerpo de una flecha sin llaves.
 */
function hastaFinDeBloque(src, desde, cortaExpresion = false) {
  let prof = 0;
  for (let i = desde; i < src.length; i++) {
    const c = src[i];
    if (c === '{' || c === '(' || c === '[') prof++;
    else if (c === '}' || c === ')' || c === ']') {
      prof--;
      if (prof < 0) return src.slice(desde, i); // salimos del ámbito que lo declaraba
    } else if (cortaExpresion && prof === 0 && (c === ';' || c === ',')) {
      return src.slice(desde, i);
    }
  }
  return src.slice(desde);
}

/** Posición del paréntesis que cierra el que abre en `abre`. */
function cierraParen(src, abre) {
  let prof = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '(') prof++;
    else if (src[i] === ')' && --prof === 0) return i;
  }
  return -1;
}

/**
 * Cuerpo de la función cuyos parámetros abren en `desde`, o '' si eso no es
 * una lista de parámetros. Las dos trampas: `clearTimeout(t)` se escribe igual
 * que un parámetro (por eso se exige la flecha justo después del paréntesis), y
 * el parámetro de `const setTab = (t) => …` solo vive dentro de la flecha (por
 * eso el cuerpo se acota, en vez de mirar hasta el final del componente).
 */
function cuerpoDeFuncion(src, desde) {
  const cierra = cierraParen(src, desde);
  if (cierra < 0) return '';
  let i = cierra + 1;
  while (/\s/.test(src[i])) i++;
  const esFlecha = src.startsWith('=>', i);
  // function clásica: la lista de parámetros va precedida por la palabra clave
  const esFunction = /\bfunction\s*[A-Za-z0-9_$]*\s*$/.test(src.slice(Math.max(0, desde - 40), desde));
  if (!esFlecha && !esFunction) return ''; // era una llamada, no una declaración
  if (esFlecha) i += 2;
  while (/\s/.test(src[i])) i++;
  if (src[i] === '{' || src[i] === '(') return hastaFinDeBloque(src, i + 1);
  return hastaFinDeBloque(src, i, true); // flecha con cuerpo de expresión
}

test('ninguna variable local llamada «t» tapa la función de traducción', () => {
  const culpables = [];
  for (const f of ficherosDe(WEB_SRC)) {
    const src = fs.readFileSync(f, 'utf8');
    // solo importa en los ficheros que de verdad traducen
    if (!/from\s+['"][^'"]*i18n\.js['"]/.test(src)) continue;
    for (const [tipo, patrones] of [['param', PARAMETRO], ['decl', DECLARACION]]) {
      for (const re of patrones) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) {
          const ambito =
            tipo === 'param'
              ? cuerpoDeFuncion(src, m.index)
              : hastaFinDeBloque(src, m.index + m[0].length);
          // llamada a t(…) dentro del ámbito donde «t» ya no es la función
          if (/\bt\s*\(/.test(ambito)) {
            const linea = src.slice(0, m.index).split('\n').length;
            culpables.push(`${path.relative(raiz, f)}:${linea} → ${m[0].trim()}`);
          }
        }
      }
    }
  }
  assert.deepEqual(
    culpables,
    [],
    `Hay variables llamadas «t» que tapan la función de traducción y romperán la página al pintar:\n  ${culpables.join('\n  ')}\n` +
      'Renómbralas (key, item, toast, timer…).'
  );
});
