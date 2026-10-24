import { NextResponse } from "next/server";

// Next 16 calls this file "proxy" (it was "middleware"). It adds security
// headers to every page.
export function proxy() {
  const response = NextResponse.next();

  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");

  // Starting point. 'unsafe-inline'/'unsafe-eval' are needed by Next's dev
  // tooling and inline bootstrap scripts; tighten with nonces before launch.
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://api.stripe.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  return response;
}

export const config = {
  // Skip the Stripe webhook (it needs the raw body untouched) and static assets.
  matcher: "/((?!api/webhooks|_next|static|favicon|assets).*)",
};
