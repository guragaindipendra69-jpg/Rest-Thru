import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  DASHBOARD_AUTH_ROUTES,
  SUPERADMIN_AUTH_ROUTES,
  ORDER_AUTH_ROUTES,
  SHARED_LOGIN_PATH,
  portalForPath,
  portalForRole,
  sessionCookieName,
  type SessionPortal,
} from "@/lib/constants";
import { jwtSecret as secret } from "@/lib/jwt-secret";

// Per-portal auth config. Each portal is guarded ONLY by its own session
// cookie, so the same browser can hold a superadmin, owner, reception and
// waiter session at once — signing in or out of one portal never disturbs
// the others.
//
// Every restaurant portal turns an unauthenticated request away to the one
// shared staff login, which routes by role on success. Sending them to the
// retired per-portal URLs instead would cost a second redirect, since those are
// now stubs that forward here anyway. They stay listed in `publicPaths` so the
// stubs remain renderable for links already printed or bookmarked on station
// tablets — dropping them there would bounce an anonymous visitor to
// /login?redirect=/owner/login and land them back on a stub after signing in.
//
// The superadmin console keeps its own door: `login()` refuses admins on the
// staff form and non-admins on the console form, so the two are not
// interchangeable.
const PORTAL_GUARDS: Record<
  SessionPortal,
  { loginPath: string; publicPaths: readonly string[] }
> = {
  admin: { loginPath: "/superadmin/login", publicPaths: SUPERADMIN_AUTH_ROUTES },
  owner: { loginPath: SHARED_LOGIN_PATH, publicPaths: DASHBOARD_AUTH_ROUTES },
  reception: { loginPath: SHARED_LOGIN_PATH, publicPaths: [] },
  waiter: { loginPath: SHARED_LOGIN_PATH, publicPaths: ORDER_AUTH_ROUTES },
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const portal = portalForPath(pathname);

  if (portal) {
    const guard = PORTAL_GUARDS[portal];

    if (!guard.publicPaths.includes(pathname)) {
      const token = request.cookies.get(sessionCookieName(portal))?.value;

      let session: any = null;
      if (token) {
        try {
          const { payload } = await jwtVerify(token, secret);
          session = payload;
        } catch {
          // invalid token
        }
      }

      // A token is only honored in the portal its role belongs to, so a
      // cookie replayed under another portal's name can't cross areas.
      if (!session || portalForRole(session.role) !== portal) {
        const loginUrl = new URL(guard.loginPath, request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // Exposes the matched path to Server Components and Server Actions via
  // headers() — lib/auth.ts uses it to pick the portal's session cookie, and
  // layouts use it for their own belt-and-suspenders session check.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/superadmin/:path*", "/owner/:path*", "/owner", "/reception/:path*", "/reception", "/order/:path*", "/order"],
};
