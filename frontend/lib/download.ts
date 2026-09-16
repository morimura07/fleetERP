import { getToken } from "@frontend/lib/auth-token";
import { getActiveCompany, handleUnauthorized, SESSION_EXPIRED_MESSAGE } from "@frontend/lib/fetcher";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Fetches a file from the API with the bearer token and hands it to the
 * browser as a download.
 *
 * A plain link cannot carry the Authorization header, so navigating to an
 * export URL lands on the API's 401 JSON. Every download in the app goes
 * through here instead: `apiFetch` is not used because that unwraps JSON and
 * a download needs the raw body. Throws with a readable message on failure
 * so the caller can toast it.
 */
export async function downloadFile(path: string, fallbackName = "download") {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(getActiveCompany() ? { "X-Data-Area": getActiveCompany() as string } : {}),
    },
  });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  if (!res.ok) {
    // The server explains a refusal (too many rows, unknown format) in JSON.
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `The file could not be built (${res.status})`);
  }

  // Filename comes from Content-Disposition so the server names the file.
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const named = /filename="?([^"]+)"?/.exec(disposition)?.[1];

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = named ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
