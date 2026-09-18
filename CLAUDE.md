# CLAUDE.md — PowaFlex

Dashboard de gestión de cine sobre una biblioteca de Plex. Se habla y se escribe en **castellano**: copy, CHANGELOG y mensajes de commit.

## Qué es

- **server/** — Fastify 5 + better-sqlite3, ESM, puerto 3860. Base en `DATA_DIR` (`powaflex.db`).
- **web/** — React 19 + Vite 6 + Tailwind 4, 21 páginas en `web/src/pages/`, i18n ES/EN.
- Monorepo con workspaces npm; las tres `package.json` comparten `version`.
- Producción: Docker en un Beelink N100. Imagen `ghcr.io/foreverramone/powaflex`, construida por GitHub Actions.
- Repo: https://github.com/ForeverRamone/PowaFlex

Integraciones: Plex (API directa), TMDB, MDBList (cuenta Supporter, 25.000 req/día), Radarr, Letterboxd, IMDb, JustWatch, palmareses de festivales scrapeados de Wikipedia.

## Comandos

```bash
npm run dev            # web (5173) + server (3860)
npm run build          # vite build → web/dist
npm test --workspace=server   # node --test, 35 ficheros en server/test/
```

`.claude/launch.json` (gitignorado) define las entradas de servidor para el navegador integrado.

## Ritmo de trabajo

Ramón manda **lotes de peticiones numeradas**. Por defecto: desarrollar todas → verificar en el navegador → informar. **NO desplegar hasta que lo diga** («actualiza todo y despliega»). Dejar el árbol sin commitear mientras tanto.

Acepta peticiones nuevas mientras se trabaja: son cola, no interrupción.

Cuando pide **agentes de revisión**, van en paralelo: sobre ficheros disjuntos si implementan, con ángulos distintos si revisan (servidor / interfaz / migración en producción / retirada limpia). Han encontrado fallos que los tests no veían. **Verifica sus hallazgos**: alguno ha dado por bueno un patrón roto.

## Desplegar

**Bump = CINCO sitios, siempre:**

1. `version` en las tres `package.json` (raíz, server, web) → `1.0.N-beta`
2. `versionLabel` en `server/package.json` → `Beta 1.NN`
3. La línea `> **Beta 1.NN**` del README
4. Entrada nueva en `CHANGELOG.md` (comprobar después con `grep -n "^## " CHANGELOG.md`: una inserción se comió una cabecera)
5. Entrada nueva al principio del array `VERSIONES` de `web/src/pages/Novedades.jsx`

Luego:

```bash
git commit && git push origin main
git tag -a v1.0.N-beta -m "…" && git push origin v1.0.N-beta
gh release create v1.0.N-beta --title "Beta 1.0N" --prerelease --notes "<sección del changelog>"
gh run watch   # esperar las DOS pasadas de CI en verde (~3 min, multiarco)
```

No saltar de major por tu cuenta. Autoría de git: `ForeverRamone <foreverramone@users.noreply.github.com>`.

## Verificar de verdad

**Antes de explicar lo que Ramón ve en pantalla, mide su pantalla.** Ante cualquier «no lo veo», enumerar qué escucha y desde cuándo antes de teorizar:

```bash
for p in 3860 3865 5173; do curl -s -m 3 "http://localhost:$p/api/version"; done
lsof -nP -iTCP -sTCP:LISTEN | grep -E "3860|3865"
```

- **El servidor no recarga solo.** Tocar `server/src/*.js` no cambia nada en un proceso ya levantado. `web/dist` sí se recoge al recargar: se puede estar viendo interfaz nueva sobre servidor viejo.
- **Un POST con `fetch` simulado NO está verificado.** Mira el código de respuesta real. Al tocar cabeceras, auth u `Origin`, prueba los tres caminos: directo a `:3860`, por el proxy de Vite en `:5173`, y con `X-Forwarded-Host`.
- **Una ruta no se verifica por su TEXTO, sino porque PINTA.** Comprobar `document.body.innerText.length`, buscar el texto de la ErrorBoundary y **leer siempre la consola**. Una página en blanco no da ninguna señal en la interfaz (un `Link` sin importar la deja vacía y el build sale en verde). En los dos idiomas y con las pestañas de la URL (`?tab=`).
- **Navega de verdad** (`navigate`), no con `pushState`: si no, verificas el bundle anterior al build.
- **Para esperar a que React pinte, `MessageChannel`, no `setTimeout`** — Chrome estrangula los timers en pestañas ocultas y los barridos salen falsos.
- **Una comprobación circular no es una comprobación.** Pregúntate de dónde sale cada uno de los dos lados que comparas; si uno se deriva del otro, no prueba nada.
- **Pide las claves de TMDB/MDBList: las da.** Antes de mandar un arreglo especulativo, pídelas y mide.

## Rendimiento

**La demo de 423 películas NO reproduce ningún problema.** Todo va por debajo de 30 ms allí mientras él sufre 9 segundos. Para medir hace falta una base de su tamaño: ~12.400 películas, ~160.000 créditos, ~8.000 entradas de Letterboxd.

Patrones ya cazados, que vuelven:

- Subconsulta correlacionada sin índice en la tabla de dentro → mirar SIEMPRE con `EXPLAIN QUERY PLAN`.
- `manualChunks` de Vite: React se cuela en el primer grupo que lo reclama. Va declarado aparte en `web/vite.config.js`.
- `useEffect` de montaje que alimenta algo que vive tras una pestaña que no es la de por defecto.

**Progreso:** `useCargaProgresiva` + `<Progreso>` en `components.jsx`. El porcentaje es siempre peticiones terminadas / total, nunca una animación que finge avanzar. Con una sola petición, barra indeterminada y «Llevamos N s» a partir de 4 s. No tocar el `<BuildProgress>` del Calendario ni el de Descubrir: leen `{done,total}` real de `/api/build-progress`.

## Emparejado con TMDB

Antes de tocar `festivals.js` o `searchMovieCandidates`, ten presente que el emparejado ha fallado por causas que no se parecen entre sí:

- TMDB compara contra el título **original y el traducido**, no contra el inglés — y los cánones están en inglés. Hace falta una vuelta con `language: 'en-US'`.
- El corte de candidatos por popularidad tira el año: ordenar antes de cortar, y probar años vecinos (el BFI fecha por producción, TMDB por estreno).
- Nombres: hipocorísticos, colectivos, transliteraciones y alfabetos no latinos (`latinPersonName`, `foldName`). Un nombre en cirílico o japonés normalizaba a **cadena vacía** y casaba con cualquier fila.
- Filas cortas de Wikipedia: la celda que falta suele ser el país, no el título. Lo decide la **cursiva**.
- Los alias (`also_known_as`) valen, pero exigiendo IGUALMENTE título clavado.
- Algunas entradas de los cánones **no son películas** (miniseries): `esSerieEnTmdb`.

Regla que manda sobre todas: **mejor sin ficha que la ficha de otra.**

## Estilo — un registro por superficie

- **Copy de interfaz**: una frase por bloque. Sin «antes/ahora», sin fontanería, sin disculpas de método.
- **CHANGELOG**: titular en negrita, secciones cortas, hechos con cifras. La crónica de cómo se llegó al arreglo va en el commit.
- **/novedades**: de tres a seis puntos por versión, de una o dos frases. No es un segundo changelog. El diccionario EN se regenera desde el castellano en la misma pasada.
- **Mensajes de commit**: en castellano, explican el PORQUÉ. Comprobar las cifras que se afirmen.
- **Comentarios de código**: se quedan como están salvo que él lo pida. El porqué que evita que alguien «arregle» algo rompiéndolo vale su espacio; la crónica no.

## Reglas de la casa

- CSS en `@layer components`, no clases sueltas repetidas.
- `cache-versions.js` centraliza las versiones de caché: al cambiar un formato, súbela ahí.
- `names.js` y `roles.js` son la lista ÚNICA de nombres y de los seis oficios. No duplicar.
- Tests-rojo que hay que mantener verdes: `i18n-shadow`, `roles`, `migrations`.
