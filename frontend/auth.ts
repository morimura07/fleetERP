import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { LOGIN_ERROR_CODES, type LoginErrorCode } from "@frontend/lib/login-errors";

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

/** Give up rather than spin forever if the API accepts the socket but never answers. */
const LOGIN_TIMEOUT_MS = 10_000;

/**
 * Carries *why* sign-in failed back to the login form.
 *
 * NextAuth turns any `authorize` rejection into a generic CredentialsSignin,
 * but the `code` on this subclass survives into the redirect URL and comes back
 * as `res.code` from `signIn(..., { redirect: false })`. Without it, an API that
 * is simply not running is indistinguishable from a wrong password, and the user
 * is sent to re-check credentials that were never the problem.
 *
 * Codes are visible in the URL, so they stay coarse: nothing here reveals
 * whether an email exists or which half of the pair was wrong.
 */
class LoginFailure extends CredentialsSignin {
  constructor(public readonly code: LoginErrorCode) {
    super();
  }
}

/** Map an API status onto a code the login form can explain. */
function codeForStatus(status: number): LoginErrorCode {
  if (status === 403) {
    // The only 403 POST /auth/login raises is an elapsed sandbox window.
    return LOGIN_ERROR_CODES.demoExpired;
  }
  if (status === 429) return LOGIN_ERROR_CODES.rateLimited;
  if (status >= 500) return LOGIN_ERROR_CODES.apiError;
  return LOGIN_ERROR_CODES.invalidCredentials;
}

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
        if (!parsed.success) throw new LoginFailure(LOGIN_ERROR_CODES.invalidCredentials);

        let res: Response;
        try {
          res = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed.data),
            signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
          });
        } catch (e) {
          // Connection refused, DNS failure, or the timeout above. The operator
          // needs the base URL to act on this, so it is logged here; the browser
          // is told only that the server is unreachable.
          const timedOut = e instanceof Error && e.name === "TimeoutError";
          console.error(`[auth] ${timedOut ? "timed out calling" : "cannot reach"} the API at ${API_BASE}`, e);
          throw new LoginFailure(timedOut ? LOGIN_ERROR_CODES.apiTimeout : LOGIN_ERROR_CODES.apiUnreachable);
        }

        if (!res.ok) {
          if (res.status !== 401) console.error(`[auth] ${API_BASE} rejected the login with ${res.status}`);
          throw new LoginFailure(codeForStatus(res.status));
        }

        let data: {
          accessToken: string;
          user: { id: string; name: string; email: string; role: string; driverId: string | null };
        };
        try {
          ({ data } = await res.json());
        } catch (e) {
          // A 200 that isn't the envelope we expect means a proxy or a version
          // skew, not a bad password. Saying so saves the same wrong hunt.
          console.error(`[auth] unreadable login response from ${API_BASE}`, e);
          throw new LoginFailure(LOGIN_ERROR_CODES.apiError);
        }

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
