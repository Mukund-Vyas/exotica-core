import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as authApi from "../api/auth";
import {
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
  clearTokens,
} from "../api/tokenStore";
import client from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | authenticated | anonymous

  const bootstrap = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      setStatus("anonymous");
      return;
    }
    try {
      const { data } = await client.post("/auth/refresh", { refresh_token: refreshToken });
      setAccessToken(data.access_token);
      setRefreshToken(data.refresh_token);
      const me = await authApi.getMe();
      setUser(me);
      setStatus("authenticated");
    } catch {
      clearTokens();
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (username, password) => {
    const tokenData = await authApi.login(username, password);
    setAccessToken(tokenData.access_token);
    setRefreshToken(tokenData.refresh_token);
    const me = await authApi.getMe();
    setUser(me);
    setStatus("authenticated");
    return me;
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    setStatus("anonymous");
    queryClient.clear(); // don't leave one session's business data cached for the next
  }, [queryClient]);

  // The server is the authority and enforces every permission itself; this only
  // decides what to *show*. It fails closed: no loaded user, no permissions.
  const permissionSet = useMemo(() => new Set(user?.permission_codes ?? []), [user]);
  const hasPermission = useCallback((code) => permissionSet.has(code), [permissionSet]);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
