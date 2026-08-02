// Minimal global toast bus so actions across the app give consistent feedback.
let listeners = [];
let seq = 0;

/** `action` = { label, onClick }: p. ej. el «Deshacer» de un descarte. */
export function toast(message, type = 'info', action = null) {
  if (!message) return;
  const t = { id: ++seq, message, type, action };
  listeners.forEach((l) => l(t));
}

export function onToast(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}
