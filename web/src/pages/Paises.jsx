import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Globe2, CalendarRange, RotateCw, Trophy, Pencil, Undo2 } from 'lucide-react';
import {
  ErrorBox, TmdbCard, RadarrButton, Empty, Spinner, PageHeader, Select,
  useRadarrIds, OwnFilterBar, BuildProgress,
} from '../components.jsx';
import { toast } from '../toast.js';
import { t, locale, getLang } from '../i18n.js';

const VISTAS = [
  ['historico', 'Histórico', Globe2],
  ['anio', 'Por año', CalendarRange],
];
const VISTA_KEYS = new Set(VISTAS.map(([k]) => k));

/**
 * LAS DOS FUENTES, y por qué están las dos.
 *
 * No son dos formas de ver lo mismo: dicen cosas distintas. El top español de
 * Letterboxd empieza por «Todo sobre mi madre», «La sociedad de la nieve» y
 * «Klaus»; el de FilmAffinity, por «El verdugo», «Los santos inocentes» y
 * «Plácido». Una vota en inglés y en presente, la otra desde España. Tenerlas
 * enfrentadas dice más que promediarlas.
 */
const FUENTES = [
  ['lb', 'Letterboxd', 'La lista de la casa: recorre TMDB año a año y ordena la nota de Letterboxd'],
  ['fa', 'FilmAffinity', 'Su ranking, en su orden, emparejado con TMDB'],
];
const FUENTE_KEYS = new Set(FUENTES.map(([k]) => k));

/**
 * Por qué entró cada película, en una palabra. Se enseña porque la atribución
 * de país falla en las dos direcciones y sin el motivo delante no hay forma de
 * juzgar si falló: «Viridiana» entra por quien la dirige, no por lo que dice
 * TMDB, y saberlo es lo que permite corregir con criterio.
 */
const MOTIVOS = {
  director: 'Entra por la nacionalidad de quien la dirige',
  origen: 'Entra por el país de origen que le pone TMDB',
  manual: 'La metiste tú a mano',
  filmaffinity: 'Puesto {n} del ranking de FilmAffinity',
};

