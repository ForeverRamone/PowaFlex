import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, PersonCard, Empty } from '../components.jsx';

const ROLES = [
  ['director', 'Directores'],
  ['actor', 'Actores'],
  ['writer', 'Guionistas'],
];

export default function People() {
  const [params, setParams] = useSearchParams();
  const role = params.get('role') || 'director';
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState(null);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    setPeople(null);
    const qs = new URLSearchParams({ role, limit: String(limit), search });
    api(`/people?${qs}`).then((r) => setPeople(Array.isArray(r) ? r : []));
  }, [role, search, limit]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-4">Directores y actores</h1>
      <div className="flex flex-wrap gap-2 mb-5 items-center">
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
