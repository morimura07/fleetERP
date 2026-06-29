import { auth } from "@/auth";

/**
 * Server-side API client for the standalone backend.
 *
 * Used by Server Components to fetch data during SSR. The backend base URL is
 * read from API_URL (server-only; falls back to the public var for local dev),
 * and the current session's backend bearer token is attached automatically.
 */
const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ServerApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Fetch JSON from the backend on the server, forwarding the session token. */
export async function serverApi<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const session = await auth();
  const token = session?.accessToken;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    // Server-rendered list pages should always reflect current data.
    cache: "no-store",
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ServerApiError(payload?.error ?? "Request failed", res.status);
  }
  return (payload?.data ?? payload) as T;
}
