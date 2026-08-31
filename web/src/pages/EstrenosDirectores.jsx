import { useEffect, useMemo, useRef, useState } from 'react';
import { api, tmdbImg } from '../api.js';
import { Ticket, MonitorPlay, RotateCw, Search } from 'lucide-react';
import {
  EnlacePersona, ErrorBox, Empty, Select, BuildProgress, RadarrButton, useRadarrIds,
  MediaModal, Subpestanas,
} from '../components.jsx';
import { toast } from '../toast.js';
import { t, locale } from '../i18n.js';

/**
 * DIRECTORES QUE ESTRENAN EN ESPAÑA, mes a mes.
 *
 * La parrilla de Estrenos contesta «qué se estrena»; esto contesta «quién», que
 * es la pregunta con la que se decide ir al cine. Una ficha por director/a con
 * su estreno del mes, sus mejores películas anteriores y por dónde ha pasado
 * (Cannes, Venecia, los cánones), para que de un vistazo se sepa quién viene.
 */

const CANALES = [
  ['cine', 'Cines', Ticket],
  ['plataforma', 'Plataformas y VOD', MonitorPlay],
];
const CLAVES_CANAL = CANALES.map(([c]) => c);

const ORDENES = {
  peso: 'Los nombres primero',
  fecha: 'Por fecha del estreno',
  nombre: 'Por orden alfabético',
  tuyas: 'Por las que ya tienes',
};

const FAVORITOS = [
  ['', 'Todos'],
  ['si', 'Solo favoritos'],
  ['no', 'Los que no sigues'],
];

/** Sin tildes y en minúsculas: buscar «Almodovar» tiene que encontrar a Almodóvar. */
const pliega = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const leerCanales = () => {
  try {
    const guardado = JSON.parse(localStorage.getItem('dir_canales') || 'null');
    const limpio = Array.isArray(guardado) ? guardado.filter((c) => CLAVES_CANAL.includes(c)) : [];
    return limpio.length ? limpio : [...CLAVES_CANAL];
  } catch {
    return [...CLAVES_CANAL];
  }
};

