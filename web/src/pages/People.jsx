import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, PersonCard, Empty } from '../components.jsx';

const ROLES = [
  ['director', 'Directores'],
  ['actor', 'Actores'],
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
  const [f, setF] = useState({ gender: '', life: '', continent: '', country: '' });

  useEffect(() => {
    api('/people/filter-options').then((o) => !o.error && setOpts(o));
  }, []);

  useEffect(() => {
    setPeople(null);
    const qs = new URLSearchParams({ role, limit: String(limit), search, ...f });
    api(`/people?${qs}`).then((r) => setPeople(Array.isArray(r) ? r : []));
  }, [role, search, limit, f]);

  const setFilter = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-4">Directores y actores</h1>
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
          <button className="btn-ghost" onClick={() => setF({ gender: '', life: '', continent: '', country: '' })}>✕ Limpiar</button>
        )}
        {opts && (
          <span className="text-xs text-slate-500 ml-auto">
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
