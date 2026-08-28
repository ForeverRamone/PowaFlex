import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Que ninguna cadena nueva se quede sin su traducción inglesa.
 *
 * `i18n-shadow` vigila que nadie tape la función t() con una variable local,
 * pero no mira el diccionario: se han metido cadenas castellanas nuevas sin su
 * clave EN y los tests seguían verdes, porque t() cae al castellano cuando no
 * encuentra la clave — no rompe nada, solo deja la interfaz inglesa a medias.
 *
 * Aquí se recogen todas las llamadas t('literal') de web/src y se cruzan con
 * los fragmentos de web/src/i18n/en. Solo literales: t(variable) y las
 * plantillas con ${…} se componen al vuelo y no son claves.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_SRC = path.join(raiz, 'web/src');
const EN_DIR = path.join(WEB_SRC, 'i18n/en');

function ficherosDe(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...ficherosDe(p));
    else if (/\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** t('…'), t("…") y t(`…`) sin interpolar; el segundo argumento de vars da igual. */
const LLAMADA = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$\\]*)`)\s*[),]/g;

/** Claves que no son texto traducible: puntuación y símbolos sueltos. */
const esPuntuacion = (s) => !/\p{L}/u.test(s);

async function diccionarioEN() {
  const EN = {};
  for (const f of fs.readdirSync(EN_DIR)) {
    if (!f.endsWith('.js')) continue;
    const mod = await import(pathToFileURL(path.join(EN_DIR, f)).href);
    Object.assign(EN, mod.default || {});
  }
  return EN;
}

test('toda cadena que pasa por t() tiene su clave en el diccionario inglés', async () => {
  const EN = await diccionarioEN();
  const huerfanas = new Map();

  for (const f of ficherosDe(WEB_SRC)) {
    const src = fs.readFileSync(f, 'utf8');
    // solo los ficheros que de verdad traducen
    if (!/from\s+['"][^'"]*i18n\.js['"]/.test(src)) continue;
    LLAMADA.lastIndex = 0;
    let m;
    while ((m = LLAMADA.exec(src)) !== null) {
      const crudo = m[1] ?? m[2] ?? m[3];
      if (crudo == null) continue;
      const clave = crudo
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\');
      if (!clave.trim() || esPuntuacion(clave)) continue;
      if (clave in EN) continue;
      if (!huerfanas.has(clave)) {
        const linea = src.slice(0, m.index).split('\n').length;
        huerfanas.set(clave, `${path.relative(raiz, f).replace(/\\/g, '/')}:${linea}`);
      }
    }
  }

  const lista = [...huerfanas].map(([clave, donde]) => `${donde} → ${JSON.stringify(clave)}`);
  assert.deepEqual(
    lista,
    [],
    `Estas cadenas no tienen traducción inglesa y saldrán en castellano con la interfaz en EN:\n  ${lista.join('\n  ')}\n` +
      `Añádelas al fragmento que les toque en web/src/i18n/en/.`
  );
});
