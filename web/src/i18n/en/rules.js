// Traducciones EN de las REGLAS automáticas a Radarr (pages/RadarrRules.jsx).
// Clave = texto castellano byte-idéntico al string pasado a t().
//
// OJO: aquí solo van las claves NUEVAS. Las que ya vivían en otro fragmento
// —«Ejecutar ahora», «Previsualizar», «ver detalle», «— elige —», los nombres
// de los oficios, «Estrenos», las pestañas de estrenos, los grupos de
// festivales— se reutilizan tal cual desde el servidor y desde el catálogo,
// que a propósito manda las MISMAS cadenas castellanas que ya usa la interfaz.
export default {
  // la confirmación en dos toques que sustituye a window.confirm
  'Borrar la regla. Lo que ya mandó a Radarr se queda.':
    'Delete the rule. What it already sent to Radarr stays.',
  'Ninguna regla volverá a proponerlas': 'No rule will propose them again',
  '🚫 ¿Vetar las {n}?': '🚫 Veto all {n}?',
  'Ejecuta ahora todas las reglas activas sobre Radarr':
    'Runs every active rule against Radarr right now',
  '¿Ejecutar ya?': 'Run now?',
  // ── espera del montaje ────────────────────────────────────────────────────
  'Leyendo tus reglas automáticas…': 'Reading your automatic rules…',

  // ── cabecera de la sección ────────────────────────────────────────────────
  'Reglas automáticas a Radarr': 'Automatic Radarr rules',
  'Cada regla vigila una cosa —un festival, un premio, una región, un oficio— y manda a Radarr lo que pase su filtro. Se revisan cada noche: lo que hoy no llega al umbral puede entrar mañana.':
    'Each rule watches one thing — a festival, an award, a region, a role — and sends Radarr whatever clears its filter. They are reviewed every night: what falls short today can get in tomorrow.',
  '⚠️ Borrar algo de Radarr a mano no basta: volvería esta noche. Para que no vuelva, pulsa su 🚫 en el historial de abajo.':
    '⚠️ Deleting something from Radarr by hand is not enough: it would come back tonight. To keep it out, press its 🚫 in the history below.',
  'Que ninguna regla la vuelva a mandar': 'Keep any rule from sending it again',
  '🚫 «{p}» no volverá a entrar por ninguna regla': '🚫 “{p}” will not come back through any rule',
  'Vas a ejecutar {n} regla(s) sobre Radarr ahora mismo (hasta {m} películas). ¿Sigo?':
    'You are about to run {n} rule(s) against Radarr right now (up to {m} movies). Go ahead?',
  'Hay una pasada en curso': 'A run is in progress',
  reintentar: 'retry',
  'papel testimonial': 'walk-on part',
  'gala o evento': 'live event',
  'gala o evento, no es cine': 'live event, not a movie',
  'sin clave de MDBList no hay nota Σ: las reglas con umbral no pueden decidir':
    'without an MDBList key there is no Σ score: rules with a threshold cannot decide',
  'agotado el cupo diario de MDBList: las notas que falten se piden mañana':
    'MDBList daily quota used up: the missing scores will be requested tomorrow',
  'quedan notas por pedir: se completan en las siguientes pasadas':
    'some scores are still pending: they will be filled in on later runs',
  'Radarr no está configurado: las reglas no se ejecutarán.': 'Radarr is not configured: the rules will not run.',
  'Sin clave de MDBList no hay nota Σ: las reglas con umbral se quedarán esperando sin añadir nada.':
    'Without an MDBList key there is no Σ rating: rules with a threshold will sit waiting and add nothing.',
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
  // ── cuarentena pre-Radarr ─────────────────────────────────────────────────
  'Cuarentena antes de Radarr': 'Quarantine before Radarr',
  '{n} esperando tu ✓': '{n} waiting for your ✓',
  'Lo que cumpla estos criterios no se manda solo: espera tu aprobación. Para lo que pasa el umbral y aun así merece una segunda mirada. Vale para todas las reglas.':
    'Anything matching these criteria is not sent automatically: it waits for your approval. For what clears the threshold and still deserves a second look. Applies to every rule.',
  'Poner en cuarentena lo que cumpla alguno de estos criterios': 'Quarantine anything meeting any of these criteria',
  'Idiomas originales': 'Original languages',
  'Países de producción': 'Production countries',
  '✓ A Radarr': '✓ To Radarr',
  'La veta: ninguna regla la volverá a proponer': 'Vetoes it: no rule will propose it again',
  '✓ «{p}» mandada a Radarr': '✓ “{p}” sent to Radarr',
  'en cuarentena, esperan tu ✓': 'in quarantine, waiting for your ✓',
  'en cuarentena: espera tu aprobación': 'in quarantine: waiting for your approval',
  // el motivo se compone en el cliente: el servidor manda las piezas
  'idioma {x}': 'language {x}',
  'país {x}': 'country {x}',
  '✓ Aprobar las {n}': '✓ Approve all {n}',
  '🚫 Vetar las {n}': '🚫 Veto all {n}',
  '¿Vetar las {n} en cuarentena? Ninguna regla las volverá a proponer.':
    'Veto all {n} in quarantine? No rule will propose them again.',
  '✓ {n} mandadas a Radarr': '✓ {n} sent to Radarr',
  '✓ {n} mandadas a Radarr · {e} no se pudieron añadir': '✓ {n} sent to Radarr · {e} could not be added',
  'Esa película no está en cuarentena': 'That movie is not in quarantine',

  // selector de criterios de cuarentena por nombre (adiós a los códigos ISO)
  'Escribe un idioma (hindi, tamil…)': 'Type a language (Hindi, Tamil…)',
  'Escribe un país (India, Nigeria…)': 'Type a country (India, Nigeria…)',
  'Quitar {x}': 'Remove {x}',
  'Nada con ese nombre.': 'Nothing by that name.',
  'Frecuentes:': 'Common picks:',
};
