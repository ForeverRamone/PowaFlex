import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { Progreso, useCargaProgresiva, Section, PageHeader, ErrorBox, ProgressBar } from '../components.jsx';
import { toast } from '../toast.js';
import { t, locale } from '../i18n.js';

/**
 * Salud de los datos: con 12.000 películas los emparejamientos malos son
 * estadísticamente seguros y solo se descubrían por casualidad. Auditorías
 * locales (cero red) con el remedio al lado.
 */
function Auditoria({ title, total, ok, children, hint }) {
  // La pista explica qué hacer con el problema: cuando NO hay problema sobra, y
  // sobraba mucho. Con la biblioteca sana de arriba (tres auditorías limpias) se
  // leían tres párrafos seguidos sobre cosas que no pasan antes de llegar a las
  // 244 peticiones zombis y las 4.200 identidades sin demostrar, que era lo
  // único que pedía atención. Limpia, la auditoría es una línea.
  return (
    <Section title={`${total > 0 ? '⚠️' : '✓'} ${title} ${total > 0 ? `(${total})` : ''}`}>
      {total === 0 ? (
        <p className="text-sm text-emerald-400">{ok}</p>
      ) : (
        <>
          {hint && <p className="text-xs text-zinc-500 mb-2 max-w-3xl">{hint}</p>}
          {children}
        </>
      )}
    </Section>
  );
}

/**
 * Lo primero que hay que poder contestar al entrar: ¿tengo algo que revisar y
 * qué es? Con seis auditorías seguidas y sin resumen había que recorrer la
 * página entera para saberlo, y las que están bien ocupan lo mismo que las que
 * no. Aquí van las que tienen algo, con su cifra; si no hay ninguna, una línea.
 */
