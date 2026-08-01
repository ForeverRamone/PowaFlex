#!/bin/sh
# Arranca como root solo para dejar la carpeta de datos escribible y baja
# privilegios antes de ejecutar PowaFlex. Así actualizar es siempre "pull y
# arriba": nadie tiene que tocar permisos a mano (unRAID incluido).
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

# Usuario objetivo, por orden de preferencia:
#   1) PUID/PGID si los defines (la convención de unRAID: 99:100)
#   2) el dueño actual de la carpeta, si no es root — así se respeta lo que ya
#      haya (por ejemplo nobody:users de unRAID) sin configurar nada
#   3) 1000:1000, el usuario "node" de la imagen
owner_uid="$(stat -c %u "$DATA_DIR" 2>/dev/null || echo 0)"
owner_gid="$(stat -c %g "$DATA_DIR" 2>/dev/null || echo 0)"
uid="${PUID:-}"
gid="${PGID:-}"
[ -n "$uid" ] || { [ "$owner_uid" != "0" ] && uid="$owner_uid" || uid=1000; }
[ -n "$gid" ] || { [ "$owner_gid" != "0" ] && gid="$owner_gid" || gid=1000; }

# Si ya somos un usuario sin privilegios (alguien fijó `user:` en compose), no
# hay nada que ajustar: ejecutar y punto.
if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

# El chown recursivo solo cuando de verdad hace falta: la caché de carátulas
# puede tener miles de ficheros y esto se ejecuta en cada arranque.
if [ "$owner_uid" != "$uid" ] || [ "$owner_gid" != "$gid" ]; then
  echo "[PowaFlex] Ajustando permisos de $DATA_DIR a $uid:$gid (una sola vez)…"
  chown -R "$uid:$gid" "$DATA_DIR" 2>/dev/null ||
    echo "[PowaFlex] Aviso: no se pudieron ajustar todos los permisos de $DATA_DIR"
fi

# better-sqlite3 y la caché de imágenes escriben en DATA_DIR; HOME apunta ahí
# para que nada intente escribir en /app (que es de solo lectura en la práctica).
export HOME="$DATA_DIR"

# Bajar privilegios. setpriv viene en util-linux (paquete "required" de Debian,
# presente en las imágenes slim); las otras dos ramas son red de seguridad.
if command -v setpriv >/dev/null 2>&1; then
  exec setpriv --reuid="$uid" --regid="$gid" --clear-groups "$@"
elif command -v gosu >/dev/null 2>&1; then
  exec gosu "$uid:$gid" "$@"
else
  exec chroot --userspec="$uid:$gid" / sh -c 'cd /app && exec "$@"' _ "$@"
fi
