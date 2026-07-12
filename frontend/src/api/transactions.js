import client from "./client";

// --- Purchases (FR-B1) ---
export async function createPurchase(payload) {
  const { data } = await client.post("/purchases/", payload);
  return data;
}
export async function listPurchases({ vendorId, limit = 50, offset = 0 } = {}) {
  const { data } = await client.get("/purchases/", { params: { vendor_id: vendorId, limit, offset } });
  return data;
}

// --- Orders (FR-B2) ---
export async function createOrder(payload) {
  const { data } = await client.post("/orders/", payload);
  return data;
}
export async function createBulkOrders(orders) {
  const { data } = await client.post("/orders/bulk", { orders });
  return data; // BulkOrderResult { orders, errors }
}
export async function listOrders({ channelId, partyId, dateFrom, dateTo, limit = 50, offset = 0 } = {}) {
  const { data } = await client.get("/orders/", {
    params: { channel_id: channelId, party_id: partyId, date_from: dateFrom, date_to: dateTo, limit, offset },
  });
  return data;
}

// --- Returns (FR-B3) ---
export async function createReturn(payload) {
  const { data } = await client.post("/returns/", payload);
  return data;
}

// --- Receivables & Payments (Epic F) ---
export async function listReceivables({ partyId, limit = 50, offset = 0 } = {}) {
  const { data } = await client.get("/receivables/", { params: { party_id: partyId, limit, offset } });
  return data;
}
export async function getReceivablesAging(asOf, partyId) {
  const { data } = await client.get("/receivables/aging", { params: { as_of: asOf, party_id: partyId } });
  return data;
}
export async function recordPayment(receivableId, payload) {
  const { data } = await client.post(`/receivables/${receivableId}/payments`, payload);
  return data;
}
