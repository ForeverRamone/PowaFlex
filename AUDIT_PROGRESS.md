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

### Iteración 1 — auditoría en paralelo y correcciones (commit 894a2cc)

Cinco auditores de solo lectura con ángulos distintos (seguridad, backend/persistencia,
rendimiento, frontend en navegador, integraciones/parsers). Cada hallazgo se reprodujo con un
script; los de backend los volví a ejecutar yo antes de aceptarlos. Implementación repartida en
ficheros disjuntos: emparejado (festivals/tmdb/justwatch/titles/radarr), `letterboxd.js` y el
resto del servidor. Verificación de rojo→verde: los tests nuevos se corrieron en un worktree del
commit original (`git worktree add … 353b7fa`): fallan 12 de 13 allí (el 13.º prueba un módulo
nuevo; su rojo es el e2e de rebinding, que también falla en el original) y pasan aquí.

Scripts de reproducción: `scratchpad/{back,seg,integ,front,perf}/` (fuera del repo).

### Iteración 2 — rendimiento, dependencias, interfaz (commits bcd471f y siguiente)

Base sintética de tamaño real (12.400 películas, 162.342 créditos, 8.000 entradas de
Letterboxd); reproduce los 9 s históricos de insights si se quita `idx_lb_movie`. Cada cambio de
consulta comparado contra el código original sobre la misma base: mismos resultados.
Interfaz: barrido Playwright de 56 URL × ES/EN × 1366/390 px con base sembrada: 0 pageerror,
0 ErrorBoundary, 0 desbordes, ruta inexistente ya pinta.

### Iteración 3 — no realizada

Ramón pidió parar los agentes para ahorrar tokens. **No se hizo la contraauditoría adversarial
independiente de los cambios ni la auditoría final**; queda como primera tarea pendiente.

## Resultado

| Comprobación | Resultado |
|---|---|
| `cd server && node --test` | 515/515 (antes 468) |
| `npm run build` | OK |
| `npm audit --omit=dev` | 1 moderado (csv-parse, no explotable aquí: probado) |
| Barrido navegador ES/EN/móvil | limpio |
| Rebinding, multipart, zip bomb, ReDoS | probados contra el servidor real con curl |

Detalle de cada arreglo: `CHANGELOG.md`, Beta 1.33, y los mensajes de commit.

## Pendiente (por prioridad)

1. **Contraauditoría adversarial de los cambios de esta rama** (no hecha).
2. Sin `POWAFLEX_AUTH` y desde un dominio propio no declarado en `POWAFLEX_HOSTS`, las rutas de
   credenciales dan 403 (el resto del panel funciona). Documentado en README y CHANGELOG.
3. Datos ya guardados que el código nuevo no repara (sin migraciones destructivas):
   `movies.tmdb_id` que el respaldo «primero del año» resolvió mal en el pasado; filas duplicadas
   de Letterboxd (notas y visionados RSS/CSV) en bases existentes.
4. `server/src/data/palmares-2026.js`: «24» (2002, `d:"N/A"`, `i:856950`, Cahiers) huele a la
   serie emparejada con otra cosa: comprobar con la clave de TMDB.
5. Riesgos plausibles sin demostrar: un paso del nocturno que agota sus 20 min sigue en segundo
   plano mientras corren los siguientes; doble arranque de `/api/tracked/from-canon` y de
   «aprobar todas»; rechazo sin manejar posible en `paises.js` (~1023) y ningún manejador global
   de `unhandledRejection`; `guidToIds` no lee guids de agentes legados de Plex.
6. Interfaz: etiquetas de Ajustes sin asociar a sus campos; Sagas y Emergentes sin pintado por
   tramos; `useRadarrIds` vuelve a bajar 88 KB en cada página; Ajustes carga todas las pestañas.
7. Menores: `POWAFLEX_SECRET` deriva la clave con sha256 sin sal (scrypt sería mejor); el
   entrypoint arranca como root si no puede dejar `/data` escribible; csv-parse 7 (major).
