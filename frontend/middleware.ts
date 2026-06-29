import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { ROUTE_GUARDS, can } from "@/lib/rbac";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  try {
    const session = req.auth;
    const role = session?.user?.role;

    // Not signed in → only public pages allowed.
    if (!session?.user) {
      if (isPublic) return NextResponse.next();
      const url = new URL("/login", nextUrl);
      url.searchParams.set("callbackUrl", path);
      return NextResponse.redirect(url);
    }

    // Signed in but on a public auth page → send to home.
    if (isPublic) {
      return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }

    // Drivers have a dedicated portal; keep them out of the admin console.
    if (role === "DRIVER" && !path.startsWith("/driver")) {
      return NextResponse.redirect(new URL("/driver", nextUrl));
    }

    // RBAC by route prefix.
    const guard = ROUTE_GUARDS.find((g) => path.startsWith(g.prefix));
    if (guard && !can(role, guard.permission)) {
      return NextResponse.redirect(new URL("/forbidden", nextUrl));
    }

    return NextResponse.next();
  } catch (e) {
    // Never let an auth/runtime error 500 the whole site. Fail closed:
    // public pages pass through; everything else is sent to login.
    console.error("[middleware] error", e);
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", nextUrl));
  }
});

export const config = {
  matcher: [
    // Run on everything except static assets and the auth API itself.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|uploads|.*\\.png$).*)",
  ],
};
