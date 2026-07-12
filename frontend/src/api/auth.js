import client from "./client";

export async function login(username, password) {
  const { data } = await client.post("/auth/login", { username, password });
  return data; // { access_token, refresh_token, token_type }
}

export async function getMe() {
  const { data } = await client.get("/auth/me");
  return data; // { id, username, is_active, role_id }
}
