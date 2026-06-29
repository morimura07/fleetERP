import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config (no Node-only deps like bcrypt/Prisma).
 * Imported by middleware. The heavy parts live in auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [], // declared in src/auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.driverId = user.driverId ?? null;
        token.accessToken = user.accessToken;
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
      return session;
    },
  },
} satisfies NextAuthConfig;
