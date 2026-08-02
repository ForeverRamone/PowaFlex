import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Devuelve la página anterior al punto donde la dejaste.
 *
 * El navegador ya sabe hacer esto, pero aquí no le sirve de nada: al volver, la
 * página se vuelve a montar vacía y pide sus datos, así que cuando el navegador
 * intenta restaurar el scroll todavía no hay altura a la que saltar y acabas
 * arriba del todo. Por eso se desactiva su restauración (`manual`) y la hacemos
 * nosotros, reintentando hasta que el contenido ha llegado.
 *
 * - PUSH (clicas un enlace): la página nueva empieza arriba. Antes heredabas el
 *   scroll de la anterior y entrabas en la ficha de un director por la mitad.
 * - POP (atrás/adelante): se recupera la posición guardada de esa entrada.
 * - REPLACE: no se toca. Los filtros de Biblioteca reescriben la URL con
 *   `replace`, y saltar arriba a cada filtro sería insufrible.
 */
const key = (k) => `powaflex:scroll:${k}`;

// cuánto esperamos a que la página recupere su altura antes de rendirnos
const RESTORE_MS = 5000;

export function ScrollMemory() {
  const location = useLocation();
  const navType = useNavigationType();
  const currentKey = useRef(location.key);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // Apunta dónde te quedas, y hazlo ANTES de navegar. No sirve guardarlo al
  // desmontar la página: para entonces React ya ha cambiado el contenido, el
  // documento mide menos y el navegador ha recortado el scroll a cero. El clic
  // en fase de captura llega antes que el router, así que ahí `scrollY` es
  // todavía el de la página que dejas.
  useEffect(() => {
    currentKey.current = location.key;
    const save = () => {
      try {
        sessionStorage.setItem(key(currentKey.current), String(Math.round(window.scrollY)));
      } catch {}
    };
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        save();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', save, true);
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', save, true);
      window.removeEventListener('pagehide', save);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [location.key]);

  useEffect(() => {
    if (navType === 'REPLACE') return;
    if (navType === 'PUSH') {
      window.scrollTo(0, 0);
      return;
    }
    let target = 0;
    try {
      target = Number(sessionStorage.getItem(key(location.key))) || 0;
    } catch {}
    if (target <= 0) return;

    // El contenido llega por fetch y la ruta puede estar aún por descargar, así
    // que no vale con saltar una vez: mientras la página crece, el navegador
    // recorta el scroll a lo que quepa en ese instante. Se reintenta con
    // temporizador (y no con requestAnimationFrame, que se para en pestañas en
    // segundo plano) hasta que la posición se queda donde la pedimos.
    const started = Date.now();
    let timer = 0;
    let settled = 0;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = 0;
    };
    // si el usuario toca el scroll mientras esperamos, mandan sus dedos
    const events = ['wheel', 'touchstart', 'keydown'];
    for (const e of events) window.addEventListener(e, stop, { passive: true, once: true });

    const tick = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= target - 2) {
        if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target);
        else if (++settled >= 3) return stop(); // ha cuajado
      }
      if (Date.now() - started >= RESTORE_MS) {
        // la página ya no da para tanto (menos resultados que antes): al final
        window.scrollTo(0, Math.min(target, Math.max(0, max)));
        stop();
      }
    };
    tick();
    if (timer === 0 && Math.abs(window.scrollY - target) > 2) timer = setInterval(tick, 40);

    return () => {
      stop();
      for (const e of events) window.removeEventListener(e, stop);
    };
  }, [location.key, navType]);

  return null;
}
