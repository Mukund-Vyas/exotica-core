// Access token lives in memory only (not localStorage) to reduce XSS exposure.
// Refresh token: this backend's /auth/refresh expects the refresh token in the
// JSON body (not a cookie), so it has to be stored client-side somewhere that
// survives a page reload — localStorage is the pragmatic choice here since the
// backend gives no option to set an httpOnly cookie itself.
let accessToken = null;

const REFRESH_KEY = "exotica_refresh_token";

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token) {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}

export function clearTokens() {
  accessToken = null;
  localStorage.removeItem(REFRESH_KEY);
}
