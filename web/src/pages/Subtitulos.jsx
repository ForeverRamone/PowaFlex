import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, Section, PageHeader, ErrorBox, Empty, StatCard, Select } from '../components.jsx';
import { toast } from '../toast.js';
import { t, locale } from '../i18n.js';

/**
 * Auditoría de subtítulos y de audio.
 *
 * Para una colección de cine no anglosajón, una película sin subtítulos es una
 * película que no tienes. El criterio de «cubierta» lo pone cada uno en
 * Ajustes; aquí solo se enseña quién lo incumple y se le pide a Bazarr que
 * busque.
 */

/**
 * Los códigos vienen como los manda Plex (ISO-639-2: «spa», «jpn») y el idioma
 * original de TMDB en ISO-639-1 («ja»). Intl los sabe pintar en el idioma de la
 * interfaz; los que no reconozca (las variantes «fre», «ger») se quedan en el
 * propio código, que sigue diciendo algo.
 */
function nombreIdioma(code) {
  if (!code) return null;
  try {
    const nombre = new Intl.DisplayNames([locale()], { type: 'language' }).of(String(code));
    return nombre && nombre !== code ? nombre : String(code).toUpperCase();
  } catch {
    return String(code).toUpperCase();
  }
}

const Lista = ({ children }) => (
  <div className="card divide-y divide-ink-800 max-h-96 overflow-y-auto text-sm">{children}</div>
);

const Pistas = ({ langs }) =>
  langs.length === 0 ? (
    <span className="text-[11px] text-orange-300 shrink-0">{t('ninguno')}</span>
  ) : (
    <span className="flex gap-1 flex-wrap shrink-0">
      {langs.map((l) => (
        <span key={l} className="badge-quiet">{nombreIdioma(l)}</span>
      ))}
    </span>
  );

