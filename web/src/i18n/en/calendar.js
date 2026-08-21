// Traducciones EN de Calendar.jsx (Cine venidero). Clave = texto castellano.
export default {
  'Corto': 'Short',
  'Documental': 'Documentary',
  'Concierto': 'Concert',
  'Ver ficha': 'View details',
  'Fecha por anunciar': 'Date TBA',
  // p.credit viene del servidor con estos dos valores exactos (server/src/tmdb.js)
  'Dirige': 'Directed by',
  'Actúa': 'Starring',
  '✓ Ya en tu biblioteca': '✓ Already in your library',
  ' — comprueba la API key de TMDB en Ajustes.': ' — check the TMDB API key in Settings.',
  'Construyendo el calendario desde TMDB (la primera vez tarda un poco)…':
    'Building the calendar from TMDB (the first time takes a while)…',
  'Actualizando…': 'Updating…',
  'Actualizar desde TMDB': 'Refresh from TMDB',
  'Estrenos próximos y proyectos anunciados de los {n} directores/actores vigilados: el top automático de tu biblioteca más tus ':
    "Upcoming releases and announced projects from the {n} directors/actors you watch: your library's automatic top plus your ",
  'favoritos': 'favorites',
  '. Generado {date}.': '. Generated {date}.',
  '✕ Limpiar filtros': '✕ Clear filters',
  '{n} ocultas por tus filtros — solo cine largometraje': '{n} hidden by your filters — feature films only',
  'Monitorizar en bloque lo visible de los próximos': 'Bulk-monitor everything visible in the next',
  '3 meses': '3 months',
  '6 meses': '6 months',
  '12 meses': '12 months',
  '2 años': '2 years',
  'todo (incl. sin fecha)': 'everything (incl. undated)',
  'Añadiendo…': 'Adding…',
  'Añadir {n} a Radarr': 'Add {n} to Radarr',
  '({n} más pendientes fuera de ese plazo — amplía el horizonte para incluirlas)':
    '({n} more pending beyond that window — widen the horizon to include them)',
  'Nada pendiente en ese plazo: todo está en tu Plex o en Radarr.':
    'Nothing pending in that window: everything is already in your Plex or in Radarr.',
  'No se pudo consultar TMDB: {error} — revisa Ajustes y pulsa «Actualizar desde TMDB».':
    'Could not query TMDB: {error} — check Settings and press “Refresh from TMDB”.',
  'No hay estrenos próximos registrados en TMDB.': 'No upcoming releases recorded on TMDB.',
  'Anunciadas, sin fecha': 'Announced, undated',
  'Estrenadas recientemente (últimos 60 días)': 'Recently released (last 60 days)',

  // veto al pase automático de Radarr (🚫 en cada ficha)
  'Fuera del automático': 'Skip auto-add',
  'El automático la ignora': 'Auto-add skips it',
  'deshacer': 'undo',
  'Que el pase automático de Radarr no la coja. Se sigue viendo aquí y puedes añadirla a mano.':
    'Keep the nightly Radarr job from grabbing it. It stays visible here and you can still add it by hand.',
  '🚫 «{title}» queda fuera del pase automático': '🚫 “{title}” is out of the nightly Radarr job',
  '↩︎ «{title}» vuelve al pase automático': '↩︎ “{title}” is back in the nightly Radarr job',

  // dirección vs reparto: lo que el pase automático puede bajar solo y lo que
  // se elige a mano
  'Por quién:': 'Whose:',
  'Dirección y reparto': 'Directing and cast',
  'Solo dirección': 'Directing only',
  'Solo reparto y otros oficios': 'Cast and other crafts only',
  'dirección': 'directing',
  'reparto': 'cast',
  'Sale de alguien a quien sigues como director/a: es lo que el pase automático puede bajar solo':
    'Comes from someone you follow as a director: this is what the nightly job can grab on its own',
  'Sale de alguien a quien sigues por otro oficio: aquí eliges tú qué mandar a Radarr':
    'Comes from someone you follow for another craft: here you pick what goes to Radarr',
  'El pase automático solo baja lo de los oficios que tengas puestos en una regla —':
    'The nightly job only grabs the crafts you set up in a rule —',
  '—; el reparto se elige a mano.': '—; cast picks are made by hand.',
};
