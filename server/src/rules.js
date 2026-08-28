/**
 * REGLAS AUTOMÁTICAS A RADARR
 *
 * Un motor modular: cada regla es una fila independiente que dice QUÉ mirar
 * (un festival, un premio, los estrenos de una región, tus favoritos de un
 * oficio) y CON QUÉ FILTRO (un umbral Σ de 0 a 100, un tope por pasada, una
 * ventana de días alrededor del estreno). Se activan y se afinan por separado,
 * y se pueden tener todas las que se quieran.
 *
 * El módulo está partido en dos mitades a propósito:
 *
 *  1. `evaluarRegla` es PURA: recibe unas candidatas y el contexto (lo que ya
 *     tienes, lo vetado, la fecha de hoy) y decide qué entra, qué se queda
 *     fuera y por qué. Sin red, sin base de datos, sin Radarr. Es lo que se
 *     puede poner a prueba de verdad.
 *  2. `candidatasDeRegla` trae los datos, y siempre por las funciones YA
 *     cacheadas de la app (festivalEdition, festivalWinners, releases,
 *     candidatasDeFavoritos). Una regla no abre una vía nueva a TMDB ni a
 *     Wikipedia: se cuelga de lo que la app ya consulta.
 *
 * DECISIONES DE PRODUCTO que explican la forma del código:
 *
 *  - **Reevaluación cada noche**, no una vez al publicarse la lista. Una
 *    película de festival tarda semanas en tener nota; si se juzgara el día
 *    que aparece en Wikipedia, el umbral no serviría de nada.
 *  - **Con umbral y sin nota, se ESPERA.** Mandar a ciegas lo que aún no tiene
 *    Σ vacía el umbral de sentido. Quien prefiera lo contrario tiene la
 *    casilla «mándala igual».
 *  - **Umbral 0 = sin filtro**: entra todo, con nota o sin ella. Hay a quien le
 *    interesa el palmarés entero de Cannes y punto.
 *  - **Tope por pasada** (20 por defecto, 0 = sin tope). Un palmarés histórico
 *    son cientos de películas: sin tope, la primera noche te llena el disco.
 *  - **Borrar de Radarr NO basta**: con reevaluación nocturna vuelve mañana.
 *    Para decir «esta no», el 🚫 (auto_radarr_vetoed) o el ✕ de Descubrir.
 */
import { db, getSetting } from './db.js';
import { today } from './dates.js';
import { REGISTRY, festivalEdition, festivalWinners } from './festivals.js';
import { RELEASE_KINDS, releases } from './releases.js';
import { ROLES, asRole } from './roles.js';
import { enrichRuntimes } from './tmdb.js';
import { enrichWithScores, refrescarNotasDeReglas, hayClaveMdblist } from './mdblist.js';
import { radarrAdd, radarrOwnedIds } from './radarr.js';
import { autoRadarrExcluidas, candidatasDeFavoritos, autoRadarrDefaults } from './automation.js';

const DAY = 24 * 3600 * 1000;

// --- catálogo: QUÉ se puede vigilar -----------------------------------------

/**
 * Los tipos de regla. `scope` solo lo usan los festivales, y sus valores NO
 * son una lista fija: salen del REGISTRY, porque no todos los festivales
 * ofrecen lo mismo. Busan y Horizontes Latinos no tienen página de premios, y
 * Sight & Sound no tiene ediciones por año — enumerarlos a mano garantizaba
 * ofrecer opciones que revientan al ejecutarse.
 */
export const RULE_KINDS = ['festival', 'estrenos', 'favoritos', 'emergentes'];

/**
 * Las dos formas de seguir a un emergente: quedarte con toda su obra —son uno,
 * dos o tres largos, no hay riesgo de avalancha— o solo con la ópera prima, que
 * es la que nunca se distribuye y la que de verdad cuesta encontrar después.
 */
const AMBITOS_EMERGENTES = [
  { key: 'todas', name: 'Todas sus películas' },
  { key: 'debut', name: 'Solo la ópera prima' },
];

/** ¿Qué vistas ofrece este festival/premio/canon? Sale de su ficha del REGISTRY. */
export function scopesDeFestival(f) {
  const out = [];
  // «edición»: la selección oficial del año (festivales) o las nominadas del
  // año (premios y el top 10 de Cahiers). Los cánones no tienen edición.
  // Las etiquetas son LAS MISMAS que ya usa la página de Festivales: si aquí se
  // inventaran otras, el diccionario inglés acabaría con dos claves parecidas
  // y traducciones divergentes (ya pasó con los fragmentos en paralelo).
  if (!f.onlyWinners) {
    out.push({
      key: 'edicion',
      label: f.editionLabel || (f.awardNominees ? 'Nominadas por año' : 'Sección oficial por año'),
    });
  }
  // «palmarés»: el histórico de ganadoras. Busan y Horizontes no lo tienen.
  if (f.awardPage || f.staticList || f.staticAward) {
    // «La lista» es cosa de los cánones (Sight & Sound, las 1001); la Cámara
    // de Oro también es solo-palmarés pero ES un palmarés histórico
    out.push({ key: 'palmares', label: f.onlyWinners && f.group === 'canon' ? 'La lista' : 'Palmarés histórico' });
  }
  return out;
}

/** Todo lo que se puede elegir al crear una regla, servido a la interfaz. */
export function rulesCatalog() {
  return {
    festival: Object.entries(REGISTRY)
      .map(([key, f]) => ({
        key,
        name: f.name,
        award: f.award,
        group: f.group || 'festival',
        scopes: scopesDeFestival(f),
      }))
      .filter((f) => f.scopes.length),
    estrenos: Object.keys(RELEASE_KINDS).map((key) => ({
      key,
      name: NOMBRES_ESTRENOS[key] || key,
      region: RELEASE_KINDS[key].region,
    })),
    favoritos: ROLES.map((r) => ({ key: r.key, name: r.label, singular: r.singular })),
    emergentes: AMBITOS_EMERGENTES,
  };
}

