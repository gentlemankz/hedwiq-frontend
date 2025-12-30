import { betterFetch } from "@better-fetch/fetch";
import { NextRequest, NextResponse } from "next/server";
import type { Session } from "@/lib/auth";

const protectedRoutes = ["/dashboard", "/settings", "/meetings"];
const authRoutes = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];

// Use internal URL for server-side session checks to avoid Cloudflare bot protection
// In production: BETTER_AUTH_URL = http://localhost:3000 (from Docker secrets)
// In development: falls back to request origin
const getInternalBaseURL = (request: NextRequest) => {
  return process.env.BETTER_AUTH_URL || request.nextUrl.origin;
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const { data: session } = await betterFetch<Session>(
    "/api/auth/get-session",
    {
      baseURL: getInternalBaseURL(request),
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    }
  );

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Redirect unauthenticated users to sign-in
  if (isProtectedRoute && !session) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackURL", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/meetings/:path*",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
  ],
};
