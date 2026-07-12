import client from "./client";

export async function listParties({ search, isActive = true, limit = 25, offset = 0 } = {}) {
  const { data } = await client.get("/parties/", {
    params: { search, is_active: isActive, limit, offset },
  });
  return data; // Page<PartyRead>
}

export async function createParty(name) {
  const { data } = await client.post("/parties/", { name });
  return data;
}

export async function updateParty(partyId, payload) {
  const { data } = await client.patch(`/parties/${partyId}`, payload);
  return data;
}