// Los nombres de las cuatro pestañas de Estrenos, tal cual se llaman en la
// interfaz. Viven aquí y no en releases.js porque ese módulo es de datos.
const NOMBRES_ESTRENOS = {
  'cine-es': 'Cines · España',
  'cine-us': 'Cines · EE UU',
  'plataformas-es': 'Plataformas y VOD · España',
  'plataformas-us': 'Plataformas y VOD · EE UU',
};

/** El nombre legible de una regla, para el log y los avisos. */
export function ruleLabel(rule) {
  if (rule.kind === 'festival') {
    const f = REGISTRY[rule.source];
    const scope = f ? scopesDeFestival(f).find((s) => s.key === rule.scope) : null;
    return `${f?.name || rule.source} · ${scope?.label || rule.scope}`;
  }
  if (rule.kind === 'estrenos') return `Estrenos · ${NOMBRES_ESTRENOS[rule.source] || rule.source}`;
  if (rule.kind === 'favoritos') {
    const r = ROLES.find((x) => x.key === rule.source);
    return `Mis favoritos · ${r?.label || rule.source}`;
  }
  if (rule.kind === 'emergentes') {
    const a = AMBITOS_EMERGENTES.find((x) => x.key === rule.source);
    return `Emergentes · ${a?.name || rule.source}`;
  }
  return `${rule.kind}:${rule.source}`;
}

/**
 * ¿Esta combinación existe? Se comprueba al crear y al ejecutar: una regla
 * guardada sobre un festival que desaparezca del REGISTRY en una versión
 * futura no puede tumbar el pase nocturno entero.
 */
export function reglaValida({ kind, source, scope }) {
  if (kind === 'festival') {
    const f = REGISTRY[source];
    if (!f) return 'Festival desconocido';
    if (!scopesDeFestival(f).some((s) => s.key === scope)) return `${f.name} no ofrece «${scope}»`;
    return null;
  }
  if (kind === 'estrenos') return RELEASE_KINDS[source] ? null : 'Pestaña de estrenos desconocida';
  if (kind === 'favoritos') return asRole(source) ? null : 'Oficio desconocido';
  if (kind === 'emergentes') {
    return AMBITOS_EMERGENTES.some((a) => a.key === source) ? null : 'Ámbito de emergentes desconocido';
  }
  return 'Tipo de regla desconocido';
}

// --- CRUD --------------------------------------------------------------------

const COLUMNAS = [
  'enabled', 'min_score', 'allow_unrated', 'cap', 'window_days',
  'editions', 'months', 'lookback_days', 'include_docs', 'min_emerging',
];

const entero = (v, min, max, def) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

/**
 * ¿Viene un valor de verdad? La cadena vacía NO cuenta.
 *
 * Sin esto, borrar el contenido de «Tope por pasada» para reteclearlo mandaba
 * un `''` que `Number('')` convertía en 0 — y 0 significa SIN TOPE. Vaciar la
 * casilla un segundo dejaba la regla ilimitada, que es justo lo contrario de
 * lo que parece. Lo mismo con la ventana de días y con los meses.
 */
const dado = (v) => v != null && String(v).trim() !== '';

/**
 * ¿Un número negativo? NINGUNO de estos campos admite uno: sus mínimos son 0 o 1.
 *
 * Y recortarlo al mínimo era peligroso justo donde más duele: `cap: -7` se
 * convertía en 0, que significa SIN TOPE, así que un signo menos de más dejaba
 * una regla de palmarés histórico bajando cientos de películas la primera
 * noche. Un negativo no es un valor tecleado a propósito: se trata como la
 * casilla vacía y no cambia lo que ya estaba guardado.
 */
const negativo = (v) => Number(v) < 0;
const valido = (v) => dado(v) && !negativo(v);

/** Los límites de cada campo, en un sitio: la API y la interfaz no pueden discrepar. */
export function normalizarCampos(body = {}, previo = {}) {
  const v = { ...previo };
  if (body.enabled != null) v.enabled = body.enabled ? 1 : 0;
  if (valido(body.min_score)) v.min_score = entero(body.min_score, 0, 100, 0);
  if (body.allow_unrated != null) v.allow_unrated = body.allow_unrated ? 1 : 0;
  if (valido(body.cap)) v.cap = entero(body.cap, 0, 500, 20);
  // el tope de 90 no es capricho: `releases()` solo mira 90 días hacia atrás,
  // así que una ventana mayor prometía datos que la fuente no tiene
  if (valido(body.window_days)) v.window_days = entero(body.window_days, 1, 90, 15);
  if (valido(body.editions)) v.editions = entero(body.editions, 1, 10, 1);
  if (valido(body.months)) v.months = entero(body.months, 1, 24, 6);
  if (valido(body.lookback_days)) v.lookback_days = entero(body.lookback_days, 0, 365, 0);
  if (body.include_docs != null) v.include_docs = body.include_docs ? 1 : 0;
  if (valido(body.min_emerging)) v.min_emerging = entero(body.min_emerging, 0, 100, 70);
  return v;
}

/** Los valores por defecto de una regla nueva, según su tipo. */
export function valoresPorDefecto(kind) {
  const base = { enabled: 1, min_score: 0, allow_unrated: 0, cap: 20, include_docs: 0 };
  if (kind === 'estrenos') return { ...base, window_days: 15 };
  if (kind === 'festival') return { ...base, editions: 1 };
  // el umbral de esta regla es el del DETECTOR (la persona), no la Σ de la
  // película: 70 es «promesa con dos señales fuertes detrás»
  if (kind === 'emergentes') return { ...base, min_emerging: 70, cap: 10 };
  if (kind === 'favoritos') {
    const d = autoRadarrDefaults();
    return { ...base, months: d.months, lookback_days: d.lookbackDays, include_docs: d.includeDocs ? 1 : 0 };
  }
  return base;
}

