# Registro de auditoría — PowaFlex

Rama de trabajo: `claude/clever-edison-dnton3` (parte de `main` @ `2dece8d`, Beta 1.32).
Sin push ni despliegue: los cambios quedan en la rama local hasta que Ramón lo autorice.

## Estado inicial (29-10-2026)

| Comprobación | Comando | Resultado |
|---|---|---|
| Tests del servidor | `cd server && node --test` | 468/468 en verde, ~9 s |
| Build de la web | `npm run build` | OK, 3,8 s |
| Dependencias (producción) | `npm audit --omit=dev` | 5 avisos (4 altos): fastify 5.9.0, fast-uri, @fastify/busboy, csv-parse |
| Dependencias (todas) | `npm audit` | 10 avisos (8 altos), los de desarrollo vía vite 6.4.3 |
| CI | `.github/workflows/*` | Solo construye y publica la imagen Docker; **no ejecuta los tests** |

Stack: Node 24 (Docker) / 22 (aquí), Fastify 5 + better-sqlite3 (ESM), React 19 + Vite 6 + Tailwind 4.
~33.000 líneas: `server/src` (30 módulos, `index.js` 2.700 líneas, `festivals.js` 4.000), `web/src` (21 páginas).

## Iteraciones

_(se rellena según avanza)_
