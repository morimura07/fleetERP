/**
 * Client-side bearer-token storage for the standalone API.
 *
 * Replaces the monolith's NextAuth same-origin session cookie. The token is
 * obtained from POST /api/auth/login and stored in localStorage; the API client
 * attaches it as `Authorization: Bearer`.
 *
 * NOTE: localStorage is XSS-readable. For higher security, store the token in a
 * Secure, SameSite cookie scoped to a shared parent domain instead.
 */
const KEY = "fleeterp.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, token);
}

export function clearToken(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
