# Changelog

## Alpha 0.3 (0.3.0-alpha) — 2026-07-04

- **Vivos y muertos**: PowaFlex cachea fecha de fallecimiento de las personas; los fallecidos se
  marcan con ✝, se pueden retirar en bloque de Favoritos y quedan fuera del auto-Radarr.
- **Letterboxd**: importación directa del **.zip** completo del export (diario, notas, vistas,
  watchlist y listas), matching mucho mejor (normaliza acentos, artículos y título original) y
  **feed RSS** de tu usuario que recoge tus últimas vistas cada noche.
- **Auto-Radarr diario**: opción para lanzar automáticamente a Radarr los estrenos de los próximos
  N meses de tus directores favoritos vivos.
- **Radarr**: snapshot local de lo ya añadido (botón «Sincronizar» en Ajustes) para mostrar el
  recuadro verde «✓ en Radarr» y no reintentar añadidos que dan «ya existe».
- **Fichas de persona y Descubrir huecos**: filtros para ocultar cortos, documentales y películas
  de TV (ocultos por defecto).
- **Dashboard**: últimas añadidas a Plex, últimas vistas (Plex + RSS de Letterboxd) y últimas
  peticiones a Radarr.
- **Sagas**: rehecho a partir de la colección real de TMDB de cada película (no de las etiquetas de
  Plex), con escaneo resumible y detección de franquicias incompletas.
- **Listas y retos**: anillos de completista con las listas de tu export de Letterboxd y opción de
  pegar cualquier lista pública de Letterboxd.
- Arreglo del diseño de pósters en «Candidatas a upgrade» y «Consenso crítico», con botón de Radarr
  bajo cada candidata. Gráficas más legibles (tipografías que ya no se solapan, géneros completos).
- Calendario: la minificha muestra siempre «Dirige» (el director real, aunque no sea favorito) y
  luego «Actúa» (el favorito mejor situado en el reparto); recuento de añadido masivo corregido.

## Alpha 0.2 (0.2.0-alpha) — 2026-07-04

- **Integración MDBList**: notas de IMDb, Rotten Tomatoes (crítica y público), Metacritic,
  Letterboxd y Trakt para toda la biblioteca, con sync por lotes que respeta el límite diario
  según el tipo de cuenta (gratuita/Supporter/auto). Nuevos filtros y ordenaciones en Biblioteca,
  chips de notas en la ficha, secciones de joyas/discrepancias en Visionado, priorización por
  nota combinada en Descubrir/upgrades y página **Listas y retos** (seguir listas de MDBList con
  % completado y envío en bloque a Radarr).
- Cine venidero: filtros estilo Letterboxd (cortos, documentales, TV), etiqueta configurable de
  Radarr, añadido masivo por horizonte temporal.
- Ajustes: selección de bibliotecas de Plex a sincronizar.
- Icono propio de la app (favicon, Docker/UNRAID, README).

## Alpha 0.1 (0.1.0-alpha) — 2026-07-04

Primera versión pública.

- **Sincronización directa con Plex** por API (X-Plex-Token): biblioteca completa con reparto,
  equipo, géneros, países, colecciones, visionados, notas y datos técnicos (resolución, códec,
  HDR/Dolby Vision, tamaño). Incremental + re-sync nocturna automática (03:30).
- **Dashboard** con totales y gráficas (década, género, país, resolución, crecimiento mensual).
- **Biblioteca** con filtros estilo Letterboxd (género, país, década, visto/sin ver,
  largo/corto, resolución, HDR, nota mínima) y 11 ordenaciones.
- **Directores y actores**: ranking, ficha con filmografía TMDB, % de completismo, lo que falta
  y lo anunciado, con envío a Radarr.
- **Cine venidero**: calendario mensual de estrenos y anuncios de tus personas top + favoritos.
- **Favoritos**: ranking por títulos con añadido en bloque («los X primeros») y edición
  individual; alimenta el calendario.
- **Descubrir huecos**: agregado de ausencias de tus filmografías top + canon de ~110 grandes
  directores del cine mundial ausentes del servidor con sus obras esenciales.
- **Sagas**: completismo de colecciones cruzado con TMDB.
- **Visionado**: visto vs. pendiente por década/género, directores con obra pendiente.
- **Calidad y disco**: resoluciones, códecs, HDR, candidatas a upgrade, duplicados, archivos
  más pesados.
- **Letterboxd**: importación del export oficial (y del formato letterboxd de WebTools-NG) con
  cruce de watchlist y notas.
- **Integración Radarr**: añadir monitorizado con búsqueda automática, perfil y carpeta
  configurables.
- Empaquetado Docker (amd64/arm64) publicado en GHCR desde GitHub Actions.
