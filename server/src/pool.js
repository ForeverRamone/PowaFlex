/**
 * Devolver el turno al bucle de eventos, UNA vuelta.
 *
 * Los recorridos largos del servidor son `async`, pero cuando todo lo que piden
 * ya está en caché ningún `await` llega a esperar de verdad: se resuelven en la
 * cola de microtareas, que Node vacía ENTERA antes de volver a mirar los
 * sockets. Lo medido: mientras Descubrir reconstruía sus tarjetas (12 s), un
 * `/api/version` tardaba 11,6 s — la aplicación entera congelada, y con ella la
 * propia barra de progreso, que no podía ni consultarse.
 *
 * `setImmediate` es una macrotarea: obliga a pasar por la fase de entrada/salida
 * y las demás peticiones entran. Cuesta un microsegundo por vuelta.
 */
export const cedeElHilo = () => new Promise((r) => setImmediate(r));

/**
 * Recorrer una lista con N trabajadores en paralelo.
 *
 * Este patrón estaba copiado a mano veintitantas veces por todo el servidor
 * («let i = 0; async function worker() { for(;;) { const idx = i++; … } }» y un
 * Promise.all al final), y cada copia volvía a resolver lo mismo: el índice
 * compartido, el corte al llegar al final y qué hacer con los fallos. Aquí vive
 * una sola vez.
 *
 * El comportamiento es el de todas esas copias: cada trabajador coge el
 * siguiente índice libre, se procesa EN ORDEN de arranque, y un fallo suelto
 * corta la tanda entera (igual que hacía Promise.all). Quien quiera tragarse
 * los errores por elemento lo hace dentro de su propia función, como hasta
 * ahora.
 */
export async function mapPool(items, concurrency, fn) {
  const lista = items || [];
  if (!lista.length) return [];
  const n = Math.max(1, Math.min(concurrency | 0 || 1, lista.length));
  const out = new Array(lista.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= lista.length) return;
      out[idx] = await fn(lista[idx], idx);
      await cedeElHilo();
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}
