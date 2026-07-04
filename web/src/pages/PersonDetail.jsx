import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api, tmdbImg, fmtDate } from '../api.js';
import {
  Spinner, ErrorBox, TmdbCard, RadarrButton, ProgressBar, Empty, StatusLegend,
  useRadarrIds, useTypeFilters, TypeFilterBar, matchesTypeFilters, DeathBadge,
} from '../components.jsx';

const VIEWS = [
  ['all', 'Todas'],
  ['owned', 'Las tienes'],
  ['missing', 'Te faltan'],
  ['upcoming', 'Próximas'],
];

const ROLE_LABEL = { director: 'director/a', actor: 'actor/actriz', writer: 'guionista' };
const ROLE_TAB = { director: '🎬 Como director/a', actor: '🎭 Como actor/actriz', writer: '✍️ Como guionista' };

export default function PersonDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const wantRole = params.get('role') || 'director';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [role, setRole] = useState(null); // active role tab
  const [view, setView] = useState('all');
  const [tracked, setTracked] = useState(false);
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [show, toggle] = useTypeFilters('person_type_filters');

  useEffect(() => {
    setData(null);
    setError(null);
    setRole(null);
    api(`/people/${id}/filmography?role=${wantRole}`).then((d) => {
      if (d.error) setError(d.error);
      else {
        setData(d);
        setRole(d.roles?.[wantRole] ? wantRole : d.primary);
      }
    });
    api('/tracked').then((list) => Array.isArray(list) && setTracked(list.some((t) => t.id === Number(id))));
  }, [id, wantRole]);

  const toggleTrack = async () => {
    await api(`/tracked/${id}`, { method: tracked ? 'DELETE' : 'POST' });
    setTracked(!tracked);
  };

  if (error) return <ErrorBox error={`No se pudo cargar la filmografía: ${error}. ¿Está configurada la API key de TMDB en Ajustes?`} />;
  if (!data) return <Spinner label="Consultando TMDB…" />;
  if (!data.matched)
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">{data.person?.name}</h1>
        <Empty>No se encontró esta persona en TMDB.</Empty>
      </div>
    );

  const { person, roles } = data;
  const roleKeys = Object.keys(roles || {});
  const active = (role && roles[role] && role) || (roles[data.primary] && data.primary) || roleKeys[0];
  if (!active)
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">{person?.name}</h1>
        <Empty>No hay filmografía que mostrar.</Empty>
      </div>
    );
  const { stats, items } = roles[active];

  const typeCounts = {
    shorts: items.filter((i) => i.isShort).length,
    docs: items.filter((i) => i.isDocumentary).length,
    tv: items.filter((i) => i.isTvMovie).length,
    coral: items.filter((i) => i.isCoral).length,
  };
  const filtered = items.filter((i) => {
    if (!matchesTypeFilters(i, show)) return false;
    if (view === 'owned') return i.owned;
    if (view === 'missing') return i.released && !i.owned;
    if (view === 'upcoming') return !i.released;
    return true;
  });

  return (
    <div>
      <div className="flex gap-6 items-start mb-6 flex-wrap">
        {person.profile_path && (
          <img src={tmdbImg(person.profile_path, 'w185')} alt="" className="w-28 rounded-xl border border-ink-700" />
        )}
        <div className="flex-1 min-w-60">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-100">{person.name}</h1>
            <DeathBadge deathday={person.deathday} />
            <button
              onClick={toggleTrack}
              className={tracked ? 'btn-gold' : 'btn-ghost'}
              title={
                person.deathday
                  ? 'Ya fallecido: no tendrá nuevos estrenos, no hace falta seguirlo'
                  : 'Las personas seguidas aparecen siempre en el calendario de cine venidero'
              }
            >
              {tracked ? '★ Siguiendo' : '☆ Seguir en calendario'}
            </button>
            <Link to={`/biblioteca?personId=${person.id}&personRole=${active}`} className="btn-ghost">
              Ver en tu biblioteca
            </Link>
          </div>
          {person.birthday && (
            <div className="text-sm text-slate-500 mt-1">
              {fmtDate(person.birthday)}
              {person.deathday && ` — ${fmtDate(person.deathday)}`}
            </div>
          )}

          {/* role switch when the person both directs and acts (#8) */}
          {roleKeys.length > 1 && (
            <div className="flex gap-2 mt-3">
              {roleKeys.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRole(r); setView('all'); }}
                  className={`btn-ghost !py-1 text-xs ${active === r ? '!border-gold-400 text-gold-400' : ''}`}
                >
                  {ROLE_TAB[r] || r} ({roles[r].stats.owned}/{roles[r].stats.released})
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 max-w-md">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-300">Completismo (como {ROLE_LABEL[active] || active})</span>
              <span className="text-gold-400 font-semibold">
                {stats.owned} / {stats.released} · {stats.pct}%
              </span>
            </div>
            <ProgressBar pct={stats.pct} />
            {active === 'director' && (
              <div className="text-[11px] text-slate-500 mt-1">
                Solo largometrajes
                {stats.documentarian ? ' (incluye documentales: es documentalista)' : ''}
                {stats.excludedFromCompletion > 0 && ` · ${stats.excludedFromCompletion} fuera del cómputo (cortos, TV, docs o dirección coral)`}
              </div>
            )}
            {stats.upcoming > 0 && (
              <div className="text-xs text-sky-300 mt-2">🗓️ {stats.upcoming} proyectos anunciados o por estrenar</div>
            )}
          </div>
          {person.biography && (
            <p className="text-sm text-slate-400 mt-3 leading-relaxed max-w-3xl line-clamp-4">{person.biography}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {VIEWS.map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} className={view === v ? 'btn-gold' : 'btn-ghost'}>
            {label}
            {v === 'missing' && ` (${stats.released - stats.owned})`}
            {v === 'upcoming' && ` (${stats.upcoming})`}
          </button>
        ))}
        <StatusLegend className="ml-auto" />
      </div>

      {(typeCounts.shorts || typeCounts.docs || typeCounts.tv || typeCounts.coral) > 0 && (
        <TypeFilterBar show={show} toggle={toggle} counts={typeCounts} />
      )}

      {filtered.length === 0 ? (
        <Empty>Nada que mostrar aquí. {view === 'missing' && '¡Filmografía completa! 🏆'}</Empty>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {filtered.map((item) => (
            <TmdbCard
              key={item.tmdb_id}
              item={item}
              badge={
                item.owned ? (
                  <span className="absolute top-1.5 right-1.5 bg-emerald-600/90 text-white text-[10px] px-1.5 py-0.5 rounded">✓ La tienes</span>
                ) : !item.released ? (
                  <span className="absolute top-1.5 right-1.5 bg-sky-600/90 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {item.date ? fmtDate(item.date) : 'Anunciada'}
                  </span>
                ) : null
              }
            >
              {!item.owned && (
                <RadarrButton tmdbId={item.tmdb_id} small alreadyInRadarr={radarrIds.has(item.tmdb_id)} onAdded={addRadarrId} />
              )}
            </TmdbCard>
          ))}
        </div>
      )}
    </div>
  );
}
