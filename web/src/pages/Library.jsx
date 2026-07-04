import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, MovieCard, MovieModal, Empty } from '../components.jsx';

const SORT_OPTIONS = [
  ['added', 'Añadida (reciente)'],
  ['release', 'Estreno (reciente)'],
  ['release_asc', 'Estreno (antigua)'],
  ['title', 'Título'],
  ['rating', 'Nota audiencia'],
  ['user_rating', 'Tu nota'],
  ['runtime', 'Duración (larga)'],
  ['runtime_asc', 'Duración (corta)'],
  ['size', 'Tamaño en disco'],
  ['last_viewed', 'Vista recientemente'],
  ['imdb', 'Nota IMDb'],
  ['rt_critic', 'RT crítica'],
  ['letterboxd', 'Nota Letterboxd'],
  ['mdb_score', 'Nota combinada (MDBList)'],
  ['random', 'Aleatorio 🎲'],
];

function Select({ value, onChange, options, placeholder }) {
  return (
    <select className="input !w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

export default function Library() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState(null);
  const [data, setData] = useState(null);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState(params.get('search') || '');

  const q = useMemo(() => Object.fromEntries(params.entries()), [params]);

  useEffect(() => {
    api('/filters').then(setFilters);
  }, []);

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

  const loadMore = async () => {
    const offset = movies.length;
    const qs = new URLSearchParams({ limit: '60', ...q, offset: String(offset) });
    const d = await api(`/movies?${qs}`);
    setMovies((prev) => [...prev, ...(d.movies || [])]);
  };

  if (!filters) return <Spinner />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-4">Biblioteca</h1>

      <div className="card p-3 mb-5 flex flex-wrap gap-2 items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set('search', search);
          }}
        >
          <input
            className="input !w-52"
            placeholder="Buscar título…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
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
        <Select value={q.hdr || ''} onChange={(v) => set('hdr', v)} placeholder="HDR"
          options={[['yes', 'HDR / DV'], ['dv', 'Solo Dolby Vision']]} />
        <Select value={q.ratingMin || ''} onChange={(v) => set('ratingMin', v)} placeholder="Nota mínima"
          options={[6, 7, 8].map((n) => [String(n), `★ ${n}+`])} />
        <Select value={q.imdbMin || ''} onChange={(v) => set('imdbMin', v)} placeholder="IMDb mín."
          options={[['6', 'IMDb 6+'], ['7', 'IMDb 7+'], ['8', 'IMDb 8+']]} />
        <Select value={q.rtMin || ''} onChange={(v) => set('rtMin', v)} placeholder="RT crítica mín."
          options={[['60', '🍅 60%+'], ['75', '🍅 75%+'], ['90', '🍅 90%+']]} />
        <Select value={q.lbMin || ''} onChange={(v) => set('lbMin', v)} placeholder="Letterboxd mín."
          options={[['3.5', 'LB 3.5+'], ['4', 'LB 4+'], ['4.3', 'LB 4.3+']]} />
        <Select value={q.sort || ''} onChange={(v) => set('sort', v)} placeholder="Orden: añadida"
          options={SORT_OPTIONS} />
        {[...params.keys()].length > 0 && (
          <button className="btn-ghost" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>
            ✕ Limpiar
          </button>
        )}
        {data && (
          <span className="text-sm text-slate-400 ml-auto">
            {data.total.toLocaleString('es-ES')} películas
          </span>
        )}
      </div>

      {loading && !movies.length ? (
        <Spinner />
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
              <button className="btn-ghost" onClick={loadMore}>
                Cargar más ({movies.length} / {data.total.toLocaleString('es-ES')})
              </button>
            </div>
          )}
        </>
      )}

      {selected && <MovieModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
