import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, accessTokenExpired } from "@/auth.config";
import { ROUTE_GUARDS, can } from "@frontend/lib/rbac";

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

    // The cookie is still valid but the backend token inside it is not: every
    // API call would 401. Send the person to sign in again before a screen
    // gets the chance to fail in front of them.
    if (accessTokenExpired(session.accessTokenExpires)) {
      if (isPublic) return NextResponse.next();
      const url = new URL("/login", nextUrl);
      url.searchParams.set("reason", "expired");
      url.searchParams.set("callbackUrl", path);
      return NextResponse.redirect(url);
    }

    // Signed in but on a public auth page → send to home.
    // EXCEPTION: an expired backend token bounced us here (?reason=expired).
    // The NextAuth cookie still looks valid, so don't ricochet back to a page
    // that will 401 again — let /login render so the user can re-authenticate.
    if (isPublic && nextUrl.searchParams.get("reason") !== "expired") {
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
