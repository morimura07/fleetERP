import { auth } from "@/auth";
import { can, type Permission } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { AuthError } from "@/lib/errors";

export { AuthError };

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
  driverId: string | null;
}

/** Returns the current user or throws 401. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new AuthError("Authentication required", 401);
  return session.user as SessionUser;
}

/** Returns the current user or throws 401/403 if the permission is missing. */
export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new AuthError("You do not have permission", 403);
  }
  return user;
}