function rotuloMes(m) {
  const nombre = new Date(m.año, m.mes - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

const fmtDia = (iso) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : t('sin fecha');

/** Dos nombres y «+N»: en una línea de ficha no cabe la lista entera. */
const resumen = (lista) => lista.slice(0, 2).join(' · ') + (lista.length > 2 ? ` +${lista.length - 2}` : '');

/** La primera fecha de sus estrenos del mes: es por la que se ordena «por fecha». */
const primeraFecha = (d) => d.estrenos.reduce((min, e) => (e.date && (!min || e.date < min) ? e.date : min), null) || '9999-99-99';

function Estreno({ e, radarrIds, addRadarrId }) {
  const [ficha, setFicha] = useState(false);
  const cartel = tmdbImg(e.poster_path, 'w92');
  return (
    <div className="flex gap-2.5 items-start">
      <button
        type="button"
        onClick={() => setFicha(true)}
        title={t('{title} — ver ficha', { title: e.title })}
        className="w-10 shrink-0 aspect-[2/3] rounded overflow-hidden bg-ink-800 cursor-pointer"
      >
        {cartel ? <img src={cartel} alt="" loading="lazy" className="w-full h-full object-cover" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-zinc-100 truncate" title={e.original_title ? `${e.title} · ${e.original_title}` : e.title}>
          {e.title}
        </div>
        <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 flex-wrap mt-0.5">
          <span className="tabular text-zinc-400">{fmtDia(e.date)}</span>
          {e.canales.map((c) => {
            const Icono = CANALES.find(([k]) => k === c)?.[2];
            return (
              <span key={c} className="badge-quiet inline-flex items-center gap-1">
                {Icono && <Icono size={11} strokeWidth={2} />} {t(CANALES.find(([k]) => k === c)[1])}
              </span>
            );
          })}
          {e.isDocumentary && <span className="badge-quiet">{t('Documental')}</span>}
          {e.owned && <span className="text-emerald-400" title={t('Ya está en tu Plex')}>●</span>}
        </div>
        {/* dónde se ve, cuando sale en digital: primero lo que ya tienes pagado
            y, si solo se alquila, el VOD con nombre y en tinta más apagada */}
        {(e.providers?.length > 0 || e.vod?.length > 0) && (
          <div
            className={`text-[11px] truncate mt-0.5 ${e.providers?.length ? 'text-zinc-400' : 'text-zinc-500'}`}
            title={[...(e.providers || []), ...(e.vod || []).map((v) => `${v} (${t('alquiler/compra')})`)].join(', ')}
          >
            {e.providers?.length ? resumen(e.providers) : `${t('VOD')}: ${resumen(e.vod)}`}
          </div>
        )}
        <div className="text-[11px] flex items-center gap-2 flex-wrap mt-0.5">
          {/* la Σ y la de IMDb van por separado: un estreno puede tener nota de
              IMDb y todavía ninguna Σ, y encadenarlas escondía las dos */}
          {e.mdb?.score > 0 && <span className="text-gold-400 tabular">Σ {e.mdb.score}</span>}
          {e.mdb?.imdb != null && <span className="text-zinc-400 tabular">IMDb {Number(e.mdb.imdb).toFixed(1)}</span>}
          {e.avales?.total > 0 && (
            <span className="text-zinc-400" title={t('En {n} palmareses o cánones', { n: e.avales.total })}>
              {e.avales.ganados > 0 ? '🏆' : '◆'} {e.avales.total}
            </span>
          )}
          {!e.owned && (
            <RadarrButton tmdbId={e.tmdb_id} small alreadyInRadarr={radarrIds.has(e.tmdb_id)} onAdded={addRadarrId} />
          )}
        </div>
      </div>
      {ficha && <MediaModal tmdbId={e.tmdb_id} onClose={() => setFicha(false)} />}
    </div>
  );
}

function FichaDirector({ d, radarrIds, addRadarrId, onSeguir, ocupado }) {
  const [fotoRota, setFotoRota] = useState(false);
  const foto = d.profile_path && !fotoRota ? tmdbImg(d.profile_path, 'w185') : null;
  // min-w-0: como celda de rejilla el card hereda min-width:auto y saca scroll
  // horizontal a la página en un móvil estrecho (ver Emergentes)
  return (
    <div className={`card p-3 min-w-0 ${d.favorito ? '!border-gold-400/50' : ''}`}>
      <div className="flex gap-3 items-start">
        <div className="w-11 h-11 rounded-full overflow-hidden bg-ink-800 shrink-0 flex items-center justify-center">
          {foto ? (
            <img src={foto} alt="" loading="lazy" onError={() => setFotoRota(true)} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm text-zinc-500">{d.name.slice(0, 1)}</span>
          )}
        </div>
        <button
          onClick={() => onSeguir(d)}
          disabled={ocupado}
          title={d.favorito ? t('Dejar de seguir a {nombre}', { nombre: d.name }) : t('Seguir a {nombre} como director/a', { nombre: d.name })}
          className={`btn-estrella !min-w-0 !min-h-0 mt-0.5 ${d.favorito ? 'text-gold-400' : 'text-zinc-600 hover:text-gold-400'}`}
        >
          {ocupado ? '…' : d.favorito ? '★' : '☆'}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <EnlacePersona nombre={d.name} personId={d.personId} tmdbId={d.tmdb_id} className="text-sm font-medium text-zinc-100" />
            {d.esOperaPrima && <span className="badge-quiet text-sky-300">{t('Ópera prima')}</span>}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {[
              // «títulos» y no «largos»: los créditos de TMDB no traen duración,
              // así que aquí van también sus cortos y no se pueden separar sin
              // una petición por película
              d.dirigidas === 1 ? t('un título antes') : d.dirigidas ? t('{n} títulos antes', { n: d.dirigidas }) : null,
              d.debut ? t('debut en {a}', { a: d.debut }) : null,
              d.enTuPlex === 1 ? t('tienes una suya') : d.enTuPlex ? t('tienes {n} suyas', { n: d.enTuPlex }) : null,
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <div className="mt-2.5 space-y-2.5 border-t border-ink-700 pt-2.5">
        {d.estrenos.map((e) => (
          <Estreno key={e.tmdb_id} e={e} radarrIds={radarrIds} addRadarrId={addRadarrId} />
        ))}
      </div>

      {/* POR DÓNDE HA PASADO. Es lo que separa el nombre que hay que apuntar del
          que no, y no se deduce de la nota del estreno: un estreno recién
          salido no tiene nota todavía. */}
      {d.palmares.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {d.palmares.map((p) => (
            <span key={p.key} className={`badge-quiet ${p.winner ? 'text-gold-400' : 'text-zinc-400'}`} title={p.winner ? t('ganadora') : t('seleccionada')}>
              {p.winner ? '🏆 ' : ''}{t(p.name)}
              {p.year ? <span className="text-zinc-600"> {p.year}</span> : null}
            </span>
          ))}
        </div>
      )}

      {d.mejores.length > 0 && (
        <div className="text-[11px] text-zinc-500 mt-2">
          {t('Antes:')}{' '}
          {d.mejores.map((m, i) => (
            <span key={m.tmdb_id}>
              {i > 0 && ' · '}
              <span className="text-zinc-300">{m.title}</span>
              {m.year ? ` (${m.year})` : ''}
              {m.vote ? <span className="text-zinc-600"> {Number(m.vote).toFixed(1)}</span> : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EstrenosDirectores() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refrescando, setRefrescando] = useState(false);
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [siguiendo, setSiguiendo] = useState(null); // tmdb_id en marcha

  const [canales, setCanalesState] = useState(leerCanales);
  const setCanales = (v) => { setCanalesState(v); localStorage.setItem('dir_canales', JSON.stringify(v)); };
  const [favs, setFavsState] = useState(() => localStorage.getItem('dir_favs') || '');
  const setFavs = (v) => { setFavsState(v); localStorage.setItem('dir_favs', v); };
  const [orden, setOrdenState] = useState(() => localStorage.getItem('dir_orden') || 'peso');
  const setOrden = (v) => { setOrdenState(v); localStorage.setItem('dir_orden', v); };
  const [soloPalmares, setSoloPalmaresState] = useState(() => localStorage.getItem('dir_palmares') === '1');
  const setSoloPalmares = (v) => { setSoloPalmaresState(v); localStorage.setItem('dir_palmares', v ? '1' : ''); };
  const [busca, setBusca] = useState('');

  const reqId = useRef(0);
  const cargar = (refresh = false) => {
    const id = ++reqId.current;
    setError(null);
    if (refresh) setRefrescando(true);
    else setData(null);
    api(`/estrenan${refresh ? '?refresh=1' : ''}`).then((r) => {
      if (id !== reqId.current) return;
      setRefrescando(false);
      if (r.error) return setError(r.error);
      setData(r);
    });
  };
  useEffect(() => { cargar(); }, []);

  // el canal es un filtro de dos casillas, pero apagar las dos no es un estado
  // útil: deja la página en blanco sin decir por qué. La última encendida no se apaga.
  const alternaCanal = (c) =>
    setCanales(canales.includes(c) ? (canales.length === 1 ? canales : canales.filter((x) => x !== c)) : [...canales, c]);

  const seguir = async (d) => {
    setSiguiendo(d.tmdb_id);
    const r = d.favorito && d.personId
      ? await api(`/tracked/${d.personId}?role=director`, { method: 'DELETE' })
      : await api('/tracked/tmdb', { method: 'POST', body: { tmdbId: d.tmdb_id, name: d.name, profilePath: d.profile_path, role: 'director' } });
    setSiguiendo(null);
    if (r.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    const ahora = !d.favorito;
    // se toca la copia en memoria, no se recarga: reconstruir la página entera
    // por una estrella son doce segundos de TMDB para no cambiar nada más
    setData((prev) => prev && {
      ...prev,
      meses: prev.meses.map((m) => ({
        ...m,
        favoritos: m.favoritos + (m.directores.some((x) => x.tmdb_id === d.tmdb_id) ? (ahora ? 1 : -1) : 0),
        directores: m.directores.map((x) =>
          x.tmdb_id === d.tmdb_id ? { ...x, favorito: ahora, personId: r.personId ?? x.personId } : x
        ),
      })),
    });
    toast(ahora ? t('★ Sigues a {nombre}', { nombre: d.name }) : t('☆ Ya no sigues a {nombre}', { nombre: d.name }));
  };

  const hayFiltros = canales.length !== CLAVES_CANAL.length || favs || soloPalmares || busca || orden !== 'peso';
  const limpiar = () => { setCanales([...CLAVES_CANAL]); setFavs(''); setSoloPalmares(false); setBusca(''); setOrden('peso'); };

  const q = pliega(busca);
  const visibles = useMemo(() => {
    const filtra = (mes) => {
      const out = [];
      for (const d of mes.directores) {
        const estrenos = d.estrenos.filter((e) => e.canales.some((c) => canales.includes(c)));
        if (!estrenos.length) continue;
        if (favs === 'si' && !d.favorito) continue;
        if (favs === 'no' && d.favorito) continue;
        if (soloPalmares && !d.palmares.length) continue;
        if (q && !pliega(d.name).includes(q)) continue;
        out.push({ ...d, estrenos });
      }
      if (orden === 'nombre') out.sort((a, b) => a.name.localeCompare(b.name));
      else if (orden === 'fecha') out.sort((a, b) => primeraFecha(a).localeCompare(primeraFecha(b)) || b.peso - a.peso);
      else if (orden === 'tuyas') out.sort((a, b) => b.enTuPlex - a.enTuPlex || b.peso - a.peso);
      else out.sort((a, b) => b.peso - a.peso || a.name.localeCompare(b.name));
      return out;
    };
    return new Map((data?.meses || []).map((m) => [m.clave, filtra(m)]));
  }, [data, canales, favs, soloPalmares, q, orden]);

  if (error) return <ErrorBox error={`${error}${t(' — comprueba la API key de TMDB en Ajustes.')}`} />;
  if (!data) {
    return (
      <BuildProgress
        job="directores"
        label={t('Mirando quién estrena en España en los próximos meses…')}
      />
    );
  }

  const pestanas = data.meses.map((m) => ({
    clave: m.clave,
    etiqueta: `${rotuloMes(m)} · ${(visibles.get(m.clave) || []).length}`,
    render: () => {
      const lista = visibles.get(m.clave) || [];
      const ocultos = m.total - lista.length;
      if (!lista.length) {
        return (
          <Empty>
            {!m.total
              ? t('TMDB no da todavía ningún estreno en España para este mes.')
              : m.total === 1
                ? t('El único de este mes no pasa tus filtros.')
                : t('Ninguno de los {n} de este mes pasa tus filtros.', { n: m.total })}
          </Empty>
        );
      }
      const estrenos = lista.reduce((s, d) => s + d.estrenos.length, 0);
      return (
        <>
          <p className="text-sm text-zinc-500 my-3">
            {lista.length === 1 ? t('un director/a') : t('{n} directores', { n: lista.length })}
            {' · '}
            {estrenos === 1 ? t('un estreno en España') : t('{p} estrenos en España', { p: estrenos })}
            {ocultos > 0 && <span> · {ocultos === 1 ? t('uno oculto por tus filtros') : t('{n} ocultos por tus filtros', { n: ocultos })}</span>}
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((d) => (
              <FichaDirector
                key={d.tmdb_id}
                d={d}
                radarrIds={radarrIds}
                addRadarrId={addRadarrId}
                onSeguir={seguir}
                ocupado={siguiendo === d.tmdb_id}
              />
            ))}
          </div>
        </>
      );
    },
  }));

  return (
    <div>
      <div className="card p-3 mb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs text-zinc-500">{t('Dónde estrena:')}</span>
          {CANALES.map(([clave, label, Icono]) => (
            <button
              key={clave}
              onClick={() => alternaCanal(clave)}
              title={canales.length === 1 && canales.includes(clave) ? t('Al menos un canal tiene que estar encendido') : ''}
              className={`chip inline-flex items-center gap-1.5 ${canales.includes(clave) ? 'chip-on' : ''}`}
            >
              <Icono size={13} strokeWidth={2} /> {t(label)}
            </button>
          ))}
          <span className="text-xs text-zinc-500 ml-2">{t('A quién:')}</span>
          {FAVORITOS.map(([v, label]) => (
            <button key={v || 'todos'} onClick={() => setFavs(v)} className={`chip ${favs === v ? 'chip-on' : ''}`}>
              {t(label)}
            </button>
          ))}
          <button
            onClick={() => setSoloPalmares(!soloPalmares)}
            title={t('Solo quien tiene algún premio o canon en su filmografía')}
            className={`chip ${soloPalmares ? 'chip-on' : ''}`}
          >
            🏆 {t('Con palmarés')}
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="relative">
            <Search size={13} strokeWidth={2} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              className="input !py-1 text-xs !pl-7 w-48"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t('Buscar por nombre')}
            />
          </label>
          <span className="text-xs text-zinc-500">{t('Ordenar:')}</span>
          <Select className="!py-1 text-xs" value={orden} onChange={setOrden}
            options={Object.entries(ORDENES).map(([k, label]) => [k, t(label)])} />
          {hayFiltros && <button className="btn-ghost !py-1 text-xs" onClick={limpiar}>{t('✕ Limpiar filtros')}</button>}
          <button
            className="btn-ghost !py-1 text-xs shrink-0 inline-flex items-center gap-1.5 ml-auto"
            onClick={() => cargar(true)}
            disabled={refrescando}
          >
            {refrescando ? t('Actualizando…') : <><RotateCw size={13} strokeWidth={2} /> {t('Actualizar')}</>}
          </button>
        </div>
      </div>

      <p className="text-sm text-zinc-500 mb-3">
        {t('Actualizado {date}.', { date: new Date(data.generatedAt).toLocaleString(locale()) })}
        {/* solo cuando faltan MESES enteros, no cuando lo que falló es la
            filmografía de una persona: eso es un hueco en su ficha, no una
            lista a medias, y decirlo así asustaba sin motivo */}
        {data.listaIncompleta && (
          <span className="text-orange-300"> · {t('TMDB cortó a mitad: lista incompleta, recarga en un rato')}</span>
        )}
      </p>

      <Subpestanas id="estrenan" param="mes" pestanas={pestanas} />
    </div>
  );
}
