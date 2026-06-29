"use client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { setToken, clearToken } from "@frontend/lib/auth-token";

/**
 * Bridges the NextAuth session's backend bearer token into the localStorage slot
 * that the client API wrapper (apiFetch) reads. Mounted once in each authed
 * layout; keeps the token in sync across login, logout, and session refresh.
 */
export function TokenSync() {
  const { data: session } = useSession();
  useEffect(() => {
    const token = session?.accessToken;
    if (token) setToken(token);
    else clearToken();
  }, [session?.accessToken]);
  return null;
}
