// After any write (order, purchase, return, payment, price...) many screens are
// stale at once: lists, stock levels, dashboards, every report. Invalidating by
// individual keys kept missing some (the orders list showed old data for up to
// 10 seconds after saving), so writes refresh everything that is currently cached.
// Reference data that essentially never changes is left alone.
const STATIC_KEYS = new Set(["channels"]);

export function invalidateBusinessData(queryClient) {
  return queryClient.invalidateQueries({
    predicate: (q) => !STATIC_KEYS.has(q.queryKey[0]),
  });
}
