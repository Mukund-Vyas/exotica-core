import client from "./client";

export async function listVendors({ search, isActive = true, limit = 25, offset = 0 } = {}) {
  const { data } = await client.get("/vendors/", {
    params: { search, is_active: isActive, limit, offset },
  });
  return data; // Page<VendorRead>
}

export async function createVendor(name) {
  const { data } = await client.post("/vendors/", { name });
  return data;
}

export async function updateVendor(vendorId, payload) {
  const { data } = await client.patch(`/vendors/${vendorId}`, payload);
  return data;
}
