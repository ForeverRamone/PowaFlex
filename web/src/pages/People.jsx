import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Star } from 'lucide-react';
import { Spinner, PersonCard, Empty, PageHeader, Select, DeathBadge } from '../components.jsx';
import { toast } from '../toast.js';
import { t, locale } from '../i18n.js';

const ROLES = [
  ['director', 'Directores/as'],
  ['actor', 'Actores/actrices'],
  ['writer', 'Guionistas'],
];

const roleLabel = (r) => (r === 'director' ? 'directores/as' : 'actores/actrices');

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

  // ── seguimiento: la estrella vive aquí desde que el ranking duplicado de
  // Favoritos se retiró — misma semántica por faceta que tenía allí
  const [tracked, setTracked] = useState([]);
  const loadTracked = () => api('/tracked').then((r) => Array.isArray(r) && setTracked(r));
  useEffect(() => { loadTracked(); }, []);
  const followState = (id) => {
    if (role === 'writer') return null;
    const here = tracked.some((t) => t.id === id && (t.role || 'director') === role);
    if (here) return 'here';
    const other = tracked.find((t) => t.id === id && (t.role || 'director') !== role);
    return other ? 'elsewhere' : 'no';
  };
  const otherRoleOf = (id) => tracked.find((t) => t.id === id && (t.role || 'director') !== role)?.role;
  // the star reflects THIS facet only: adding here never touches the other
  // facet, so someone can be in directors AND actors at once (#Eastwood)
  const toggleFollow = async (p) => {
    const here = followState(p.id) === 'here';
    if (here) {
      setTracked((prev) => prev.filter((t) => !(t.id === p.id && (t.role || 'director') === role)));
      await api(`/tracked/${p.id}?role=${role}`, { method: 'DELETE' });
      toast(t('{name} fuera de {role}', { name: p.name, role: t(roleLabel(role)) }));
    } else {
      const r = await api(`/tracked/${p.id}`, { method: 'POST', body: { role } });
      const extra = r.directorAlso
        ? t(' · y a directores/as: dirige 4+ películas')
        : r.actorAlso
          ? t(' · y a actores/actrices: tiene 8+ interpretadas')
          : '';
      toast(t('⭐ {name} a {role}', { name: p.name, role: t(roleLabel(role)) }) + extra, 'success');
    }
    loadTracked();
  };

  // ── alta masiva top-N con previsualización (venía del ranking de Favoritos)
  const [topN, setTopN] = useState(10);
  const [preview, setPreview] = useState(null);
  const bulkAdd = async () => {
    const res = await api('/tracked/bulk', { method: 'POST', body: { role, top: Number(topN), preview: true } });
    if (res.error) return toast(`⚠️ ${res.error}`, 'error');
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
    if (res.ok) { toast(t('⭐ {n} añadidos a {role}', { n: res.added, role: t(roleLabel(role)) }), 'success'); loadTracked(); }
    else toast(`⚠️ ${res.error || 'error'}`, 'error');
  };

  const setFilter = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));

  return (
    <div>
      <PageHeader eyebrow={t('Tu gente')} title={t('Directores/as y actores/actrices')} />
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        {ROLES.map(([r, label]) => (
          <button
            key={r}
            onClick={() => setParams({ role: r })}
            className={role === r ? 'btn-gold' : 'btn-ghost'}
          >
            {t(label)}
          </button>
        ))}
        <input
          className="input !w-56 ml-2 max-sm:!w-full max-sm:ml-0"
          placeholder={t('Buscar nombre…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
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
      {role !== 'writer' && (
        <div className="flex flex-wrap gap-2 mb-5 items-center text-sm">
          <span className="text-xs text-zinc-500">
            {t('La ★ sigue a esa persona como {role} (Favoritos).', { role: role === 'director' ? t('director/a') : t('actor/actriz') })}
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
      )}

      {preview && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h3 className="font-semibold text-zinc-100 text-sm">
              {t('Vas a seguir a {sel} de {total} como {role}', { sel: preview.checked.size, total: preview.candidates.length, role: role === 'director' ? t('director/a') : t('actor/actriz') })}
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

      {!people ? (
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
                  follow={state && {
                    state,
                    onToggle: toggleFollow,
                    title:
                      state === 'here'
                        ? t('Quitar de {role}', { role: t(roleLabel(role)) })
                        : state === 'elsewhere'
                          ? t('Le sigues como {other}: seguirle TAMBIÉN como {role}', { other: otherRoleOf(p.id) === 'director' ? t('director/a') : t('actor/actriz'), role: role === 'director' ? t('director/a') : t('actor/actriz') })
                          : t('Seguir como {role}', { role: role === 'director' ? t('director/a') : t('actor/actriz') }),
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
