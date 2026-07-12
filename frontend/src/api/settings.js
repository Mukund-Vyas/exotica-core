import client from "./client";

export async function listSettings() {
  const { data } = await client.get("/settings/");
  return data;
}

export async function updateSetting(key, value) {
  const { data } = await client.patch(`/settings/${key}`, { value });
  return data;
}
