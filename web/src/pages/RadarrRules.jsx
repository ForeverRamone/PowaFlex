import { useEffect, useMemo, useRef, useState } from 'react';
import { api, tmdbImg } from '../api.js';
import { Select, Spinner } from '../components.jsx';
import { t, locale } from '../i18n.js';
import { toast } from '../toast.js';

/**
 * REGLAS AUTOMÁTICAS A RADARR.
 *
 * Una tarjeta por regla, todas independientes: se activan, se afinan y se
 * apagan por separado. La barrita de nota mínima va de 0 a 100 y el 0 significa
 * «sin filtro»: hay a quien le interesa el palmarés entero y punto.
 *
 * El aviso de arriba no es decorativo. Con reevaluación cada noche, borrar algo
 * de Radarr a mano NO basta: vuelve mañana. Para decir «esta no» está el 🚫.
 */

const GRUPOS = { festival: 'Festivales', debut: 'Secciones de debut', premio: 'Premios', canon: 'Cánones' };

function Titulo({ children, extra = null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-zinc-200">{children}</h3>
      {extra}
    </div>
  );
}

/** La barrita de 0 a 100. Escribe al soltar, no en cada píxel del arrastre. */
function UmbralBar({ value, onChange, onCommit }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-zinc-400 shrink-0">{t('Nota mínima Σ')}</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        className="accent-gold-500 w-48 max-sm:w-full"
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
      <span className={`text-xs tabular-nums ${value > 0 ? 'text-gold-400' : 'text-zinc-500'}`}>
        {value > 0 ? `Σ ≥ ${value}` : t('sin filtro: entra todo')}
      </span>
    </div>
  );
}

/** La misma barrita, pero midiendo a la PERSONA: la puntuación del detector. */
function UmbralEmergentes({ value, onCommit }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-zinc-400 shrink-0">{t('Puntuación mínima de emergente')}</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={v}
        className="accent-gold-500 w-48 max-sm:w-full"
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v !== value && onCommit(v)}
        onKeyUp={() => v !== value && onCommit(v)}
        onBlur={() => v !== value && onCommit(v)}
      />
      <span className="text-xs tabular-nums text-gold-400">≥ {v}</span>
      <span className="text-[11px] text-zinc-500">{t('la puntuación del detector, no la nota de la película')}</span>
    </div>
  );
}

/**
 * Campo numérico que NO manda la cadena vacía.
 *
 * Borrar el contenido para reteclearlo mandaba un `''` que el servidor
 * convertía en 0 — y en «Tope por pasada» 0 significa SIN TOPE. Vaciar la
 * casilla medio segundo dejaba la regla ilimitada. Ahora el hueco se ve en
 * pantalla (estado local) pero solo se guarda cuando hay un número.
 */
function NumeroCampo({ label, value, min, max, hint = null, onChange }) {
  const [texto, setTexto] = useState(value ?? '');
  useEffect(() => { setTexto(value ?? ''); }, [value]);
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-400" title={hint || undefined}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        className="input !w-20 text-center !py-1"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          if (e.target.value.trim() !== '') onChange(e.target.value);
        }}
        onBlur={() => { if (String(texto).trim() === '') setTexto(value ?? ''); }}
      />
    </label>
  );
}

/**
 * El nombre de la regla se compone AQUÍ, no en el servidor: el servidor lo
 * manda en castellano (sus mensajes compuestos no están traducidos) y así la
 * tarjeta se lee en inglés cuando toca. `label` queda de respaldo por si la
 * fuente ya no está en el catálogo.
 */
function etiqueta(regla, catalog) {
  if (regla.kind === 'festival') {
    const f = catalog?.festival?.find((x) => x.key === regla.source);
    const sc = f?.scopes?.find((x) => x.key === regla.scope);
    if (f) return `${t(f.name)} · ${t(sc?.label || regla.scope)}`;
  }
  if (regla.kind === 'estrenos') {
    const e = catalog?.estrenos?.find((x) => x.key === regla.source);
    if (e) return `${t('Estrenos')} · ${t(e.name)}`;
  }
  if (regla.kind === 'favoritos') {
    const r = catalog?.favoritos?.find((x) => x.key === regla.source);
    if (r) return `${t('Mis favoritos')} · ${t(r.name)}`;
  }
  if (regla.kind === 'emergentes') {
    const a = catalog?.emergentes?.find((x) => x.key === regla.source);
    if (a) return `${t('Emergentes')} · ${t(a.name)}`;
  }
  return regla.label;
}

