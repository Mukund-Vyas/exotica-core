import client from "./client";

export async function listVendorMappings({ vendorId, skuId, search, limit = 100, offset = 0 } = {}) {
  const { data } = await client.get("/vendor-sku-mappings/", {
    params: { vendor_id: vendorId, sku_id: skuId, search: search || undefined, limit, offset },
  });
  return data; // Page<VendorSkuMappingRead>
}

export async function createVendorMapping(payload) {
  const { data } = await client.post("/vendor-sku-mappings/", payload);
  return data;
}

export async function updateVendorMapping(id, payload) {
  const { data } = await client.patch(`/vendor-sku-mappings/${id}`, payload);
  return data;
}

export async function deleteVendorMapping(id) {
  await client.delete(`/vendor-sku-mappings/${id}`);
}

export async function uploadVendorMappings(vendorId, file) {
  const formData = new FormData();
  formData.append("vendor_id", vendorId);
  formData.append("file", file);
  const { data } = await client.post("/vendor-sku-mappings/bulk", formData);
  return data; // { created_count, failed_count, errors }
}

export async function downloadVendorMappingTemplate() {
  // Authenticated download (a plain <a href> wouldn't carry the in-memory token).
  const response = await client.get("/vendor-sku-mappings/bulk/template", { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "vendor_sku_mapping_template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
