import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Que no falte ninguna ruta que la interfaz llame.
 *
 * Al limpiar endpoints muertos se borraron cuatro que sí se usaban, y la suite
 * siguió en verde porque nadie comprobaba esa correspondencia: quitar un
 * favorito devolvía 404 y la persona reaparecía sola en la lista. Esto cruza
 * las llamadas de web/src con las rutas declaradas en el servidor.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function ficherosDe(dir, ext) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...ficherosDe(p, ext));
    else if (ext.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

/** Rutas declaradas en el servidor, con sus parámetros vueltos comodines. */
function rutasDelServidor() {
  const src = fs.readFileSync(path.join(raiz, 'server/src/index.js'), 'utf-8');
  const rutas = [];
  for (const m of src.matchAll(/app\.(get|post|put|delete|patch)\('([^']+)'/g)) {
    rutas.push({ metodo: m[1].toUpperCase(), patron: m[2] });
  }
  return rutas;
}

const casa = ({ metodo, ruta }, rutas) => {
  // una interpolación al final puede ser un parámetro (/justwatch/${id}) o la
  // query pegada (/calendar${refresh ? '?refresh=1' : ''}): valen las dos
  const variantes = [ruta, ruta.replace(/\/?X$/, '')].filter(Boolean);
  return rutas.some((r) => {
    if (r.metodo !== metodo) return false;
    const re = new RegExp('^' + r.patron.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/') + '$');
    return variantes.some((v) => re.test(v));
  });
};

/** Llamadas api('/loquesea') del frontend, con las interpolaciones a comodín. */
function llamadasDelCliente() {
  const fuera = new Set();
  for (const f of ficherosDe(path.join(raiz, 'web/src'), ['.js', '.jsx'])) {
    const src = fs.readFileSync(f, 'utf-8');
    // tres formas: plantilla con ${...} (que puede llevar comillas dentro),
    // comilla simple y comilla doble
    const patrones = [
      /\bapi\(\s*`((?:[^`$]|\$\{[^}]*\})*)`/g,
      /\bapi\(\s*'([^']*)'/g,
      /\bapi\(\s*"([^"]*)"/g,
    ];
    for (const re of patrones) {
      for (const m of src.matchAll(re)) {
        let ruta = m[1];
        if (!ruta.startsWith('/')) continue;
        ruta = ruta.replace(/\$\{[^}]*\}/g, 'X').split('?')[0].replace(/\/$/, '');
        if (!ruta || ruta === '/') continue;
        // el método va en las opciones, justo detrás: sin él, borrar
        // DELETE /api/tracked/:id colaba porque existe GET /api/tracked
        const cola = src.slice(m.index, m.index + m[0].length + 120);
        const metodo = (cola.match(/method:\s*['"](\w+)['"]/) || [])[1] || 'GET';
        fuera.add(`${metodo.toUpperCase()} /api${ruta}|${path.relative(raiz, f)}`);
      }
    }
    // fetch('/api/...') suelto (la subida de ficheros no pasa por api())
    for (const m of src.matchAll(/fetch\(\s*['"`](\/api\/[^'"`?]+)/g)) {
      const cola = src.slice(m.index, m.index + 200);
      const metodo = (cola.match(/method:\s*['"](\w+)['"]/) || [])[1] || 'GET';
      fuera.add(`${metodo.toUpperCase()} ${m[1].replace(/\$\{[^}]*\}/g, 'X')}|${path.relative(raiz, f)}`);
    }
  }
  return [...fuera].map((s) => {
    const [llamada, fichero] = s.split('|');
    const [metodo, ruta] = llamada.split(' ');
    return { metodo, ruta, fichero };
  });
}

test('toda ruta que llama la interfaz existe en el servidor', () => {
  const rutas = rutasDelServidor();
  assert.ok(rutas.length > 40, `solo he encontrado ${rutas.length} rutas: ¿ha cambiado el formato?`);

  const huerfanas = llamadasDelCliente().filter((ll) => !casa(ll, rutas));
  assert.deepEqual(
    huerfanas,
    [],
    `la interfaz llama a rutas que el servidor no tiene:\n${huerfanas.map((h) => `  ${h.metodo} ${h.ruta}  (${h.fichero})`).join('\n')}`
  );
});

test('las rutas que la interfaz usa a diario siguen ahí', () => {
  // lista corta y explícita de las que, si desaparecen, rompen algo que se ve:
  // son justo las que se perdieron al limpiar código muerto
  const imprescindibles = [
    ['GET', '/api/tracked'],
    ['DELETE', '/api/tracked/:personId'],
    ['POST', '/api/tracked/:personId'],
    ['PATCH', '/api/tracked/:personId/role'],
    ['DELETE', '/api/tracked/batch'],
    ['POST', '/api/letterboxd/resolve'],
    ['DELETE', '/api/letterboxd'],
    ['POST', '/api/letterboxd/import'],
    ['POST', '/api/radarr/add'],
    ['PUT', '/api/settings'],
    ['POST', '/api/sync'],
    ['POST', '/api/refresh-all'],
  ];
  const rutas = rutasDelServidor();
  for (const [metodo, patron] of imprescindibles) {
    assert.ok(
      rutas.some((r) => r.metodo === metodo && r.patron === patron),
      `falta ${metodo} ${patron}`
    );
  }
});
