// Tiny pub/sub so non-React code (the query cache) can raise a visible notice.
const listeners = new Set();
export function subscribeNotice(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emitNotice(notice) {
  listeners.forEach((fn) => fn(notice));
}