export function listRules() {
  return db
    .prepare('SELECT * FROM radarr_rules ORDER BY kind, source, scope')
    .all()
    .map((r) => ({ ...r, label: ruleLabel(r), invalid: reglaValida(r) }));
}

export function getRule(id) {
  const r = db.prepare('SELECT * FROM radarr_rules WHERE id = ?').get(Number(id));
  return r ? { ...r, label: ruleLabel(r), invalid: reglaValida(r) } : null;
}

export function createRule(body = {}) {
  const kind = String(body.kind || '');
  const source = String(body.source || '');
  const scope = kind === 'festival' ? String(body.scope || '') : '';
  const mal = reglaValida({ kind, source, scope });
  if (mal) throw new Error(mal);
  if (db.prepare('SELECT id FROM radarr_rules WHERE kind = ? AND source = ? AND scope = ?').get(kind, source, scope)) {
    throw new Error('Esa regla ya existe');
  }
  const v = normalizarCampos(body, valoresPorDefecto(kind));
  const info = db
    .prepare(
      `INSERT INTO radarr_rules (kind, source, scope, ${COLUMNAS.join(', ')}, created_at)
       VALUES (?, ?, ?, ${COLUMNAS.map(() => '?').join(', ')}, ?)`
    )
    .run(kind, source, scope, ...COLUMNAS.map((c) => v[c] ?? null), Date.now());
  return getRule(info.lastInsertRowid);
}

