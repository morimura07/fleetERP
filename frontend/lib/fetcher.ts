import { getToken, clearToken } from "./auth-token";

/** ADMIN company switcher: the active company code, if one is selected. */
export function getActiveCompany(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("fleeterp.company");
}
export function setActiveCompany(code: string | null): void {
  if (typeof window === "undefined") return;
  if (code) window.localStorage.setItem("fleeterp.company", code);
  else window.localStorage.removeItem("fleeterp.company");
}

/** Thin client-side JSON fetch wrapper with typed errors. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";

let redirecting = false;

/**
 * What every client-side call does on a 401: drop the dead token and send
 * the person to sign in again, once, keeping where they were. Without this a
 * screen kept open past the token's life fails request by request with raw
 * "Invalid or expired token" messages and no way out but a manual reload.
 */
export function handleUnauthorized(): void {
  clearToken();
  if (typeof window === "undefined" || redirecting) return;
  if (window.location.pathname.startsWith("/login")) return;
  redirecting = true;
  const back = window.location.pathname + window.location.search;
  window.location.assign(`/login?reason=expired&callbackUrl=${encodeURIComponent(back)}`);
}

/** The message a person should see for a failed call, never a raw status. */
export function describeError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (e instanceof ApiError) return e.status === 401 ? SESSION_EXPIRED_MESSAGE : e.message || fallback;
  if (e instanceof TypeError && /fetch/i.test(e.message)) return "Cannot reach the server. Check your connection and try again.";
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/**
 * Base URL of the standalone API (e.g. https://api.example.com). Paths passed to
 * apiFetch start with "/api/...", so this is just the origin. Empty string keeps
 * same-origin behaviour for local/dev when the API is reverse-proxied.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface ApiFetchOptions extends RequestInit {
  /** Return the full { data, meta } envelope instead of just `data` (for paginated lists). */
  returnRaw?: boolean;
}

export async function apiFetch<T = unknown>(
  url: string,
  options?: ApiFetchOptions,
): Promise<T> {
  const { returnRaw, ...init } = options ?? {};
  const token = getToken();
  const company = getActiveCompany();
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(company ? { "X-Data-Area": company } : {}),
      ...init.headers,
    },
  });
  // A 401 means the token is missing or expired: back to sign-in.
  if (res.status === 401) handleUnauthorized();
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new ApiError(
      res.status === 401 ? SESSION_EXPIRED_MESSAGE : payload?.error ?? `Request failed (${res.status})`,
      res.status,
      payload?.details,
    );
  }
  // returnRaw keeps { data, meta } for paginated lists; otherwise unwrap `data`.
  return (returnRaw ? payload : payload?.data ?? payload) as T;
}
