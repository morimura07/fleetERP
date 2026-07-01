import { SignJWT, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import { prisma } from "@backend/lib/prisma";
import { verifyPassword } from "@backend/lib/password";
import { AuthError } from "@backend/lib/errors";
import { can, type Permission } from "@backend/lib/rbac";
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
  role: Role;
  driverId: string | null;
  /** Legal entity the user belongs to; drives multi-company data isolation. */
  dataAreaId: string;
}

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");
const EXPIRES = process.env.JWT_EXPIRES ?? "1d";

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, driverId: user.driverId, name: user.name, dataAreaId: user.dataAreaId })
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
    driverId: (payload.driverId as string | null) ?? null,
    dataAreaId: (payload.dataAreaId as string) ?? "HQ01",
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
  return { id: user.id, email: user.email, name: user.name, role: user.role, driverId: user.driver?.id ?? null, dataAreaId: user.dataAreaId };
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
    c.set("user", await verifyToken(token));
  } catch {
    throw new AuthError("Invalid or expired token", 401);
  }
  await next();
};

/** Hono middleware factory: require a specific permission (after requireAuth). */
export const requirePermission = (permission: Permission): MiddlewareHandler => async (c, next) => {
  const user = c.get("user");
  if (!user || !can(user.role, permission)) {
    throw new AuthError("You do not have permission", 403);
  }
  await next();
};
