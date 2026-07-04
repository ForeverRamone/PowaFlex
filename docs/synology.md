# PowaFlex en Synology DSM (Docker / Container Manager)

Guía para DSM 7.2+ con **Container Manager** (en DSM 6.x / 7.0–7.1 la app se llama «Docker»;
los pasos son casi idénticos).

## 1. Preparar la carpeta

1. Abre **File Station** y crea la carpeta `docker/powaflex` (si no existe `docker`, créala).
   Ahí vivirán la base de datos y la caché de imágenes de PowaFlex.

## 2. Crear el proyecto

1. Abre **Container Manager** → **Proyecto** → **Crear**.
2. Nombre del proyecto: `powaflex`.
3. Ruta: selecciona la carpeta `docker/powaflex` que acabas de crear.
4. Origen: **Crear docker-compose.yml** y pega esto:

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

5. **Siguiente** → **Siguiente** → **Hecho**. Container Manager descargará la imagen y arrancará
   el contenedor.

## 3. Primer arranque

1. Abre `http://IP-DE-TU-SYNOLOGY:3860` en el navegador.
2. La app te llevará a **Ajustes**: conecta Plex (URL + X-Plex-Token), TMDB (API key) y Radarr
   (URL + API key). Cada campo tiene una mini-guía desplegable para conseguir la credencial.
3. Pulsa **Sincronizar ahora**. Con bibliotecas grandes (10.000+ películas) la primera
   sincronización tarda varios minutos; las siguientes son incrementales.

> Si Plex corre en el propio Synology, la URL de Plex es `http://IP-DE-TU-SYNOLOGY:32400`.

## 4. Actualizar PowaFlex

Cuando salga una versión nueva (se anuncian en
[Releases](https://github.com/ForeverRamone/PowaFlex/releases)):

1. **Container Manager** → **Proyecto** → selecciona `powaflex` → **Acción** → **Detener**.
2. Con el proyecto seleccionado: **Acción** → **Compilar** (vuelve a hacer *pull* de
   `latest` y recrea el contenedor).
3. **Acción** → **Iniciar**.

Alternativa por SSH (más rápida):

```bash
cd /volume1/docker/powaflex
docker compose pull && docker compose up -d
```

Tus datos están en `docker/powaflex/data` y **no se tocan** al actualizar.

## Problemas comunes

- **No carga la web** → comprueba que el puerto 3860 no esté ocupado por otro paquete; puedes
  cambiar el mapeo a `'3861:3860'` en el compose y abrir el 3861.
- **Plex no conecta** → si tienes el firewall de DSM activo, permite el tráfico entre
  contenedores y hacia el puerto 32400.
- **La imagen no se descarga** → asegúrate de escribir bien
  `ghcr.io/foreverramone/powaflex:latest` (GitHub Container Registry, no Docker Hub).
- **El contenedor sale con icono «?»** → Container Manager solo muestra logos de imágenes de
  Docker Hub; para imágenes de GHCR no permite personalizarlo. El icono de PowaFlex sí aparece
  en la pestaña del navegador y al anclar la web a favoritos o a la pantalla de inicio.
