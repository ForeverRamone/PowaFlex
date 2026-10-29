/**
 * Freno contra el DNS rebinding cuando el panel va SIN contraseña.
 *
 * Una web cualquiera puede hacer que su dominio resuelva a la IP de PowaFlex en
 * tu red. Para el navegador sigue siendo «su» origen, así que Origin y Host
 * casan (el cortafuegos anti-CSRF no ve nada raro) y puede leer las respuestas:
 * /api/backup/settings devolvía el token de Plex y las claves en claro. Lo que
 * el atacante no puede elegir es un nombre que solo existe en tu red, así que se
 * aceptan IPs, `localhost`, nombres de una sola etiqueta («beelink») y los
 * dominios reservados para redes locales. Un dominio propio (un proxy inverso
 * con su propia autenticación delante) se declara en POWAFLEX_HOSTS.
 *
 * Con POWAFLEX_AUTH esto no hace falta: el navegador no manda las credenciales
 * de tu PowaFlex al dominio del atacante.
 */

// sufijos reservados para redes locales (RFC 6762, RFC 8375) o que solo
// resuelve tu propia red/VPN; ninguno lo puede apuntar a tu IP un tercero
const SUFIJOS_LOCALES = ['.local', '.lan', '.home', '.home.arpa', '.internal', '.localdomain', '.localhost', '.ts.net'];

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** El nombre de una cabecera Host, sin puerto y en minúsculas. */
export function nombreDeHost(host) {
  const h = String(host || '').trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1); // [::1]:3860
  return h.replace(/:\d*$/, '').replace(/\.$/, '');
}

/** POWAFLEX_HOSTS="cine.example.com, .midominio.es" → lista normalizada. */
export function hostsDeclarados(valor = process.env.POWAFLEX_HOSTS) {
  return String(valor || '')
    .split(',')
    .map((x) => nombreDeHost(x))
    .filter(Boolean);
}

export function hostDeConfianza(host, declarados = hostsDeclarados()) {
  const h = nombreDeHost(host);
  if (!h) return false;
  if (h.startsWith('[')) return true; // IPv6 literal
  if (IPV4.test(h)) return true;
  if (h === 'localhost' || !h.includes('.')) return true;
  if (SUFIJOS_LOCALES.some((s) => h.endsWith(s))) return true;
  return declarados.some((d) => (d.startsWith('.') ? h.endsWith(d) || h === d.slice(1) : h === d));
}
