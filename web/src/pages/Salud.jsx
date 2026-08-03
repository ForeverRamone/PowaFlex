import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { Spinner, Section, Empty, PageHeader, ErrorBox } from '../components.jsx';
import { toast } from '../toast.js';

/**
 * Salud de los datos: con 12.000 películas los emparejamientos malos son
 * estadísticamente seguros y solo se descubrían por casualidad. Auditorías
 * locales (cero red) con el remedio al lado.
 */
function Auditoria({ title, total, ok, children, hint }) {
  return (
    <Section title={`${total > 0 ? '⚠️' : '✓'} ${title} ${total > 0 ? `(${total})` : ''}`}>
      {hint && <p className="text-xs text-zinc-500 mb-2 max-w-3xl">{hint}</p>}
      {total === 0 ? <p className="text-sm text-emerald-400">{ok}</p> : children}
    </Section>
  );
}

const Lista = ({ children }) => (
  <div className="card divide-y divide-ink-800 max-h-80 overflow-y-auto text-sm">{children}</div>
);

export default function Salud() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [resolviendo, setResolviendo] = useState(false);

  const cargar = () => api('/datahealth').then((r) => (r.error ? setError(r.error) : setData(r)));
  useEffect(() => {
    cargar();
  }, []);

  const resolverLb = async () => {
    setResolviendo(true);
    const r = await api('/letterboxd/resolve', { method: 'POST' });
    setResolviendo(false);
    if (r.error) toast(`⚠️ ${r.error}`, 'error');
    else {
      toast(`✓ ${r.matched ?? 0} entradas emparejadas`);
      cargar();
    }
  };

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner label="Auditando la base de datos…" />;

  return (
    <div>
      <PageHeader
        eyebrow="Tu colección"
        title="Salud de los datos"
        subtitle="Auditorías locales de la base de datos: huérfanos, homónimos y peticiones zombis, cada uno con su remedio al lado."
      />

      <Auditoria
        title="Películas sin ficha de TMDB"
        total={data.sinTmdb.total}
        ok="Toda la biblioteca tiene su ficha: notas, sagas, festivales y huecos las ven todas."
        hint="Sin TMDB id quedan fuera de notas, sagas, festivales y huecos. El pase nocturno intenta resolverlas solas (por IMDb id y por título); las que persisten suelen ser rarezas o títulos mal escritos en Plex."
      >
        <Lista>
          {data.sinTmdb.sample.map((m) => (
            <div key={m.rating_key} className="px-3 py-1.5 flex gap-2">
              <span className="text-zinc-200 truncate flex-1">{m.title}</span>
              <span className="text-zinc-500 shrink-0">{m.year ?? '¿?'}</span>
            </div>
          ))}
        </Lista>
      </Auditoria>

      <Auditoria
        title="Mismo TMDB id en varias entradas de Plex"
        total={data.tmdbRepetido.total}
        ok="Ninguna identidad repetida."
        hint="O son ediciones legítimas duplicadas (véase también «Duplicados» en Calidad y disco), o el agente de Plex emparejó dos películas distintas a la misma ficha: merece un vistazo en Plex."
      >
        <Lista>
          {data.tmdbRepetido.sample.map((g) => (
            <div key={g.tmdb_id} className="px-3 py-1.5 flex gap-2">
              <span className="text-zinc-200 truncate flex-1">{g.titles}</span>
              <span className="text-zinc-500 shrink-0">×{g.n}</span>
            </div>
          ))}
        </Lista>
      </Auditoria>

      <Auditoria
        title="Entradas de Letterboxd sin emparejar"
        total={data.lbSinEmparejar.total}
        ok="Todo tu Letterboxd está casado con la biblioteca o con TMDB."
        hint="Visionados o notas tuyas que no casan con nada: no cuentan en Visionado ni en el completismo."
      >
        <div className="flex gap-2 mb-2">
          <button className="btn-gold !py-1 text-xs" disabled={resolviendo} onClick={resolverLb}>
            {resolviendo ? 'Resolviendo…' : '🔎 Intentar resolverlas contra TMDB'}
          </button>
          <Link to="/letterboxd" className="btn-ghost !py-1 text-xs">Ir a Letterboxd</Link>
        </div>
        <Lista>
          {data.lbSinEmparejar.sample.map((m, i) => (
            <div key={i} className="px-3 py-1.5 flex gap-2">
              <span className="text-zinc-200 truncate flex-1">{m.title}</span>
              <span className="text-zinc-500 shrink-0">{m.year ?? '¿?'}</span>
            </div>
          ))}
        </Lista>
      </Auditoria>

      <Auditoria
        title="Peticiones zombis en Radarr (6+ meses sin aparecer)"
        total={data.radarrZombis.total}
        ok="Nada pedido lleva más de seis meses atascado."
        hint="Monitorizadas desde hace más de medio año sin archivo. En «Calidad y disco» tienen su fase de estreno y la re-búsqueda; las que no existan en digital quizá merezcan salir de Radarr."
      >
        <div className="mb-2">
          <Link to="/calidad" className="btn-ghost !py-1 text-xs">Verlas en Calidad y disco →</Link>
        </div>
        <Lista>
          {data.radarrZombis.sample.map((m) => (
            <div key={m.tmdb_id} className="px-3 py-1.5 flex gap-2">
              <span className="text-zinc-200 truncate flex-1">
                {m.title} <span className="text-zinc-500">({m.year ?? '¿?'})</span>
              </span>
              <span className="text-zinc-500 shrink-0">desde {fmtDate(m.added)}</span>
            </div>
          ))}
        </Lista>
      </Auditoria>

      <Auditoria
        title="Personas con emparejado sin demostrar"
        total={data.personasSinVerificar.total}
        ok="Todas las personas con ficha TMDB demostraron su identidad con tus propias películas."
        hint="Su búsqueda en TMDB no encontró a nadie con al menos una de tus películas en su filmografía: puede ser un homónimo. Se reintenta solo cada semana; entrar en su ficha también fuerza el reintento."
      >
        <Lista>
          {data.personasSinVerificar.sample.map((p) => (
            <div key={p.id} className="px-3 py-1.5 flex gap-2">
              <Link to={`/personas/${p.id}`} className="text-zinc-200 hover:text-gold-400 truncate flex-1">{p.name}</Link>
              <span className="text-zinc-500 shrink-0">{p.films} películas tuyas</span>
            </div>
          ))}
        </Lista>
      </Auditoria>

      {data.notas && (
        <Section title="Cobertura de notas de MDBList">
          <p className="text-sm text-zinc-400">
            <b className="text-zinc-200">{data.notas.withRatings.toLocaleString('es-ES')}</b> de{' '}
            <b className="text-zinc-200">{data.notas.total.toLocaleString('es-ES')}</b> películas con notas
            {data.notas.total > data.notas.withRatings &&
              ` · el resto se descarga solo cada noche dentro del cupo diario (te quedan ${data.notas.remainingBudget.toLocaleString('es-ES')} peticiones hoy)`}
            . <Link to="/ajustes" className="text-gold-400 hover:underline">Ajustes →</Link>
          </p>
        </Section>
      )}
    </div>
  );
}