export function updateRule(id, body = {}) {
  const previo = db.prepare('SELECT * FROM radarr_rules WHERE id = ?').get(Number(id));
  if (!previo) throw new Error('Regla desconocida');
  const v = normalizarCampos(body, previo);
  db.prepare(`UPDATE radarr_rules SET ${COLUMNAS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
    .run(...COLUMNAS.map((c) => v[c] ?? null), Number(id));
  return getRule(id);
}

export function deleteRule(id) {
  db.prepare('DELETE FROM radarr_rule_log WHERE rule_id = ?').run(Number(id));
  const r = db.prepare('DELETE FROM radarr_rules WHERE id = ?').run(Number(id));
  return { deleted: r.changes };
}

export function rulesLog({ ruleId = null, limit = 200 } = {}) {
  const lim = entero(limit, 1, 1000, 200);
  return ruleId
    ? db.prepare('SELECT * FROM radarr_rule_log WHERE rule_id = ? ORDER BY at DESC, id DESC LIMIT ?').all(Number(ruleId), lim)
    : db.prepare('SELECT * FROM radarr_rule_log ORDER BY at DESC, id DESC LIMIT ?').all(lim);
}

/**
 * QUÉ SE HA MANDADO SOLO A RADARR, y por quién.
 *
 * El pase de favoritos («autorradarr») baja los estrenos de la gente que sigues
 * en un oficio, casi siempre dirección. Hasta ahora eso solo se podía leer
 * abriendo Ajustes → Automatismos y bajando por el historial de la regla; en la
 * pantalla de entrada, esas altas se mezclaban con todo lo demás en «Últimas
 * peticiones a Radarr», que es la lista de Radarr entera —lo que mandas a mano,
 * lo de las reglas de festivales y lo de esta— sin distinguir nada.
 *
 * Aquí solo salen las de PowaFlex, y solo las del pase de favoritos, con el
 * nombre de la persona por la que entró cada una. Las filas anteriores a la
 * columna `person` salen sin nombre: no se inventa.
 *
 * Se lee del log de reglas, que se poda a 30 días en cada pasada: pedir más
 * días que eso devuelve lo que haya.
 */
export function enviosDeFavoritos({ days = 30, limit = 30 } = {}) {
  const desde = Date.now() - entero(days, 1, 30, 30) * DAY;
  return db
    .prepare(
      `SELECT l.tmdb_id, l.title, l.score, l.at, l.person, l.detail, r.source AS role,
              m.has_file, m.monitored
       FROM radarr_rule_log l
       JOIN radarr_rules r ON r.id = l.rule_id
       LEFT JOIN radarr_movies m ON m.tmdb_id = l.tmdb_id
       WHERE l.action = 'added' AND l.tmdb_id IS NOT NULL AND l.at >= ? AND r.kind = 'favoritos'
       ORDER BY l.at DESC, l.id DESC LIMIT ?`
    )
    .all(desde, entero(limit, 1, 200, 30));
}

// --- el evaluador PURO -------------------------------------------------------

/**
 * LA CUARENTENA PRE-RADARR.
 *
 * Hay cine que cumple el umbral y aun así no quieres que entre solo: en tus
 * palabras, «muchas pelis ruido muy hiperhinchadas en notas». Las notas
 * agregadas no distinguen entre una película buena y una con una comunidad muy
 * entregada votándola, y eso se concentra en idiomas y países concretos.
 *
 * Los criterios son GLOBALES, no por regla: son un juicio tuyo sobre qué
 * procedencias te merecen una segunda mirada, no una propiedad de la fuente. Lo
 * que los cumple NO se descarta —eso sería el ✕— sino que espera tu ✓ en la
 * cuarentena. Aprobarla la manda a Radarr; rechazarla la veta.
 */
export function criteriosCuarentena() {
  const lista = (k) =>
    (getSetting(k) || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  return {
    enabled: getSetting('quarantine_enabled') === '1',
    langs: lista('quarantine_langs'),
    countries: lista('quarantine_countries'),
    // lo que escribiste, TAL CUAL, para que la casilla no te devuelva «in»
    // donde tú tecleaste «IN»: la lista de arriba va en minúsculas porque es
    // con la que se compara, no la que se enseña
    texto: {
      langs: getSetting('quarantine_langs') || '',
      countries: getSetting('quarantine_countries') || '',
    },
  };
}

/**
 * ¿Este item cae en cuarentena? PURA. Devuelve `{ kind, value }` o null.
 * El idioma y los países salen de la ficha que `enrichRuntimes` ya pide.
 *
 * El motivo va PARTIDO y no como frase hecha porque la bandeja se pinta en el
 * idioma de la interfaz: un `«idioma hi»` compuesto aquí es exactamente lo que
 * deja a los avisos del servidor sin traducir. La frase se compone al final,
 * con `textoCuarentena` para el historial (castellano) y con t() en el cliente.
 */
export function motivoCuarentena(item, criterios) {
  if (!criterios?.enabled) return null;
  const lang = String(item.original_language || '').toLowerCase();
  if (lang && criterios.langs.includes(lang)) return { kind: 'idioma', value: lang };
  const pais = (item.countries || [])
    .map((c) => String(c).toUpperCase())
    .find((c) => criterios.countries.includes(c.toLowerCase()));
  if (pais) return { kind: 'pais', value: pais };
  return null;
}

/** El motivo en castellano, para el historial de reglas y el log de la pasada. */
export const textoCuarentena = (m) =>
  m ? (m.kind === 'idioma' ? `idioma ${m.value}` : `país ${m.value}`) : '';

/** Los motivos de descarte, con su texto. Un sitio, para que log e interfaz coincidan. */
export const MOTIVOS = {
  sin_ficha: 'sin ficha en TMDB',
  ya_la_tienes: 'ya la tienes',
  vetada: 'vetada (🚫)',
  descartada: 'descartada (✕)',
  corto: 'cortometraje',
  documental: 'documental',
  telefilme: 'telefilme',
  evento: 'gala o evento, no es cine',
  cameo: 'papel testimonial',
  fuera_de_ventana: 'fuera de la ventana del estreno',
  esperando_nota: 'aún sin nota Σ: espera',
  bajo_umbral: 'por debajo del umbral',
  tope: 'aplazada por el tope de la pasada',
  cuarentena: 'en cuarentena: espera tu aprobación',
};

const scoreDe = (i) => (i?.mdb?.score == null ? null : Number(i.mdb.score));
const fechaDe = (i) => i.date || (i.year ? `${i.year}-01-01` : null);

/** Días entre dos fechas ISO (positivo = la primera es posterior). */
export function diasEntre(a, b) {
  const ms = Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / DAY) : null;
}

/**
 * QUIÉN ENTRA. Puro: sin red, sin base, sin Radarr.
 *
 * @param items  candidatas ya normalizadas ({tmdb_id, title, date|year, mdb, isShort…})
 * @param rule   la fila de radarr_rules
 * @param ctx    { inLib:Set, owned:Set, excluidas:Map<id,motivo>, hoy:'YYYY-MM-DD' }
 * @returns { elegidas, descartadas, porMotivo }
 */
export function evaluarRegla(items = [], rule = {}, ctx = {}) {
  const inLib = ctx.inLib || new Set();
  const owned = ctx.owned || new Set();
  const excluidas = ctx.excluidas || new Map();
  const hoy = ctx.hoy || today();
  const minScore = Number(rule.min_score) || 0;
  const permiteSinNota = minScore === 0 || !!rule.allow_unrated;
  const incluyeDocs = !!rule.include_docs;
  const ventana = rule.window_days == null ? null : Number(rule.window_days);
  const cap = Number(rule.cap) || 0;

  const criterios = ctx.criterios || null;
  const cuarentena = [];
  const descartadas = [];
  const fuera = (item, motivo, detalle = null) =>
    descartadas.push({ tmdb_id: item.tmdb_id ?? null, title: item.title, score: scoreDe(item), motivo, detalle });

  const vistos = new Set();
  const pasan = [];
  for (const item of items) {
    if (!item?.tmdb_id) { fuera(item || {}, 'sin_ficha'); continue; }
    if (vistos.has(item.tmdb_id)) continue; // una película en dos secciones cuenta una vez
    vistos.add(item.tmdb_id);

    if (inLib.has(item.tmdb_id) || owned.has(item.tmdb_id)) { fuera(item, 'ya_la_tienes'); continue; }
    if (excluidas.has(item.tmdb_id)) { fuera(item, excluidas.get(item.tmdb_id)); continue; }
    if (item.isShort) { fuera(item, 'corto'); continue; }
    if (item.isTvMovie) { fuera(item, 'telefilme'); continue; }
    // una gala de lucha libre o un evento deportivo no es una película, aunque
    // TMDB la tenga fichada como tal, y NUNCA se manda a Radarr por una regla
    if (item.isEvento) { fuera(item, 'evento'); continue; }
    // un puesto muy abajo en el reparto o un «Self» es un cameo, no una
    // película que seguir a alguien signifique querer: mismo criterio que los
    // huecos y las filmografías de toda la app
    if (item.isCameo) { fuera(item, 'cameo'); continue; }
    if (!incluyeDocs && (item.isDocumentary || item.isMusic)) { fuera(item, 'documental'); continue; }

    // La ventana del estreno: «desde 15 días antes hasta 15 después». Mientras
    // dura, cada noche se vuelve a mirar su nota; pasada, la película deja de
    // ser candidata (para eso está Descubrir, que sí mira hacia atrás).
    if (ventana != null) {
      const f = fechaDe(item);
      if (!f) { fuera(item, 'fuera_de_ventana', 'sin fecha'); continue; }
      const d = diasEntre(f, hoy);
      if (d == null || Math.abs(d) > ventana) {
        fuera(item, 'fuera_de_ventana', d == null ? 'fecha ilegible' : `${d > 0 ? '+' : ''}${d} días`);
        continue;
      }
    }

    // La cuarentena va DESPUÉS de los filtros de tipo y de lo que ya tienes
    // —no tiene sentido pedirte que apruebes un corto— y ANTES del umbral: si
    // no llega al umbral, ni siquiera es candidata y no hay nada que aprobar.
    const score = scoreDe(item);
    if (minScore > 0) {
      if (score == null) {
        if (!permiteSinNota) { fuera(item, 'esperando_nota'); continue; }
      } else if (score < minScore) {
        fuera(item, 'bajo_umbral', `Σ ${score} < ${minScore}`);
        continue;
      }
    }
    const motivoQ = motivoCuarentena(item, criterios);
    if (motivoQ) {
      cuarentena.push({ ...item, motivoCuarentena: motivoQ });
      continue;
    }
    pasan.push(item);
  }

  // Orden: primero la mejor nota (las sin nota, al final), y a igualdad la más
  // reciente. Con tope, es lo que decide qué entra hoy y qué espera a mañana.
  pasan.sort((a, b) => {
    const sa = scoreDe(a);
    const sb = scoreDe(b);
    if (sa !== sb) return (sb ?? -1) - (sa ?? -1);
    return String(fechaDe(b) || '').localeCompare(String(fechaDe(a) || ''));
  });

  const elegidas = cap > 0 ? pasan.slice(0, cap) : pasan;
  for (const item of cap > 0 ? pasan.slice(cap) : []) fuera(item, 'tope');

  const porMotivo = {};
  for (const d of descartadas) porMotivo[d.motivo] = (porMotivo[d.motivo] || 0) + 1;
  if (cuarentena.length) porMotivo.cuarentena = cuarentena.length;
  return { elegidas, descartadas, cuarentena, porMotivo };
}

// --- la mitad que trae los datos ---------------------------------------------

// Días hacia atrás que se miran SIEMPRE cuando la regla tiene umbral: es el
// tiempo que tarda una película en juntar reseñas suficientes para tener Σ.
const LOOKBACK_CON_UMBRAL = 60;

/**
 * Las fichas que salen de Wikipedia traen título, año y dirección, y nada más:
 * ni duración, ni géneros. Sin esto, `isShort`/`isDocumentary`/`isTvMovie`
 * llegaban al evaluador siempre en `undefined`, así que en las reglas de
 * festival la casilla «Incluir documentales» no hacía absolutamente nada y los
 * cortos y los telefilmes entraban igual. `enrichRuntimes` es el punto único
 * por el que ya pasan las demás fuentes: usa la caché por película y de paso
 * relee los géneros de verdad.
 */
const conTipo = async (films) => {
  const conFicha = films.filter((f) => f.tmdb_id);
  await enrichRuntimes(conFicha, { concurrency: 5 });
  return films;
};

/**
 * Las candidatas de una regla, por las funciones ya cacheadas de la app.
 * Devuelve también `errors`: sin ellos, «0 candidatas» y «Wikipedia caída» se
 * ven exactamente igual desde fuera.
 */
export async function candidatasDeRegla(rule) {
  const mal = reglaValida(rule);
  if (mal) throw new Error(mal);

  if (rule.kind === 'festival') {
    if (rule.scope === 'palmares') {
      const w = await festivalWinners(rule.source);
      return { items: await conTipo(w.films || []), errors: w.resolveErrors ? [`${w.resolveErrors} sin comprobar`] : [] };
    }
    // «edición»: las últimas N publicadas. Se baja de año en año hasta juntar
    // N con contenido — en enero, la edición del año en curso aún no existe y
    // sin este respaldo la regla no haría nada durante meses.
    const nEd = Math.max(1, Number(rule.editions) || 1);
    const nowYear = new Date().getFullYear();
    const items = [];
    const errors = [];
    let encontradas = 0;
    for (let y = nowYear; y >= nowYear - nEd - 2 && encontradas < nEd; y--) {
      if (REGISTRY[rule.source].sinceYear && y < REGISTRY[rule.source].sinceYear) break;
      try {
        const ed = await festivalEdition(rule.source, y);
        if (ed.films?.length) {
          items.push(...ed.films);
          encontradas++;
        }
      } catch (err) {
        // el año en curso sin programa todavía es lo NORMAL: no es un error
        // que deba salir por pantalla, solo se anota si ya vamos vacíos
        if (encontradas === 0 && y < nowYear) errors.push(`${y}: ${String(err.message || err)}`);
      }
    }
    return { items: await conTipo(items), errors };
  }

  if (rule.kind === 'estrenos') {
    // releases() solo admite 7/30/90 días hacia atrás: se pide la más pequeña
    // que cubra la ventana pedida, y el filtro fino lo hace el evaluador
    const win = [7, 30, 90].find((w) => w >= (Number(rule.window_days) || 15)) || 90;
    const r = await releases({ kind: rule.source, window: win });
    return { items: [...(r.recent || []), ...(r.upcoming || [])], errors: r.errors || [] };
  }

  if (rule.kind === 'emergentes') {
    // Las candidatas salen de la tabla que ya construyó el detector: la regla
    // NO relanza la detección. Si el detector aún no ha corrido, la regla lo
    // dice en vez de quedarse muda con «0 candidatas», que es indistinguible
    // de «no hay nadie que llegue al umbral».
    const umbral = Number(rule.min_emerging) || 0;
    const filas = db.prepare('SELECT * FROM emerging_directors WHERE score >= ? ORDER BY score DESC').all(umbral);
    if (!db.prepare('SELECT COUNT(*) n FROM emerging_directors').get().n) {
      return { items: [], errors: ['el detector de emergentes aún no ha corrido: se reconstruye en el pase nocturno'] };
    }
    const items = [];
    for (const f of filas) {
      let pelis = [];
      try {
        pelis = JSON.parse(f.breakdown || '{}').pelis || [];
      } catch {
        pelis = [];
      }
      // ordenadas de la más antigua a la más nueva por el detector: la ópera
      // prima es la primera
      for (const p of rule.source === 'debut' ? pelis.slice(0, 1) : pelis) {
        if (!p.tmdb_id) continue;
        items.push({
          tmdb_id: p.tmdb_id,
          title: p.title,
          year: p.year || null,
          poster_path: p.poster_path || null,
          person: f.name,
          emergingScore: f.score,
        });
      }
    }
    return { items: await conTipo(items), errors: [] };
  }

  // favoritos
  const d = autoRadarrDefaults();
  // Con umbral, el retrovisor mínimo NO puede ser cero. Una película estrenada
  // ayer deja de ser candidata hoy, y mientras era «próxima» casi nunca tenía
  // Σ: la regla con umbral no habría añadido NADA jamás. Se mira 60 días atrás
  // como poco, que es donde llega la nota.
  const pedido = Number(rule.lookback_days) || 0;
  const lookbackDays = Number(rule.min_score) > 0 ? Math.max(pedido, LOOKBACK_CON_UMBRAL) : pedido;
  const r = await candidatasDeFavoritos({
    role: rule.source,
    months: Number(rule.months) || d.months,
    lookbackDays,
  });
  return { items: r.candidates, errors: r.errors };
}

// --- la pasada ---------------------------------------------------------------

export const rulesStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  dryRun: false,
  considered: 0,
  added: 0,
  skipped: 0,
  cuarentena: 0,
  error: null,
  aviso: null, // lo que impide que la pasada sirva de algo (Radarr a medias, sin MDBList…)
  rules: [], // { id, label, considered, added, skipped, failed, error, porMotivo, log: [] }
};

/**
 * ¿Puede Radarr aceptar un alta AHORA MISMO?
 *
 * Con URL y clave pero sin perfil de calidad o sin carpeta raíz, `radarrAdd`
 * revienta en TODAS las películas, una por una: las reglas corrían enteras cada
 * noche, gastaban su cupo de TMDB y no añadían nada, y el resumen decía «0
 * añadidas de 20 candidatas», que se lee como «no había nada nuevo».
 */
export function radarrListoParaAñadir() {
  if (!getSetting('radarr_url') || !getSetting('radarr_key')) return 'Radarr no está configurado (falta la URL o la API key)';
  if (!Number(getSetting('radarr_quality_profile'))) return 'Falta elegir el perfil de calidad de Radarr en Conexiones';
  if (!getSetting('radarr_root_folder')) return 'Falta elegir la carpeta raíz de Radarr en Conexiones';
  return null;
}

// Por qué una regla con umbral puede quedarse muda, en cristiano.
const MOTIVO_NOTAS = {
  sin_api_key: 'sin clave de MDBList no hay nota Σ: las reglas con umbral no pueden decidir',
  sin_presupuesto: 'agotado el cupo diario de MDBList: las notas que falten se piden mañana',
  quedan_para_manana: 'quedan notas por pedir: se completan en las siguientes pasadas',
};

const insLog = () =>
  db.prepare(
    'INSERT INTO radarr_rule_log (rule_id, at, tmdb_id, title, score, action, detail, person) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

/**
 * Ejecuta las reglas activas. `ruleId` limita a una (el botón de cada regla),
 * `kinds` a un tipo, y `dryRun` no toca Radarr ni escribe log: es la
 * previsualización.
 */
export async function runRadarrRules({ dryRun = false, ruleId = null, kinds = null } = {}) {
  if (rulesStatus.running) return rulesStatus;
  Object.assign(rulesStatus, {
    running: true, startedAt: Date.now(), finishedAt: null, dryRun: !!dryRun,
    considered: 0, added: 0, skipped: 0, cuarentena: 0, error: null, aviso: null, rules: [],
  });

  try {
    // se comprueba ANTES de gastar una sola petición: si Radarr no puede
    // aceptar altas, la pasada entera es tiempo tirado y hay que decirlo
    if (!dryRun) {
      const falta = radarrListoParaAñadir();
      if (falta) throw new Error(falta);
    }
    let reglas = listRules().filter((r) => r.enabled && !r.invalid);
    if (ruleId != null) {
      // ejecutar UNA a mano vale aunque esté apagada: es la previsualización
      const una = getRule(ruleId);
      reglas = una && !una.invalid ? [una] : [];
    }
    if (kinds?.length) reglas = reglas.filter((r) => kinds.includes(r.kind));

    // Se leen UNA vez para todas las reglas: son consultas a la base, pero
    // también son el contexto compartido que hace comparables sus decisiones.
    const inLib = new Set(db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').all().map((r) => r.tmdb_id));
    const owned = new Set(radarrOwnedIds().tmdbIds);
    const excluidas = autoRadarrExcluidas();
    const criterios = criteriosCuarentena();
    // la bandeja se limpia ANTES de mirarla: lo que ya tienes o ya decidiste no
    // puede seguir pidiéndote permiso, ni bloquear a la regla que lo propuso
    if (!dryRun) purgarPendientes();
    // lo que ya espera tu ✓ no se vuelve a proponer ni se cuenta dos veces
    for (const r of db.prepare('SELECT tmdb_id FROM radarr_pending').all()) excluidas.set(r.tmdb_id, 'cuarentena');
    const hoy = today();
    const log = dryRun ? null : insLog();

    for (const rule of reglas) {
      const parte = { id: rule.id, label: rule.label, considered: 0, added: 0, skipped: 0, failed: 0, cuarentena: 0, error: null, porMotivo: {}, log: [] };
      rulesStatus.rules.push(parte);
      try {
        const { items, errors } = await candidatasDeRegla(rule);
        if (errors?.length) parte.log.push(`⚠️ ${errors.slice(0, 3).join(' · ')}`);
        // Las notas son EL filtro: se rellenan antes de juzgar, no después. Y
        // se REFRESCAN: enrichWithScores solo pide lo que no tiene fila, así
        // que una película vista sin Σ la primera noche se quedaba «esperando
        // nota» para siempre y la reevaluación nocturna era una promesa falsa.
        if (rule.min_score > 0) {
          const notas = await refrescarNotasDeReglas(items, { maxFetch: 200 });
          if (notas.motivo) {
            const texto = MOTIVO_NOTAS[notas.motivo] || notas.motivo;
            parte.log.push(`⚠️ ${texto}`);
            if (notas.motivo === 'sin_api_key' || notas.motivo === 'sin_presupuesto') rulesStatus.aviso = texto;
          }
          await enrichWithScores(items, { fetchMissing: false });
        }

        const { elegidas, descartadas, cuarentena, porMotivo } = evaluarRegla(items, rule, { inLib, owned, excluidas, hoy, criterios });
        // a la bandeja, no a Radarr: esperan tu ✓
        for (const q of cuarentena) {
          const texto = textoCuarentena(q.motivoCuarentena);
          if (dryRun) {
            parte.log.push(`(simulado) ⏸ ${q.title} — iría a cuarentena (${texto})`);
            continue;
          }
          const r = insPendiente.run(
            q.tmdb_id, q.title, q.year || null, scoreDe(q), q.poster_path || null,
            rule.id, rule.label, texto, q.motivoCuarentena.kind, q.motivoCuarentena.value, Date.now()
          );
          if (!r.changes) continue; // ya estaba en la bandeja: ni log ni aviso repetido
          parte.log.push(`⏸ ${q.title} — en cuarentena (${texto})`);
          // Una bandeja que nadie mira no sirve de nada, y esta vive dentro de
          // una pestaña de Ajustes: el aviso del Dashboard es lo que hace que
          // te enteres de que hay algo esperándote.
          avisarDeCuarentena(q, texto);
        }
        parte.cuarentena = cuarentena.length;
        rulesStatus.cuarentena += cuarentena.length;
        parte.considered = elegidas.length;
        parte.skipped = descartadas.length;
        parte.porMotivo = porMotivo;
        rulesStatus.considered += elegidas.length;
        rulesStatus.skipped += descartadas.length;

        for (const item of elegidas) {
          const score = scoreDe(item);
          if (dryRun) {
            parte.log.push(`(simulado) ${item.title}${score != null ? ` · Σ ${score}` : ''}`);
            continue;
          }
          try {
            await radarrAdd(item.tmdb_id);
            owned.add(item.tmdb_id); // que otra regla no la reintente en la misma pasada
            parte.added++;
            rulesStatus.added++;
            parte.log.push(`✓ ${item.title}${score != null ? ` · Σ ${score}` : ''}`);
            // `item.person` solo lo traen las candidatas del pase de favoritos:
            // es la persona por la que esta película entró
            log.run(rule.id, Date.now(), item.tmdb_id, item.title, score, 'added', ruleLabel(rule), item.person || null);
          } catch (err) {
            const msg = String(err.message || err);
            if (/already/i.test(msg)) { owned.add(item.tmdb_id); continue; }
            parte.failed++;
            parte.log.push(`⚠️ ${item.title}: ${msg}`);
            log.run(rule.id, Date.now(), item.tmdb_id, item.title, score, 'error', msg, item.person || null);
          }
        }

        // el resumen de descartes, para que «0 añadidas» sea explicable
        if (!dryRun) {
          for (const [motivo, n] of Object.entries(porMotivo)) {
            log.run(rule.id, Date.now(), null, null, null, 'skipped', `${MOTIVOS[motivo] || motivo}: ${n}`, null);
          }
          // si TODAS las altas fallaron, eso NO es una pasada correcta: sin
          // esto la tarjeta decía «0 añadidas de 20 candidatas» y borraba el
          // error de la vez anterior, que es exactamente lo contrario de avisar
          const fallosTodos = parte.failed > 0 && parte.added === 0
            ? `${parte.failed} de ${parte.considered} no se pudieron añadir a Radarr`
            : null;
          db.prepare('UPDATE radarr_rules SET last_run_at = ?, last_considered = ?, last_added = ?, last_error = ? WHERE id = ?')
            .run(Date.now(), parte.considered, parte.added, fallosTodos, rule.id);
        }
      } catch (err) {
        parte.error = String(err.message || err);
        if (!dryRun) {
          db.prepare('UPDATE radarr_rules SET last_run_at = ?, last_error = ? WHERE id = ?')
            .run(Date.now(), parte.error, rule.id);
          log.run(rule.id, Date.now(), null, null, null, 'error', parte.error, null);
        }
      }
      parte.log = parte.log.slice(0, 60);
    }

    if (!dryRun) {
      db.prepare('DELETE FROM radarr_rule_log WHERE at < ?').run(Date.now() - 30 * DAY);
    }
  } catch (err) {
    rulesStatus.error = String(err.message || err);
  } finally {
    rulesStatus.running = false;
    rulesStatus.finishedAt = Date.now();
  }
  return rulesStatus;
}

// --- la bandeja de cuarentena -------------------------------------------------

const insPendiente = db.prepare(
  `INSERT OR IGNORE INTO radarr_pending
     (tmdb_id, title, year, score, poster_path, rule_id, rule_label, reason, reason_kind, reason_value, at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

/**
 * El aviso del Dashboard. Va por `app_events` como el resto de novedades del
 * pase nocturno, con `ref` = el id de TMDB: cada película se anuncia UNA vez
 * aunque vuelva a caer en la bandeja después de aprobarla y borrarla.
 */
function avisarDeCuarentena(item, texto) {
  db.prepare(
    `INSERT OR IGNORE INTO app_events (type, ref, title, body, url, created_at)
     VALUES ('radarr_pending', ?, ?, ?, ?, ?)`
  ).run(
    String(item.tmdb_id),
    `⏸ «${item.title}» espera tu visto bueno`,
    `Pasó el filtro de una regla pero cumple un criterio de cuarentena (${texto}). En Ajustes → Automatismos la apruebas o la vetas.`,
    '/ajustes?tab=automatismos',
    Date.now()
  );
}

/** Lo que espera tu ✓, lo último detectado primero. */
export function pendientes() {
  return db.prepare('SELECT * FROM radarr_pending ORDER BY at DESC, tmdb_id DESC').all();
}

/** Cuántas esperan tu ✓. Lo pide /api/setup-state para el punto de la barra lateral. */
export const cuantasPendientes = () =>
  db.prepare('SELECT COUNT(*) n FROM radarr_pending').get().n;

/**
 * Fuera de la bandeja lo que ya no hay que decidir: lo que has acabado teniendo
 * en Plex o en Radarr por tu cuenta, y lo que has vetado o descartado desde
 * otra pantalla. Sin esto la bandeja envejece: te pide permiso para bajar algo
 * que ya bajaste, y una decisión que ya tomaste en otro sitio sigue esperando.
 */
export function purgarPendientes() {
  const n = db.prepare(
    `DELETE FROM radarr_pending WHERE tmdb_id IN (
       SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL
       UNION SELECT tmdb_id FROM radarr_movies
       UNION SELECT tmdb_id FROM auto_radarr_vetoed
       UNION SELECT tmdb_id FROM dismissed_movies)`
  ).run().changes;
  return n;
}

/**
 * Aprobar: va a Radarr AHORA. Solo se borra de la bandeja si el alta funciona
 * —si Radarr está caído y la quitáramos igual, la película se perdería entre
 * dos sillas: ni pedida ni pendiente.
 */
export async function aprobarPendiente(tmdbId) {
  const id = Number(tmdbId);
  const fila = db.prepare('SELECT * FROM radarr_pending WHERE tmdb_id = ?').get(id);
  if (!fila) throw new Error('Esa película no está en cuarentena');
  const falta = radarrListoParaAñadir();
  if (falta) throw new Error(falta);
  await radarrAdd(id);
  db.prepare('DELETE FROM radarr_pending WHERE tmdb_id = ?').run(id);
  // la regla que la propuso puede haberse borrado mientras esperaba: el
  // historial es por regla, y una fila colgando de un id que ya no existe no
  // se ve desde ninguna parte
  const existeRegla = fila.rule_id && db.prepare('SELECT 1 FROM radarr_rules WHERE id = ?').get(fila.rule_id);
  if (existeRegla) {
    db.prepare(
      'INSERT INTO radarr_rule_log (rule_id, at, tmdb_id, title, score, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(fila.rule_id, Date.now(), id, fila.title, fila.score, 'added', `aprobada desde la cuarentena (${fila.reason})`);
  }
  return { ok: true, title: fila.title };
}

/**
 * Rechazar: fuera de la bandeja Y vetada. Sin el veto volvería a caer en
 * cuarentena la noche siguiente, y la bandeja se convertiría en una noria.
 *
 * El veto sale de lo que HAY en la bandeja, nunca de un id suelto. Vetar algo
 * que ya no está fabricaba vetos fantasma: un segundo clic en el 🚫, o el de
 * una pestaña que aún enseñaba una película aprobada en otra, dejaba en «fuera
 * del pase automático» una fila sin título —y esa película quedaba prohibida
 * para siempre justo después de haberla mandado a Radarr. Para vetar a mano
 * está el 🚫 del historial, que es otra puerta (/api/radarr/auto/veto).
 */
export function rechazarPendiente(tmdbId) {
  const id = Number(tmdbId);
  const fila = db.prepare('SELECT * FROM radarr_pending WHERE tmdb_id = ?').get(id);
  if (!fila) return { ok: true, vetada: false };
  db.prepare('INSERT OR REPLACE INTO auto_radarr_vetoed (tmdb_id, title, at) VALUES (?, ?, ?)')
    .run(id, fila.title || null, Date.now());
  db.prepare('DELETE FROM radarr_pending WHERE tmdb_id = ?').run(id);
  return { ok: true, vetada: true };
}

/**
 * Vaciar la bandeja de una vez. Una regla sobre un país entero puede dejar
 * veinte películas esperando en una sola noche, y decidirlas de una en una es
 * lo que hace que la bandeja se abandone.
 *
 * Aprobar en bloque NO se detiene en el primer fallo: si Radarr rechaza una,
 * las demás siguen, y lo que no entró se queda en la bandeja con su motivo.
 */
export async function resolverTodasLasPendientes(accion) {
  const filas = pendientes();
  if (accion === 'rechazar') {
    let rechazadas = 0;
    for (const f of filas) if (rechazarPendiente(f.tmdb_id).vetada) rechazadas++;
    return { ok: true, rechazadas };
  }
  const falta = radarrListoParaAñadir();
  if (falta) throw new Error(falta);
  let aprobadas = 0;
  const errores = [];
  for (const f of filas) {
    try {
      await aprobarPendiente(f.tmdb_id);
      aprobadas++;
    } catch (err) {
      errores.push(`${f.title}: ${String(err.message || err)}`);
    }
  }
  return { ok: true, aprobadas, errores };
}

/** ¿Hay algo que ejecutar? Lo consulta el pase nocturno para saltarse el paso. */
export const hayReglasActivas = () => listRules().some((r) => r.enabled && !r.invalid);

/**
 * El pase de siempre —los estrenos de tus favoritos— ahora son las reglas de
 * tipo `favoritos`. Se conserva la puerta con su nombre viejo porque el
 * endpoint /api/radarr/auto y su botón de Ajustes la siguen usando.
 */
export const runAutoRadarr = (opts = {}) => runRadarrRules({ ...opts, kinds: ['favoritos'] });

/** Resumen para la interfaz: reglas, catálogo y estado de la última pasada. */
export function rulesOverview() {
  // se purga también al abrir la página, no solo de noche: si acabas de meter
  // una a mano en Radarr, pedirte permiso para bajarla se lee como una avería
  purgarPendientes();
  return {
    rules: listRules(),
    catalog: rulesCatalog(),
    status: rulesStatus,
    criterios: criteriosCuarentena(),
    pendientes: pendientes(),
    radarrConfigurado: !!(getSetting('radarr_url') && getSetting('radarr_key')),
    // Sin clave de MDBList no hay Σ, y una regla con umbral no puede decidir
    // NADA: se queda esperando nota cada noche. Hasta ahora eso solo se sabía
    // ejecutándola y leyendo el aviso de la pasada — es decir, después.
    mdblistConfigurado: hayClaveMdblist(),
  };
}
