// Minimal global toast bus so actions across the app give consistent feedback.
let listeners = [];
let seq = 0;

export function toast(message, type = 'info') {
  if (!message) return;
  const t = { id: ++seq, message, type };
  listeners.forEach((l) => l(t));
}

export function onToast(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}
