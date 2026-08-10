import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import { Spinner, Empty, PageHeader, ErrorBox, Select, SortSelect, EnlacePersona } from '../components.jsx';
import { toast } from '../toast.js';
import { t, locale } from '../i18n.js';

/**
 * DIRECTORES EMERGENTES: quién puede ser un grande dentro de diez años.
 *
 * La lista sale de las tablas de selección oficial que PowaFlex ya tiene
 * cacheadas —incluidas las cinco secciones de debut, que es donde de verdad
 * estrena quien empieza— y se puntúa de 0 a 100 con cinco señales.
 *
 * LO IMPORTANTE DE ESTA PÁGINA es el desglose. Un número sin explicación es un
 * oráculo, y de un oráculo no te fías: cada ficha dice con qué datos puntuó y
 * qué señales le faltaban. El servidor manda el desglose ESTRUCTURADO y las
 * frases se componen aquí, para que se lea igual de bien en inglés.
 */

const NOMBRE_SENAL = {
  institucional: 'Consagración',
  critica: 'Crítica',
  traccion: 'Tracción',
  aceleracion: 'Aceleración',
  afinidad: 'Afinidad contigo',
};

// los mismos nombres que la página de Festivales, para no inventar un segundo
// vocabulario que luego se traduzca distinto
const NOMBRE_FESTIVAL = {
  cannes: 'Cannes',
  venecia: 'Venecia',
  berlinale: 'Berlinale',
  sansebastian: 'San Sebastián',
  sundance: 'Sundance',
  sundanceus: 'Sundance · Competición de EE UU',
  tiff: 'Toronto (TIFF)',
  busan: 'Busan (BIFF)',
  horizontes: 'S.S. · Horizontes Latinos',
  uncertainregard: 'Cannes · Un Certain Regard',
  semaine: 'Cannes · Semana de la Crítica',
  quinzaine: 'Cannes · Quincena',
  orizzonti: 'Venecia · Orizzonti',
  perspectives: 'Berlinale · Perspectives',
  ssnuevos: 'S.S. · Nuevos Directores',
};

const ORDENES = {
  puntuacion: { label: 'Puntuación', fn: (a, b) => b.score - a.score },
  reciente: { label: 'Debut más reciente', fn: (a, b) => (b.first_year ?? 0) - (a.first_year ?? 0) },
  primeriza: { label: 'Menos películas', fn: (a, b) => (a.features ?? 9) - (b.features ?? 9) },
  alfabetico: { label: 'Nombre (A-Z)', fn: (a, b) => a.name.localeCompare(b.name, 'es') },
};

const VACIO = { continente: '', pais: '', sexo: '', pendientes: false };

/** El desglose de una señal, en una frase. Se compone aquí, nunca en el servidor. */
function textoSenal(d) {
  const x = d.detalle || {};
  if (d.clave === 'institucional') {
    const ap = (x.apariciones || []).slice(0, 3)
      .map((a) => `${t(NOMBRE_FESTIVAL[a.festival] || a.festival)} ${a.year}${a.winner ? ' 🏆' : ''}`)
      .join(' · ');
    return ap || t('sin detalle');
  }
  if (d.clave === 'critica') {
    const f = x.mejor?.fuente;
    const nombre = f === 'metacritic' ? 'Metacritic' : f === 'rt_critic' ? 'RT crítica' : 'Σ';
    return t('{fuente} {n} de media', { fuente: nombre, n: x.media });
  }
  if (d.clave === 'traccion') {
    return t('Letterboxd {nota} con {marcas} marcas', {
      nota: Number(x.letterboxd || 0).toLocaleString(locale(), { minimumFractionDigits: 1 }),
      marcas: Number(x.marcas || 0).toLocaleString(locale()),
    });
  }
  if (d.clave === 'aceleracion') {
    const nombres = { nota: t('nota'), volumen: t('volumen'), festival: t('nivel de festival') };
    const sube = (x.sube || []).map((k) => nombres[k] || k).join(', ');
    const baja = (x.baja || []).map((k) => nombres[k] || k).join(', ');
    if (sube && baja) return t('sube en {sube}, baja en {baja}', { sube, baja });
    if (sube) return t('su última sube en {sube}', { sube });
    return t('su última baja en {baja}', { baja });
  }
  if (d.clave === 'afinidad') {
    const nota = (n) => Number(n || 0).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    return t('puntúas ese cine {media} frente a tu media de {tuya}', { media: nota(x.media), tuya: nota(x.tuya) });
  }
  return '';
}

