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
export const RULE_KINDS = ['festival', 'estrenos', 'favoritos'];

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
    out.push({ key: 'palmares', label: f.onlyWinners ? 'La lista' : 'Palmarés histórico' });
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
  return 'Tipo de regla desconocido';
}

// --- CRUD --------------------------------------------------------------------

const COLUMNAS = [
  'enabled', 'min_score', 'allow_unrated', 'cap', 'window_days',
  'editions', 'months', 'lookback_days', 'include_docs',
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

/** Los límites de cada campo, en un sitio: la API y la interfaz no pueden discrepar. */
export function normalizarCampos(body = {}, previo = {}) {
  const v = { ...previo };
  if (body.enabled != null) v.enabled = body.enabled ? 1 : 0;
  if (dado(body.min_score)) v.min_score = entero(body.min_score, 0, 100, 0);
  if (body.allow_unrated != null) v.allow_unrated = body.allow_unrated ? 1 : 0;
  if (dado(body.cap)) v.cap = entero(body.cap, 0, 500, 20);
  // el tope de 90 no es capricho: `releases()` solo mira 90 días hacia atrás,
  // así que una ventana mayor prometía datos que la fuente no tiene
  if (dado(body.window_days)) v.window_days = entero(body.window_days, 1, 90, 15);
  if (dado(body.editions)) v.editions = entero(body.editions, 1, 10, 1);
  if (dado(body.months)) v.months = entero(body.months, 1, 24, 6);
  if (dado(body.lookback_days)) v.lookback_days = entero(body.lookback_days, 0, 365, 0);
  if (body.include_docs != null) v.include_docs = body.include_docs ? 1 : 0;
  return v;
}

/** Los valores por defecto de una regla nueva, según su tipo. */
export function valoresPorDefecto(kind) {
  const base = { enabled: 1, min_score: 0, allow_unrated: 0, cap: 20, include_docs: 0 };
  if (kind === 'estrenos') return { ...base, window_days: 15 };
  if (kind === 'festival') return { ...base, editions: 1 };
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

// --- el evaluador PURO -------------------------------------------------------

/** Los motivos de descarte, con su texto. Un sitio, para que log e interfaz coincidan. */
export const MOTIVOS = {
  sin_ficha: 'sin ficha en TMDB',
  ya_la_tienes: 'ya la tienes',
  vetada: 'vetada (🚫)',
  descartada: 'descartada (✕)',
  corto: 'cortometraje',
  documental: 'documental',
  telefilme: 'telefilme',
  cameo: 'papel testimonial',
  fuera_de_ventana: 'fuera de la ventana del estreno',
  esperando_nota: 'aún sin nota Σ: espera',
  bajo_umbral: 'por debajo del umbral',
  tope: 'aplazada por el tope de la pasada',
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

    const score = scoreDe(item);
    if (minScore > 0) {
      if (score == null) {
        if (!permiteSinNota) { fuera(item, 'esperando_nota'); continue; }
      } else if (score < minScore) {
        fuera(item, 'bajo_umbral', `Σ ${score} < ${minScore}`);
        continue;
      }
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
  return { elegidas, descartadas, porMotivo };
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
    'INSERT INTO radarr_rule_log (rule_id, at, tmdb_id, title, score, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)'
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
    considered: 0, added: 0, skipped: 0, error: null, aviso: null, rules: [],
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
    const hoy = today();
    const log = dryRun ? null : insLog();

    for (const rule of reglas) {
      const parte = { id: rule.id, label: rule.label, considered: 0, added: 0, skipped: 0, failed: 0, error: null, porMotivo: {}, log: [] };
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

        const { elegidas, descartadas, porMotivo } = evaluarRegla(items, rule, { inLib, owned, excluidas, hoy });
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
            log.run(rule.id, Date.now(), item.tmdb_id, item.title, score, 'added', ruleLabel(rule));
          } catch (err) {
            const msg = String(err.message || err);
            if (/already/i.test(msg)) { owned.add(item.tmdb_id); continue; }
            parte.failed++;
            parte.log.push(`⚠️ ${item.title}: ${msg}`);
            log.run(rule.id, Date.now(), item.tmdb_id, item.title, score, 'error', msg);
          }
        }

        // el resumen de descartes, para que «0 añadidas» sea explicable
        if (!dryRun) {
          for (const [motivo, n] of Object.entries(porMotivo)) {
            log.run(rule.id, Date.now(), null, null, null, 'skipped', `${MOTIVOS[motivo] || motivo}: ${n}`);
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
          log.run(rule.id, Date.now(), null, null, null, 'error', parte.error);
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
  return {
    rules: listRules(),
    catalog: rulesCatalog(),
    status: rulesStatus,
    radarrConfigurado: !!(getSetting('radarr_url') && getSetting('radarr_key')),
  };
}
