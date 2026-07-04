# PowerPlex en UNRAID (Docker)

PowerPlex no necesita plantilla de Community Applications: se añade en un minuto como
contenedor manual apuntando a la imagen pública de GitHub.

## 1. Añadir el contenedor

1. Ve a la pestaña **Docker** → botón **Add Container** (abajo).
2. Activa **Advanced View** (arriba a la derecha) y rellena:

| Campo | Valor |
|---|---|
| **Name** | `PowerPlex` |
| **Repository** | `ghcr.io/foreverramone/powerplex:latest` |
| **Network Type** | `bridge` |
| **WebUI** | `http://[IP]:[PORT:3860]` |

3. **Add another Path, Port, Variable…** → **Port**:
   - Container Port: `3860` · Host Port: `3860` (o el que prefieras)
4. **Add another Path, Port, Variable…** → **Path**:
   - Container Path: `/data`
   - Host Path: `/mnt/user/appdata/powerplex`
5. **Add another Path, Port, Variable…** → **Variable**:
   - Key: `TZ` · Value: `Europe/Madrid`
6. **Apply**. UNRAID descargará la imagen y arrancará el contenedor.

## 2. Primer arranque

1. Abre `http://IP-DE-UNRAID:3860` (o clic en el icono del contenedor → **WebUI**).
2. La app te llevará a **Ajustes**: conecta Plex (URL + X-Plex-Token), TMDB (API key) y Radarr
   (URL + API key). Cada campo tiene una mini-guía desplegable.
3. Pulsa **Sincronizar ahora**. La primera sincronización de una biblioteca grande tarda unos
   minutos; después es incremental y nocturna.

> Si Plex y Radarr también corren en UNRAID, sus URLs son `http://IP-DE-UNRAID:32400` y
> `http://IP-DE-UNRAID:7878`.

## 3. Actualizar PowerPlex

UNRAID lo pone fácil: en la pestaña **Docker**, cuando haya versión nueva verás
**«update ready»** junto a PowerPlex.

1. Clic en **update ready** (o menú del contenedor → **Update**).
2. Ya está. Los datos viven en `/mnt/user/appdata/powerplex` y no se tocan.

Si no aparece el aviso, fuerza la comprobación con **Check for Updates** (abajo en la pestaña
Docker). Las novedades de cada versión están en
[Releases](https://github.com/ForeverRamone/PowerPlex/releases).

## Problemas comunes

- **Puerto ocupado** → cambia el Host Port (p. ej. `3861`) dejando el Container Port en `3860`.
- **Permisos en appdata** → PowerPlex corre como root dentro del contenedor y escribe SQLite en
  `/data`; con el appdata estándar de UNRAID no hay que tocar nada.
- **¿Backup?** → incluye `/mnt/user/appdata/powerplex` en tu backup de appdata (plugin
  «Appdata Backup»); es todo lo que PowerPlex necesita para restaurarse.