function Ficha({ d, onFollow, onDescartar, busy }) {
  const [abierto, setAbierto] = useState(false);
  const [fotoRota, setFotoRota] = useState(false);
  const foto = d.profile_path && !fotoRota ? tmdbImg(d.profile_path, 'w185') : null;

  return (
    <div className={`card p-3 ${d.tracked ? '!border-gold-400/50' : ''}`}>
      <div className="flex gap-3 items-start">
        <div className="w-11 h-11 rounded-full overflow-hidden bg-ink-800 shrink-0 flex items-center justify-center">
          {foto ? (
            <img src={foto} alt="" loading="lazy" onError={() => setFotoRota(true)} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm text-zinc-500">{d.name.slice(0, 1)}</span>
          )}
        </div>
        <button
          onClick={() => !d.tracked && onFollow(d)}
          disabled={d.tracked || busy}
          title={d.tracked ? t('Ya le sigues como director/a') : t('Seguir a {nombre} como director/a', { nombre: d.name })}
          className={`text-lg leading-none shrink-0 mt-0.5 cursor-pointer disabled:cursor-default ${
            d.tracked ? 'text-gold-400' : 'text-zinc-600 hover:text-gold-400'
          }`}
        >
          {d.tracked ? '★' : busy ? '…' : '☆'}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            {/* el detector ya verificó su ficha de TMDB: se enlaza por id */}
            <EnlacePersona nombre={d.name} tmdbId={d.tmdb_id} className="text-sm font-medium text-zinc-100" />
            <span className="text-sm text-gold-400 tabular" title={t('Puntuación del detector (0–100)')}>
              {d.score}
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {[
              d.country,
              // «1 largos» es justo lo que delata una lista generada: aquí casi
              // todo el mundo tiene uno o dos, así que el singular importa
              d.features === 1 ? t('un largo') : d.features ? t('{n} largos', { n: d.features }) : null,
              d.first_year ? t('debut en {a}', { a: d.first_year }) : null,
            ].filter(Boolean).join(' · ')}
          </div>
          {d.last_title && (
            <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
              {t('Lo último:')} <span className="text-zinc-300">{d.last_title}</span>
              {d.last_year ? ` (${d.last_year})` : ''}
            </div>
          )}
        </div>

        <button
          onClick={() => onDescartar(d)}
          title={t('No me interesa: fuera de la lista, y no vuelve en la próxima reconstrucción')}
          className="text-xs text-zinc-600 hover:text-red-400 shrink-0"
        >
          ✕
        </button>
      </div>

      {/* EL DESGLOSE. Sin esto la puntuación es un oráculo. */}
      <button
        className="text-[11px] text-zinc-500 hover:text-gold-400 mt-2"
        onClick={() => setAbierto((v) => !v)}
      >
        {abierto ? t('▾ Por qué esta puntuación') : t('▸ Por qué esta puntuación')}
      </button>
      {abierto && (
        <div className="mt-2 space-y-1 border-t border-ink-700 pt-2">
          {d.desglose.map((s) => (
            <div key={s.clave} className="flex items-baseline gap-2 text-[11px]">
              <span className="text-gold-400 tabular w-8 shrink-0 text-right">{s.puntos}</span>
              <span className="text-zinc-300 w-28 shrink-0 truncate">{t(NOMBRE_SENAL[s.clave] || s.clave)}</span>
              <span className="text-zinc-500 min-w-0">{textoSenal(s)}</span>
            </div>
          ))}
          {d.ausentes?.length > 0 && (
            // «sin dato ≠ cero»: decirlo es parte de que te puedas fiar del número
            <div className="text-[11px] text-zinc-600 pt-1">
              {t('Sin datos (no puntúan ni penalizan): {lista}', {
                lista: d.ausentes.map((k) => t(NOMBRE_SENAL[k] || k)).join(', '),
              })}
            </div>
          )}
          {d.pelis?.length > 0 && (
            <div className="text-[11px] text-zinc-500 pt-1">
              {d.pelis.map((p) => `${p.title}${p.year ? ` (${p.year})` : ''}`).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Emergentes() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [corriendo, setCorriendo] = useState(false);
  const [q, setQ] = useState('');
  const [orden, setOrden] = useState(() => localStorage.getItem('emerg_sort') || 'puntuacion');
  const [f, setF] = useState(() => {
    try {
      return { ...VACIO, ...JSON.parse(localStorage.getItem('emerg_filters') || '{}') };
    } catch {
      return { ...VACIO };
    }
  });
  useEffect(() => { localStorage.setItem('emerg_filters', JSON.stringify(f)); }, [f]);

  const cargar = () => api('/emergentes').then((r) => (r.error ? setError(r.error) : setData(r)));
  useEffect(() => { cargar(); }, []);

  // mientras el detector corre, la página se refresca sola: la pasada dura
  // minutos y quedarse mirando una lista vieja parece que no hace nada
  useEffect(() => {
    if (!corriendo) return;
    const id = setInterval(async () => {
      const s = await api('/emergentes/status');
      if (s && !s.running) {
        setCorriendo(false);
        cargar();
        if (s.error) toast(`⚠️ ${s.error}`, 'error');
        else toast(t('Detección terminada: {n} emergentes', { n: s.elegidos }), 'info');
      }
    }, 4000);
    return () => clearInterval(id);
  }, [corriendo]);

  const todos = data?.directors || [];

  const opciones = useMemo(() => {
    const cuenta = (campo, lista) => {
      const m = new Map();
      for (const d of lista) if (d[campo]) m.set(d[campo], (m.get(d[campo]) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
    };
    const enCont = f.continente ? todos.filter((d) => d.continent === f.continente) : todos;
    return {
      continentes: cuenta('continent', todos).map(([c, n]) => [c, `${t(c)} (${n})`]),
      paises: cuenta('country', enCont).map(([p, n]) => [p, `${p} (${n})`]),
    };
  }, [todos, f.continente]);

  const filtrados = useMemo(() => {
    const termino = q.trim().toLowerCase();
    return todos
      .filter((d) => {
        if (f.continente && d.continent !== f.continente) return false;
        if (f.pais && d.country !== f.pais) return false;
        if (f.sexo === 'mujer' && d.gender !== 1) return false;
        if (f.sexo === 'hombre' && d.gender !== 2) return false;
        if (f.pendientes && d.tracked) return false;
        if (termino && !d.name.toLowerCase().includes(termino) && !(d.country || '').toLowerCase().includes(termino)) return false;
        return true;
      })
      .sort(ORDENES[orden]?.fn || ORDENES.puntuacion.fn);
  }, [todos, f, q, orden]);

  const seguir = async (d) => {
    setBusy(d.name_key);
    const r = await api(`/emergentes/${encodeURIComponent(d.name_key)}/follow`, { method: 'POST' });
    setBusy(null);
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    setData((prev) => ({
      ...prev,
      directors: prev.directors.map((x) => (x.name_key === d.name_key ? { ...x, tracked: true } : x)),
    }));
    toast(t('⭐ {nombre} en favoritos (directores/as)', { nombre: d.name }), 'success');
  };

  const descartar = async (d) => {
    const r = await api(`/emergentes/${encodeURIComponent(d.name_key)}`, { method: 'DELETE' });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    setData((prev) => ({ ...prev, directors: prev.directors.filter((x) => x.name_key !== d.name_key) }));
    toast(t('✕ {nombre} fuera de la lista', { nombre: d.name }), 'info', {
      label: t('Deshacer'),
      onClick: async () => {
        await api(`/emergentes/${encodeURIComponent(d.name_key)}/restore`, { method: 'POST' });
        cargar();
      },
    });
  };

  const detectar = async () => {
    const r = await api('/emergentes/run', { method: 'POST' });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    setCorriendo(true);
    toast(t('Detección en marcha: tarda unos minutos'), 'info');
  };

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner label={t('Cargando emergentes…')} />;

  const hayFiltros = q.trim() || orden !== 'puntuacion' || Object.values(f).some(Boolean);
  const limpiar = () => { setQ(''); setF({ ...VACIO }); setOrden('puntuacion'); localStorage.setItem('emerg_sort', 'puntuacion'); };

  return (
    <div>
      <PageHeader
        eyebrow={t('La caza')}
        title={t('Directores emergentes')}
        subtitle={t('Quién puede ser un grande dentro de diez años. Sale de las tablas de selección oficial que PowaFlex ya tiene cacheadas —con las cinco secciones de debut, que es donde de verdad estrena quien empieza— y se puntúa de 0 a 100. Cada ficha enseña con qué datos puntuó.')}
      />

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          className="input !w-64 max-sm:!w-full"
          placeholder={t('Buscar nombre o país…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={f.continente} onChange={(v) => setF((p) => ({ ...p, continente: v, pais: '' }))}
          placeholder={t('Continente')} options={opciones.continentes} />
        <Select value={f.pais} onChange={(v) => setF((p) => ({ ...p, pais: v }))}
          placeholder={t('País')} options={opciones.paises} />
        {/* mismo placeholder y etiquetas en singular que el resto de filtros de
            persona; los VALORES ('mujer'/'hombre') son de los datos y no se tocan */}
        <Select value={f.sexo} onChange={(v) => setF((p) => ({ ...p, sexo: v }))}
          placeholder={t('Género||persona')} options={[['mujer', t('Mujer')], ['hombre', t('Hombre')]]} />
        <button
          className={`chip ${f.pendientes ? 'chip-on' : ''}`}
          onClick={() => setF((p) => ({ ...p, pendientes: !p.pendientes }))}
          title={t('Esconde a quien ya sigues como director/a')}
        >
          {t('☆ Solo los que no sigo')}
        </button>
        {hayFiltros && <button className="btn-ghost" onClick={limpiar}>{t('✕ Limpiar filtros')}</button>}
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        {/* SortSelect trae el rótulo «Ordenar:» común */}
        <SortSelect
          value={orden}
          onChange={(v) => { setOrden(v); localStorage.setItem('emerg_sort', v); }}
          options={Object.entries(ORDENES).map(([k, o]) => [k, t(o.label)])}
        />
        <span className="text-xs text-zinc-400 tabular">
          {filtrados.length} {t('de')} {todos.length}
        </span>
        <button className="btn-ghost !py-1 text-xs ml-auto" disabled={corriendo || data.status?.running} onClick={detectar}>
          {corriendo || data.status?.running ? t('Detectando…') : t('Volver a detectar')}
        </button>
      </div>

      {(corriendo || data.status?.running) && data.status?.paso && (
        <p className="text-[11px] text-zinc-500 mb-3">
          {data.status.paso} · {t('{n} mirados de {c} candidatos', { n: data.status.mirados, c: data.status.candidatos })}
        </p>
      )}

      {todos.length === 0 ? (
        <Empty>
          {t('Todavía no hay lista: el detector se reconstruye una vez por semana en el pase nocturno.')}{' '}
          <button className="text-gold-400 hover:underline" onClick={detectar}>{t('Detectar ahora')}</button>
        </Empty>
      ) : filtrados.length === 0 ? (
        <Empty>
          {t('Nadie con esos filtros.')} <button className="text-gold-400 hover:underline" onClick={limpiar}>{t('Limpiar')}</button>
        </Empty>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {filtrados.map((d) => (
            <Ficha key={d.name_key} d={d} busy={busy === d.name_key} onFollow={seguir} onDescartar={descartar} />
          ))}
        </div>
      )}

      <div className="text-[11px] text-zinc-600 mt-8 max-w-3xl leading-relaxed space-y-1">
        <p>
          {t('Cinco señales, con estos pesos: consagración institucional {i}, consenso crítico {c}, tracción real {tr}, aceleración {a} y afinidad contigo {af}. La señal que no tiene datos NO puntúa cero: sale del reparto y las demás se reparten su peso, para que un debut sin Metacritic no quede por detrás de una película mediana solo porque de la mediana haya más datos.', {
            i: data.pesos.institucional, c: data.pesos.critica, tr: data.pesos.traccion,
            a: data.pesos.aceleracion, af: data.pesos.afinidad,
          })}
        </p>
        <p>
          {data.generatedAt
            ? t('Última detección: {d} · {n} ediciones leídas.', {
                d: new Date(data.generatedAt).toLocaleString(locale()),
                n: data.ediciones || 0,
              })
            : t('Sin detección todavía.')}{' '}
          {t('Lo que sigas aquí alimenta')}{' '}
          <Link to="/calendario" className="text-gold-400 hover:underline">{t('Cine venidero')}</Link> {t('y')}{' '}
          <Link to="/descubrir" className="text-gold-400 hover:underline">{t('Descubrir huecos')}</Link>.
        </p>
      </div>
    </div>
  );
}
