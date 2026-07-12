import client from "./client";

export async function getChannelPnl({ dateFrom, dateTo, channelId }) {
  const { data } = await client.get("/reports/channel-pnl", {
    params: { date_from: dateFrom, date_to: dateTo, channel_id: channelId },
  });
  return data;
}

export async function getSkuPnl({ dateFrom, dateTo, channelId, skuId }) {
  const { data } = await client.get("/reports/sku-pnl", {
    params: { date_from: dateFrom, date_to: dateTo, channel_id: channelId, sku_id: skuId },
  });
  return data;
}

export async function getInventoryValuation() {
  const { data } = await client.get("/reports/inventory-valuation");
  return data;
}

export async function getDeadStock() {
  const { data } = await client.get("/reports/dead-stock");
  return data;
}

export async function getPerformance({ dateFrom, dateTo, metric = "revenue", channelId, descending = true, limit = 20 }) {
  const { data } = await client.get("/reports/performance", {
    params: { date_from: dateFrom, date_to: dateTo, metric, channel_id: channelId, descending, limit },
  });
  return data;
}

export async function getAuditLog({ dateFrom, dateTo, limit = 50, offset = 0 }) {
  const { data } = await client.get("/reports/audit-log", {
    params: { date_from: dateFrom, date_to: dateTo, limit, offset },
  });
  return data;
}
