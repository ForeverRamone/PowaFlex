import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { toast } from '../toast.js';
import { Spinner, MovieCard, MovieModal, Empty, SkeletonGrid, PageHeader, ErrorBox, Select } from '../components.jsx';

const SORT_OPTIONS = [
  ['added', 'Añadida (reciente)'],
  ['release', 'Estreno (reciente)'],
  ['release_asc', 'Estreno (antigua)'],
  ['title', 'Título'],
  ['runtime', 'Duración (larga)'],
  ['runtime_asc', 'Duración (corta)'],
  ['size', 'Tamaño en disco'],
  ['last_viewed', 'Vista recientemente'],
  ['mdb_score', 'Nota combinada (MDBList)'],
  ['imdb', 'Nota IMDb'],
  ['rt_critic', 'RT crítica'],
  ['letterboxd', 'Nota Letterboxd'],
  ['random', 'Aleatorio 🎲'],
];

export default function Library() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState(null);
  const [data, setData] = useState(null);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState(params.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);

  const q = useMemo(() => Object.fromEntries(params.entries()), [params]);

  useEffect(() => {
    api('/filters').then(setFilters);
    // restore the last-used filters when landing on a bare /biblioteca (#8)
    if ([...params.keys()].length === 0) {
      try {
        const saved = JSON.parse(localStorage.getItem('lib_filters') || 'null');
        if (saved && Object.keys(saved).length) setParams(saved, { replace: true });
      } catch {}
    }
  }, []);

  // persist current filters
  useEffect(() => {
    const keep = {};
    for (const [k, v] of Object.entries(q)) if (k !== 'offset' && v) keep[k] = v;
    localStorage.setItem('lib_filters', JSON.stringify(keep));
  }, [q]);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: '60', ...q });
    api(`/movies?${qs}`).then((d) => {
      setData(d);
      setMovies(d.movies || []);
      setLoading(false);
    });
  }, [q]);

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('offset');
    setParams(next, { replace: true });
  };

  // el guardia evita que un doble clic pida dos veces el mismo tramo y añada las
  // mismas 60 películas repetidas (con claves duplicadas incluidas)
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ limit: '60', ...q, offset: String(movies.length) });
      const d = await api(`/movies?${qs}`);
      if (d.error) return toast(`⚠️ ${d.error}`, 'error');
      setMovies((prev) => {
        const vistas = new Set(prev.map((m) => m.rating_key));
        return [...prev, ...(d.movies || []).filter((m) => !vistas.has(m.rating_key))];
      });
    } finally {
      setLoadingMore(false);
    }
  };

  if (filters?.error || data?.error) return <ErrorBox error={filters?.error || data?.error} />;
  if (!filters) return <Spinner />;

  // active filters (everything but the free-text search and the sort/paging)
  const FILTER_LABELS = {
    genres: 'Género', countries: 'País', decade: 'Década', watched: 'Visionado', length: 'Metraje',
    resolution: 'Resolución', hdr: 'HDR', imdbMin: 'IMDb', rtMin: 'RT', lbMin: 'LB', personId: 'Persona',
    collection: 'Colección', yearMin: 'Desde', yearMax: 'Hasta',
  };
  const VALUE_LABELS = { yes: 'Vistas', no: 'Sin ver', feature: 'Largometraje', short: 'Corto', hdr: 'HDR/DV', dv: 'Dolby Vision', sdr: 'SDR' };
  const activeKeys = Object.keys(q).filter((k) => FILTER_LABELS[k] && q[k]);
  // el deep-link de una ficha trae personId (+personRole); el nombre viaja en
  // personName solo para que el chip no enseñe un id numérico crudo
  const chipLabel = (k) =>
    k === 'personId'
      ? `Persona: ${q.personName || `#${q.personId}`}${q.personRole ? ` (${q.personRole === 'director' ? 'dirige' : 'actúa'})` : ''}`
      : `${FILTER_LABELS[k]}: ${VALUE_LABELS[q[k]] || q[k]}`;
  const clearChip = (k) => {
    if (k !== 'personId') return set(k, '');
    const next = new URLSearchParams(params);
    for (const extra of ['personId', 'personRole', 'personName']) next.delete(extra);
    next.delete('offset');
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader eyebrow="Colección" title="Biblioteca" />

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <form className="max-sm:w-full" onSubmit={(e) => { e.preventDefault(); set('search', search); }}>
          <input className="input !w-52 max-sm:!w-full" placeholder="Buscar título…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <Select value={q.sort || ''} onChange={(v) => set('sort', v)} placeholder="Orden: añadida" options={SORT_OPTIONS} />
        <button className={`btn-ghost ${showFilters ? '!border-gold-400 text-gold-400' : ''}`} onClick={() => setShowFilters((s) => !s)}>
          ⚙ Filtros{activeKeys.length > 0 ? ` (${activeKeys.length})` : ''}
        </button>
        {[...params.keys()].length > 0 && (
          <button className="btn-ghost" onClick={() => { setSearch(''); setParams({}, { replace: true }); setShowFilters(false); }}>✕ Limpiar filtros</button>
        )}
        {data && <span className="text-sm text-zinc-400 ml-auto">{data.total.toLocaleString('es-ES')} películas</span>}
      </div>
      {/* aquí todo está en tu Plex: la única marca que aplica es la estrella */}
      <p className="text-[11px] text-zinc-500 mb-3"><span className="text-gold-400">★</span> vista (en Plex o en Letterboxd)</p>

      {(activeKeys.length > 0 || q.search) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {q.search && (
            <button className="text-xs bg-ink-800 border border-ink-600 rounded-full px-2.5 py-1 text-zinc-300 hover:border-red-400" onClick={() => { setSearch(''); set('search', ''); }}>
              «{q.search}» ✕
            </button>
          )}
          {activeKeys.map((k) => (
            <button key={k} className="text-xs bg-ink-800 border border-ink-600 rounded-full px-2.5 py-1 text-zinc-300 hover:border-red-400" onClick={() => clearChip(k)}>
              {chipLabel(k)} ✕
            </button>
          ))}
        </div>
      )}

      {showFilters && (
        <div className="card p-3 mb-5 flex flex-wrap gap-2 items-center">
          <Select value={q.genres || ''} onChange={(v) => set('genres', v)} placeholder="Género"
            options={filters.genres.map((g) => [g.name, `${g.name} (${g.n})`])} />
          <Select value={q.countries || ''} onChange={(v) => set('countries', v)} placeholder="País"
            options={filters.countries.slice(0, 60).map((c) => [c.name, `${c.name} (${c.n})`])} />
          <Select value={q.decade || ''} onChange={(v) => set('decade', v)} placeholder="Década"
            options={filters.decades.map((d) => [String(d.decade), `${d.decade}s (${d.n})`])} />
          <Select value={q.watched || ''} onChange={(v) => set('watched', v)} placeholder="Visionado"
            options={[['yes', 'Vistas'], ['no', 'Sin ver']]} />
          <Select value={q.length || ''} onChange={(v) => set('length', v)} placeholder="Metraje"
            options={[['feature', 'Largometraje'], ['short', 'Cortometraje (<40m)']]} />
          <Select value={q.resolution || ''} onChange={(v) => set('resolution', v)} placeholder="Resolución"
            options={filters.resolutions.map((r) => [r.name, `${r.name} (${r.n})`])} />
          <Select value={q.hdr || ''} onChange={(v) => set('hdr', v)} placeholder="HDR/SDR"
            options={[['hdr', 'Con HDR o DV'], ['dv', 'Solo Dolby Vision'], ['sdr', 'Solo SDR']]} />
          <Select value={q.imdbMin || ''} onChange={(v) => set('imdbMin', v)} placeholder="IMDb mín."
            options={[['6', 'IMDb 6+'], ['7', 'IMDb 7+'], ['8', 'IMDb 8+']]} />
          <Select value={q.rtMin || ''} onChange={(v) => set('rtMin', v)} placeholder="RT crítica mín."
            options={[['60', '🍅 60%+'], ['75', '🍅 75%+'], ['90', '🍅 90%+']]} />
          {/* la nota de Letterboxd que guarda MDBList va de 0 a 10, no en estrellas:
              con umbrales 3.5/4/4.3 este filtro no descartaba prácticamente nada */}
          <Select value={q.lbMin || ''} onChange={(v) => set('lbMin', v)} placeholder="Letterboxd mín."
            options={[['7', 'LB 7+'], ['8', 'LB 8+'], ['8.6', 'LB 8.6+']]} />
          {/* las colecciones de Plex llevaban desde siempre en /api/filters sin
              que ninguna página las enseñara */}
          {filters.collections?.length > 0 && (
            <Select value={q.collection || ''} onChange={(v) => set('collection', v)} placeholder="Colección de Plex"
              options={filters.collections.map((c) => [c.name, `${c.name} (${c.n})`])} />
          )}
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            Años
            <input
              type="number" className="input !w-20 !py-1.5 text-center" placeholder="desde"
              value={q.yearMin || ''} onChange={(e) => set('yearMin', e.target.value)}
            />
            –
            <input
              type="number" className="input !w-20 !py-1.5 text-center" placeholder="hasta"
              value={q.yearMax || ''} onChange={(e) => set('yearMax', e.target.value)}
            />
          </span>
        </div>
      )}

      {loading && !movies.length ? (
        <SkeletonGrid />
      ) : movies.length === 0 ? (
        <Empty>Sin resultados con estos filtros.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
            {movies.map((m) => (
              <MovieCard key={m.rating_key} movie={m} onClick={() => setSelected(m.rating_key)} />
            ))}
          </div>
          {data && movies.length < data.total && (
            <div className="text-center mt-6">
              <button className="btn-ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore
                  ? 'Cargando…'
                  : `Cargar más (${movies.length} / ${(data?.total ?? 0).toLocaleString('es-ES')})`}
              </button>
            </div>
          )}
        </>
      )}

      {selected && <MovieModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
