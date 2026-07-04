export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
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
