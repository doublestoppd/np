import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
/**
 * Whether this deployment is actually reachable over TLS. HSTS is a
 * promise about the origin, so it is sent only where the origin can keep
 * it — not on a local production-mode run, and not on the plain-HTTP
 * fallback the droplet script uses before a certificate exists.
 */
const servesHttps = (process.env.APP_URL ?? "").startsWith("https://");

/**
 * Content Security Policy.
 *
 * Everything here is enforceable today and costs nothing: the app loads no
 * third-party scripts, styles, fonts, or images, and talks to no other
 * origin, so the restrictive values are simply the truth about the app.
 *
 * `script-src` is the deliberate exception. Next's App Router streams the
 * RSC payload through inline `<script>` tags, so tightening it past
 * `'unsafe-inline'` requires per-request nonces threaded through
 * middleware. That is a real change to every request path and is tracked as
 * follow-up work, not something to half-land here — an inaccurate policy
 * that has to be relaxed under pressure is worse than an honest one. The
 * directives below still block loading script from any other origin, which
 * is the part that turns a content injection into data exfiltration.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval' is react-refresh in development only.
  isProduction
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Tailwind and Next both emit inline style attributes.
  "style-src 'self' 'unsafe-inline'",
  // Placeholder artwork is inline SVG and data URIs.
  "img-src 'self' data:",
  "font-src 'self'",
  // Server actions post to this origin; nothing else is contacted.
  isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Deliberately no `upgrade-insecure-requests`: the app loads nothing
  // cross-origin, so every subresource already inherits the document's
  // scheme and the directive would buy nothing — while breaking the
  // plain-HTTP deployment the setup script falls back to before a
  // certificate is installed.
].join("; ");

/**
 * Response headers applied to every route.
 *
 * `frame-ancestors` above is the modern clickjacking control;
 * `X-Frame-Options` is kept alongside it for older browsers that ignore
 * CSP.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
  ...(isProduction && servesHttps
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Version and stack fingerprinting is free reconnaissance; the header
  // buys the app nothing.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