function PeliCard({ p, fuente, radarrIds, addRadarrId, onQuitar }) {
  const ayuda = p.motivo === 'filmaffinity'
    ? t(MOTIVOS.filmaffinity, { n: p.rank_global })
    : t(MOTIVOS[p.motivo] || '');
  return (
    <TmdbCard item={p}>
      <div className="text-[11px] text-zinc-500 truncate" title={p.director || ''}>
        {p.year || '—'}{p.director ? ` · ${p.director}` : ''}
      </div>
      <div className="text-[11px] text-gold-400">
        {/* En la lista de la casa manda la nota de Letterboxd, así que va
            delante y sola. En la de FilmAffinity manda SU puesto, y la nota
            —si está pedida— es solo una referencia al lado: pintarla como si
            ordenara haría pensar que la lista está mal ordenada. */}
        {fuente === 'fa' ? (
          <>
            #{p.rank_global}
            {p.lb != null && <span className="text-zinc-500"> · LB {Number(p.lb).toFixed(1)}</span>}
          </>
        ) : (
          <>
            LB {p.lb != null ? Number(p.lb).toFixed(1) : '—'}
            {p.sigma != null && <span className="text-zinc-500"> · Σ {p.sigma}</span>}
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!p.owned && (
          <RadarrButton tmdbId={p.tmdb_id} small alreadyInRadarr={radarrIds.has(p.tmdb_id)} onAdded={addRadarrId} />
        )}
        <button
          title={t('{motivo}. Pulsa para sacarla de este país.', { motivo: ayuda })}
          onClick={() => onQuitar(p)}
          className="text-zinc-500 hover:text-red-400 text-xs px-1 shrink-0"
        >
          <Pencil size={12} strokeWidth={2} />
        </button>
      </div>
    </TmdbCard>
  );
}

/**
 * EL CINE POR PAÍSES: lo mejor de cada cinematografía, histórico y año a año.
 *
 * Ordena la nota de Letterboxd —la única fuente que puntúa el cine del mundo—
 * y desempata el canon. El país de cada película es el de quien la dirige, no
 * el que le pone TMDB, que da «Viridiana» por mexicana. El porqué de las tres
 * decisiones está en `server/src/paises.js`.
 */
export default function Paises() {
  const [params, setParams] = useSearchParams();
  const pedido = (params.get('pais') || localStorage.getItem('paises_iso') || 'ES').toUpperCase();
  // El código de la URL se respeta tal cual —el servidor dirá si no existe— pero
  // el desplegable NO puede fingir que está puesto otro: sin un hueco vacío que
  // enseñar, un `?pais=XX` dejaba el selector marcando «Alemania» y la página
  // hablando de XX, y para salir había que elegir un TERCER país, porque volver
  // a marcar Alemania no dispara ningún cambio.
  const iso = pedido;
  const vista = VISTA_KEYS.has(params.get('vista')) ? params.get('vista') : 'historico';
  const fuente = FUENTE_KEYS.has(params.get('fuente')) ? params.get('fuente') : 'lb';
  const anioUrl = params.get('anio');

  // la fuente y la vista viajan en la URL para que un enlace lleve a lo mismo
  const nav = (cambios) => {
    const base = { pais: iso, ...(fuente !== 'lb' ? { fuente } : {}), ...(vista !== 'historico' ? { vista } : {}), ...(anioUrl ? { anio: anioUrl } : {}) };
    const next = { ...base, ...cambios };
    for (const k of Object.keys(next)) if (!next[k] || (k === 'vista' && next[k] === 'historico') || (k === 'fuente' && next[k] === 'lb')) delete next[k];
    setParams(next);
  };
  const setIso = (v) => {
    localStorage.setItem('paises_iso', v);
    nav({ pais: v, anio: null });
  };
  // FilmAffinity no tiene vista por año: su ranking es uno solo
  const setFuente = (v) => nav({ fuente: v, ...(v === 'fa' ? { vista: 'historico', anio: null } : {}) });
  const setVista = (v) => nav({ vista: v, ...(v === 'historico' ? { anio: null } : {}) });
  const setAnio = (y) => nav({ vista: 'anio', anio: y ? String(y) : null });

  const [catalogo, setCatalogo] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [construyendo, setConstruyendo] = useState(false);
  const [radarrIds, addRadarrId] = useRadarrIds();
  const [own, setOwnState] = useState(() => localStorage.getItem('paises_own') || '');
  const setOwn = (v) => { setOwnState(v); localStorage.setItem('paises_own', v); };

  useEffect(() => {
    api('/paises').then((r) => {
      if (r.error) return setError(r.error);
      setCatalogo(r.paises);
      // El estado del servidor es único: sin mirar de QUÉ país es, la página
      // decía «Construyendo España…» y bloqueaba su botón mientras lo que
      // corría era Alemania.
      const st = r.status;
      setConstruyendo(!!st?.running && st.iso === iso && (st.fuente || 'lb') === fuente);
    });
  }, []);

  // como en Descubrir: cada petición lleva su número y solo la última pinta
  const reqId = useRef(0);
  const cargar = () => {
    const id = ++reqId.current;
    setError(null);
    setData(null);
    const q = new URLSearchParams();
    if (fuente !== 'lb') q.set('fuente', fuente);
    if (vista === 'anio' && anioUrl) q.set('anio', anioUrl);
    api(`/paises/${iso}${q.toString() ? `?${q}` : ''}`).then((d) => {
      if (id !== reqId.current) return;
      if (d.error) return setError(d.error);
      setData(d);
    });
  };
  useEffect(() => { cargar(); }, [iso, vista, anioUrl, fuente]);

  /**
   * EL SONDEO, con lo que hace falta para que no mienta.
   *
   * Tres cosas aprendidas a base de verlas:
   *
   *  - **Lee de una referencia, no de la clausura.** El intervalo se monta una
   *    vez y vivía con el `cargar`, el `iso` y el nombre del render en que
   *    arrancó: cambiando de país mientras construía, al terminar pintaba las
   *    películas del país VIEJO bajo el titular del nuevo. Y `reqId` no salvaba
   *    nada, porque esa llamada rancia se declaraba a sí misma la más reciente.
   *  - **Un tick sin respuesta no es un fallo.** `api()` nunca rechaza: si el
   *    servidor no contesta devuelve `{offline:true}`, y leer eso como «no está
   *    corriendo» declaraba fallido un pase de tres minutos por un segundo de
   *    red.
   *  - **El estado del servidor es UNO para toda la aplicación.** Si el pase que
   *    corre es de otro país, aquí no se toca nada.
   */
  const ultimo = useRef({});

  useEffect(() => {
    if (!construyendo) return undefined;
    const id = setInterval(async () => {
      const est = await api('/paises/status');
      if (est?.offline || est?.running) return;
      const { cargar: recargar, iso: paisActual, fuente: fuenteActual, nombrePais: nombre } = ultimo.current;
      clearInterval(id);
      setConstruyendo(false);
      api('/paises').then((r) => !r.error && setCatalogo(r.paises));
      // el aviso solo tiene sentido si lo que acabó es lo que se está mirando
      const esLoMio = est?.iso === paisActual && (est?.fuente || 'lb') === fuenteActual;
      if (est?.error) toast(t('⚠️ No se pudo construir: {error}', { error: t(est.error) }), 'error');
      else if (esLoMio) toast(t('✓ {pais} listo: {n} películas', { pais: nombre, n: est?.ultimo?.guardadas ?? 0 }));
      recargar();
    }, 3000);
    return () => clearInterval(id);
  }, [construyendo]);

  const construir = async () => {
    const r = await api(`/paises/${iso}/build${fuente !== 'lb' ? '?fuente=fa' : ''}`, { method: 'POST' });
    if (r.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    setConstruyendo(true);
    toast(
      fuente === 'fa'
        ? t('Cargando el ranking de FilmAffinity de {pais}…', { pais: nombrePais })
        : t('Construyendo {pais}: recorre cien años y pregunta las notas. Tarda unos minutos.', { pais: nombrePais })
    );
  };

  const quitar = async (p) => {
    const r = await api(`/paises/${iso}/override`, {
      method: 'POST',
      body: { tmdbId: p.tmdb_id, modo: 'drop', title: p.title },
    });
    if (r.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    // Se dice que sale de las DOS listas y que volver cuesta una reconstrucción:
    // ofrecer un «Deshacer» que en realidad solo retira la corrección —y deja la
    // película fuera hasta el siguiente pase— es prometer lo que no se cumple.
    toast(
      t('✎ «{title}» fuera de {pais}, en las dos listas', { title: p.title, pais: nombrePais }),
      'info',
      { label: t('Retirar la corrección'), onClick: () => devolver(p.tmdb_id) }
    );
    cargar();
  };

  const devolver = async (tmdbId) => {
    const r = await api(`/paises/${iso}/override/${tmdbId}`, { method: 'DELETE' });
    if (r.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    // el `drop` borró la fila del índice: para que vuelva hay que reconstruir,
    // y decirlo es mejor que dejar pulsando «deshacer» sin que pase nada
    toast(t('Corrección retirada: vuelve al reconstruir el país'));
    api('/paises').then((r2) => !r2.error && setCatalogo(r2.paises));
    cargar();
  };

  const pais = catalogo?.find((p) => p.iso === iso);
  // El catálogo trae el nombre en los dos idiomas: los nombres de país no pasan
  // por t() porque no son copy, son datos, y meter setenta y dos entradas en el
  // diccionario para decir «Sweden» sería mantener a mano lo que ya viene dado.
  const nombreDe = (p) => (p ? (getLang() === 'en' ? p.en : p.es) : null);
  const nombrePais = nombreDe(pais) || data?.nombre || iso;
  // Se rellena AQUI y no arriba: nombrePais se declara unas lineas mas arriba
  // que esta, pero DESPUES del efecto de sondeo; leerlo alli es un
  // ReferenceError que se lleva la pagina entera por delante. Lo cazo la
  // ErrorBoundary del navegador, no el build, que salio verde.
  ultimo.current = { cargar, iso, fuente, nombrePais };

  const build = data?.build;
  const anios = data?.anios || [];
  // con FilmAffinity no hay vista por año: el titular no puede prometer una
  const anioActivo = fuente === 'lb' && vista === 'anio' && anioUrl ? Number(anioUrl) : null;

  const visibles = (data?.peliculas || []).filter(
    (p) => own === '' || (own === 'missing' ? !p.owned : !!p.owned)
  );
  const ocultas = (data?.peliculas?.length || 0) - visibles.length;
  const tengo = (data?.peliculas || []).filter((p) => p.owned).length;

  return (
    <div>
      <PageHeader eyebrow={t('La caza')} title={t('Por países')} />
      <p className="text-sm text-zinc-500 mb-4 max-w-3xl">
        {t('Lo mejor de cada cinematografía, de siempre y año a año. Ordena la nota de Letterboxd —la única que puntúa el cine del mundo— y desempatan los premios y los cánones. El país de cada película es el de quien la dirige.')}
      </p>

      <div className="card p-3 mb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs text-zinc-500">{t('País:')}</span>
          <Select
            className="!py-1 text-xs"
            value={iso}
            onChange={setIso}
            placeholder={t('Elige un país')}
            // ordenado por el nombre que se ve: el catálogo llega ordenado por
            // el castellano, y en inglés salía «Germany, East Germany, Algeria…»
            options={[...(catalogo || [])]
              .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), getLang()))
              .map((p) => {
                const hecho = fuente === 'fa' ? p.buildFa?.guardadas : p.build?.guardadas;
                return [p.iso, hecho ? `${nombreDe(p)} · ${hecho}` : `${nombreDe(p)} — ${t('sin construir')}`];
              })}
          />
          {FUENTES.map(([key, label, ayuda]) => (
            <button
              key={key}
              onClick={() => setFuente(key)}
              title={t(ayuda)}
              disabled={key === 'fa' && pais && !pais.fa}
              className={`btn-ghost !py-1 text-xs ${fuente === key ? '!border-gold-400 text-gold-400' : ''} ${key === 'fa' && pais && !pais.fa ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {label}
            </button>
          ))}
          {/* la vista por año es de la lista nuestra: el ranking de
              FilmAffinity no se reparte por años */}
          {fuente === 'lb' && VISTAS.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setVista(key)}
              className={`btn-ghost !py-1 text-xs inline-flex items-center gap-1.5 ${vista === key ? '!border-gold-400 text-gold-400' : ''}`}
            >
              <Icon size={13} strokeWidth={1.75} /> {t(label)}
            </button>
          ))}
          <button
            className="btn-ghost !py-1 text-xs shrink-0 inline-flex items-center gap-1.5 ml-auto"
            onClick={construir}
            /* en FilmAffinity sin ranking el botón solo podía dar un 400 */
            disabled={construyendo || (fuente === 'fa' && pais && !pais.fa)}
            title={
              fuente === 'fa'
                ? t('Carga el ranking que viene con esta versión y lo cruza con tu Plex.')
                : t('Recorre TMDB año a año, pide las notas a MDBList y comprueba de dónde es cada una.')
            }
          >
            <RotateCw size={13} strokeWidth={2} />
            {construyendo ? t('Construyendo…') : build ? t('Reconstruir') : t('Construir')}
          </button>
        </div>

        {fuente === 'lb' && vista === 'anio' && anios.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setAnio(null)}
              className={`btn-ghost !py-0.5 !px-2 text-[11px] ${!anioActivo ? '!border-gold-400 text-gold-400' : ''}`}
            >
              {t('Todos')}
            </button>
            {anios.map(({ year, n }) => (
              <button
                key={year}
                onClick={() => setAnio(year)}
                title={t('{n} películas', { n })}
                className={`btn-ghost !py-0.5 !px-2 text-[11px] ${anioActivo === year ? '!border-gold-400 text-gold-400' : ''}`}
              >
                {year}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <OwnFilterBar own={own} setOwn={setOwn} />
          {ocultas > 0 && <span className="text-xs text-zinc-500">{t('{n} ocultas por tus filtros', { n: ocultas })}</span>}
        </div>
      </div>

      {construyendo && (
        <BuildProgress
          job={[`paises:${iso}`, `paises-fa:${iso}`]}
          label={t('Construyendo {pais}…', { pais: nombrePais })}
          className="mb-4"
        />
      )}

      {error ? (
        <ErrorBox error={error} />
      ) : !data ? (
        <Spinner label={t('Cargando {pais}…', { pais: nombrePais })} />
      ) : fuente === 'fa' && !data.fa ? (
        /* Un país sin ranking en FilmAffinity no es un país sin cine: se dice
           cuál es el motivo en vez de enseñar un vacío que parece un fallo. */
        <Empty>
          {t('FilmAffinity no tiene ranking de {pais}. Solo lo tienen catorce países; para los demás queda la lista de Letterboxd.', { pais: nombrePais })}
        </Empty>
      ) : !build ? (
        <Empty>
          {fuente === 'fa'
            ? t('El ranking de FilmAffinity de {pais} está listo para cargar. Pulsa «Construir».', { pais: nombrePais })
            : t('{pais} todavía no está construido. Pulsa «Construir»: recorre TMDB año a año desde 1915, pide las notas de Letterboxd y comprueba de dónde es cada película.', { pais: nombrePais })}
        </Empty>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <p className="text-sm text-zinc-500">
              {/* las cifras del pase van delante: un país con doce películas
                  parece un fallo hasta que se ve que se miraron cuatro mil
                  candidatas y solo mil seiscientas tenían nota */}
              {fuente === 'fa'
                ? t('Las {cand} de su ranking, {n} emparejadas con TMDB.', { cand: build.candidatos, n: build.guardadas })
                : t('{cand} candidatas miradas, {nota} con nota de Letterboxd, {n} son de {pais}.', {
                    cand: build.candidatos, nota: build.con_nota, n: build.guardadas, pais: nombrePais,
                  })}
              {build.del_palmares > 0 && (
                <span> {t('{n} las puso el palmarés y no TMDB.', { n: build.del_palmares })}</span>
              )}
              {build.at && (
                <span> {t('Construido el {date}.', { date: new Date(build.at).toLocaleString(locale()) })}</span>
              )}
              {tengo > 0 && <span className="text-gold-400"> · {t('tienes {n}', { n: tengo })}</span>}
            </p>
          </div>

          {build.error && <ErrorBox error={build.error} />}

          {data.overrides?.length > 0 && (
            <div className="card p-3 mb-4">
              <div className="text-xs text-zinc-500 mb-2 inline-flex items-center gap-1.5">
                <Pencil size={12} strokeWidth={2} /> {t('Tus correcciones en {pais}', { pais: nombrePais })}
              </div>
              <div className="flex flex-wrap gap-2">
                {data.overrides.map((o) => (
                  <button
                    key={o.tmdb_id}
                    onClick={() => devolver(o.tmdb_id)}
                    className="btn-ghost !py-0.5 !px-2 text-[11px] inline-flex items-center gap-1.5"
                    title={t('Retirar esta corrección')}
                  >
                    <Undo2 size={11} strokeWidth={2} />
                    {o.modo === 'drop' ? '✕' : '+'} {o.title || o.tmdb_id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {visibles.length === 0 ? (
            <Empty>
              {own || ocultas > 0
                ? t('Nada que enseñar con estos filtros.')
                : t('Este país está construido pero no tiene ninguna película que enseñar.')}
            </Empty>
          ) : (
            <section className="mb-8">
              <h2 className="font-semibold text-zinc-100 mb-3 inline-flex items-center gap-2">
                <Trophy size={16} strokeWidth={1.75} className="text-gold-400" />
                {anioActivo
                  ? t('Lo mejor de {pais} en {year}', { pais: nombrePais, year: anioActivo })
                  : t('Lo mejor de {pais}', { pais: nombrePais })}
                <span
                  className="text-zinc-500 text-sm font-normal"
                  /* el recuento de arriba dice cuántas son de ese país y este
                     dice cuántas se enseñan: sin explicarlo se lee como si
                     faltaran mil */
                  title={t('Se enseñan las mejores; arriba está cuántas hay en total.')}
                >
                  · {visibles.length}
                </span>
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {visibles.map((p) => (
                  <PeliCard key={p.tmdb_id} p={p} fuente={fuente} radarrIds={radarrIds} addRadarrId={addRadarrId} onQuitar={quitar} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
