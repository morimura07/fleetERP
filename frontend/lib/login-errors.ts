/**
 * Why a sign-in failed, and what to tell the person looking at the form.
 *
 * Every failure used to collapse into "Incorrect email or password", so a
 * backend that was not running, a database that could not be reached, and an
 * expired demo tenant all sent the user to re-check credentials that were
 * correct. The codes here are produced in auth.ts and travel to the browser in
 * the sign-in redirect URL, so they must stay non-sensitive: none of them
 * reveals whether an account exists or which half of the pair was wrong.
 */
export const LOGIN_ERROR_CODES = {
  invalidCredentials: "invalid_credentials",
  demoExpired: "demo_expired",
  rateLimited: "rate_limited",
  apiUnreachable: "api_unreachable",
  apiTimeout: "api_timeout",
  apiError: "api_error",
} as const;

export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[keyof typeof LOGIN_ERROR_CODES];

const MESSAGES: Record<LoginErrorCode, string> = {
  invalid_credentials: "Incorrect email or password.",
  demo_expired: "This demo environment has expired. Please contact your administrator.",
  rate_limited: "Too many sign-in attempts. Please wait a minute and try again.",
  // Deliberately free of setup instructions: this screen is shown to customers.
  // The API base URL is logged on the server for whoever has to fix it.
  api_unreachable: "Cannot reach the FleetFlow server. Please try again in a moment.",
  api_timeout: "The server took too long to respond. Please try again.",
  api_error: "The server could not complete the sign-in. Please try again shortly.",
};

/**
 * Resolve the message for a code returned by `signIn`.
 *
 * An unrecognised code falls back to the credentials message rather than to
 * something alarming, since a future NextAuth build could emit its own codes.
 */
export function loginErrorMessage(code: string | undefined | null): string {
  return MESSAGES[code as LoginErrorCode] ?? MESSAGES.invalid_credentials;
}
