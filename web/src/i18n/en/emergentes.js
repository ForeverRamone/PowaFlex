// Detector de directores emergentes. El desglose de la puntuación llega
// ESTRUCTURADO desde el servidor y las frases se componen en el cliente: por eso
// todas las piezas están aquí y no hay ni un mensaje compuesto sin traducir.
export default {
  'Directores emergentes': 'Emerging directors',
  'Quién puede ser un grande dentro de diez años. Sale de lo que PowaFlex ya tiene cacheado —las tablas de selección oficial, con las cinco secciones de debut que es donde de verdad estrena quien empieza, y los palmareses que alcanzan primeras películas, empezando por la Cámara de Oro— y se puntúa de 0 a 100. Cada ficha enseña con qué datos puntuó.':
    'Who could be a great director ten years from now. It comes from what PowaFlex already has cached — the official line-up tables, including the five debut sections where people actually premiere when they are starting out, and the award lists that reach first features, starting with the Caméra d’Or — and is scored from 0 to 100. Every card shows the data behind its score.',
  'Cargando emergentes…': 'Loading emerging directors…',

  // señales
  'Consagración': 'Institutional standing',
  'Crítica': 'Critics',
  'Tracción': 'Traction',
  'Aceleración': 'Acceleration',
  'Afinidad contigo': 'Affinity with you',

  // desglose
  'Puntuación del detector (0–100)': 'Detector score (0–100)',
  '▸ Por qué esta puntuación': '▸ Why this score',
  '▾ Por qué esta puntuación': '▾ Why this score',
  'sin detalle': 'no detail',
  '{fuente} {n} de media': '{fuente} {n} on average',
  'RT crítica': 'RT critics',
  'Letterboxd {nota} con {marcas} marcas': 'Letterboxd {nota} with {marcas} logs',
  'nota': 'rating',
  'volumen': 'volume',
  'nivel de festival': 'festival level',
  'sube en {sube}, baja en {baja}': 'up in {sube}, down in {baja}',
  'su última sube en {sube}': 'their latest is up in {sube}',
  'su última baja en {baja}': 'their latest is down in {baja}',
  'puntúas ese cine {media} frente a tu media de {tuya}': 'you rate that cinema {media} against your {tuya} average',
  'Sin datos (no puntúan ni penalizan): {lista}': 'No data (they neither score nor penalise): {lista}',
  'Lo último:': 'Latest:',
  'debut en {a}': 'debut in {a}',
  'un largo': 'one feature',

  // parrilla y controles (el placeholder de género y sus etiquetas en singular
  // son los mismos que en Personas/Descubrir; «Nombre (A-Z)» y «Ordenar:» los
  // comparten todas las listas de personas)
  'Puntuación': 'Score',
  'Menos películas': 'Fewest movies',
  'Nombre (A-Z)': 'Name (A-Z)',
  'Género||persona': 'Gender',
  'Mujer': 'Female',
  'Hombre': 'Male',
  'Continente': 'Continent',
  'Lo que sigas aquí alimenta': 'What you follow here feeds',
  // los continentes salen del mismo mapa que la demografía de tu biblioteca, y
  // hasta ahora ninguna pantalla los traducía: al añadirlos aquí se arreglan
  // también los filtros de Personas, que comparten diccionario
  'Europa': 'Europe',
  'Sudamérica': 'South America',
  'África': 'Africa',
  'No me interesa: fuera de la lista, y no vuelve en la próxima reconstrucción':
    'Not interested: off the list, and it will not come back on the next rebuild',
  'Volver a detectar': 'Run detection again',
  'Detectando…': 'Detecting…',
  'Detectar ahora': 'Detect now',
  'Detección en marcha: tarda unos minutos': 'Detection under way: it takes a few minutes',
  'Detección terminada: {n} emergentes': 'Detection finished: {n} emerging directors',
  '{n} mirados de {c} candidatos': '{n} checked out of {c} candidates',
  'Todavía no hay lista: el detector se reconstruye una vez por semana en el pase nocturno.':
    'No list yet: the detector rebuilds once a week during the nightly run.',
  '✕ {nombre} fuera de la lista': '✕ {nombre} off the list',
  'Cinco señales, con estos pesos: consagración institucional {i}, consenso crítico {c}, tracción real {tr}, aceleración {a} y afinidad contigo {af}. La señal que no tiene datos NO puntúa cero: sale del reparto y las demás se reparten su peso, para que un debut sin Metacritic no quede por detrás de una película mediana solo porque de la mediana haya más datos.':
    'Five signals, with these weights: institutional standing {i}, critical consensus {c}, real traction {tr}, acceleration {a} and affinity with you {af}. A signal with no data does NOT score zero: it drops out of the split and the rest share its weight, so a debut without a Metacritic score does not end up behind a mediocre movie just because the mediocre one is better documented.',
  'Última detección: {d} · {n} ediciones leídas.': 'Last detection: {d} · {n} editions read.',
  'Sin detección todavía.': 'No detection yet.',

  // secciones de debut, con los mismos nombres que la página de Festivales
  'Secciones de debut': 'Debut sections',
  'Cannes · Un Certain Regard': 'Cannes · Un Certain Regard',
  'Sundance · Competición de EE UU': 'Sundance · U.S. Competition',
  'Cannes · Semana de la Crítica': 'Cannes · Critics’ Week',
  'Cannes · Quincena': 'Cannes · Directors’ Fortnight',
  'Venecia · Orizzonti': 'Venice · Orizzonti',
  'Berlinale · Perspectives': 'Berlinale · Perspectives',
  'S.S. · Nuevos Directores': 'S.S. · New Directors',
  'Cannes · Cámara de Oro': 'Cannes · Caméra d’Or',

  // los palmareses que también mira el radar. Los nombres propios (Sitges, Mar
  // del Plata, BAFTA, Seminci, David di Donatello) se quedan igual y por eso no
  // llevan entrada
  'Cine Europeo (EFA)': 'European Film Awards',
  'Óscar internacional': 'International Oscar',
  'Premios Goya': 'Goya Awards',
  'Premios César': 'César Awards',
  'Guldbagge (Suecia)': 'Guldbagge (Sweden)',
  'Lola (Alemania)': 'Lola (Germany)',

  // regla de Radarr sobre emergentes
  'Emergentes': 'Emerging',
  'Todas sus películas': 'All their movies',
  'Solo la ópera prima': 'First feature only',
  'Puntuación mínima de emergente': 'Minimum emerging score',
  'la puntuación del detector, no la nota de la película': 'the detector’s score, not the movie’s rating',
  'Nace pidiendo 70 de puntuación de emergente y con tope de 10 por pasada. Se apoya en el detector, que se reconstruye una vez por semana.':
    'It starts asking for an emerging score of 70 and a cap of 10 per run. It leans on the detector, which rebuilds once a week.',
  'el detector de emergentes aún no ha corrido: se reconstruye en el pase nocturno':
    'the emerging-directors detector has not run yet: it rebuilds during the nightly run',
  'Sin clave de TMDB no se pueden identificar los directores':
    'Without a TMDB key the directors cannot be identified',
  'Ya hay una detección en marcha': 'A detection is already under way',
  'No está en la lista de emergentes': 'Not in the emerging-directors list',

  // ── progreso de la detección (el paso lo nombra el servidor)
  'Rastreando debuts en las ediciones de festival…': 'Tracking debuts across the festival line-ups…',
  'Rastreando debuts · {paso} · {n} mirados de {c} candidatos':
    'Tracking debuts · {paso} · {n} of {c} candidates checked',
  'leyendo las ediciones': 'reading the line-ups',
  'cribando': 'sifting',
};
