import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, PersonCard, Empty, PageHeader } from '../components.jsx';

const ROLES = [
  ['director', 'Directores/as'],
  ['actor', 'Actores/actrices'],
  ['writer', 'Guionistas'],
];

const Select = ({ value, onChange, options, placeholder }) => (
  <select className="input !w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {options.map(([v, l]) => (
      <option key={v} value={v}>{l}</option>
    ))}
  </select>
);

export default function People() {
  const [params, setParams] = useSearchParams();
  const role = params.get('role') || 'director';
  const [search, setSearch] = useState(params.get('search') || '');
  const [people, setPeople] = useState(null);
  const [limit, setLimit] = useState(60);
  const [opts, setOpts] = useState(null);
  // los filtros sobreviven a la navegación (adelante, atrás, otra página y
  // vuelta) hasta que se pulse «Limpiar»
  const [f, setF] = useState(() => {
    const vacio = { gender: '', life: '', continent: '', country: '' };
    try {
      return { ...vacio, ...JSON.parse(localStorage.getItem('people_filters') || '{}') };
    } catch {
      return vacio;
    }
  });
  useEffect(() => {
    localStorage.setItem('people_filters', JSON.stringify(f));
  }, [f]);

  useEffect(() => {
    api('/people/filter-options').then((o) => !o.error && setOpts(o));
  }, []);

  // debounced, and the grid keeps the previous results while refetching so
  // typing a name doesn't flash the whole page to a spinner per keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ role, limit: String(limit), search, ...f });
      api(`/people?${qs}`).then((r) => setPeople(Array.isArray(r) ? r : []));
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [role, search, limit, f]);

  const setFilter = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));

  return (
    <div>
      <PageHeader eyebrow="Tu gente" title="Directores/as y actores/actrices" />
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        {ROLES.map(([r, label]) => (
          <button
            key={r}
            onClick={() => setParams({ role: r })}
            className={role === r ? 'btn-gold' : 'btn-ghost'}
          >
            {label}
          </button>
        ))}
        <input
          className="input !w-56 ml-2"
          placeholder="Buscar nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        <Select value={f.gender} onChange={setFilter('gender')} placeholder="Género"
          options={[['female', 'Mujer'], ['male', 'Hombre'], ['other', 'No binario']]} />
        <Select value={f.life} onChange={setFilter('life')} placeholder="Vivo/fallecido"
          options={[['alive', 'Vivos'], ['dead', 'Fallecidos']]} />
        <Select value={f.continent} onChange={setFilter('continent')} placeholder="Continente"
          options={(opts?.continents || []).map((c) => [c, c])} />
        <Select value={f.country} onChange={setFilter('country')} placeholder="País (nacimiento)"
          options={(opts?.countries || []).map((c) => [c, c])} />
        {(f.gender || f.life || f.continent || f.country) && (
          <button className="btn-ghost" onClick={() => setF({ gender: '', life: '', continent: '', country: '' })}>✕ Limpiar filtros</button>
        )}
        {opts && (
          <span className="text-xs text-zinc-500 ml-auto">
            Datos demográficos de {opts.enriched.toLocaleString('es-ES')} personas · amplíalos en Ajustes → «Actualizar estado vital»
          </span>
        )}
      </div>

      {!people ? (
        <Spinner />
      ) : people.length === 0 ? (
        <Empty>No hay resultados.</Empty>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {people.map((p) => (
              <PersonCard key={p.id} person={p} role={role} />
            ))}
          </div>
          {people.length >= limit && (
            <div className="text-center mt-6">
              <button className="btn-ghost" onClick={() => setLimit((l) => l + 60)}>
                Cargar más
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