function ReglaCard({ regla, catalog, onPatch, onDelete, onRun, corriendo, parte }) {
  const [umbral, setUmbral] = useState(regla.min_score);
  useEffect(() => { setUmbral(regla.min_score); }, [regla.min_score]);
  const nombre = etiqueta(regla, catalog);

  const conUmbral = umbral > 0;
  const resumenDescartes = parte?.porMotivo
    ? Object.entries(parte.porMotivo).map(([m, n]) => `${t(MOTIVO_TEXTO[m] || m)}: ${n}`).join(' · ')
    : null;

  return (
    <div className={`rounded-lg border p-3 ${regla.enabled ? 'border-ink-600 bg-ink-800/40' : 'border-ink-700 opacity-60'}`}>
      <Titulo
        extra={
          <button
            className="text-xs text-zinc-500 hover:text-red-400 shrink-0 disabled:opacity-40"
            disabled={corriendo}
            title={corriendo ? t('Hay una pasada en curso') : t('Borrar la regla')}
            onClick={() => {
              if (!window.confirm(t('¿Borrar la regla «{r}»? Lo que ya mandó a Radarr se queda.', { r: nombre }))) return;
              onDelete(regla.id);
            }}
          >
            {t('borrar')}
          </button>
        }
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-gold-500"
            checked={!!regla.enabled}
            onChange={(e) => onPatch(regla.id, { enabled: e.target.checked })}
          />
          {nombre}
        </label>
      </Titulo>

      {regla.invalid && (
        <p className="text-[11px] text-red-400 mt-1">⚠️ {regla.invalid}</p>
      )}

      <div className="mt-3 space-y-2">
        {/* El umbral de una regla de emergentes es el del DETECTOR —la persona,
            de 0 a 100— y no la Σ de la película: son dos números distintos y
            enseñar los dos a la vez sería garantizar que se confunden. */}
        {regla.kind === 'emergentes' ? (
          <UmbralEmergentes
            value={regla.min_emerging ?? 70}
            onCommit={(v) => onPatch(regla.id, { min_emerging: v })}
          />
        ) : (
          <UmbralBar value={umbral} onChange={setUmbral} onCommit={() => {
            if (umbral !== regla.min_score) onPatch(regla.id, { min_score: umbral });
          }} />
        )}

        {conUmbral && (
          <label className="flex items-center gap-2 text-[11px] text-zinc-500 cursor-pointer">
            <input
              type="checkbox"
              className="accent-gold-500"
              checked={!!regla.allow_unrated}
              onChange={(e) => onPatch(regla.id, { allow_unrated: e.target.checked })}
            />
            {t('Mandar también las que aún no tienen nota (por defecto esperan a tenerla)')}
          </label>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <NumeroCampo
            label={t('Tope por pasada')}
            value={regla.cap}
            min={0}
            max={500}
            hint={t('0 = sin tope. Un palmarés histórico son cientos de películas.')}
            onChange={(v) => onPatch(regla.id, { cap: v })}
          />
          {/* solo la vista por año tiene «ediciones»: un palmarés histórico es
              uno y no se cuenta hacia atrás */}
          {regla.kind === 'festival' && regla.scope === 'edicion' && (
            <NumeroCampo
              label={t('Últimas ediciones')}
              value={regla.editions}
              min={1}
              max={10}
              hint={t('Cuántas ediciones publicadas mirar hacia atrás')}
              onChange={(v) => onPatch(regla.id, { editions: v })}
            />
          )}
          {regla.kind === 'estrenos' && (
            <NumeroCampo
              label={t('Días alrededor del estreno')}
              value={regla.window_days}
              min={1}
              max={90}
              hint={t('Mientras dure la ventana se vuelve a mirar su nota cada noche')}
              onChange={(v) => onPatch(regla.id, { window_days: v })}
            />
          )}
          {regla.kind === 'favoritos' && (
            <>
              <NumeroCampo
                label={t('Meses por delante')}
                value={regla.months}
                min={1}
                max={24}
                onChange={(v) => onPatch(regla.id, { months: v })}
              />
              <NumeroCampo
                label={t('Días hacia atrás')}
                value={regla.lookback_days}
                min={0}
                max={365}
                hint={t('TMDB a veces pone fecha a las películas pequeñas después del estreno; con 0 esas se pierden')}
                onChange={(v) => onPatch(regla.id, { lookback_days: v })}
              />
            </>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              className="accent-gold-500"
              checked={!!regla.include_docs}
              onChange={(e) => onPatch(regla.id, { include_docs: e.target.checked })}
            />
            {t('Incluir documentales')}
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button className="btn-ghost !py-1 text-xs" disabled={corriendo} onClick={() => onRun(regla.id, true)}>
            {t('Previsualizar')}
          </button>
          <button className="btn-ghost !py-1 text-xs" disabled={corriendo} onClick={() => onRun(regla.id, false)}>
            {t('Ejecutar ahora')}
          </button>
          {regla.last_run_at > 0 && (
            <span className="text-[11px] text-zinc-500">
              {t('última pasada: {d} · {a} añadidas de {c}', {
                d: new Date(regla.last_run_at).toLocaleString(locale()),
                a: regla.last_added ?? 0,
                c: regla.last_considered ?? 0,
              })}
            </span>
          )}
          {regla.last_error && <span className="text-[11px] text-red-400">⚠️ {regla.last_error}</span>}
        </div>

        {parte && (
          <div className="text-[11px] text-zinc-400 border-t border-ink-700 pt-2">
            {parte.error ? (
              <span className="text-red-400">⚠️ {parte.error}</span>
            ) : (
              <span>
                {t('{c} pasan el filtro · {s} descartadas', { c: parte.considered, s: parte.skipped })}
                {resumenDescartes ? ` — ${resumenDescartes}` : ''}
              </span>
            )}
            {parte.log?.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer hover:text-zinc-200">{t('ver detalle')}</summary>
                <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                  {parte.log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Los motivos que devuelve el servidor, en cristiano. Las claves son las de
// MOTIVOS en server/src/rules.js: si se añade una allí, va también aquí.
const MOTIVO_TEXTO = {
  sin_ficha: 'sin ficha en TMDB',
  ya_la_tienes: 'ya la tienes',
  vetada: 'vetada (🚫)',
  descartada: 'descartada (✕)',
  corto: 'cortometraje',
  documental: 'documental',
  telefilme: 'telefilme',
  evento: 'gala o evento',
  cameo: 'papel testimonial',
  fuera_de_ventana: 'fuera de la ventana',
  esperando_nota: 'esperando nota',
  bajo_umbral: 'bajo el umbral',
  tope: 'aplazadas por el tope',
  cuarentena: 'en cuarentena, esperan tu ✓',
};

/** El formulario de alta: tipo → fuente → (vista, solo festivales). */
function NuevaRegla({ catalog, existentes, onCreate }) {
  const [abierto, setAbierto] = useState(false);
  const [kind, setKind] = useState('festival');
  const [source, setSource] = useState('');
  const [scope, setScope] = useState('');

  const fest = catalog.festival.find((f) => f.key === source);
  const scopes = kind === 'festival' && fest ? fest.scopes : [];

  // ya existente = no se puede duplicar; se marca en el desplegable
  const yaEsta = (k, s, sc) => existentes.some((r) => r.kind === k && r.source === s && (r.scope || '') === (sc || ''));

  const opcionesFuente =
    kind === 'festival'
      ? catalog.festival.map((f) => [f.key, `${t(GRUPOS[f.group] || f.group)} · ${t(f.name)}`])
      : kind === 'estrenos'
        ? catalog.estrenos.map((e) => [e.key, t(e.name)])
        : kind === 'emergentes'
          ? (catalog.emergentes || []).map((a) => [a.key, t(a.name)])
          : catalog.favoritos.map((r) => [r.key, t(r.name)]);

  const elegirKind = (k) => {
    setKind(k);
    setSource('');
    setScope('');
  };

  const elegirSource = (s) => {
    setSource(s);
    const f = catalog.festival.find((x) => x.key === s);
    setScope(kind === 'festival' && f ? (f.scopes.find((sc) => !yaEsta('festival', s, sc.key))?.key || f.scopes[0].key) : '');
  };

  if (!abierto) {
    return (
      <button className="btn-ghost !py-1 text-xs" onClick={() => setAbierto(true)}>
        {t('+ Añadir regla')}
      </button>
    );
  }

  const listo = source && (kind !== 'festival' || scope);
  const duplicada = listo && yaEsta(kind, source, scope);

  return (
    <div className="rounded-lg border border-dashed border-ink-600 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={kind}
          onChange={elegirKind}
          options={[
            ['festival', t('Festival, premio o canon')],
            ['estrenos', t('Estrenos')],
            ['favoritos', t('Mis favoritos')],
            ['emergentes', t('Directores emergentes')],
          ]}
        />
        <Select value={source} onChange={elegirSource} options={opcionesFuente} placeholder={t('— elige —')} />
        {kind === 'festival' && scopes.length > 0 && (
          <Select value={scope} onChange={setScope} options={scopes.map((s) => [s.key, t(s.label)])} />
        )}
        <button
          className="btn-gold !py-1 text-xs"
          disabled={!listo || duplicada}
          onClick={async () => {
            const r = await onCreate({ kind, source, scope: kind === 'festival' ? scope : '' });
            if (!r?.error) {
              setAbierto(false);
              setSource('');
              setScope('');
            }
          }}
        >
          {t('Crear')}
        </button>
        <button className="btn-ghost !py-1 text-xs" onClick={() => setAbierto(false)}>{t('Cancelar')}</button>
      </div>
      {duplicada && <p className="text-[11px] text-amber-400">{t('Esa regla ya existe: afínala en su tarjeta.')}</p>}
      <p className="text-[11px] text-zinc-500">
        {kind === 'emergentes'
          ? t('Nace pidiendo 70 de puntuación y con tope de 10 por pasada. Se apoya en el detector, que se rehace cada semana.')
          : t('Nace sin umbral (entra todo) y con tope de 20 por pasada. Ajusta la barrita después.')}
      </p>
    </div>
  );
}

/**
 * CUARENTENA PRE-RADARR: los criterios y la bandeja de lo que espera tu ✓.
 *
 * Los criterios son GLOBALES a todas las reglas a propósito: son un juicio tuyo
 * sobre qué procedencias merecen una segunda mirada —«pelis ruido muy
 * hiperhinchadas en notas»—, no una propiedad de la fuente de cada regla.
 */
/**
 * El motivo, compuesto AQUÍ y no en el servidor: la bandeja se pinta en el
 * idioma de la interfaz, y una frase ya redactada en castellano es justo lo
 * que deja sin traducir a los avisos viejos. El servidor manda las piezas
 * (`reason_kind` + `reason_value`) y guarda su propia frase para el historial.
 */
// el valor del motivo es un código ISO («hi», «IN»): se enseña con su NOMBRE
// en el idioma de la interfaz, que es como se eligen ahora los criterios
const nombreDeCodigo = (code, tipo) => {
  try {
    const dn = new Intl.DisplayNames([locale()], { type: tipo });
    const probe = tipo === 'region' ? String(code).toUpperCase() : String(code).toLowerCase();
    const name = dn.of(probe);
    return name && name.toLowerCase() !== probe.toLowerCase() ? name : code;
  } catch {
    return code;
  }
};

const motivoLegible = (p) => {
  if (p.reason_kind === 'idioma') return t('idioma {x}', { x: nombreDeCodigo(p.reason_value, 'language') });
  if (p.reason_kind === 'pais') return t('país {x}', { x: nombreDeCodigo(p.reason_value, 'region') });
  return p.reason || '';
};

/** Una película esperando tu ✓: cartel pequeño, el porqué, y las dos salidas. */
function FilaPendiente({ p, onAprobar, onRechazar }) {
  const cartel = tmdbImg(p.poster_path, 'w92');
  return (
    <div className="flex items-center gap-3 text-xs bg-ink-800/40 rounded-lg px-3 py-2">
      {/* el cartel no es adorno: decidir «esta sí, esta no» a ciegas sobre un
          título que no conoces es lo que hace que la bandeja se abandone */}
      {cartel ? (
        <img src={cartel} alt="" loading="lazy" className="w-8 h-12 object-cover rounded shrink-0 bg-ink-700" />
      ) : (
        <div className="w-8 h-12 rounded shrink-0 bg-ink-700" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-zinc-200 truncate">{p.title || `TMDB ${p.tmdb_id}`}</span>
          {p.year && <span className="text-zinc-500">{p.year}</span>}
          {p.score != null && <span className="text-gold-400 tabular">Σ {p.score}</span>}
        </div>
        <div className="text-zinc-500 truncate">
          {motivoLegible(p)}
          {p.rule_label ? ` · ${p.rule_label}` : ''}
        </div>
      </div>
      <span className="flex items-center gap-2 shrink-0">
        <button className="btn-gold !py-0.5 !px-2" onClick={() => onAprobar(p)}>{t('✓ A Radarr')}</button>
        <button
          className="btn-ghost !py-0.5 !px-2"
          title={t('La veta: ninguna regla la volverá a proponer')}
          onClick={() => onRechazar(p)}
        >
          🚫
        </button>
      </span>
    </div>
  );
}

/**
 * Todos los códigos ISO de dos letras que el navegador sabe NOMBRAR en el
 * idioma de la interfaz, vía Intl.DisplayNames: cero datasets que mantener.
 * Un código sin nombre asignado vuelve tal cual (o revienta) y se descarta.
 */
function codigosConNombre(tipo) {
  let dn;
  try {
    dn = new Intl.DisplayNames([locale()], { type: tipo });
  } catch {
    return [];
  }
  const out = [];
  for (let a = 97; a <= 122; a++) {
    for (let b = 97; b <= 122; b++) {
      const code = String.fromCharCode(a) + String.fromCharCode(b);
      const probe = tipo === 'region' ? code.toUpperCase() : code;
      let name;
      try {
        name = dn.of(probe);
      } catch {
        continue;
      }
      if (name && name.toLowerCase() !== probe.toLowerCase()) out.push({ code, name });
    }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, locale()));
}

/**
 * Selector de idiomas/países por NOMBRE. Antes eran dos campos de texto libre
 * con códigos ISO a pelo («hi, ta, te») — Ramón: complejo de usar y nada
 * sencillo. Ahora se escribe «hindi» o «India», se pulsa, y el chip enseña el
 * nombre; el código solo vive en el ajuste guardado, que no cambia de formato
 * (códigos separados por comas) para no tocar el motor ni las copias.
 */
function SelectorCodigos({ tipo, etiqueta, valor, onCambiar, frecuentes = [] }) {
  const [busca, setBusca] = useState('');
  const todos = useMemo(() => codigosConNombre(tipo), [tipo]);
  const porCodigo = useMemo(() => new Map(todos.map((x) => [x.code, x.name])), [todos]);
  const parse = (v) =>
    [...new Set(String(v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))];
  // ESTADO LOCAL con el prop de arranque: derivarlo del prop en cada render
  // perdía chips — cada clic dispara PUT + recarga de criterios, y un segundo
  // clic antes de que vuelva la recarga recalculaba desde el valor viejo y
  // pisaba el anterior. Una vez tocado, manda lo local; el prop solo entra
  // mientras no se ha editado (p. ej. la carga inicial). El Set de `parse`
  // además pliega duplicados guardados a mano («hi, hi»), que duplicaban keys.
  const [elegidos, setElegidos] = useState(() => parse(valor));
  const tocado = useRef(false);
  useEffect(() => {
    if (!tocado.current) setElegidos(parse(valor));
  }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  const nombreDe = (c) => porCodigo.get(c) || c.toUpperCase();
  const formato = (c) => (tipo === 'region' ? c.toUpperCase() : c);
  const guarda = (lista) => {
    tocado.current = true;
    setElegidos(lista);
    onCambiar(lista.map(formato).join(', '));
  };
  const añade = (c) => {
    if (!elegidos.includes(c)) guarda([...elegidos, c]);
    setBusca('');
  };
  const q = busca.trim().toLowerCase();
  const candidatos = q
    ? todos.filter((x) => (x.name.toLowerCase().includes(q) || x.code === q) && !elegidos.includes(x.code)).slice(0, 8)
    : [];
  const sugeridos = frecuentes.filter((c) => !elegidos.includes(c));
  return (
    <div>
      <label className="text-xs text-zinc-400">{etiqueta}</label>
      {elegidos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {elegidos.map((c) => (
            <button
              key={c}
              className="btn-ghost !py-0.5 !px-2 text-xs !border-gold-400/60 text-zinc-200"
              title={t('Quitar {x}', { x: nombreDe(c) })}
              onClick={() => guarda(elegidos.filter((x) => x !== c))}
            >
              {nombreDe(c)} <span className="text-zinc-500">✕</span>
            </button>
          ))}
        </div>
      )}
      <input
        className="input mt-1.5"
        placeholder={tipo === 'region' ? t('Escribe un país (India, Nigeria…)') : t('Escribe un idioma (hindi, tamil…)')}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {candidatos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {candidatos.map((x) => (
            <button key={x.code} className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => añade(x.code)}>
              + {x.name}
            </button>
          ))}
        </div>
      )}
      {q && !candidatos.length && (
        <p className="text-[11px] text-zinc-500 mt-1">{t('Nada con ese nombre.')}</p>
      )}
      {!q && sugeridos.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-1.5 mt-1.5">
          <span className="text-[11px] text-zinc-500">{t('Frecuentes:')}</span>
          {sugeridos.map((c) => (
            <button key={c} className="btn-ghost !py-0.5 !px-2 text-xs text-zinc-400" onClick={() => añade(c)}>
              + {nombreDe(c)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Cuarentena({ criterios, pendientes, onGuardar, onAprobar, onRechazar, onTodas }) {

  return (
    <div className="mt-5 pt-4 border-t border-ink-700">
      <Titulo
        extra={
          pendientes.length > 0 ? (
            <span className="badge-quiet">{t('{n} esperando tu ✓', { n: pendientes.length })}</span>
          ) : null
        }
      >
        {t('Cuarentena antes de Radarr')}
      </Titulo>
      <p className="text-[11px] text-zinc-500 mt-1 max-w-3xl">
        {t('Lo que cumpla estos criterios no se manda solo: espera tu aprobación. Para lo que pasa el umbral y aun así merece una segunda mirada. Vale para todas las reglas.')}
      </p>

      <label className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer mt-3">
        <input
          type="checkbox"
          className="accent-gold-500"
          checked={!!criterios?.enabled}
          onChange={(e) => onGuardar({ quarantine_enabled: e.target.checked ? '1' : '0' })}
        />
        {t('Poner en cuarentena lo que cumpla alguno de estos criterios')}
      </label>

      {criterios?.enabled && (
        <div className="grid sm:grid-cols-2 gap-4 mt-3 ml-6 max-w-2xl">
          {/* por nombre y con chips: aquí se escribía «hi, ta, te» a pelo y
              había que saberse los códigos ISO de memoria */}
          <SelectorCodigos
            tipo="language"
            etiqueta={t('Idiomas originales')}
            valor={criterios?.texto?.langs ?? ''}
            onCambiar={(v) => onGuardar({ quarantine_langs: v })}
            frecuentes={['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'tl', 'id', 'tr']}
          />
          <SelectorCodigos
            tipo="region"
            etiqueta={t('Países de producción')}
            valor={criterios?.texto?.countries ?? ''}
            onCambiar={(v) => onGuardar({ quarantine_countries: v })}
            frecuentes={['in', 'ng', 'ph', 'id', 'tr', 'bd', 'pk', 'eg']}
          />
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {pendientes.map((p) => (
            <FilaPendiente key={p.tmdb_id} p={p} onAprobar={onAprobar} onRechazar={onRechazar} />
          ))}
          {/* con una regla sobre un país entero, veinte de una en una es lo que
              hace que la bandeja se abandone */}
          {pendientes.length > 1 && (
            <div className="flex items-center gap-2 pt-1">
              <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => onTodas('aprobar')}>
                {t('✓ Aprobar las {n}', { n: pendientes.length })}
              </button>
              <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => onTodas('rechazar')}>
                {t('🚫 Vetar las {n}', { n: pendientes.length })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Las películas que vetaste al pase automático desde Cine venidero (🚫). Aquí
 * se repasan y se deshacen: una vez estrenada, la ficha desaparece del
 * calendario y el veto se quedaría sin sitio donde tocarlo.
 *
 * Vive con las reglas porque el veto vale para TODAS: es la forma de decir
 * «esta no» a un robot que reevalúa cada noche.
 */
function VetadasList() {
  const [vetadas, setVetadas] = useState(null);
  const load = () => api('/radarr/auto/veto').then((r) => Array.isArray(r) && setVetadas(r));
  useEffect(() => { load(); }, []);
  if (!vetadas?.length) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
        {t('🚫 {n} fuera del pase automático', { n: vetadas.length })}
      </summary>
      <p className="text-[11px] text-zinc-500 mt-1 mb-2 max-w-2xl">
        {t('El automático las ignora. Se siguen viendo en Cine venidero y se mandan a mano cuando quieras.')}
      </p>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {vetadas.map((v) => (
          <div key={v.tmdb_id} className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="truncate">{v.title || `TMDB ${v.tmdb_id}`}</span>
            <button
              className="text-gold-400 hover:underline shrink-0"
              onClick={async () => {
                const r = await api(`/radarr/auto/veto/${v.tmdb_id}`, { method: 'DELETE' });
                if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
                load();
              }}
            >
              {t('quitar el veto')}
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function RadarrRulesSection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [corriendo, setCorriendo] = useState(false);
  // Los campos pendientes de guardar, ACUMULADOS por regla. Antes había un
  // temporizador por regla que guardaba solo el último `campos`: tocar el tope
  // y acto seguido las ediciones mandaba únicamente lo segundo y lo primero se
  // perdía sin decir nada.
  const pendientes = useRef({});
  const timers = useRef({});
  const sondeo = useRef(null);

  const load = () =>
    api('/radarr/rules').then((r) => {
      if (r?.error) { setError(r.error); return null; }
      setError(null);
      setData(r);
      return r;
    });

  // Al salir de Ajustes se VUELCA lo pendiente, no se tira. Con el debounce a
  // medio segundo, cambiar algo y cambiar de pestaña perdía el cambio.
  const volcar = () => {
    for (const [id, campos] of Object.entries(pendientes.current)) {
      clearTimeout(timers.current[id]);
      navigator.sendBeacon?.(
        `/api/radarr/rules/${id}`,
        new Blob([JSON.stringify(campos)], { type: 'application/json' })
      ) || fetch(`/api/radarr/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos),
        keepalive: true,
      }).catch(() => {});
    }
    pendientes.current = {};
  };

  useEffect(() => {
    load();
    return () => {
      volcar();
      clearInterval(sondeo.current);
    };
  }, []);

  const patch = (id, campos) => {
    // pintado optimista: la barrita no puede dar tirones esperando al servidor
    setData((d) => (d ? { ...d, rules: d.rules.map((r) => (r.id === id ? { ...r, ...campos } : r)) } : d));
    pendientes.current[id] = { ...(pendientes.current[id] || {}), ...campos };
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const cuerpo = pendientes.current[id];
      delete pendientes.current[id];
      if (!cuerpo) return;
      const r = await api(`/radarr/rules/${id}`, { method: 'PUT', body: cuerpo });
      if (r?.error) {
        toast(`⚠️ ${t(r.error)}`, 'error');
        load(); // deshace el pintado optimista con lo que diga el servidor
        return;
      }
      // solo se pisa la fila si no ha quedado nada más pendiente entre medias
      if (!pendientes.current[id]) {
        setData((d) => (d ? { ...d, rules: d.rules.map((x) => (x.id === id ? r : x)) } : d));
      }
    }, 500);
  };

  /** Manda YA lo pendiente: ejecutar con los ajustes viejos no vale. */
  const guardarPendientes = async () => {
    const ids = Object.keys(pendientes.current);
    if (!ids.length) return;
    for (const id of ids) {
      clearTimeout(timers.current[id]);
      const cuerpo = pendientes.current[id];
      delete pendientes.current[id];
      await api(`/radarr/rules/${id}`, { method: 'PUT', body: cuerpo });
    }
    await load();
  };

  const crear = async (body) => {
    const r = await api('/radarr/rules', { method: 'POST', body });
    if (r?.error) toast(`⚠️ ${t(r.error)}`, 'error');
    else {
      toast(t('Regla creada'));
      load();
    }
    return r;
  };

  const borrar = async (id) => {
    const r = await api(`/radarr/rules/${id}`, { method: 'DELETE' });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    setStatus(null);
    load();
  };

  /**
   * La pasada corre en el servidor y aquí se SONDEA. Servirla dentro de la
   * petición hacía que un palmarés entero se comiera el tiempo de espera de
   * cualquier proxy inverso: 504 en pantalla mientras Radarr seguía recibiendo.
   */
  const ejecutar = async (ruleId, dryRun) => {
    await guardarPendientes();
    setCorriendo(true);
    setStatus(null);
    const r = await api('/radarr/rules/run', { method: 'POST', body: { ruleId, dryRun } });
    if (r?.error) {
      toast(`⚠️ ${t(r.error)}`, 'error');
      setCorriendo(false);
      return;
    }
    setStatus(r.status || null);
    clearInterval(sondeo.current);
    sondeo.current = setInterval(async () => {
      const o = await load();
      if (!o) return;
      setStatus(o.status || null);
      if (!o.status?.running) {
        clearInterval(sondeo.current);
        setCorriendo(false);
      }
    }, 1500);
  };

  const guardarCriterios = async (campos) => {
    const r = await api('/settings', { method: 'PUT', body: campos });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    load();
  };

  const aprobar = async (p) => {
    const r = await api(`/radarr/pending/${p.tmdb_id}/approve`, { method: 'POST' });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    toast(t('✓ «{p}» mandada a Radarr', { p: p.title || p.tmdb_id }));
    load();
  };

  const rechazar = async (p) => {
    const r = await api(`/radarr/pending/${p.tmdb_id}`, { method: 'DELETE' });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    load();
  };

  /** Vaciar la bandeja de una vez. Vetar en bloque es irreversible: se pregunta. */
  const todas = async (accion) => {
    const n = data?.pendientes?.length || 0;
    if (accion === 'rechazar' && !window.confirm(t('¿Vetar las {n} en cuarentena? Ninguna regla las volverá a proponer.', { n }))) return;
    const r = await api('/radarr/pending/all', { method: 'POST', body: { accion } });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    if (accion === 'aprobar') {
      // lo que Radarr rechazó se queda en la bandeja: hay que decirlo, o el
      // recuento que baja «casi del todo» parece un fallo de la pantalla
      toast(
        r.errores?.length
          ? t('✓ {n} mandadas a Radarr · {e} no se pudieron añadir', { n: r.aprobadas, e: r.errores.length })
          : t('✓ {n} mandadas a Radarr', { n: r.aprobadas }),
        r.errores?.length ? 'error' : 'info'
      );
    }
    load();
  };

  /** 🚫 sobre una película que una regla ya mandó: la única forma de que no vuelva. */
  const vetar = async (tmdbId, title) => {
    const r = await api('/radarr/auto/veto', { method: 'POST', body: { tmdbId, title } });
    if (r?.error) return toast(`⚠️ ${t(r.error)}`, 'error');
    toast(t('🚫 «{p}» no volverá a entrar por ninguna regla', { p: title || tmdbId }));
    load();
  };

  if (error) {
    return (
      <div className="text-xs text-red-400">
        ⚠️ {t(error)}{' '}
        <button className="text-gold-400 hover:underline" onClick={() => { setError(null); setData(null); load(); }}>
          {t('reintentar')}
        </button>
      </div>
    );
  }
  if (!data) return <Spinner label={t('Leyendo tus reglas automáticas…')} />;

  const parteDe = (id) => status?.rules?.find((x) => x.id === id) || null;
  const porTipo = (k) => data.rules.filter((r) => r.kind === k);
  const activas = data.rules.filter((r) => r.enabled && !r.invalid).length;

  // sin caja propia: la pone quien la monta (hoy, la pestaña Automatismos)
  return (
    <div>
      <Titulo
        extra={
          <div className="flex items-center gap-2">
            <button className="btn-ghost !py-1 text-xs" disabled={corriendo || !activas} onClick={() => ejecutar(null, true)}>
              {t('Previsualizar todas')}
            </button>
            <button
              className="btn-gold !py-1 text-xs"
              disabled={corriendo || !activas}
              onClick={() => {
                // sin esto, un clic podía mandar cientos de películas a Radarr
                // de golpe (una regla de palmarés sin tope son 300)
                const tope = data.rules.filter((r) => r.enabled && !r.invalid)
                  .reduce((n, r) => n + (r.cap > 0 ? r.cap : 500), 0);
                if (!window.confirm(t('Vas a ejecutar {n} regla(s) sobre Radarr ahora mismo (hasta {m} películas). ¿Sigo?', { n: activas, m: tope }))) return;
                ejecutar(null, false);
              }}
            >
              {t('Ejecutar todas')}
            </button>
          </div>
        }
      >
        {t('Reglas automáticas a Radarr')}
      </Titulo>

      <p className="text-[11px] text-zinc-500 mt-1 max-w-3xl">
        {t('Cada regla vigila una cosa —un festival, un premio, una región, un oficio— y manda a Radarr lo que pase su filtro. Se revisan cada noche: lo que hoy no llega al umbral puede entrar mañana.')}
      </p>
      <p className="text-[11px] text-amber-400/80 mt-1 max-w-3xl">
        {t('⚠️ Borrar algo de Radarr a mano no basta: volvería esta noche. Para que no vuelva, pulsa su 🚫 en el historial de abajo.')}
      </p>
      {!data.radarrConfigurado && (
        <p className="text-[11px] text-red-400 mt-1">{t('Radarr no está configurado: las reglas no se ejecutarán.')}</p>
      )}
      {/* Una regla con umbral y sin clave de MDBList no añade nada NUNCA: se
          queda esperando una nota que no va a llegar. Hasta ahora eso solo se
          sabía ejecutándola y leyendo el aviso de la pasada. */}
      {data.mdblistConfigurado === false && data.rules?.some((r) => r.enabled && r.min_score > 0) && (
        <p className="text-[11px] text-red-400 mt-1">
          {t('Sin clave de MDBList no hay nota Σ: las reglas con umbral se quedarán esperando sin añadir nada.')}
        </p>
      )}

      {corriendo && <div className="text-xs text-zinc-400 mt-3">{t('Ejecutando reglas…')}</div>}
      {status?.error && <div className="text-xs text-red-400 mt-3">⚠️ {status.error}</div>}
      {status?.aviso && <div className="text-xs text-amber-400 mt-3">⚠️ {t(status.aviso)}</div>}
      {status && !status.error && (
        <div className="text-xs text-zinc-300 mt-3">
          {status.dryRun
            ? t('{c} películas entrarían en Radarr ({s} descartadas)', { c: status.considered, s: status.skipped })
            : t('✓ {a} añadidas de {c} candidatas ({s} descartadas)', { a: status.added, c: status.considered, s: status.skipped })}
        </div>
      )}

      {/* Un tipo de regla que falte AQUÍ se puede crear y no se ve nunca: la
          tarjeta no existe, así que no hay forma de afinarla ni de borrarla.
          Hay un test que compara esta lista con RULE_KINDS del servidor. */}
      {[
        ['festival', t('Festivales, premios y cánones')],
        ['estrenos', t('Estrenos')],
        ['favoritos', t('Mis favoritos')],
        ['emergentes', t('Directores emergentes')],
      ].map(([kind, titulo]) => (
        <div key={kind} className="mt-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{titulo}</div>
          {porTipo(kind).length === 0 ? (
            <p className="text-[11px] text-zinc-600">{t('sin reglas de este tipo')}</p>
          ) : (
            <div className="space-y-2">
              {porTipo(kind).map((r) => (
                <ReglaCard
                  key={r.id}
                  regla={r}
                  catalog={data.catalog}
                  onPatch={patch}
                  onDelete={borrar}
                  onRun={ejecutar}
                  corriendo={corriendo}
                  parte={parteDe(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="mt-4">
        <NuevaRegla catalog={data.catalog} existentes={data.rules} onCreate={crear} />
      </div>

      <Cuarentena
        criterios={data.criterios}
        pendientes={data.pendientes || []}
        onGuardar={guardarCriterios}
        onAprobar={aprobar}
        onRechazar={rechazar}
        onTodas={todas}
      />

      {data.log?.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
            {t('Historial de las reglas (30 días)')}
          </summary>
          <div className="mt-2 max-h-64 overflow-y-auto space-y-0.5 text-[11px] text-zinc-500">
            {data.log.map((l) => (
              <div key={l.id} className="flex gap-2">
                <span className="text-zinc-600 shrink-0 tabular-nums">{new Date(l.at).toLocaleString(locale())}</span>
                <span className={l.action === 'added' ? 'text-emerald-400' : l.action === 'error' ? 'text-red-400' : ''}>
                  {l.action === 'added' ? '✓' : l.action === 'error' ? '⚠️' : '·'}
                </span>
                <span className="truncate">
                  {l.title || l.detail}
                  {l.title && l.score != null ? ` · Σ ${l.score}` : ''}
                </span>
                {l.action === 'added' && l.tmdb_id && (
                  <button
                    className="shrink-0 ml-auto hover:text-red-400"
                    title={t('Que ninguna regla la vuelva a mandar')}
                    onClick={() => vetar(l.tmdb_id, l.title)}
                  >
                    🚫
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <VetadasList />
    </div>
  );
}
