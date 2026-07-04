# 🎬 PowaFlex

> **Alpha 0.1** · Dashboard de gestión de cine para tu servidor Plex: estadísticas, completismo
> de filmografías, calendario de estrenos venideros conectado a TMDB y envío directo a Radarr.

PowaFlex es tu centro de mando cinéfilo. Vive junto a tu servidor Plex (en Docker), lee tu
biblioteca de películas **directamente por la API** (sin exports ni CSV), la cruza con
**TMDB** y con **Radarr**, y convierte todo eso en dos cosas: *conocer a fondo el cine que
tienes* y *cazar el cine que te falta o que está por venir*. Todo se guarda en local, sin
cuentas ni telemetría.

---

## ✨ Qué hace

| Sección | Qué encuentras |
|---|---|
| 📊 **Dashboard** | Totales (películas, horas, disco, vistas) y gráficas por década, género, país y resolución, más el ritmo de crecimiento de la biblioteca y tus tops. |
| 🎞️ **Biblioteca** | Toda la colección en parrilla de pósters con filtros estilo Letterboxd: género, país, década, visto/sin ver, largo/corto (<40 min), resolución, HDR/Dolby Vision, nota mínima… y 11 ordenaciones (incluido aleatorio). |
| 🎭 **Directores y actores** | Ranking por presencia en tu biblioteca. Cada ficha cruza la filmografía completa de TMDB con lo que tienes: % de completismo, lo que falta (botón **+ Radarr**) y proyectos anunciados. |
| 🗓️ **Cine venidero** | Calendario mensual de estrenos próximos y proyectos anunciados de tus directores/actores top y favoritos, con envío a Radarr en un clic. |
| ⭐ **Favoritos** | Ranking por nº de títulos con añadido en bloque («los X primeros») y edición individual. Los favoritos entran siempre en el calendario. |
| 🧭 **Descubrir huecos** | Lo que te falta de tus filmografías top, y un canon de ~110 grandes directores del cine mundial para detectar los que no tienen ni una película en tu servidor, con sus obras esenciales. |
| 📚 **Sagas** | Cruza las colecciones de tu Plex con TMDB: qué partes de cada saga te faltan o están por estrenar. |
| 👁️ **Visionado** | Visto vs. pendiente por década y género, directores con obra pendiente, mejor valoradas sin ver. |
| 💾 **Calidad y disco** | Resoluciones, códecs, HDR, candidatas a upgrade (buenas películas por debajo de 1080p), duplicados, archivos más pesados. |
| 🟠 **Letterboxd** | Importa tu export oficial (diary, ratings, watched, watchlist) y lo cruza con Plex: watchlist que ya tienes o falta, comparación de notas. |

La sincronización con Plex es **incremental** y se repite sola cada noche (03:30). Los datos de
TMDB se cachean para no abusar de su API.

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
- Solo salen de tu red las consultas a la API de TMDB.
- La app **no tiene autenticación propia**: está pensada para red local. No la expongas a
  internet sin un proxy con autenticación delante.

## 🙏 Créditos

- Datos de cine por cortesía de [TMDB](https://www.themoviedb.org). Este producto usa la API de
  TMDB pero no está avalado ni certificado por TMDB.
- Gracias a los proyectos [Plex](https://plex.tv), [Radarr](https://radarr.video) y
  [Letterboxd](https://letterboxd.com) por sus APIs y formatos abiertos.

Licencia [MIT](LICENSE).
