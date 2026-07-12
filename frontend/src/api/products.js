import client from "./client";

export async function listChannels() {
  const { data } = await client.get("/channels/");
  return data;
}

export async function listSkus({ isActive, search, limit = 50, offset = 0 } = {}) {
  const { data } = await client.get("/skus/", {
    params: { is_active: isActive, search, limit, offset },
  });
  return data; // Page<SKURead>
}

export async function getSku(skuId) {
  const { data } = await client.get(`/skus/${skuId}`);
  return data;
}

export async function createSku(payload) {
  const { data } = await client.post("/skus/", payload);
  return data;
}

export async function updateSku(skuId, payload) {
  const { data } = await client.patch(`/skus/${skuId}`, payload);
  return data;
}

export async function getSkuChannelPrices(skuId) {
  const { data } = await client.get(`/skus/${skuId}/channel-prices`);
  return data; // list of current ChannelPriceRead, one per channel that has one
}

export async function getCurrentChannelPrice(skuId, channelId) {
  const { data } = await client.get("/channel-prices/current", {
    params: { sku_id: skuId, channel_id: channelId },
  });
  return data; // ChannelPriceRead | null
}

export async function setChannelPrice(skuId, channelId, price) {
  const { data } = await client.post("/channel-prices/", {
    sku_id: skuId,
    channel_id: channelId,
    price,
  });
  return data;
}

export async function listCurrentChannelCommissions() {
  const { data } = await client.get("/channel-commissions/");
  return data; // list of current ChannelCommissionRead, one per channel that has one
}

export async function setChannelCommission(channelId, commissionType, value) {
  const { data } = await client.post("/channel-commissions/", {
    channel_id: channelId,
    commission_type: commissionType,
    value,
  });
  return data;
}

// --- Bulk SKU upload (FR-A4) ---

export async function downloadSkuBulkTemplate() {
  // The template endpoint requires auth like everything else, so a plain
  // <a href> wouldn't carry the in-memory bearer token — fetch via the
  // authenticated client and trigger the download as a blob instead.
  const response = await client.get("/skus/bulk/template", { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "exotica_sku_upload_template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function uploadSkusBulk(file) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await client.post("/skus/bulk", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // BulkSKUUploadResult
}
