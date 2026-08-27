<p align="center"><img src="assets/icon.png" width="128" alt="PowaFlex"></p>

# 🎬 PowaFlex

> **Beta 1.26** · Dashboard de gestión de cine para tu servidor Plex: estadísticas, completismo
> de filmografías, calendario de estrenos venideros conectado a TMDB y envío directo a Radarr.

PowaFlex vive junto a tu servidor Plex (en Docker), lee tu biblioteca **directamente por la API**
—sin exports ni CSV—, la cruza con **TMDB** y con **Radarr** y la convierte en dos cosas: *conocer
el cine que tienes* y *cazar el que te falta*. Todo en local, sin cuentas ni telemetría.

---

## ✨ Qué hace

| Sección | Qué encuentras |
|---|---|
| 📊 **Dashboard** | Totales y gráficas por década, género, país y resolución, con el ritmo de crecimiento y tus tops. |
| 🎞️ **Biblioteca** | La colección en parrilla de pósters, con filtros estilo Letterboxd (género, país, década, metraje, resolución, HDR, notas mínimas) y la ordenación que quieras. La nota del póster la eliges tú. |
| 🎭 **Directores/as y actores/actrices** | Ranking por presencia con filtros demográficos. Cada ficha cruza la filmografía de TMDB con lo que tienes: completismo, lo que falta (**+ Radarr**) y proyectos anunciados. |
| 🗓️ **Cine venidero** | Calendario mensual de estrenos y proyectos de tu gente, con envío a Radarr en un clic. |
| 🎪 **Festivales, premios y cánones** | Sesenta y seis fuentes: secciones oficiales edición a edición, palmareses y nominadas por año, crítica gremial, animación y documental, y los cánones (Sight & Sound, las 1001, el AFI, Criterion, el registro estadounidense). Más **«Lo mejor del año»**, el corte transversal. Cada ficha se corrige a mano (✎), manda a Radarr lo que falte y el pase nocturno vigila las ediciones nuevas. |
| ⭐ **Favoritos** | Tu gente de cabecera, por una faceta o por las dos. Paquetes temáticos, el catálogo de 680 directores en activo de Wikidata, pegar listas de nombres y exportar la tuya. Alimentan el calendario y el auto-Radarr. |
| 🧭 **Descubrir huecos** | Lo que falta de tus favoritos y de tus top, los grandes ausentes del canon y tus sagas a medias, con listón de nota y filtros de ruido. |
| 🏆 **Listas y retos** | Listas de MDBList y retos de Letterboxd con anillos de «tengo» vs «visto», y envío en bloque a Radarr. |
| 👁️ **Visionado** | Lo visto contra lo pendiente por década y género, de quién te queda más, joyas y discrepancias frente a tu nota de Letterboxd. |
| 🔧 **Taller** | Calidad y disco (resoluciones, upgrades con comprobación en JustWatch, duplicados, deuda de Radarr) y salud de los datos: auditorías locales, cada una con su remedio. |

Además: buscador global (Ctrl/⌘ + K), ficha de película en cualquier póster, notas de IMDb, Rotten
Tomatoes, Metacritic y Letterboxd vía MDBList, cifrado opcional de credenciales
(`POWAFLEX_SECRET`) y auto-Radarr diario de los estrenos de tus favoritos vivos.

La sincronización con Plex es incremental y se repite sola cada noche, con histórico de cada
pasada y aviso en la barra lateral si algo falló.

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
- Añade a toda la app las notas de IMDb, Rotten Tomatoes (crítica y público), Metacritic,
  Letterboxd y Trakt (filtros, ordenaciones, joyas/discrepancias) y las listas como retos.
- PowaFlex respeta el límite diario de tu cuenta (gratuita o Supporter, configurable en Ajustes)
  repartiendo la sincronización de notas en varios días si hace falta.

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
- Autenticación básica opcional con `POWAFLEX_AUTH="usuario:contraseña"`. Aun así está pensada
  para red local: no la expongas a internet sin un proxy con autenticación delante.
- En **Ajustes → Copia de seguridad** puedes descargar la base de datos entera y
  exportar/importar la configuración para reinstalar sin empezar de cero.

## 🙏 Créditos

- Datos de cine por cortesía de [TMDB](https://www.themoviedb.org). Este producto usa la API de
  TMDB pero no está avalado ni certificado por TMDB.
- Gracias a los proyectos [Plex](https://plex.tv), [Radarr](https://radarr.video) y
  [Letterboxd](https://letterboxd.com) por sus APIs y formatos abiertos.

Licencia [MIT](LICENSE).
