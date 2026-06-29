/** Auth/authorization error with an associated HTTP status. Framework-free. */
export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Optional structured payload surfaced as `details` in the response. */
    public details?: unknown,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
