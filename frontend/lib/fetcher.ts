import { getToken, clearToken } from "./auth-token";

/** Thin client-side JSON fetch wrapper with typed errors. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Base URL of the standalone API (e.g. https://api.example.com). Paths passed to
 * apiFetch start with "/api/...", so this is just the origin. Empty string keeps
 * same-origin behaviour for local/dev when the API is reverse-proxied.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      ...(options?.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  // A 401 means the token is missing/expired — clear it so the guard redirects.
  if (res.status === 401) clearToken();
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(payload?.error ?? "Request failed", res.status, payload?.details);
  }
  return (payload?.data ?? payload) as T;
}
