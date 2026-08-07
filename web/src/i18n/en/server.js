// Mensajes que genera el SERVIDOR y acaban pintados en la interfaz (errores de
// API, validaciones, avisos de tareas). No hizo falta tocar el servidor: como
// el sistema de traducción usa el castellano COMO CLAVE, sus mensajes ya son
// claves válidas — basta con envolver con t() el punto donde se pintan.
//
// Cubre los mensajes FIJOS. Los que llevan datos dentro del texto (nombres de
// película, cifras) y los avisos de Novedades se componen en el servidor y
// caen en castellano a propósito: traducirlos exigiría cambiar la API.
export default {
  // ── acceso y peticiones ──
  'No autorizado': 'Not authorised',
  'Demasiados intentos, prueba en unos minutos': 'Too many attempts, try again in a few minutes',
  'Petición desde otro sitio web': 'Request from another website',
  'No encontrada': 'Not found',
  'no encontrado': 'not found',
  'bad request': 'bad request',
  'Servicio desconocido': 'Unknown service',
  'Ya hay una actualización en marcha': 'There is already a refresh running',

  // ── validación ──
  'Falta tmdbId': 'Missing tmdbId',
  'Falta tmdbIds': 'Missing tmdbIds',
  'Faltan personIds': 'Missing personIds',
  'Faltan personas': 'No people given',
  'Faltan datos de la persona': 'Missing details for that person',
  'Faltan listId o title': 'Missing listId or title',
  'Faltan el título o el año de la fila a corregir': 'Missing the title or year of the row to fix',
  'El id de TMDB no es válido': 'That TMDB id is not valid',
  'Ese oficio no existe': 'That role does not exist',
  'Máximo 300 películas por tanda': 'Maximum 300 movies per batch',
  'Pega al menos un nombre': 'Paste at least one name',
  'Indica tu usuario de Letterboxd': 'Enter your Letterboxd username',
  'No se recibió ningún archivo': 'No file received',
  'Esto no parece un fichero de ajustes exportado por PowaFlex':
    'This does not look like a settings file exported by PowaFlex',

  // ── biblioteca y listas ──
  'Esa película no está en tu biblioteca': 'That movie is not in your library',
  'Esa persona no está en tu biblioteca': 'That person is not in your library',
  'Esa lista no existe o está vacía': 'That list does not exist or is empty',
  'Lista no encontrada': 'List not found',
  'No hay a quién seguir': 'There is nobody to follow',

  // ── integraciones ──
  'Falta la API key de TMDB en Ajustes': 'The TMDB API key is missing in Settings',

  // ── imágenes ──
  'sin imagen': 'no image',
  'error de imagen': 'image error',
};
