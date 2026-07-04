import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, Section, Empty } from '../components.jsx';

const ROLES = [
  ['director', 'Directores'],
  ['actor', 'Actores'],
  ['writer', 'Guionistas'],
];

export default function Favorites() {
  const [tracked, setTracked] = useState(null);
  const [role, setRole] = useState('director');
  const [ranking, setRanking] = useState(null);
  const [topN, setTopN] = useState(10);
  const [flash, setFlash] = useState('');
  const [rankLimit, setRankLimit] = useState(50);

  const loadTracked = () => api('/tracked').then((r) => setTracked(Array.isArray(r) ? r : []));
  useEffect(() => {
    loadTracked();
  }, []);

  useEffect(() => {
    setRanking(null);
    api(`/people?role=${role}&limit=${rankLimit}`).then((r) => setRanking(Array.isArray(r) ? r : []));
  }, [role, rankLimit]);

  const trackedIds = new Set((tracked || []).map((t) => t.id));

  const bulkAdd = async () => {
    const res = await api('/tracked/bulk', { method: 'POST', body: { role, top: Number(topN) } });
    if (res.ok) {
      setFlash(`✓ ${res.added} añadidos (${res.total - res.added} ya estaban)`);
      setTimeout(() => setFlash(''), 4000);
      loadTracked();
    }
  };

  const toggle = async (id) => {
    await api(`/tracked/${id}`, { method: trackedIds.has(id) ? 'DELETE' : 'POST' });
    loadTracked();
  };

  const clearAll = async () => {
    await api('/tracked/all', { method: 'DELETE' });
    loadTracked();
  };

  if (!tracked) return <Spinner />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Favoritos</h1>
      <p className="text-sm text-slate-500 mb-6 max-w-3xl">
        Tus directores y actores de cabecera. Todos los favoritos entran <b>siempre</b> en el calendario de{' '}
        <Link to="/calendario" className="text-gold-400 hover:underline">Cine venidero</Link> (además del top
        automático que configures en Ajustes). Añade en bloque desde el ranking y quita lo que sobre cuando quieras.
      </p>

      {/* bulk controls */}
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {ROLES.map(([r, label]) => (
            <button key={r} onClick={() => setRole(r)} className={role === r ? 'btn-gold' : 'btn-ghost'}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-slate-400">Añadir los</span>
          <input
            type="number"
            min="1"
            max="200"
            className="input !w-20 text-center"
            value={topN}
            onChange={(e) => setTopN(e.target.value)}
          />
          <span className="text-sm text-slate-400">primeros</span>
          <button className="btn-gold" onClick={bulkAdd}>⭐ Añadir</button>
        </div>
        {flash && <span className="text-emerald-400 text-sm w-full">{flash}</span>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ranking */}
        <Section title={`Ranking de ${ROLES.find(([r]) => r === role)[1].toLowerCase()} por títulos en tu Plex`}>
          {!ranking ? (
            <Spinner />
          ) : (
            <div className="card divide-y divide-ink-800 max-h-[70vh] overflow-y-auto">
              {ranking.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-slate-600 text-sm w-8 text-right shrink-0">{i + 1}.</span>
                  <Link
                    to={`/personas/${p.id}?role=${role}`}
                    className="text-sm text-slate-200 hover:text-gold-400 truncate flex-1"
                  >
                    {p.name}
                  </Link>
                  <span className="text-xs text-slate-500 shrink-0">{p.n} títulos</span>
                  <button
                    onClick={() => toggle(p.id)}
                    title={trackedIds.has(p.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    className={`text-lg cursor-pointer transition-colors shrink-0 ${
                      trackedIds.has(p.id) ? 'text-gold-400' : 'text-ink-600 hover:text-slate-400'
                    }`}
                  >
                    ★
                  </button>
                </div>
              ))}
              {ranking.length >= rankLimit && (
                <button
                  className="w-full py-2 text-xs text-slate-400 hover:text-gold-400 cursor-pointer"
                  onClick={() => setRankLimit((l) => l + 50)}
                >
                  Ver más
                </button>
              )}
            </div>
          )}
        </Section>

        {/* current favorites */}
        <Section
          title={`Tus favoritos (${tracked.length})`}
          action={
            tracked.length > 0 && (
              <button className="text-xs text-red-400 hover:underline cursor-pointer" onClick={clearAll}>
                Vaciar todos
              </button>
            )
          }
        >
          {tracked.length === 0 ? (
            <Empty>
              Aún no tienes favoritos. Añade los primeros del ranking de la izquierda, o marca «☆ Seguir» en la
              ficha de cualquier persona.
            </Empty>
          ) : (
            <div className="card divide-y divide-ink-800 max-h-[70vh] overflow-y-auto">
              {tracked.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-gold-400">★</span>
                  <Link
                    to={`/personas/${t.id}?role=${t.directed >= t.acted ? 'director' : 'actor'}`}
                    className="text-sm text-slate-200 hover:text-gold-400 truncate flex-1"
                  >
                    {t.name}
                  </Link>
                  <span className="text-xs text-slate-500 shrink-0">
                    {t.directed > 0 && `${t.directed} dirigidas`}
                    {t.directed > 0 && t.acted > 0 && ' · '}
                    {t.acted > 0 && `${t.acted} actuadas`}
                  </span>
                  <button
                    onClick={() => toggle(t.id)}
                    title="Quitar de favoritos"
                    className="text-slate-500 hover:text-red-400 cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
