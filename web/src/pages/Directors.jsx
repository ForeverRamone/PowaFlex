import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, tmdbImg } from '../api.js';
import { Spinner, Empty, PageHeader, ErrorBox, Select } from '../components.jsx';
import { toast } from '../toast.js';

/**
 * El catálogo de directores en activo: 680 nombres de Wikidata con su
 * importancia, su obra y sus premios, para elegir a quién seguir. Una sola
 * lista: aquí no hay directores de primera y de segunda según de qué hoja del
 * análisis vinieran.
 *
 * Sustituye a los cuatro paquetes escritos a mano que había en Favoritos
 * («españoles», «premiados», «emergentes», «taquilleros»): eran veinte nombres
 * fijos cada uno, y cualquiera de esas cuatro ideas se saca ahora de aquí con
 * un filtro y un orden, sobre datos de verdad.
 *
 * Todo el filtrado y la ordenación pasan en el navegador: son 680 filas, y así
 * mover un control responde al instante en vez de esperar al servidor.
 */

const ORDENES = {
  importancia: { label: 'Importancia', fn: (a, b) => (b.importance ?? -1) - (a.importance ?? -1) },
  prestigio: { label: 'Prestigio (premios y crítica)', fn: (a, b) => (b.prestige ?? -1) - (a.prestige ?? -1) },
  impacto: { label: 'Impacto (notoriedad y éxito)', fn: (a, b) => (b.impact ?? -1) - (a.impact ?? -1) },
  prolificos: { label: 'Más prolíficos', fn: (a, b) => (b.features || 0) - (a.features || 0) },
  taquilla: { label: 'Más taquilleros', fn: (a, b) => (b.boxOffice ?? -1) - (a.boxOffice ?? -1) },
  jovenes: { label: 'Más jóvenes', fn: (a, b) => (a.age ?? 999) - (b.age ?? 999) },
  veteranos: { label: 'Más veteranos', fn: (a, b) => (b.age ?? -1) - (a.age ?? -1) },
  debut: { label: 'Debut más reciente', fn: (a, b) => (b.first ?? -1) - (a.first ?? -1) },
  reciente: { label: 'Último estreno más reciente', fn: (a, b) => (b.last ?? -1) - (a.last ?? -1) },
  alfabetico: { label: 'Alfabético (A–Z)', fn: (a, b) => a.name.localeCompare(b.name, 'es') },
};

// el orden de las regiones va por peso en el catálogo, no alfabético: buscar
// «Norteamérica» o «Europa Occidental» es lo más frecuente
const ORDEN_REGIONES = [
  'Norteamérica', 'Europa Occidental', 'Europa del Sur', 'Asia Oriental', 'Europa del Norte',
  'Latinoamérica', 'Europa del Este', 'Oriente Medio y Norte de África', 'Oceanía',
  'Sudeste Asiático', 'África Subsahariana', 'Asia Meridional',
];

// «solo los que no sigo» es un conmutador a la vista, no una opción escondida
// en un desplegable: es justo lo que más se usa cuando vienes a añadir gente.
const VACIO = { region: '', country: '', gender: '', status: '', pendientes: false };