export default function Subtitulos({ embedded = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [orden, setOrden] = useState('desnudas');
  const [pedidas, setPedidas] = useState(new Set());
  const [buscando, setBuscando] = useState(null);
  const [bulk, setBulk] = useState({ busy: false, done: 0, total: 0 });
  const [audio, setAudio] = useState(null);

  useEffect(() => {
    api('/subs/audit?limit=300').then((r) => (r.error ? setError(r.error) : setData(r)));
  }, []);

  // la auditoría de audio recorre las pistas de toda la biblioteca: solo se
  // pide cuando de verdad se abre el desplegable
  const abrirAudio = (e) => {
    if (!e.currentTarget.open || audio) return;
    setAudio({ cargando: true });
    api('/subs/audio-audit?limit=300').then((r) => setAudio(r.error ? { error: r.error } : r));
  };

  const marcarPedida = (radarrId) => setPedidas((p) => new Set(p).add(radarrId));

  const buscarUna = async (m) => {
    setBuscando(m.radarrId);
    const r = await api(`/subs/search/${m.radarrId}`, { method: 'POST' });
    setBuscando(null);
    if (r.error) toast(`⚠️ ${t(r.error)}`, 'error');
    else {
      marcarPedida(m.radarrId);
      toast(t('🔎 Bazarr busca los subtítulos de «{title}»', { title: m.title }));
    }
  };

  const visibles = useMemo(() => {
    if (!data?.faltan) return [];
    const busca = q.trim().toLowerCase();
    const out = data.faltan.filter((m) => !busca || (m.title || '').toLowerCase().includes(busca));
    if (orden === 'titulo') out.sort((a, b) => (a.title || '').localeCompare(b.title || '', locale()));
    else if (orden === 'ano') out.sort((a, b) => (b.year || 0) - (a.year || 0));
    return out; // «desnudas» es el orden en que ya vienen del servidor
  }, [data, q, orden]);

  const conRadarr = visibles.filter((m) => m.radarrId && !pedidas.has(m.radarrId));

  const buscarTodas = async () => {
    const ids = conRadarr.map((m) => m.radarrId);
    if (!ids.length) return;
    setBulk({ busy: true, done: 0, total: ids.length });
    let siguiente = 0;
    let ok = 0;
    let fallos = 0;
    // de cuatro en cuatro: Bazarr encola cada búsqueda contra sus proveedores y
    // con toda la tanda a la vez empieza a devolver errores
    const obrero = async () => {
      while (siguiente < ids.length) {
        const id = ids[siguiente++];
        const r = await api(`/subs/search/${id}`, { method: 'POST' });
        if (r.error) fallos++;
        else {
          ok++;
          marcarPedida(id);
        }
        setBulk((b) => ({ ...b, done: ok + fallos }));
      }
    };
    await Promise.all(Array.from({ length: 4 }, obrero));
    setBulk({ busy: false, done: ids.length, total: ids.length });
    toast(
      t('✓ {n} búsquedas encargadas a Bazarr', { n: ok }) +
        (fallos ? t(' · ⚠️ {n} fallaron', { n: fallos }) : ''),
      fallos && !ok ? 'error' : undefined,
    );
  };

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner label={t('Auditando los subtítulos…')} />;

  const intro = t('Para una colección de cine no anglosajón, una película sin subtítulos es una película que no tienes: aquí están las que no llegan al criterio que elegiste en Ajustes, y el botón para que Bazarr las busque.');
  const criterio = (data.options || [])
    .filter((o) => (data.criteria || []).includes(o.key))
    .map((o) => t(o.label))
    .join(' · ');

  return (
    <div>
      {!embedded ? (
        <PageHeader eyebrow={t('Tu colección')} title={t('Subtítulos')} subtitle={intro} />
      ) : (
        <p className="text-sm text-zinc-400 mb-5 max-w-3xl leading-relaxed">{intro}</p>
      )}

      {data.sinAnalizar > 0 && (
        <div className="card p-4 mb-5 text-sm">
          <p className="text-orange-300 mb-1">
            {t('⚠️ {n} películas aún no tienen sus pistas leídas', { n: data.sinAnalizar.toLocaleString(locale()) })}
          </p>
          <p className="text-zinc-400">
            {t('Los subtítulos y el audio solo llegan al sincronizar el detalle de cada película, así que estas quedan fuera del recuento hasta que hagas una re-sincronización completa. ')}
            <Link to="/ajustes" className="text-gold-400 hover:underline">{t('Ir a Ajustes → Re-sincronización completa')}</Link>
          </p>
        </div>
      )}

      {!data.enabled ? (
        <Empty>
          {t('Todavía no has dicho qué subtítulos te valen, así que no hay nada que auditar. ')}
          <Link to="/ajustes" className="text-gold-400 hover:underline">{t('Elige tu criterio en Ajustes →')}</Link>
        </Empty>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              label={t('Películas analizadas')}
              value={data.total.toLocaleString(locale())}
              sub={t('con sus pistas ya leídas')}
            />
            <StatCard
              label={t('Sin cubrir según tu criterio')}
              value={data.conProblema.toLocaleString(locale())}
              sub={criterio ? t('te valen: {langs}', { langs: criterio }) : null}
            />
            <StatCard
              label={t('Sin ningún subtítulo')}
              value={data.sinNinguno.toLocaleString(locale())}
              sub={t('ni siquiera una pista')}
            />
          </div>

          <Section
            title={
              data.conProblema > 0
                ? t('⚠️ Se quedan sin subtítulos que te sirvan ({n})', { n: data.conProblema.toLocaleString(locale()) })
                : t('✓ Todas cumplen tu criterio')
            }
          >
            {data.conProblema === 0 ? (
              <p className="text-sm text-emerald-400">
                {t('Toda la biblioteca tiene subtítulos que te valen. Nada que hacer aquí.')}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 items-center mb-3">
                  <input
                    className="input !w-64 max-sm:!w-full"
                    placeholder={t('Buscar por título…')}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <Select
                    className="!py-1 text-xs"
                    value={orden}
                    onChange={setOrden}
                    options={[
                      ['desnudas', t('Las más desnudas primero')],
                      ['ano', t('Por año, las recientes primero')],
                      ['titulo', t('Por título')],
                    ]}
                  />
                  {data.bazarr && conRadarr.length > 0 && (
                    <button className="btn-gold !py-1 text-xs" disabled={bulk.busy} onClick={buscarTodas}>
                      {bulk.busy
                        ? t('Encargando… {done}/{total}', { done: bulk.done, total: bulk.total })
                        : t('🔎 Buscar las {n} visibles en Bazarr', { n: conRadarr.length })}
                    </button>
                  )}
                  {data.faltan.length < data.conProblema && (
                    <span className="text-xs text-zinc-500">
                      {t('se enseñan las {n} primeras', { n: data.faltan.length })}
                    </span>
                  )}
                </div>

                {!data.bazarr && (
                  <p className="text-xs text-zinc-500 mb-2 max-w-3xl">
                    {t('Con Bazarr configurado en Ajustes, cada línea tendría aquí su botón para encargarle la búsqueda.')}
                  </p>
                )}

                {visibles.length === 0 ? (
                  <Empty>{t('Ninguna de las que faltan lleva ese título.')}</Empty>
                ) : (
                  <Lista>
                    {visibles.map((m) => (
                      <div key={m.id} className="px-3 py-2 flex gap-3 items-center flex-wrap">
                        <span className="text-zinc-200 truncate flex-1 min-w-40">
                          {m.title} <span className="text-zinc-500">({m.year ?? t('¿?')})</span>
                        </span>
                        <Pistas langs={m.subs} />
                        <span className="text-[11px] text-zinc-500 shrink-0" title={t('Idioma en que se rodó')}>
                          {t('rodada en {lang}', { lang: nombreIdioma(m.originalLanguage) || t('¿?') })}
                        </span>
                        {data.bazarr &&
                          (!m.radarrId ? (
                            <span className="text-[11px] text-zinc-600 shrink-0" title={t('Bazarr identifica las películas por su id de Radarr')}>
                              {t('sincroniza Radarr para poder pedirla')}
                            </span>
                          ) : pedidas.has(m.radarrId) ? (
                            <span className="text-[11px] text-emerald-400 shrink-0">{t('✓ encargada')}</span>
                          ) : (
                            <button
                              className="btn-ghost !py-0.5 text-[11px] shrink-0"
                              disabled={buscando === m.radarrId || bulk.busy}
                              onClick={() => buscarUna(m)}
                            >
                              {buscando === m.radarrId ? t('Encargando…') : t('Buscar en Bazarr')}
                            </button>
                          ))}
                      </div>
                    ))}
                  </Lista>
                )}
              </>
            )}
          </Section>
        </>
      )}

      <details className="mt-6" onToggle={abrirAudio}>
        <summary className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-200">
          {t('Doblaje colado: las que no tienen audio en su idioma original')}
        </summary>
        <p className="text-xs text-zinc-500 my-2 max-w-3xl">
          {t('Películas cuya única pista de audio está en otro idioma que aquel en el que se rodaron. No se acusa a las que no tienen ni idioma original ni pistas leídas.')}
        </p>
        {audio?.cargando && <Spinner label={t('Repasando las pistas de audio…')} />}
        {audio?.error && <ErrorBox error={audio.error} />}
        {audio && !audio.cargando && !audio.error && (
          audio.conProblema === 0 ? (
            <p className="text-sm text-emerald-400">{t('Ninguna: todas se oyen en su idioma.')}</p>
          ) : (
            <>
              <p className="text-xs text-zinc-400 mb-2">
                {t('{n} de {total} películas', {
                  n: audio.conProblema.toLocaleString(locale()),
                  total: audio.total.toLocaleString(locale()),
                })}
              </p>
              <Lista>
                {audio.faltan.map((m) => (
                  <div key={m.id} className="px-3 py-2 flex gap-3 items-center flex-wrap">
                    <span className="text-zinc-200 truncate flex-1 min-w-40">
                      {m.title} <span className="text-zinc-500">({m.year ?? t('¿?')})</span>
                    </span>
                    <Pistas langs={m.audio} />
                    <span className="text-[11px] text-zinc-500 shrink-0">
                      {t('rodada en {lang}', { lang: nombreIdioma(m.originalLanguage) || t('¿?') })}
                    </span>
                  </div>
                ))}
              </Lista>
            </>
          )
        )}
      </details>
    </div>
  );
}
