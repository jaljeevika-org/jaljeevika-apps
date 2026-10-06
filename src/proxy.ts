import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/lib/session-cookie";

/**
 * Runs before every page and API request:
 *  1. Blocks cross-site state-changing requests (defence in depth on top of
 *     SameSite cookies and Next.js' own Server Action origin check, which
 *     lets requests without an Origin header through).
 *  2. Sends signed-out visitors of protected pages to /login (an optimistic
 *     check of cookie presence only; the real session check happens on the
 *     server for every page and action).
 *  3. Sets a per-request nonce-based Content-Security-Policy.
 */

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function extraAllowedHosts(): string[] {
  return (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function crossSiteBlocked(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  try {
    const originHost = new URL(origin).host.toLowerCase();
    return originHost !== host && !extraAllowedHosts().includes(originHost);
  } catch {
    return true;
  }
}

function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by React/drag-and-drop; scripts stay strict.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  if (crossSiteBlocked(request)) {
    return new NextResponse("Cross-site request blocked.", { status: 403, headers: { "Content-Type": "text/plain" } });
  }

  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (!hasSessionCookie && !isPublic(pathname) && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-jj-path", pathname + search);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (isPublic(pathname) && pathname !== "/api/health") {
    // Pages that may carry one-time tokens in the URL must not leak them.
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  if (!pathname.startsWith("/api/")) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except static assets and uploaded files (which set their own headers).
      source: "/((?!_next/static|_next/image|api/files|brand/|favicon.ico|icon.png|apple-icon.png|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