function Resumen({ auditorias }) {
  const conAlgo = auditorias.filter(([, n]) => n > 0);
  if (!conAlgo.length) {
    return (
      <p className="text-sm text-emerald-400 mb-6">
        {t('✓ Las {n} auditorías salen limpias: no hay nada que revisar.', { n: auditorias.length })}
      </p>
    );
  }
  return (
    <div className="card p-4 mb-6">
      <p className="text-sm text-zinc-300 mb-2">
        {t('{n} de {total} auditorías tienen algo que revisar:', { n: conAlgo.length, total: auditorias.length })}
      </p>
      <div className="flex flex-wrap gap-2">
        {conAlgo.map(([label, n]) => (
          <span key={label} className="badge-quiet !text-xs !py-1 !px-2">
            {label} <b className="text-orange-300 tabular">{n.toLocaleString(locale())}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

const Lista = ({ children }) => (
  <div className="card divide-y divide-ink-800 max-h-80 overflow-y-auto text-sm">{children}</div>
);

export default function Salud({ embedded = false }) {
  const [error, setError] = useState(null);
  const [resolviendo, setResolviendo] = useState(false);
  const [verif, setVerif] = useState(null);

  // las dos a la vez: la auditoría no necesita saber nada de la comprobación en
  // marcha, y la segunda es un vistazo de un milisegundo
  const carga = useCargaProgresiva([
    { clave: 'auditoria', etiqueta: t('Auditando la base de datos…'), carga: () => api('/datahealth') },
    { clave: 'verif', etiqueta: t('Mirando si quedó una comprobación a medias…'), carga: () => api('/datahealth/verify-people') },
  ], []);

  // la auditoría se vuelve a pedir cuando algo de esta página la cambia
  // (resolver Letterboxd, demostrar identidades): esa recarga manda sobre la
  // primera, sin devolver la página a la pantalla de carga
  const [dataFresca, setDataFresca] = useState(null);
  const cargar = () => api('/datahealth').then((r) => (r.error ? setError(r.error) : setDataFresca(r)));
  const bruto = dataFresca ?? carga.datos.auditoria ?? null;
  const fallo = error ?? bruto?.error ?? null;
  const data = bruto && !bruto.error ? bruto : null;

  // por si quedó una comprobación en marcha de una visita anterior
  useEffect(() => {
    const r = carga.datos.verif;
    if (r && !r.error && (r.running || r.finishedAt)) setVerif(r);
  }, [carga.datos.verif]);

  // mientras corre se pregunta cada segundo y medio; al terminar se recarga la
  // auditoría, que es justo lo que la comprobación acaba de cambiar
  useEffect(() => {
    if (!verif?.running) return undefined;
    const t2 = setInterval(async () => {
      const r = await api('/datahealth/verify-people');
      if (r.error) return;
      setVerif(r);
      if (!r.running) {
        clearInterval(t2);
        cargar();
        toast(t('✓ {n} identidades demostradas', { n: r.verified }) + (r.failed ? t(' · {n} sin demostrar', { n: r.failed }) : ''), 'success');
      }
    }, 1500);
    return () => clearInterval(t2);
  }, [verif?.running]);

  const comprobarPersonas = async () => {
    const r = await api('/datahealth/verify-people', { method: 'POST' });
    if (r.error) { toast(`⚠️ ${t(r.error)}`, 'error'); return; }
    setVerif({ ...r, running: true });
  };

  const resolverLb = async () => {
    setResolviendo(true);
    const r = await api('/letterboxd/resolve', { method: 'POST' });
    setResolviendo(false);
    if (r.error) toast(`⚠️ ${t(r.error)}`, 'error');
    else {
      toast(t('✓ {n} entradas emparejadas', { n: r.matched ?? 0 }));
      cargar();
    }
  };

  if (fallo) return <ErrorBox error={fallo} />;
  if (!data) return <Progreso {...carga} />;

  // Nombres cortos para el resumen: el título completo de cada auditoría lleva
  // su explicación dentro y en una fila de etiquetas no se lee ninguno.
  const auditorias = [
    [t('Sin ficha de TMDB'), data.sinTmdb.total],
    [t('Identidades repetidas'), data.tmdbRepetido.total],
    [t('Letterboxd sin emparejar'), data.lbSinEmparejar.total],
    [t('Peticiones zombis'), data.radarrZombis.total],
    [t('Emparejados sin demostrar'), data.personasSinVerificar.total],
  ];

  return (
    <div>
      {!embedded && (
        <PageHeader
          eyebrow={t('Tu colección')}
          title={t('Salud de los datos')}
          subtitle={t('Auditorías locales de la base de datos: huérfanos, homónimos y peticiones zombis, cada uno con su remedio al lado.')}
        />
      )}

      <Resumen auditorias={auditorias} />

      <Auditoria
        title={t('Películas sin ficha de TMDB')}
        total={data.sinTmdb.total}
        ok={t('Toda la biblioteca tiene su ficha: notas, sagas, festivales y huecos las ven todas.')}
        hint={t('Sin TMDB id quedan fuera de notas, sagas, festivales y huecos. El pase nocturno intenta resolverlas solas (por IMDb id y por título); las que persisten suelen ser rarezas o títulos mal escritos en Plex.')}
      >
        <Lista>
          {data.sinTmdb.sample.map((m) => (
            <div key={m.rating_key} className="px-3 py-1.5 flex gap-2">
              <span className="text-zinc-200 truncate flex-1">{m.title}</span>
              <span className="text-zinc-500 shrink-0">{m.year ?? t('¿?')}</span>
            </div>
          ))}
        </Lista>
      </Auditoria>

      <Auditoria
        title={t('Mismo TMDB id en varias entradas de Plex')}
        total={data.tmdbRepetido.total}
        ok={t('Ninguna identidad repetida.')}
        hint={t('O son ediciones legítimas duplicadas (véase también «Duplicados» en Calidad y disco), o el agente de Plex emparejó dos películas distintas a la misma ficha: merece un vistazo en Plex.')}
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
        title={t('Entradas de Letterboxd sin emparejar')}
        total={data.lbSinEmparejar.total}
        ok={t('Todo tu Letterboxd está casado con la biblioteca o con TMDB.')}
        hint={t('Visionados o notas tuyas que no casan con nada: no cuentan en Visionado ni en el completismo.')}
      >
        <div className="flex gap-2 mb-2">
          <button className="btn-gold !py-1 text-xs" disabled={resolviendo} onClick={resolverLb}>
            {resolviendo ? t('Resolviendo…') : t('🔎 Intentar resolverlas contra TMDB')}
          </button>
          <Link to="/ajustes?tab=fuentes" className="btn-ghost !py-1 text-xs">{t('Ir a Ajustes → Letterboxd')}</Link>
        </div>
        <Lista>
          {data.lbSinEmparejar.sample.map((m, i) => (
            <div key={i} className="px-3 py-1.5 flex gap-2">
              <span className="text-zinc-200 truncate flex-1">{m.title}</span>
              <span className="text-zinc-500 shrink-0">{m.year ?? t('¿?')}</span>
            </div>
          ))}
        </Lista>
      </Auditoria>

      <Auditoria
        title={t('Peticiones zombis en Radarr (6+ meses sin aparecer)')}
        total={data.radarrZombis.total}
        ok={t('Nada pedido lleva más de seis meses atascado.')}
        hint={t('Monitorizadas desde hace más de medio año sin archivo. En «Calidad y disco» tienen su fase de estreno y la re-búsqueda; las que no existan en digital quizá merezcan salir de Radarr.')}
      >
        <div className="mb-2">
          <Link to="/taller?tab=calidad" className="btn-ghost !py-1 text-xs">{t('Verlas en Calidad y disco →')}</Link>
        </div>
        <Lista>
          {data.radarrZombis.sample.map((m) => (
            <div key={m.tmdb_id} className="px-3 py-1.5 flex gap-2">
              <span className="text-zinc-200 truncate flex-1">
                {m.title} <span className="text-zinc-500">({m.year ?? t('¿?')})</span>
              </span>
              <span className="text-zinc-500 shrink-0">{t('desde {date}', { date: fmtDate(m.added) })}</span>
            </div>
          ))}
        </Lista>
      </Auditoria>

      <Auditoria
        title={t('Personas con emparejado sin demostrar')}
        total={data.personasSinVerificar.total}
        ok={t('Todas las personas con ficha TMDB demostraron su identidad con tus propias películas.')}
        hint={
          data.personasSinVerificar.sinComprobar > 0
            ? t('Casi todas están simplemente SIN MIRAR: añadir a alguien a favoritos o volcar un canon le pone su ficha de TMDB, pero la identidad solo se comprueba cuando algo necesita su filmografía. Con el botón se comprueban todas de una vez.')
            : t('Su búsqueda en TMDB no encontró a nadie con al menos una de tus películas en su filmografía: puede ser un homónimo. Se reintenta solo cada semana; entrar en su ficha también fuerza el reintento.')
        }
      >
        <p className="text-xs text-zinc-400 mb-2">
          <b className="text-orange-300">{data.personasSinVerificar.fallidas.toLocaleString(locale())}</b>
          {t(' se comprobaron y ninguna ficha de TMDB compartía película con las tuyas (ahí sí puede haber un homónimo) · ')}
          <b className="text-zinc-300">{data.personasSinVerificar.sinComprobar.toLocaleString(locale())}</b>
          {t(' aún sin mirar.')}
        </p>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <button className="btn-gold !py-1 text-xs" onClick={comprobarPersonas} disabled={verif?.running}>
            {verif?.running ? t('Comprobando…') : t('🔎 Comprobar ahora contra TMDB')}
          </button>
          {verif?.running && (
            <span className="text-xs text-zinc-400 tabular">
              {t('{done} de {total} · {n} demostradas', { done: verif.done, total: verif.total, n: verif.verified })}
            </span>
          )}
          {!verif?.running && verif?.finishedAt && (
            <span className="text-xs text-emerald-400">
              {t('✓ {n} demostradas · {m} siguen sin poder demostrarse', { n: verif.verified, m: verif.failed })}
            </span>
          )}
          {verif?.error && <span className="text-xs text-red-400">⚠️ {verif.error}</span>}
        </div>
        {verif?.running && verif.total > 0 && (
          <div className="mb-3 max-w-md"><ProgressBar pct={Math.round((verif.done / verif.total) * 100)} /></div>
        )}
        <Lista>
          {data.personasSinVerificar.sample.map((p) => (
            <div key={p.id} className="px-3 py-1.5 flex gap-2">
              <Link to={`/personas/${p.id}`} className="text-zinc-200 hover:text-gold-400 truncate flex-1">{p.name}</Link>
              {p.comprobado && (
                <span className="text-[11px] text-orange-300 shrink-0" title={t('Se buscó y ninguna ficha compartía película con las tuyas')}>
                  {t('comprobada')}
                </span>
              )}
              <span className="text-zinc-500 shrink-0">{t('{n} películas tuyas', { n: p.films })}</span>
            </div>
          ))}
        </Lista>
      </Auditoria>

      {data.notas && (
        <Section title={t('Cobertura de notas de MDBList')}>
          <p className="text-sm text-zinc-400">
            <b className="text-zinc-200">{data.notas.withRatings.toLocaleString(locale())}</b>{t(' de ')}
            <b className="text-zinc-200">{data.notas.total.toLocaleString(locale())}</b>{t(' películas con notas')}
            {data.notas.total > data.notas.withRatings &&
              t(' · el resto se descarga solo cada noche dentro del cupo diario (te quedan {n} peticiones hoy)', { n: data.notas.remainingBudget.toLocaleString(locale()) })}
            . <Link to="/ajustes?tab=fuentes" className="text-gold-400 hover:underline">{t('Ajustes →')}</Link>
          </p>
        </Section>
      )}
    </div>
  );
}
