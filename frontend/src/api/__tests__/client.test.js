// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import client from "../client";

function failWith401(config) {
  return Promise.reject(Object.assign(new Error("401"), { config, response: { status: 401, data: { code: "invalid_credentials" } } }));
}

describe("401 handling", () => {
  let assign;
  beforeEach(() => {
    assign = vi.fn();
    Object.defineProperty(window, "location", { value: { assign, pathname: "/skus" }, writable: true });
    localStorage.clear();
    sessionStorage.clear();
    client.defaults.adapter = failWith401;
  });

  it("a wrong password does NOT redirect/reload the login page", async () => {
    await expect(client.post("/auth/login", { username: "a", password: "b" })).rejects.toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it("an expired session on a normal call still sends the user to /login", async () => {
    await expect(client.get("/skus/")).rejects.toBeTruthy();
    expect(assign).toHaveBeenCalledWith("/login");
  });
});
