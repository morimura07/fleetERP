import { SignJWT, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import { prisma } from "@backend/lib/prisma";
import { verifyPassword } from "@backend/lib/password";
import { AuthError } from "@backend/lib/errors";
import { can, type Permission } from "@backend/lib/rbac";
import { isSandboxExpired } from "@backend/services/sandbox";
import { organizationOf } from "@backend/lib/organization";
import type { Role } from "@prisma/client";

/**
 * Standalone-API auth. Replaces the monolith's NextAuth same-origin session with
 * a stateless JWT bearer token the frontend (a separate origin) sends on every
 * request. Permission checks reuse the shared RBAC map (can()).
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role; // system role — drives ADMIN/DRIVER special behavior
  /** Custom role key (RbacRole.key) when assigned; overrides the system role for permission checks. */
  roleKey: string | null;
  driverId: string | null;
  /** Legal entity the user belongs to; drives multi-company data isolation. */
  dataAreaId: string;
  /**
   * Tenant the user belongs to, resolved from their company at login. Bounds an
   * ADMIN to the companies inside their own organization. Null for SUPER_ADMIN,
   * who is not scoped to one.
   */
  organizationId: string | null;
  /** Cross-entity per-request "active company" from the X-Data-Area header (company switcher). */
  activeArea?: string;
}

/** The role key used for permission resolution: the custom role if set, else the system role. */
export function effectiveRoleKey(user: { role: Role; roleKey: string | null }): string {
  return user.roleKey ?? user.role;
}

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");
const EXPIRES = process.env.JWT_EXPIRES ?? "1d";

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, roleKey: user.roleKey, driverId: user.driverId, name: user.name, dataAreaId: user.dataAreaId, organizationId: user.organizationId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(EXPIRES)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, secret());
  return {
    id: payload.sub as string,
    email: payload.email as string,
    name: payload.name as string,
    role: payload.role as Role,
    roleKey: (payload.roleKey as string | null) ?? null,
    driverId: (payload.driverId as string | null) ?? null,
    dataAreaId: (payload.dataAreaId as string) ?? "HQ01",
    // Tokens issued before the organization layer carry no claim; fall back to
    // the live map so an existing session keeps working after deploy.
    organizationId: (payload.organizationId as string | null) ?? organizationOf((payload.dataAreaId as string) ?? "HQ01"),
  };
}

/** Validate credentials and return the principal (used by POST /auth/login). */
export async function authenticate(email: string, password: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { driver: { select: { id: true } } },
  });
  if (!user || !user.isActive) throw new AuthError("Invalid credentials", 401);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new AuthError("Invalid credentials", 401);

  // A sandbox partition may carry an access window (M32). Checked only after the
  // password verifies, so an anonymous caller can't probe which areas are demos.
  const company = await prisma.company.findUnique({
    where: { code: user.dataAreaId },
    select: { isSandbox: true, sandboxExpiresAt: true, organizationId: true },
  });
  if (company && isSandboxExpired(company)) {
    throw new AuthError("This demo environment has expired. Please contact your administrator", 403);
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    roleKey: user.roleKey ?? null,
    driverId: user.driver?.id ?? null,
    dataAreaId: user.dataAreaId,
    // The tenant is a property of the user's company, not of the user, so it is
    // resolved here rather than stored on the row where it could drift.
    organizationId: company?.organizationId ?? null,
  };
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/** Hono middleware: require a valid bearer token; attaches `user` to context. */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AuthError("Authentication required", 401);
  try {
    const user = await verifyToken(token);
    // Company switcher: ADMIN may focus a specific company via X-Data-Area.
    // Ignored for non-admins (they can never leave their own entity).
    const active = c.req.header("x-data-area");
    if (active && user.role === "ADMIN") user.activeArea = active;
    c.set("user", user);
  } catch {
    throw new AuthError("Invalid or expired token", 401);
  }
  await next();
};

/** Hono middleware factory: require a specific permission (after requireAuth). */
export const requirePermission = (permission: Permission): MiddlewareHandler => async (c, next) => {
  const user = c.get("user");
  if (!user || !can(effectiveRoleKey(user), permission)) {
    throw new AuthError("You do not have permission", 403);
  }
  await next();
};
