import type { Role } from "@frontend/lib/rbac";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      driverId: string | null;
    } & DefaultSession["user"];
    /** Backend API bearer token, forwarded on server-side fetches. */
    accessToken: string;
  }

  interface User {
    role: Role;
    driverId: string | null;
    /** Backend API bearer token issued by POST /api/auth/login. */
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    driverId: string | null;
    accessToken?: string;
  }
}
