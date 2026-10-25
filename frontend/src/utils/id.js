// crypto.randomUUID() only exists in secure contexts (HTTPS / localhost). Opening
// the app over plain http on a LAN IP (e.g. testing from a phone) would crash
// every entry form, so fall back to a simple unique key.
let counter = 0;
export function newKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  counter += 1;
  return `k${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 8)}`;
}
