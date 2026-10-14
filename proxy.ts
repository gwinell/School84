import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const isTeacherArea = request.nextUrl.pathname.startsWith("/teacher");
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // requireAdmin() inside the admin layout is the authoritative gate; this is
  // just a cleaner redirect for signed-in non-admins.
  if (isTeacherArea ? session.user.role !== "admin" && session.user.role !== "teacher" : session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/not-admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"], // Specify the routes the middleware applies to
};