function Ficha({ d, foto, onFollow, busy }) {
  const seguido = d.tracked;
  // una ruta de foto que luego no carga (TMDB la retira, o la caché guarda una
  // vieja) dejaba el icono de imagen rota; con esto se cae a la inicial, igual
  // que hacen las tarjetas de persona del resto de la app
  const [fotoRota, setFotoRota] = useState(false);
  useEffect(() => setFotoRota(false), [foto?.profilePath]);
  return (
    <div className={`card p-3 flex gap-3 items-start ${seguido ? '!border-gold-400/50' : ''}`}>
      {/* la foto tarda un instante en llegar (se resuelve contra TMDB al
          mirarla): el hueco se reserva desde el principio para que las
          tarjetas no den un salto cuando aparece */}
      <div className="w-11 h-11 rounded-full overflow-hidden bg-ink-800 shrink-0 flex items-center justify-center">
        {foto?.profilePath && !fotoRota ? (
          <img
            src={tmdbImg(foto.profilePath, 'w185')}
            alt=""
            loading="lazy"
            onError={() => setFotoRota(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-sm text-zinc-500">{d.name.slice(0, 1)}</span>
        )}
      </div>
      <button
        onClick={() => !seguido && onFollow(d)}
        disabled={seguido || busy}
        title={seguido ? 'Ya le sigues como director/a' : `Seguir a ${d.name} como director/a`}
        className={`text-lg leading-none shrink-0 mt-0.5 cursor-pointer disabled:cursor-default ${
          seguido ? 'text-gold-400' : 'text-zinc-600 hover:text-gold-400'
        }`}
      >
        {seguido ? '★' : busy ? '…' : '☆'}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-100">{d.name}</span>
          {d.importance != null && (
            <span className="text-[11px] text-gold-400 tabular" title="Índice de importancia (0–100)">
              {d.importance}
            </span>
          )}
          {d.status === 'Sin estreno reciente' && (
            <span className="badge-quiet text-zinc-500" title="Sin largometraje estrenado en los últimos ocho años">
              sin estreno reciente
            </span>
          )}
        </div>
        <div className="text-[11px] text-zinc-500 mt-0.5">
          {[d.country, d.age ? `${d.age} años` : null, d.features ? `${d.features} largos` : null,
            d.first && d.last ? `${d.first}–${d.last}` : null].filter(Boolean).join(' · ')}
        </div>
        {d.awardsText && (
          <div className="text-[11px] text-zinc-400 mt-1 leading-snug" title={d.awardsText}>
            🏆 {d.awardsText}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Directors() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [q, setQ] = useState('');
  const [orden, setOrden] = useState(() => localStorage.getItem('dir_sort') || 'importancia');
  const [f, setF] = useState(() => {
    try {
      return { ...VACIO, ...JSON.parse(localStorage.getItem('dir_filters') || '{}') };
    } catch {
      return { ...VACIO };
    }
  });
  const [limite, setLimite] = useState(120);
  const [fotos, setFotos] = useState({});
  const sinFotos = useRef(false); // sin clave de TMDB: no insistir

  useEffect(() => { localStorage.setItem('dir_filters', JSON.stringify(f)); }, [f]);
  const setOrdenPref = (v) => { setOrden(v); localStorage.setItem('dir_sort', v); };

  const cargar = () =>
    api('/directors/catalog').then((r) => (r.error ? setError(r.error) : setData(r)));
  useEffect(() => { cargar(); }, []);

  const todos = data?.directors || [];

  // las opciones de país salen del propio catálogo, con su recuento, y se
  // acotan a la región elegida: con 56 países, el desplegable entero es ruido
  const opciones = useMemo(() => {
    const enRegion = f.region ? todos.filter((d) => d.region === f.region) : todos;
    const cuenta = (lista, campo) => {
      const m = new Map();
      for (const d of lista) if (d[campo]) m.set(d[campo], (m.get(d[campo]) || 0) + 1);
      return m;
    };
    const paises = [...cuenta(enRegion, 'country').entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
    const regiones = cuenta(todos, 'region');
    return {
      regiones: ORDEN_REGIONES.filter((r) => regiones.has(r)).map((r) => [r, `${r} (${regiones.get(r)})`]),
      paises: paises.map(([p, n]) => [p, `${p} (${n})`]),
    };
  }, [todos, f.region]);

  const filtrados = useMemo(() => {
    const termino = q.trim().toLowerCase();
    const lista = todos.filter((d) => {
      if (f.region && d.region !== f.region) return false;
      if (f.country && d.country !== f.country) return false;
      if (f.gender && d.gender !== f.gender) return false;
      if (f.status === 'activo' && d.status !== 'En activo') return false;
      if (f.status === 'parado' && d.status === 'En activo') return false;
      if (f.pendientes && d.tracked) return false;
      if (termino && !d.name.toLowerCase().includes(termino) && !(d.country || '').toLowerCase().includes(termino)) return false;
      return true;
    });
    return lista.sort(ORDENES[orden]?.fn || ORDENES.importancia.fn);
  }, [todos, f, q, orden]);

  const visibles = useMemo(() => filtrados.slice(0, limite), [filtrados, limite]);

  // Las fotos se piden SOLO de lo que está en pantalla y solo una vez por
  // nombre: el catálogo no trae ids de TMDB, así que resolver los 680 al abrir
  // serían 680 búsquedas para pintar una lista. Como el servidor las cachea 30
  // días, la segunda visita ya no pide nada.
  useEffect(() => {
    if (sinFotos.current) return;
    const pendientes = visibles.map((d) => d.name).filter((n) => !(n in fotos));
    if (!pendientes.length) return;
    let vivo = true;
    const tanda = pendientes.slice(0, 150);
    api('/directors/photos', { method: 'POST', body: { names: tanda } }).then((r) => {
      if (!vivo) return;
      if (r.unavailable) { sinFotos.current = true; return; }
      // Se apuntan TODOS los pedidos —los que TMDB no conoce y los de una
      // petición fallida— porque este efecto se dispara con cada render: sin
      // dejar constancia del intento, un error hacía que se pidiera lo mismo
      // una y otra vez en bucle. Sin foto se ve la inicial, y recargar
      // reintenta.
      const nuevo = {};
      for (const n of tanda) nuevo[n] = (!r.error && r.photos?.[n]) || { profilePath: null };
      setFotos((prev) => ({ ...prev, ...nuevo }));
    });
    return () => { vivo = false; };
  }, [visibles, fotos]);

  const hayFiltros = q.trim() || orden !== 'importancia' || Object.values(f).some(Boolean);
  const limpiar = () => { setQ(''); setF({ ...VACIO }); setOrdenPref('importancia'); };
  const setFiltro = (k) => (v) =>
    setF((prev) => ({ ...prev, [k]: v, ...(k === 'region' ? { country: '' } : {}) }));

  // marcar como seguido en local evita recargar las 680 filas por cada estrella
  const marcar = (nombres) =>
    setData((prev) => ({
      ...prev,
      directors: prev.directors.map((d) => (nombres.has(d.name) ? { ...d, tracked: true } : d)),
    }));

  const seguir = async (d) => {
    setBusy(d.name);
    const r = await api('/tracked/by-names', { method: 'POST', body: { names: d.name, role: 'director' } });
    setBusy(null);
    if (r.error) { toast(`⚠️ ${r.error}`, 'error'); return; }
    if (!r.added) { toast(`${d.name} no se encontró en TMDB`, 'error'); return; }
    marcar(new Set([d.name]));
    toast(`⭐ ${d.name} en favoritos (directores/as)`, 'success');
  };

  const seguirVisibles = async () => {
    const pendientes = filtrados.filter((d) => !d.tracked).slice(0, 150);
    if (!pendientes.length) return;
    setBulkBusy(true);
    const r = await api('/tracked/by-names', {
      method: 'POST',
      body: { names: pendientes.map((d) => d.name).join('\n'), role: 'director' },
    });
    setBulkBusy(false);
    if (r.error) { toast(`⚠️ ${r.error}`, 'error'); return; }
    const noEncontrados = new Set(r.notFound || []);
    marcar(new Set(pendientes.map((d) => d.name).filter((n) => !noEncontrados.has(n))));
    toast(
      `⭐ ${r.added} añadidos a favoritos${r.notFound?.length ? ` · ${r.notFound.length} sin ficha en TMDB` : ''}`,
      'success'
    );
  };

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner label="Cargando el catálogo de directores…" />;

  const pendientesVisibles = filtrados.filter((d) => !d.tracked).length;

  return (
    <div>
      <PageHeader
        eyebrow="La caza"
        title="Directores en activo"
        subtitle="680 directores y directoras con obra reciente, de Wikidata: quiénes son, cuánto han rodado y qué han ganado. Filtra por región, país o género, ordena por lo que te interese y ve marcando con la estrella a quién quieres seguir."
      />

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          className="input !w-64 max-sm:!w-full"
          placeholder="Buscar nombre o país…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={f.region} onChange={setFiltro('region')} placeholder="Región" options={opciones.regiones} />
        <Select value={f.country} onChange={setFiltro('country')} placeholder="País" options={opciones.paises} />
        <Select value={f.gender} onChange={setFiltro('gender')} placeholder="Sexo/género"
          options={[['Mujer', 'Mujeres'], ['Hombre', 'Hombres']]} />
        <Select value={f.status} onChange={setFiltro('status')} placeholder="Actividad"
          options={[['activo', 'En activo'], ['parado', 'Sin estreno reciente']]} />
        <button
          className={`chip ${f.pendientes ? 'chip-on' : ''}`}
          onClick={() => setF((p) => ({ ...p, pendientes: !p.pendientes }))}
          title="Esconde a quien ya sigues como director/a"
        >
          ☆ Solo los que no sigo
        </button>
        {hayFiltros && <button className="btn-ghost" onClick={limpiar}>✕ Limpiar filtros</button>}
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <span className="text-xs text-zinc-500">Ordenar por:</span>
        {/* sin placeholder: aquí siempre hay un orden puesto, no existe el
            «sin ordenar» que justifica la opción vacía de los filtros */}
        <Select value={orden} onChange={setOrdenPref}
          options={Object.entries(ORDENES).map(([k, o]) => [k, o.label])} />
        <span className="text-xs text-zinc-400 tabular">
          {filtrados.length} de {todos.length}
          {pendientesVisibles < filtrados.length && ` · ${filtrados.length - pendientesVisibles} ya en favoritos`}
        </span>
        {pendientesVisibles > 0 && (
          <button
            className="btn-gold !py-1 text-xs ml-auto"
            disabled={bulkBusy}
            onClick={seguirVisibles}
            title="Los busca en TMDB y los añade a tus favoritos como directores/as"
          >
            {bulkBusy ? 'Añadiendo…' : `⭐ Seguir a los ${Math.min(pendientesVisibles, 150)} que faltan de esta lista`}
          </button>
        )}
      </div>

      <p className="text-[11px] text-zinc-500 mb-4 max-w-3xl leading-relaxed">
        La <b className="text-zinc-400">importancia</b> combina prestigio (premios y reconocimiento crítico, 60 %) e
        impacto (notoriedad, alcance de la obra y taquilla, 40 %). Es una convención operativa, no un juicio de valor:
        Wikidata no es exhaustiva ni neutral y su cobertura de premios está sesgada hacia Europa y Norteamérica.
        «En activo» significa al menos un largometraje en los últimos ocho años.
      </p>

      {filtrados.length === 0 ? (
        <Empty>Nadie con esos filtros. <button className="text-gold-400 hover:underline" onClick={limpiar}>Limpiar</button></Empty>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {visibles.map((d) => (
              <Ficha key={d.name} d={d} foto={fotos[d.name]} busy={busy === d.name} onFollow={seguir} />
            ))}
          </div>
          {filtrados.length > visibles.length && (
            <div className="text-center mt-6">
              <button className="btn-ghost" onClick={() => setLimite((l) => l + 120)}>
                Ver más ({visibles.length} de {filtrados.length})
              </button>
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-zinc-600 mt-8">
        Fuente: {data.source}, consulta del {data.generatedAt}. Lo que sigas aquí alimenta{' '}
        <Link to="/calendario" className="text-gold-400 hover:underline">Cine venidero</Link> y{' '}
        <Link to="/descubrir" className="text-gold-400 hover:underline">Descubrir huecos</Link>, igual que el resto de
        tus <Link to="/favoritos" className="text-gold-400 hover:underline">favoritos</Link>.
      </p>
    </div>
  );
}
