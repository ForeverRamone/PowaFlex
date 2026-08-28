/**
 * LO QUE NO ES CINE, aunque TMDB lo guarde como película.
 *
 * El clasificador de la casa (`esLargometraje` + los filtros de concierto y de
 * telefilme) atrapa casi todo, pero deja pasar tres clases de ficha que no son
 * una película: el documental promocional de una serie, el monólogo grabado y
 * el «cómo se hizo» que salió en el DVD. Las tres duran más de cuarenta
 * minutos, no están marcadas como televisión y llevan géneros de cine, así que
 * no hay regla de duración ni de género que las separe — y subir el suelo a una
 * hora amputaría el cine mudo, que es donde una película de cincuenta minutos
 * es un largometraje de pleno derecho: Lubitsch tiene ocho entre 45 y 64.
 *
 * Por eso van a mano y por id, con su motivo escrito. La lista VIAJA con el
 * software a propósito: una corrección en `country_overrides` vive solo en la
 * base donde se hizo, y los índices por país vienen empaquetados y se siembran
 * en todas las instalaciones.
 *
 * REGLA PARA AMPLIARLA: solo entra lo que no es una película. Un documental
 * sobre una persona SÍ es cine — «Sembène: The Making of African Cinema» (id
 * 364418) es un documental sobre Ousmane Sembène y no un «cómo se hizo», y
 * «Ronaldo: El Fenómeno» (id 1038205) es un documental sobre el futbolista y no
 * sobre una serie. Los dos casaban con el barrido por título y los dos se
 * quedan: quien amplíe esto que mire la ficha, no el título.
 */
export const NO_ES_CINE = new Map([
  [689249, 'Documental promocional de 57 minutos SOBRE UNA SERIE de Netflix («La Casa de Papel»). Salía 106.º de España y 2.º de su año.'],
  [595723, 'Monólogo grabado de Franco Escamilla. Salía 402.º de España y 14.º de su año.'],
  [321744, 'El «cómo se hizo» de «Agárrame esos fantasmas», de Peter Jackson. Salía 36.º de Nueva Zelanda y PRIMERO de 1998.'],
  [121251, 'El «cómo se hizo» del «King Kong» de Peter Jackson, extra de su edición en DVD. Salía 70.º de Nueva Zelanda y 2.º de 2006.'],
]);

/** ¿Esta ficha de TMDB es una de las que no son cine? */
export const noEsCine = (tmdbId) => NO_ES_CINE.has(Number(tmdbId));
