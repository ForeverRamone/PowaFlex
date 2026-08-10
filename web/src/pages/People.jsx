import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import { Star, Clapperboard } from 'lucide-react';
import { Spinner, PersonCard, Empty, PageHeader, Select, DeathBadge } from '../components.jsx';
import { toast } from '../toast.js';
import { t, locale } from '../i18n.js';

// Los oficios los sirve el servidor (GET /roles): tener aquí una copia a mano
// era garantía de desincronizarse en cuanto el servidor aprendiera uno nuevo.
// Esto es solo el arranque mientras llega la respuesta —dirección primero,
// interpretación después— para que las pestañas no parpadeen al montar.
const ROLES_INICIALES = [
  { key: 'director', label: 'Directores/as', singular: 'director/a', rankable: true, principal: true },
  { key: 'actor', label: 'Actores/actrices', singular: 'actor/actriz', rankable: true, principal: true },
];

/** Una persona de TMDB con la ★ para seguirla en la faceta activa. */
function TmdbPersonCard({ person, seguido, onFollow, onUnfollow }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="w-11 h-11 rounded-full overflow-hidden bg-ink-800 shrink-0 flex items-center justify-center">
        {person.profile_path ? (
          <img src={tmdbImg(person.profile_path, 'w185')} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <Clapperboard size={18} className="text-zinc-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-200 truncate">{person.name}</div>
        <div className="text-[11px] text-zinc-500 truncate">{(person.knownFor || []).join(', ')}</div>
      </div>
      <button
        onClick={() => (seguido ? onUnfollow(person) : onFollow(person))}
        title={seguido ? t('Quitar de favoritos') : t('Añadir a favoritos')}
        className={`text-lg cursor-pointer shrink-0 ${seguido ? 'text-gold-400' : 'text-zinc-600 hover:text-gold-400'}`}
      >
        ★
      </button>
    </div>
  );
}

export default function People() {
  const [params, setParams] = useSearchParams();
  const role = params.get('role') || 'director';
  const [search, setSearch] = useState(params.get('search') || '');
  const [people, setPeople] = useState(null);
  const [limit, setLimit] = useState(60);
  const [opts, setOpts] = useState(null);
  const [roles, setRoles] = useState(ROLES_INICIALES);
  useEffect(() => {
    api('/roles').then((r) => Array.isArray(r) && r.length && setRoles(r));
  }, []);
  // un oficio que aún no conocemos se trata como no rankeable: así no asoma el
  // alta masiva un instante para desaparecer cuando llega la lista de verdad
  const info = (r) => roles.find((x) => x.key === r) || { key: r, label: r, singular: r, rankable: false, principal: false };
  const roleLabel = (r) => t(info(r).label); // «Directores/as»
  const roleSingular = (r) => t(info(r).singular); // «director/a»
  const rankable = info(role).rankable;
  // un oficio del que aún no sabemos nada (se ha entrado por URL a ?role=dop
  // antes de que llegue la lista): no se pinta ni el alta masiva ni el
  // buscador hasta saber cuál de los dos toca
  const oficioConocido = roles.some((r) => r.key === role);
  const principales = roles.filter((r) => r.principal);
  const secundarios = roles.filter((r) => !r.principal);

  // los filtros sobreviven a la navegación (adelante, atrás, otra página y
  // vuelta) hasta que se pulse «Limpiar». Comparten clave con los demográficos
  // de Descubrir: elegir «mujeres españolas» en una página vale en la otra.
  // La primera lectura hereda de las claves viejas de cada página.
  const [f, setF] = useState(() => {
    const vacio = { gender: '', life: '', continent: '', country: '' };
    try {
      const crudo = localStorage.getItem('demo_filters')
        ?? localStorage.getItem('people_filters')
        ?? localStorage.getItem('gaps_demo_filters');
      return { ...vacio, ...JSON.parse(crudo || '{}') };
    } catch {
      return vacio;
    }
  });
  useEffect(() => {
    localStorage.setItem('demo_filters', JSON.stringify(f));
  }, [f]);

  useEffect(() => {
    api('/people/filter-options').then((o) => !o.error && setOpts(o));
  }, []);

  // debounced, and the grid keeps the previous results while refetching so
  // typing a name doesn't flash the whole page to a spinner per keystroke.
  // Los oficios sin ranking (fotografía, música, montaje) no salen de Plex: no
  // hay parrilla que pedir, se sigue por nombre desde TMDB.
  useEffect(() => {
    if (!rankable) { setPeople([]); return undefined; }
    const temporizador = setTimeout(() => {
      const qs = new URLSearchParams({ role, limit: String(limit), search, ...f });
      api(`/people?${qs}`).then((r) => setPeople(Array.isArray(r) ? r : []));
    }, search ? 250 : 0);
    return () => clearTimeout(temporizador);
  }, [role, search, limit, f, rankable]);

  // ── seguimiento: la estrella vive aquí desde que el ranking duplicado de
  // Favoritos se retiró — misma semántica por faceta que tenía allí
  const [tracked, setTracked] = useState([]);
  const loadTracked = () => api('/tracked').then((r) => Array.isArray(r) && setTracked(r));
  useEffect(() => { loadTracked(); }, []);
  const followState = (id) => {
    const here = tracked.some((fav) => fav.id === id && (fav.role || 'director') === role);
    if (here) return 'here';
    const other = tracked.find((fav) => fav.id === id && (fav.role || 'director') !== role);
    return other ? 'elsewhere' : 'no';
  };
  const otherRoleOf = (id) => tracked.find((fav) => fav.id === id && (fav.role || 'director') !== role)?.role;
  // the star reflects THIS facet only: adding here never touches the other
  // facet, so someone can be in directors AND actors at once (#Eastwood)
  const toggleFollow = async (p) => {
    const here = followState(p.id) === 'here';
    if (here) {
      setTracked((prev) => prev.filter((fav) => !(fav.id === p.id && (fav.role || 'director') === role)));
      await api(`/tracked/${p.id}?role=${role}`, { method: 'DELETE' });
      toast(t('{name} fuera de {role}', { name: p.name, role: roleLabel(role).toLowerCase() }));
    } else {
      const r = await api(`/tracked/${p.id}`, { method: 'POST', body: { role } });
      const extra = r.directorAlso
        ? t(' · y a directores/as: dirige 4+ películas')
        : r.actorAlso
          ? t(' · y a actores/actrices: tiene 8+ interpretadas')
          : '';
      toast(t('⭐ {name} a {role}', { name: p.name, role: roleLabel(role).toLowerCase() }) + extra, 'success');
    }
    loadTracked();
  };

  // ── seguir por nombre: la única vía para fotografía, música y montaje, que
  // Plex no acredita y por tanto no tienen «top de tu biblioteca»
  const [tq, setTq] = useState('');
  const [tmdbResults, setTmdbResults] = useState(null);
  const [buscandoTmdb, setBuscandoTmdb] = useState(false);
  useEffect(() => { setTmdbResults(null); setTq(''); }, [role]);
  const trackedTmdb = new Set(
    tracked.filter((fav) => (fav.role || 'director') === role).map((fav) => fav.tmdb_id).filter(Boolean)
  );
  const buscarTmdb = async (e) => {
    e.preventDefault();
    if (!tq.trim()) return;
    setBuscandoTmdb(true);
    const r = await api(`/people/search-tmdb?q=${encodeURIComponent(tq.trim())}&role=${role}`);
    setBuscandoTmdb(false);
    setTmdbResults(Array.isArray(r) ? r : []);
  };
  const seguirTmdb = async (p) => {
    const r = await api('/tracked/tmdb', {
      method: 'POST',
      body: { tmdbId: p.tmdb_id, name: p.name, profilePath: p.profile_path, role },
    });
    if (r.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    toast(t('⭐ {name} a {role}', { name: p.name, role: roleLabel(role).toLowerCase() }), 'success');
    loadTracked();
  };
  const dejarTmdb = async (p) => {
    const fav = tracked.find((x) => x.tmdb_id === p.tmdb_id && (x.role || 'director') === role);
    if (!fav) return;
    await api(`/tracked/${fav.id}?role=${role}`, { method: 'DELETE' });
    toast(t('{name} fuera de {role}', { name: p.name, role: roleLabel(role).toLowerCase() }));
    loadTracked();
  };

  // ── alta masiva top-N con previsualización (venía del ranking de Favoritos)
  const [topN, setTopN] = useState(10);
  const [preview, setPreview] = useState(null);
  const bulkAdd = async () => {
    const res = await api('/tracked/bulk', { method: 'POST', body: { role, top: Number(topN), preview: true } });
    if (res.error) return toast(`⚠️ ${t(res.error)}`, 'error');
    const candidates = res.candidates || [];
    if (!candidates.length) return toast(t('Nadie nuevo que añadir con ese criterio'));
    setPreview({ candidates, checked: new Set(candidates.map((c) => c.id)) });
  };
  const togglePreview = (id) =>
    setPreview((p) => {
      const checked = new Set(p.checked);
      checked.has(id) ? checked.delete(id) : checked.add(id);
      return { ...p, checked };
    });
  const confirmBulkAdd = async () => {
    const ids = preview.candidates.filter((c) => preview.checked.has(c.id)).map((c) => c.id);
    setPreview(null);
    if (!ids.length) return;
    const res = await api('/tracked/bulk', { method: 'POST', body: { personIds: ids, role } });
    if (res.ok) { toast(t('⭐ {n} añadidos a {role}', { n: res.added, role: roleLabel(role).toLowerCase() }), 'success'); loadTracked(); }
    else toast(`⚠️ ${t(res.error || 'error')}`, 'error');
  };

  const setFilter = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));

  return (
    <div>
      <PageHeader eyebrow={t('Tu gente')} title={t('Directores, actores y equipo')} />
      {/* la dirección abre y manda; la interpretación va detrás; los demás
          oficios se agrupan aparte y en formato menor, para que la barra no se
          lea como seis pestañas iguales */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        {principales.map((r) => (
          <button
            key={r.key}
            onClick={() => setParams({ role: r.key })}
            className={role === r.key ? 'btn-gold' : 'btn-ghost'}
          >
            {t(r.label)}
          </button>
        ))}
        {secundarios.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center border-l border-ink-700 pl-3 ml-1">
            <span className="text-xs text-zinc-600">{t('y también')}</span>
            {secundarios.map((r) => (
              <button
                key={r.key}
                onClick={() => setParams({ role: r.key })}
                className={`btn-ghost !py-1 text-xs ${role === r.key ? '!border-gold-400 text-gold-400' : ''}`}
              >
                {t(r.label)}
              </button>
            ))}
          </div>
        )}
        {rankable && (
          <input
            className="input !w-56 ml-2 max-sm:!w-full max-sm:ml-0"
            placeholder={t('Buscar nombre…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>
      {/* los filtros demográficos recortan la parrilla de tu Plex: sin parrilla
          (fotografía, música, montaje) no tienen nada que recortar */}
      {rankable && (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <Select value={f.gender} onChange={setFilter('gender')} placeholder={t('Género||persona')}
            options={[['female', t('Mujer')], ['male', t('Hombre')], ['other', t('No binario')]]} />
          <Select value={f.life} onChange={setFilter('life')} placeholder={t('Vivo/fallecido')}
            options={[['alive', t('Vivos')], ['dead', t('Fallecidos')]]} />
          <Select value={f.continent} onChange={setFilter('continent')} placeholder={t('Continente')}
            options={(opts?.continents || []).map((c) => [c, c])} />
          <Select value={f.country} onChange={setFilter('country')} placeholder={t('País (nacimiento)')}
            options={(opts?.countries || []).map((c) => [c, c])} />
          {(f.gender || f.life || f.continent || f.country) && (
            <button className="btn-ghost" onClick={() => setF({ gender: '', life: '', continent: '', country: '' })}>{t('✕ Limpiar filtros')}</button>
          )}
          {opts && (
            <span className="text-xs text-zinc-500 ml-auto">
              {t('Datos demográficos de {n} personas · amplíalos en Ajustes → «Actualizar estado vital»', { n: opts.enriched.toLocaleString(locale()) })}
            </span>
          )}
        </div>
      )}
      {!oficioConocido ? null : rankable ? (
        <div className="flex flex-wrap gap-2 mb-5 items-center text-sm">
          <span className="text-xs text-zinc-500">
            {t('La ★ sigue a esa persona como {role} (Favoritos).', { role: roleSingular(role) })}
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-xs text-zinc-400 whitespace-nowrap">{t('Seguir a los')}</span>
            <input type="number" min="1" max="1000" className="input !w-20 text-center !py-1" value={topN} onChange={(e) => setTopN(e.target.value)} />
            <span className="text-xs text-zinc-400 whitespace-nowrap">{t('primeros')}</span>
            <button className="btn-gold !py-1 text-xs inline-flex items-center gap-1.5" onClick={bulkAdd}>
              <Star size={12} strokeWidth={2} /> {t('Revisar y añadir')}
            </button>
          </div>
        </div>
      ) : (
        // sin ranking posible: el buscador de TMDB ocupa el sitio del alta masiva
        <div className="card p-4 mb-6">
          <h2 className="font-semibold text-zinc-100 mb-1">{t('Seguir por nombre')}</h2>
          <p className="text-xs text-zinc-500 mb-3 max-w-2xl">
            {t('Plex no guarda estos créditos, así que aquí no hay «top de tu biblioteca»: busca a la persona en TMDB y síguela como {role} con la ★.', { role: roleSingular(role) })}
          </p>
          <form onSubmit={buscarTmdb} className="flex gap-2 max-w-xl">
            <input className="input" placeholder={t('Buscar por nombre en TMDB…')} value={tq} onChange={(e) => setTq(e.target.value)} />
            <button className="btn-gold shrink-0" disabled={buscandoTmdb}>{buscandoTmdb ? t('Buscando…') : t('Buscar')}</button>
            {tmdbResults && (
              <button type="button" className="btn-ghost shrink-0" onClick={() => { setTmdbResults(null); setTq(''); }}>✕</button>
            )}
          </form>
          {tmdbResults && (
            tmdbResults.length === 0 ? (
              <div className="text-sm text-zinc-500 mt-3">{t('Nadie con ese nombre en TMDB.')}</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                {tmdbResults.map((p) => (
                  <TmdbPersonCard
                    key={p.tmdb_id}
                    person={p}
                    seguido={p.tracked || trackedTmdb.has(p.tmdb_id)}
                    onFollow={seguirTmdb}
                    onUnfollow={dejarTmdb}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {preview && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h3 className="font-semibold text-zinc-100 text-sm">
              {t('Vas a seguir a {sel} de {total} como {role}', { sel: preview.checked.size, total: preview.candidates.length, role: roleSingular(role) })}
            </h3>
            <div className="flex gap-2">
              <button className="btn-gold !py-1 text-xs inline-flex items-center gap-1.5" onClick={confirmBulkAdd} disabled={!preview.checked.size}>
                <Star size={12} strokeWidth={2} /> {t('Confirmar')} ({preview.checked.size})
              </button>
              <button className="btn-ghost !py-1 text-xs" onClick={() => setPreview(null)}>{t('Cancelar')}</button>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 max-h-72 overflow-y-auto">
            {preview.candidates.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-zinc-300 py-0.5 cursor-pointer min-w-0">
                <input type="checkbox" checked={preview.checked.has(c.id)} onChange={() => togglePreview(c.id)} />
                <span className="truncate">{c.name}</span>
                <DeathBadge deathday={c.deathday} />
                <span className="text-[11px] text-zinc-500 shrink-0 ml-auto">{t('{n} títulos', { n: c.n })}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {!rankable ? null : !people ? (
        <Spinner />
      ) : people.length === 0 ? (
        <Empty>{t('No hay resultados.')}</Empty>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {people.map((p) => {
              const state = followState(p.id);
              return (
                <PersonCard
                  key={p.id}
                  person={p}
                  role={role}
                  follow={{
                    state,
                    onToggle: toggleFollow,
                    title:
                      state === 'here'
                        ? t('Quitar de {role}', { role: roleLabel(role).toLowerCase() })
                        : state === 'elsewhere'
                          ? t('Le sigues como {other}: seguirle TAMBIÉN como {role}', { other: roleSingular(otherRoleOf(p.id)), role: roleSingular(role) })
                          : t('Seguir como {role}', { role: roleSingular(role) }),
                  }}
                />
              );
            })}
          </div>
          {people.length >= limit && (
            <div className="text-center mt-6">
              <button className="btn-ghost" onClick={() => setLimit((l) => l + 60)}>
                {t('Cargar más')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
