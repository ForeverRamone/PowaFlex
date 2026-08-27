/**
 * ARRANQUE DE DESARROLLO: la API y el frontend a la vez.
 *
 *   npm run dev        # API en :3860 + Vite en :5173
 *
 * Antes esto era `npm run dev --workspace=web & npm run dev --workspace=server
 * & wait` metido en el package.json, y eso es sintaxis de shell POSIX: en
 * Windows npm lo pasa por cmd.exe, donde `&` encadena en vez de lanzar en
 * paralelo y `wait` no existe — así que solo levantaba Vite y el servidor no
 * arrancaba nunca. Aquí lo hace Node, que se comporta igual en las tres.
 *
 * Si uno de los dos se cae, se lleva al otro por delante y devuelve su código:
 * un `npm run dev` a medias, con la API muerta y Vite tan feliz, engaña.
 */
import { spawn, spawnSync } from 'node:child_process';

const esWindows = process.platform === 'win32';
const npm = esWindows ? 'npm.cmd' : 'npm';

const procesos = new Map();
let cerrando = false;

/**
 * En Windows cada `npm run` cuelga otro cmd.exe y otro npm por debajo: de este
 * proceso a Vite hay seis eslabones. kill() solo se lleva el primero y deja al
 * resto vivos y con el puerto cogido — el clásico `EADDRINUSE` al reintentar.
 * taskkill /T tira del árbol entero. Fuera de Windows, SIGTERM al grupo basta.
 */
const matar = (p) => {
  if (!p.pid || p.exitCode !== null || p.signalCode !== null) return;
  if (esWindows) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else p.kill('SIGTERM');
};

const lanzar = (nombre) => {
  // Los .cmd de Windows solo se lanzan a través del shell (Node se niega desde
  // la 18.20). Los argumentos son literales de este fichero, no llega nada de
  // fuera.
  const p = spawn(npm, ['run', `dev:${nombre}`], { stdio: 'inherit', shell: esWindows });
  procesos.set(nombre, p);
  p.on('exit', (code, signal) => {
    procesos.delete(nombre);
    if (cerrando) return;
    console.error(`\n[dev] «${nombre}» se ha ido (${signal || `código ${code}`}). Cierro el otro.`);
    process.exitCode = code ?? 1;
    parar();
  });
};

function parar() {
  if (cerrando) return;
  cerrando = true;
  for (const p of procesos.values()) matar(p);
}

for (const señal of ['SIGINT', 'SIGTERM']) process.on(señal, parar);
process.on('exit', parar);

lanzar('web');
lanzar('server');
