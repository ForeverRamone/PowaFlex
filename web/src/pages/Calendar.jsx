import { useEffect, useState } from 'react';
import { addBulkToRadarr } from '../radarr.js';
import { Link } from 'react-router-dom';
import { api, tmdbImg, fmtDate } from '../api.js';
import { Plus, RotateCw, Ban } from 'lucide-react';
import {
  ErrorBox, RadarrButton, Empty, useRadarrIds, MediaModal, BuildProgress,
  useTypeFilters, matchesTypeFilters, TypeFilterBar, typeCounts, Select, EnlacePersona,
} from '../components.jsx';
import { toast } from '../toast.js';
import { t, locale } from '../i18n.js';

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(locale(), { month: 'long' })} ${y}`;
}

// tinta sobre el relleno de campo: los `bg-*-900` de Tailwind solo existen en
// los temas oscuros y quedaban como manchas sobre el papel de «Cartelera»
function typeBadges(ev) {
  const badges = [];
  if (ev.isShort) badges.push([t('Corto'), 'tag text-orange-300']);
  if (ev.isDocumentary) badges.push([t('Documental'), 'tag text-sky-300']);
  if (ev.isMusic) badges.push([t('Concierto'), 'tag text-yellow-500']);
  if (ev.isTvMovie) badges.push(['TV', 'tag text-red-400']);
  return badges;
}

/**
 * DIRECCIÓN O REPARTO: la separación que pedía esta página.
 *
 * No son lo mismo aunque el calendario los junte. Lo que dirige alguien a quien
 * sigues es lo que el pase automático puede bajar solo (las reglas de Radarr se
 * ponen por oficio, y la de dirección es la típica); lo que sale de un actor o
 * una actriz es exploración: se mira y se elige a mano. Mezclados en la misma
 * parrilla, lo segundo tapaba lo primero.
 *
 * El dato lo pone el SERVIDOR (`porDireccion`, tmdb.js) y no se puede deducir
 * de los créditos de la ficha: `people` lleva siempre al director real de la
 * película, la sigas o no, así que una película que entra por su actriz también
 * dice «Dirige Fulano» y por ahí se clasificaba mal.
 */
export const dirigeAlguien = (ev) => !!ev.porDireccion;

const FACETAS = [
  ['todo', 'Dirección y reparto'],
  ['direccion', 'Solo dirección'],
  ['reparto', 'Solo reparto y otros oficios'],
];

function FacetBadge({ ev }) {
  const dirige = dirigeAlguien(ev);
  return (
    <span
      className={`badge-quiet ml-1.5 align-middle ${dirige ? 'text-gold-400' : 'text-sky-300'}`}
      title={`${dirige
        ? t('Sale de alguien a quien sigues como director/a: es lo que el pase automático puede bajar solo')
        : t('Sale de alguien a quien sigues por otro oficio: aquí eliges tú qué mandar a Radarr')}${
        ev.porQuien?.length ? ` — ${ev.porQuien.join(' · ')}` : ''}`}
    >
      {dirige ? t('dirección') : t('reparto')}
    </span>
  );
}

function EventCard({ ev, radarrIds, onAdded, vetada, onToggleVeto }) {
  const img = tmdbImg(ev.poster_path, 'w185');
  const [ficha, setFicha] = useState(false);
  return (
    <div className="card p-3 flex gap-3">
      <button
        type="button"
        onClick={() => setFicha(true)}
        className="w-20 shrink-0 aspect-[2/3] rounded overflow-hidden bg-ink-800 cursor-pointer hover:ring-2 hover:ring-gold-400"
        title={t('Ver ficha')}
      >
        {img ? <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" /> : null}
      </button>
      {ficha && <MediaModal tmdbId={ev.tmdb_id} onClose={() => setFicha(false)} />}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-zinc-100 text-sm">
          {ev.title}
          <FacetBadge ev={ev} />
          {typeBadges(ev).map(([label, cls]) => (
            <span key={label} className={`badge-quiet ml-1.5 align-middle ${cls}`}>
              {label}
            </span>
          ))}
        </div>
        {ev.original_title !== ev.title && (
          <div className="text-xs text-zinc-500 italic">{ev.original_title}</div>
        )}
        <div className="text-xs text-gold-400 mt-1">
          {ev.date ? fmtDate(ev.date) : t('Fecha por anunciar')}
          {ev.runtime ? <span className="text-zinc-500"> · {ev.runtime} min</span> : null}
        </div>
        <div className="text-xs text-zinc-400 mt-1">
          {ev.people.map((p, i) => (
            <span key={`${p.id ?? p.name}-${p.credit}`}>
              {i > 0 && ' · '}
              {t(p.credit)}{' '}
              {/* clicable aunque no tenga id local: /personas/:ref resuelve
                  por nombre AL PULSAR, como en Festivales */}
              <EnlacePersona
                nombre={p.name}
                personId={p.id}
                role={p.credit === 'Dirige' ? 'director' : 'actor'}
                className="text-zinc-200"
              />
            </span>
          ))}
        </div>
        {ev.overview && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{ev.overview}</p>}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {ev.inLibrary ? (
            <span className="text-emerald-400 text-xs">{t('✓ Ya en tu biblioteca')}</span>
          ) : (
            <RadarrButton tmdbId={ev.tmdb_id} small alreadyInRadarr={radarrIds.has(ev.tmdb_id)} onAdded={onAdded} />
          )}
          {/* el veto solo tiene sentido en lo que el robot podría coger: lo que
              ya tienes en Plex no lo mira nadie */}
          {!ev.inLibrary && (
            vetada ? (
              <span className="text-xs text-zinc-500 inline-flex items-center gap-1">
                <Ban size={12} strokeWidth={2} /> {t('El automático la ignora')}
                <button className="text-gold-400 hover:underline ml-1" onClick={() => onToggleVeto(ev, false)}>
                  {t('deshacer')}
                </button>
              </span>
            ) : (
              <button
                className="text-xs text-zinc-500 hover:text-red-400 inline-flex items-center gap-1"
                title={t('Que el pase automático de Radarr no la coja. Se sigue viendo aquí y puedes añadirla a mano.')}
                onClick={() => onToggleVeto(ev, true)}
              >
                <Ban size={12} strokeWidth={2} /> {t('Fuera del automático')}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function Calendar() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [radarrIds, addRadarrId] = useRadarrIds();
  // same persisted filters as Descubrir/fichas: decide "sin cortos" once, applies everywhere
  const [show, toggleFilter, resetTypes] = useTypeFilters();
  // el horizonte sobrevive a la navegación hasta pulsar «Limpiar filtros»
  const [horizon, setHorizonState] = useState(() => localStorage.getItem('cal_horizon') || '6');
  const setHorizon = (v) => { setHorizonState(v); localStorage.setItem('cal_horizon', v); };
  // dirección / reparto: ver `dirigeAlguien`. Sobrevive a la navegación, como
  // el horizonte, y vuelve a «todo» con «Limpiar filtros».
  const [faceta, setFacetaState] = useState(() => localStorage.getItem('cal_faceta') || 'todo');
  const setFaceta = (v) => { setFacetaState(v); localStorage.setItem('cal_faceta', v); };
  const [bulk, setBulk] = useState({ running: false, summary: null });
  // vetadas al pase automático: se pintan apagadas y el añadido masivo las salta
  const [vetadas, setVetadas] = useState(new Set());
  useEffect(() => {
    api('/radarr/auto/veto').then((r) => Array.isArray(r) && setVetadas(new Set(r.map((v) => v.tmdb_id))));
  }, []);
  const toggleVeto = async (ev, veto) => {
    // optimista: la ficha responde al instante y se revierte si el servidor falla
    setVetadas((prev) => { const n = new Set(prev); veto ? n.add(ev.tmdb_id) : n.delete(ev.tmdb_id); return n; });
    const r = veto
      ? await api('/radarr/auto/veto', { method: 'POST', body: { tmdbId: ev.tmdb_id, title: ev.title } })
      : await api(`/radarr/auto/veto/${ev.tmdb_id}`, { method: 'DELETE' });
    if (r?.error) {
      setVetadas((prev) => { const n = new Set(prev); veto ? n.delete(ev.tmdb_id) : n.add(ev.tmdb_id); return n; });
      return toast(t('⚠️ No se ha podido guardar: {error}', { error: r.error }), 'error');
    }
    toast(veto
      ? t('🚫 «{title}» queda fuera del pase automático', { title: ev.title })
      : t('↩︎ «{title}» vuelve al pase automático', { title: ev.title }));
  };

  const load = (refresh = false) => {
    setError(null);
    if (refresh) setRefreshing(true);
    else setData(null);
    api(`/calendar${refresh ? '?refresh=1' : ''}`).then((d) => {
      setRefreshing(false);
      if (d.error) setError(d.error);
      else setData(d);
    });
  };

  useEffect(() => {
    load();
  }, []);

  if (error)
    return (
      <div>
        <h1 className="font-display text-3xl md:text-4xl text-zinc-100 leading-tight">{t('Cine venidero')}</h1>
        <ErrorBox error={`${error}${t(' — comprueba la API key de TMDB en Ajustes.')}`} />
      </div>
    );
  if (!data) return <BuildProgress label={t('Construyendo el calendario desde TMDB (la primera vez tarda un poco)…')} />;

  const today = data.today;

  // las siete claves contadas siempre (typeCounts, components.jsx): omitir una
  // pintaba su chip sin recuento en vez de esconderlo
  const counts = typeCounts(data.events);
  const pasaFaceta = (e) =>
    faceta === 'todo' || (faceta === 'direccion' ? dirigeAlguien(e) : !dirigeAlguien(e));
  const porTipo = data.events.filter((e) => matchesTypeFilters(e, show));
  const visible = porTipo.filter(pasaFaceta);
  // «ocultas por tus filtros» habla SOLO del filtro de tipo: lo que quita la
  // faceta ya se lee en sus propios botones, que llevan el recuento puesto
  const hiddenCount = data.events.length - porTipo.length;
  // los recuentos de las dos facetas, para que los botones digan cuánto hay
  const nDireccion = porTipo.filter(dirigeAlguien).length;
  const nReparto = porTipo.length - nDireccion;

  const upcoming = visible.filter((e) => e.date && e.date >= today);
  const recent = visible.filter((e) => e.date && e.date < today);
  const undated = visible.filter((e) => !e.date);

  // bulk add: visible upcoming within horizon, not yet owned/queued
  const horizonEnd = (() => {
    if (horizon === 'all') return '9999-12-31';
    const d = new Date(today);
    d.setMonth(d.getMonth() + Number(horizon));
    return d.toISOString().slice(0, 10);
  })();
  // pending = not owned and not already in Radarr; eligible = pending within the horizon.
  // Las vetadas quedan fuera también aquí: pediste que el automático no las
  // cogiera, y mandarlas en bloque sería colarlas por la puerta de al lado.
  const pending = [...upcoming, ...undated].filter(
    (e) => !e.inLibrary && !radarrIds.has(e.tmdb_id) && !vetadas.has(e.tmdb_id)
  );
  const eligible = pending.filter((e) => (horizon === 'all' ? true : e.date && e.date <= horizonEnd));
  const beyondHorizon = pending.length - eligible.length;

  const bulkAdd = async () => {
    setBulk({ running: true, summary: null });
    // el resumen se enseña aquí al lado, no en un toast
    const { summary } = await addBulkToRadarr(eligible.map((e) => e.tmdb_id), { onAdded: addRadarrId });
    setBulk({ running: false, summary });
  };

  const byMonth = new Map();
  for (const ev of upcoming) {
    const ym = ev.date.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(ev);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 className="font-display text-3xl md:text-4xl text-zinc-100 leading-tight">{t('Cine venidero')}</h1>
        <button className="btn-ghost inline-flex items-center gap-2" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? t('Actualizando…') : <><RotateCw size={14} strokeWidth={2} /> {t('Actualizar desde TMDB')}</>}
        </button>
      </div>
      <p className="text-sm text-zinc-500 mb-6">
        {t('Estrenos próximos y proyectos anunciados de los {n} directores/actores vigilados: el top automático de tu biblioteca más tus ', { n: data.peopleCount })}
        <Link to="/favoritos" className="text-gold-400 hover:underline">{t('favoritos')}</Link>
        {t('. Generado {date}.', { date: new Date(data.generatedAt).toLocaleString(locale()) })}
      </p>

      {/* La separación que faltaba: qué viene de tu gente de DIRECCIÓN (lo que
          el pase automático puede bajar solo) y qué viene del reparto y de los
          demás oficios, que es exploración y se elige a mano. */}
      <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap text-sm">
        <span className="text-xs text-zinc-500">{t('Por quién:')}</span>
        {FACETAS.map(([v, label]) => (
          <button
            key={v}
            onClick={() => setFaceta(v)}
            className={`btn-ghost !py-1 text-xs ${faceta === v ? '!border-gold-400 text-gold-400' : ''}`}
          >
            {t(label)}
            <span className="text-zinc-600">
              {' '}{v === 'todo' ? porTipo.length : v === 'direccion' ? nDireccion : nReparto}
            </span>
          </button>
        ))}
        <span className="text-xs text-zinc-600">
          {t('El pase automático solo baja lo de los oficios que tengas puestos en una regla —')}
          <Link to="/ajustes?tab=automatismos" className="text-gold-400 hover:underline">{t('Automatismos')}</Link>
          {t('—; el reparto se elige a mano.')}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <TypeFilterBar show={show} toggle={toggleFilter} counts={counts} />
        <button className="btn-ghost !py-1 text-xs" onClick={() => { resetTypes(); setHorizon('6'); setFaceta('todo'); }}>
          {t('✕ Limpiar filtros')}
        </button>
      </div>
      {hiddenCount > 0 && (
        <p className="text-xs text-zinc-500 mt-1 mb-6">{t('{n} ocultas por tus filtros — solo cine largometraje', { n: hiddenCount })}</p>
      )}

      <div className="card p-3 mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-400">{t('Monitorizar en bloque lo visible de los próximos')}</span>
        <Select className="!py-1" value={horizon} onChange={setHorizon}
          options={[['3', t('3 meses')], ['6', t('6 meses')], ['12', t('12 meses')], ['24', t('2 años')], ['all', t('todo (incl. sin fecha)')]]} />
        <button className="btn-gold !py-1.5 inline-flex items-center gap-2" onClick={bulkAdd} disabled={bulk.running || eligible.length === 0}>
          {bulk.running ? t('Añadiendo…') : <><Plus size={14} strokeWidth={2.5} /> {t('Añadir {n} a Radarr', { n: eligible.length })}</>}
        </button>
        {bulk.summary && <span className="text-xs text-emerald-400">{bulk.summary}</span>}
        {!bulk.running && !bulk.summary && beyondHorizon > 0 && (
          <span className="text-xs text-zinc-500">
            {t('({n} más pendientes fuera de ese plazo — amplía el horizonte para incluirlas)', { n: beyondHorizon })}
          </span>
        )}
        {!bulk.running && eligible.length === 0 && beyondHorizon === 0 && !bulk.summary && (
          <span className="text-xs text-zinc-500">{t('Nada pendiente en ese plazo: todo está en tu Plex o en Radarr.')}</span>
        )}
      </div>

      {data.errors?.length > 0 && data.events.length === 0 && (
        <ErrorBox error={t('No se pudo consultar TMDB: {error} — revisa Ajustes y pulsa «Actualizar desde TMDB».', { error: data.errors[0].split(': ').slice(1).join(': ') })} />
      )}
      {upcoming.length === 0 && undated.length === 0 && data.events.length === 0 && data.errors?.length === 0 && (
        <Empty>{t('No hay estrenos próximos registrados en TMDB.')}</Empty>
      )}

      {[...byMonth.entries()].map(([ym, evs]) => (
        <section key={ym} className="mb-8">
          <h2 className="text-lg font-semibold text-gold-400 mb-3 capitalize">{monthLabel(ym)}</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {evs.map((ev) => <EventCard key={ev.tmdb_id} ev={ev} radarrIds={radarrIds} onAdded={addRadarrId} vetada={vetadas.has(ev.tmdb_id)} onToggleVeto={toggleVeto} />)}
          </div>
        </section>
      ))}

      {undated.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-sky-300 mb-3">{t('Anunciadas, sin fecha')}</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {undated.map((ev) => <EventCard key={ev.tmdb_id} ev={ev} radarrIds={radarrIds} onAdded={addRadarrId} vetada={vetadas.has(ev.tmdb_id)} onToggleVeto={toggleVeto} />)}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-400 mb-3">{t('Estrenadas recientemente (últimos 60 días)')}</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {recent.reverse().map((ev) => <EventCard key={ev.tmdb_id} ev={ev} radarrIds={radarrIds} onAdded={addRadarrId} vetada={vetadas.has(ev.tmdb_id)} onToggleVeto={toggleVeto} />)}
          </div>
        </section>
      )}
    </div>
  );
}
