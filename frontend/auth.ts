import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Backend base URL for credential verification. The frontend no longer touches
 * the database — login is delegated to the standalone API's POST /auth/login,
 * which returns a bearer token we stash in the NextAuth JWT.
 */
const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        if (!res.ok) return null;

        const { data } = (await res.json()) as {
          data: {
            accessToken: string;
            user: { id: string; name: string; email: string; role: string; driverId: string | null };
          };
        };

        return {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
          driverId: data.user.driverId,
          accessToken: data.accessToken,
        } as never;
      },
    }),
  ],
});
