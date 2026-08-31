<p align="center"><img src="assets/icon.png" width="128" alt="PowaFlex"></p>

# 🎬 PowaFlex

> **Beta 1.29** · Dashboard de gestión de cine para tu servidor Plex: estadísticas, completismo
> de filmografías, calendario de estrenos venideros conectado a TMDB y envío directo a Radarr.

Vive junto a tu Plex en Docker, lee la biblioteca **por la API** —sin exports ni CSV— y la cruza
con **TMDB** y **Radarr**: *conocer el cine que tienes* y *cazar el que te falta*. Todo en local.

---

## ✨ Qué hace

| Sección | Qué encuentras |
|---|---|
| 📊 **Dashboard** | Totales y gráficas por década, género, país y resolución, con el ritmo de crecimiento y tus tops. |
| 🎞️ **Biblioteca** | Parrilla de pósters con filtros estilo Letterboxd (género, país, década, metraje, resolución, HDR, nota mínima). Eliges qué nota va en el póster. |
| 🎭 **Directores/as y actores/actrices** | Ranking por presencia, con filtros demográficos. Cada ficha cruza su filmografía de TMDB con lo que tienes: completismo, lo que falta (**+ Radarr**) y lo anunciado. |
| 🗓️ **Cine venidero** | Calendario mensual de estrenos y proyectos de tu gente, con envío a Radarr en un clic. |
| 🎪 **Festivales, premios y cánones** | Sesenta y seis fuentes: secciones oficiales edición a edición, palmareses y nominadas, crítica gremial, y los cánones (Sight & Sound, las 1001, el AFI, Criterion). Más **«Lo mejor del año»**, el corte transversal. Se corrige a mano (✎) y el pase nocturno vigila las ediciones nuevas. |
| ⭐ **Favoritos** | Tu gente de cabecera, por dirección o por reparto. Paquetes temáticos, 680 directores en activo de Wikidata, pegar y exportar listas. Alimentan el calendario y el auto-Radarr. |
| 🧭 **Descubrir huecos** | Lo que falta de tus favoritos y de tus top, los grandes ausentes del canon y tus sagas a medias, con listón de nota y filtros de ruido. |
| 🏆 **Listas y retos** | Listas de MDBList y retos de Letterboxd con anillos de «tengo» vs «visto», y envío en bloque a Radarr. |
| 👁️ **Visionado** | Lo visto contra lo pendiente por década y género, de quién te queda más, joyas y discrepancias frente a tu nota de Letterboxd. |
| 🔧 **Taller** | Calidad y disco: resoluciones, upgrades comprobados en JustWatch, duplicados, deuda de Radarr. Y auditorías de los datos, cada una con su remedio. |

Además: buscador global (Ctrl/⌘ + K), ficha en cualquier póster, notas de IMDb, Rotten Tomatoes,
Metacritic y Letterboxd vía MDBList, cifrado opcional de credenciales (`POWAFLEX_SECRET`) y
auto-Radarr diario. La sincronización con Plex es incremental, nocturna y con histórico.

## 📋 Requisitos

- Un servidor **Plex** accesible en tu red (y su [X-Plex-Token](#credenciales)).
- Una **API key de TMDB** (gratuita).
- **Radarr** (opcional, solo para añadir películas desde la app).
- **Docker** en cualquier máquina de tu red: el propio servidor de Plex, un NAS…

## 🚀 Instalación

### Docker Compose (genérico)

```yaml
services:
  powaflex:
    image: ghcr.io/foreverramone/powaflex:latest
    container_name: powaflex
    restart: unless-stopped
    ports:
      - '3860:3860'
    volumes:
      - ./data:/data
    environment:
      - TZ=Europe/Madrid
```

```bash
docker compose up -d
```

Abre `http://IP-DEL-HOST:3860` → **Ajustes** → sigue los 4 pasos guiados. Listo.

### Guías paso a paso por plataforma

- 📗 **[Synology DSM (Container Manager)](docs/synology.md)**
- 📙 **[UNRAID](docs/unraid.md)**

### Actualizar a una nueva versión

Las versiones se publican en [Releases](https://github.com/ForeverRamone/PowaFlex/releases) y
la imagen Docker se reconstruye automáticamente. Actualizar es:

```bash
docker compose pull && docker compose up -d
```

(En Synology y UNRAID hay botón para esto — está explicado en cada guía.) Tus datos viven en la
carpeta `data/` y sobreviven a cualquier actualización.

## 🔑 Credenciales

Las mismas guías están dentro de la app (Ajustes → desplegables bajo cada campo).

<a name="credenciales"></a>

**X-Plex-Token**
1. Abre `app.plex.tv`, entra en tu servidor.
2. En cualquier película: **⋯ → Obtener información → Ver XML**.
3. En la URL de la pestaña nueva, copia el valor de `X-Plex-Token=...`.
4. URL del servidor: IP local + puerto 32400, p. ej. `http://192.168.1.50:32400`.

**API key de TMDB** (gratis)
1. Cuenta en [themoviedb.org](https://www.themoviedb.org) → **Ajustes → API → Crear (Developer)**.
2. Vale la **API Key (v3)** o el **Read Access Token (v4)**.

**Radarr**
- URL: la misma con la que abres Radarr (puerto 7878 por defecto).
- API key: **Settings → General → Security → API Key**.
- Tras «Probar y cargar perfiles», elige perfil de calidad y carpeta raíz.

**MDBList** (opcional, recomendado)
- Cuenta en [mdblist.com](https://mdblist.com) → **Preferences → API Access**.
- Añade las notas de IMDb, Rotten Tomatoes, Metacritic, Letterboxd y Trakt a toda la app, y las
  listas como retos.
- Respeta el límite diario de tu cuenta, repartiendo la sincronización en varios días si hace falta.

## 🧑‍💻 Desarrollo local

```bash
git clone https://github.com/ForeverRamone/PowaFlex.git
cd PowaFlex
npm install
npm run dev        # API en :3860 + frontend Vite en :5173
```

Stack: Node 24 · Fastify · better-sqlite3 · React 19 · Vite · Tailwind 4 · Recharts.
Los datos van a `server/data/` (configurable con `DATA_DIR`).

## 🔒 Privacidad y seguridad

- Todo corre y se guarda en tu máquina (SQLite en `/data`). Sin cuentas, sin telemetría.
- De tu red solo salen las consultas a los servicios que conectes: TMDB, MDBList, JustWatch,
  Letterboxd y Wikipedia (festivales).
- Autenticación básica opcional con `POWAFLEX_AUTH="usuario:contraseña"`. Está pensada para red
  local: no la expongas a internet sin un proxy con autenticación delante.
- En **Ajustes → Copia de seguridad** te llevas la base entera y la configuración.

## 🙏 Créditos

- Datos de cine por cortesía de [TMDB](https://www.themoviedb.org). Usa su API, pero no está
  avalado ni certificado por TMDB.
- Gracias a [Plex](https://plex.tv), [Radarr](https://radarr.video) y
  [Letterboxd](https://letterboxd.com) por sus APIs y formatos abiertos.

Licencia [MIT](LICENSE).
