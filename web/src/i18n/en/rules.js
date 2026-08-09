// Traducciones EN de las REGLAS automáticas a Radarr (pages/RadarrRules.jsx).
// Clave = texto castellano byte-idéntico al string pasado a t().
//
// OJO: aquí solo van las claves NUEVAS. Las que ya vivían en otro fragmento
// —«Ejecutar ahora», «Previsualizar», «ver detalle», «— elige —», los nombres
// de los oficios, «Estrenos», las pestañas de estrenos, los grupos de
// festivales— se reutilizan tal cual desde el servidor y desde el catálogo,
// que a propósito manda las MISMAS cadenas castellanas que ya usa la interfaz.
export default {
  // ── cabecera de la sección ────────────────────────────────────────────────
  'Reglas automáticas a Radarr': 'Automatic Radarr rules',
  'Cada regla vigila una cosa —un festival, un premio, los estrenos de una región, tus favoritos de un oficio— y manda a Radarr lo que pase su filtro. Se revisan CADA NOCHE: una película que hoy no llega al umbral puede entrar mañana, cuando tenga más notas.':
    'Each rule watches one thing — a festival, an award, the new releases of one region, your favorites in one craft — and sends to Radarr whatever clears its filter. They are re-checked EVERY NIGHT: a movie that misses the threshold today can make it tomorrow, once more ratings are in.',
  '⚠️ Como se reevalúan cada noche, borrar algo de Radarr a mano no basta: volvería. Para que una película no vuelva a entrar, pulsa su 🚫 en el historial de abajo (o el ✕ de Descubrir y Estrenos).':
    '⚠️ Since they are re-checked every night, deleting something from Radarr by hand is not enough: it would come back. To keep a movie out for good, hit its 🚫 in the history below (or the ✕ in Discover and New releases).',
  'Que ninguna regla la vuelva a mandar': 'Keep any rule from sending it again',
  '🚫 «{p}» no volverá a entrar por ninguna regla': '🚫 “{p}” will not come back through any rule',
  'Vas a ejecutar {n} regla(s) sobre Radarr ahora mismo (hasta {m} películas). ¿Sigo?':
    'You are about to run {n} rule(s) against Radarr right now (up to {m} movies). Go ahead?',
  'Hay una pasada en curso': 'A run is in progress',
  reintentar: 'retry',
  'papel testimonial': 'walk-on part',
  'sin clave de MDBList no hay nota Σ: las reglas con umbral no pueden decidir':
    'without an MDBList key there is no Σ score: rules with a threshold cannot decide',
  'agotado el cupo diario de MDBList: las notas que falten se piden mañana':
    'MDBList daily quota used up: the missing scores will be requested tomorrow',
  'quedan notas por pedir: se completan en las siguientes pasadas':
    'some scores are still pending: they will be filled in on later runs',
  'Radarr no está configurado: las reglas no se ejecutarán.': 'Radarr is not configured: the rules will not run.',
  'Previsualizar todas': 'Preview all',
  'Ejecutar todas': 'Run all',
  'Ejecutando reglas…': 'Running rules…',

  // ── grupos ────────────────────────────────────────────────────────────────
  'Festivales, premios y cánones': 'Festivals, awards and canons',
  'Mis favoritos': 'My favorites',
  'sin reglas de este tipo': 'no rules of this kind yet',

  // ── etiquetas de vista que sirve el catálogo ──────────────────────────────
  'Palmarés histórico': 'All-time winners',
  'La lista': 'The list',
  'Top 10 por año': 'Top 10 by year',

  // ── la tarjeta de una regla ───────────────────────────────────────────────
  'Nota mínima Σ': 'Minimum Σ score',
  'sin filtro: entra todo': 'no filter: everything goes in',
  'Mandar también las que aún no tienen nota (por defecto esperan a tenerla)':
    'Send the ones with no score yet too (by default they wait until they have one)',
  'Tope por pasada': 'Cap per run',
  '0 = sin tope. Un palmarés histórico son cientos de películas.':
    '0 = no cap. An all-time winners list is hundreds of movies.',
  'Últimas ediciones': 'Latest editions',
  'Cuántas ediciones publicadas mirar hacia atrás': 'How many published editions to look back at',
  'Días alrededor del estreno': 'Days around release',
  'Mientras dure la ventana se vuelve a mirar su nota cada noche':
    'While the window lasts, its score is checked again every night',
  'Meses por delante': 'Months ahead',
  'Días hacia atrás': 'Days back',
  'Incluir documentales': 'Include documentaries',
  'Borrar la regla': 'Delete the rule',
  borrar: 'delete',
  '¿Borrar la regla «{r}»? Lo que ya mandó a Radarr se queda.':
    'Delete the rule “{r}”? Whatever it already sent to Radarr stays.',
  'última pasada: {d} · {a} añadidas de {c}': 'last run: {d} · {a} added out of {c}',
  '{c} pasan el filtro · {s} descartadas': '{c} clear the filter · {s} skipped',

  // ── alta de una regla ─────────────────────────────────────────────────────
  '+ Añadir regla': '+ Add rule',
  'Festival, premio o canon': 'Festival, award or canon',
  Crear: 'Create',
  'Regla creada': 'Rule created',
  'Esa regla ya existe: afínala en su tarjeta.': 'That rule already exists: tune it on its own card.',
  'Nace sin umbral (entra todo) y con tope de 20 por pasada. Ajusta la barrita después.':
    'It starts with no threshold (everything goes in) and a cap of 20 per run. Move the slider afterwards.',

  // ── resultado de una pasada ───────────────────────────────────────────────
  '{c} películas entrarían en Radarr ({s} descartadas)': '{c} movies would go into Radarr ({s} skipped)',
  '✓ {a} añadidas de {c} candidatas ({s} descartadas)': '✓ {a} added out of {c} candidates ({s} skipped)',
  'Historial de las reglas (30 días)': 'Rule history (30 days)',

  // ── motivos de descarte (MOTIVO_TEXTO) ────────────────────────────────────
  'sin ficha en TMDB': 'no TMDB entry',
  'ya la tienes': 'you already have it',
  'vetada (🚫)': 'vetoed (🚫)',
  'descartada (✕)': 'dismissed (✕)',
  cortometraje: 'short film',
  documental: 'documentary',
  telefilme: 'TV movie',
  'fuera de la ventana': 'outside the window',
  'esperando nota': 'waiting for a score',
  'bajo el umbral': 'below the threshold',
  'aplazadas por el tope': 'held back by the cap',
};
