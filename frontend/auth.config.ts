import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config (no Node-only deps like bcrypt/Prisma).
 * Imported by middleware. The heavy parts live in auth.ts.
 */
/**
 * The `exp` claim of the backend token, read without verifying it: the
 * backend verifies on every request, this only needs to know when to stop
 * trusting the token. Null when the token cannot be read.
 */
export function tokenExpiry(accessToken: string | undefined): number | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

/** True once the backend would refuse the token. A token with no readable expiry is trusted. */
export function accessTokenExpired(expires: number | null | undefined, now = Date.now()): boolean {
  return expires != null && expires * 1000 <= now;
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // The session cookie carries the backend token and is useless once that
  // token has expired. Its lifetime is therefore pinned to the backend's
  // (JWT_EXPIRES, one day by default) rather than NextAuth's 30-day default,
  // and the expiry claim is checked on every request in the middleware.
  session: { strategy: "jwt", maxAge: Number(process.env.AUTH_SESSION_MAX_AGE ?? 60 * 60 * 24) },
  trustHost: true,
  providers: [], // declared in src/auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.driverId = user.driverId ?? null;
        token.accessToken = user.accessToken;
        token.accessTokenExpires = tokenExpiry(user.accessToken);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as never;
        session.user.driverId = (token.driverId as string | null) ?? null;
      }
      session.accessToken = (token.accessToken as string) ?? "";
      session.accessTokenExpires = (token.accessTokenExpires as number | null) ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;
