#!/bin/sh
# Arranca como root solo para dejar la carpeta de datos escribible y baja
# privilegios antes de ejecutar PowaFlex. Actualizar es siempre "pull y arriba":
# nadie tiene que tocar permisos a mano (unRAID incluido).
#
# La comprobación es de escritura REAL, no de propietario: en unRAID la carpeta
# appdata suele ser de nobody:users mientras que powaflex.db lo creó root en
# versiones antiguas, y mirar solo el dueño del directorio daba por buena una
# situación en la que SQLite no podía escribir ("attempt to write a readonly
# database"). Y si aun así no se consigue, arranca como root en vez de fallar.
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

# ¿Puede $1:$2 escribir de verdad en la carpeta Y en la base de datos?
writable_as() {
  _probe='
    t="$0/.powaflex-write-test"
    touch "$t" 2>/dev/null || exit 1
    rm -f "$t" 2>/dev/null
    [ ! -e "$0/powaflex.db" ] || [ -w "$0/powaflex.db" ]
  '
  if command -v setpriv >/dev/null 2>&1; then
    setpriv --reuid="$1" --regid="$2" --clear-groups sh -c "$_probe" "$DATA_DIR" 2>/dev/null
  elif command -v gosu >/dev/null 2>&1; then
    gosu "$1:$2" sh -c "$_probe" "$DATA_DIR" 2>/dev/null
  else
    chroot --userspec="$1:$2" / sh -c "$_probe" "$DATA_DIR" 2>/dev/null
  fi
}

# Si ya somos un usuario sin privilegios (alguien fijó `user:` en compose), no
# podemos arreglar nada: ejecutar y, si no se puede escribir, avisar claro.
if [ "$(id -u)" != "0" ]; then
  writable_as "$(id -u)" "$(id -g)" ||
    echo "[PowaFlex] Aviso: $DATA_DIR no es escribible por el usuario $(id -u):$(id -g)."
  exec "$@"
fi

# Usuario objetivo, por orden de preferencia:
#   1) PUID/PGID si los defines (la convención de unRAID: 99:100)
#   2) el dueño actual de la carpeta, si no es root — así se respeta lo que ya
#      haya (por ejemplo nobody:users de unRAID)
#   3) 1000:1000, el usuario "node" de la imagen
owner_uid="$(stat -c %u "$DATA_DIR" 2>/dev/null || echo 0)"
owner_gid="$(stat -c %g "$DATA_DIR" 2>/dev/null || echo 0)"
uid="${PUID:-}"
gid="${PGID:-}"
[ -n "$uid" ] || { [ "$owner_uid" != "0" ] && uid="$owner_uid" || uid=1000; }
[ -n "$gid" ] || { [ "$owner_gid" != "0" ] && gid="$owner_gid" || gid=1000; }

# El chown recursivo solo si hace falta de verdad: la caché de carátulas puede
# tener miles de ficheros y esto se ejecuta en cada arranque.
if ! writable_as "$uid" "$gid"; then
  echo "[PowaFlex] Ajustando permisos de $DATA_DIR para $uid:$gid…"
  chown -R "$uid:$gid" "$DATA_DIR" 2>/dev/null || true
fi

# better-sqlite3 y la caché de imágenes escriben en DATA_DIR; HOME apunta ahí
# para que nada intente escribir en /app.
export HOME="$DATA_DIR"

if writable_as "$uid" "$gid"; then
  echo "[PowaFlex] Arrancando como $uid:$gid"
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid="$uid" --regid="$gid" --clear-groups "$@"
  elif command -v gosu >/dev/null 2>&1; then
    exec gosu "$uid:$gid" "$@"
  else
    exec chroot --userspec="$uid:$gid" / sh -c 'cd /app && exec "$@"' _ "$@"
  fi
fi

# Última red de seguridad: es mejor arrancar con privilegios (lo que hacían
# todas las versiones hasta la 0.8) que no arrancar.
echo "[PowaFlex] Aviso: no se pudo dejar $DATA_DIR escribible para $uid:$gid; arranco como root."
exec "$@"
