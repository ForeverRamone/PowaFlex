/**
 * Llama a la API y SIEMPRE resuelve. Si el servidor no responde —contenedor
 * parado, wifi caída— antes se rechazaba la promesa: ningún `.then` llegaba a
 * ejecutarse y la pantalla se quedaba con el spinner girando para siempre, sin
 * un mensaje. Ahora eso también es un `{ error }`, que es lo que las pantallas
 * saben pintar.
 */
export async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    return { error: 'No hay respuesta del servidor de PowaFlex. ¿Está encendido?', offline: true };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
  return data;
}

export const fmtBytes = (b) => {
  if (!b) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(b >= 100 ? 0 : 1)} ${units[i]}`;
};

export const fmtDuration = (ms) => {
  if (!ms) return '—';
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export const fmtDate = (d) => {
  if (!d) return 'Sin fecha';
  try {
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
};

export const tmdbImg = (path, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

// Which rating shows as the headline chip on small poster cards (#5). Mirrored
// from the server setting into localStorage on app load, so cards read it
// synchronously. Values: 'score' (MDBList Σ, default) | 'imdb' | 'letterboxd'.
export const primaryRating = () => localStorage.getItem('primary_rating') || 'score';

// Selectable look (Ajustes). Mirrored to localStorage so index.html can apply it
// before the first paint; the server setting keeps it across browsers.
export const UI_THEMES = [
  { key: 'cartelera', label: 'Cartelera', hint: 'Cartel de cine de los setenta: crema, rojo y ocre, palo seco pesado' },
  { key: 'cinemateca', label: 'Cinemateca', hint: 'Carbón neutro, titulares en Bodoni, oro reservado' },
  { key: 'clasico', label: 'Clásico', hint: 'El aspecto anterior al rediseño: carbón azulado y fuente del sistema' },
];
export const applyTheme = (key) => {
  const t = UI_THEMES.some((x) => x.key === key) ? key : 'cartelera';
  // cartelera is the default: it lives in :root, so it needs no attribute
  if (t === 'cartelera') delete document.documentElement.dataset.ui;
  else document.documentElement.dataset.ui = t;
  localStorage.setItem('ui_theme', t);
  return t;
};
export const currentTheme = () => localStorage.getItem('ui_theme') || 'cartelera';

// External links per rating source, so a score chip opens that film on its site.
export const ratingLinks = ({ imdb_id, tmdb_id, title } = {}) => ({
  imdb: imdb_id
    ? `https://www.imdb.com/title/${imdb_id}/`
    : title
      ? `https://www.imdb.com/find/?q=${encodeURIComponent(title)}`
      : null,
  // letterboxd resolves /tmdb/<id> to the film page
  letterboxd: tmdb_id ? `https://letterboxd.com/tmdb/${tmdb_id}/` : null,
  rt: title ? `https://www.rottentomatoes.com/search?search=${encodeURIComponent(title)}` : null,
  metacritic: title ? `https://www.metacritic.com/search/${encodeURIComponent(title)}/` : null,
  tmdb: tmdb_id ? `https://www.themoviedb.org/movie/${tmdb_id}` : null,
});
