/**
 * El «hoy» de la app, en tu huso horario.
 *
 * `en-CA` da el formato ISO (2026-08-05) pero con la fecha LOCAL, que es la que
 * importa aquí: si son las 23:30 en Madrid, «estrena hoy» tiene que seguir
 * refiriéndose a hoy y no al día siguiente, que es lo que daría un UTC.
 *
 * Estaba escrito a mano en siete módulos, y el cron nocturno usaba además la
 * variante UTC para decidir si ya había corrido ese día: dos ideas distintas de
 * qué día es dentro del mismo proceso.
 */
export function today() {
  return new Date().toLocaleDateString('en-CA');
}
