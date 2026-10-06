import type { NextConfig } from "next";

// Extra hosts allowed to call Server Actions (comma separated), e.g. when the
// portal sits behind a reverse proxy whose public host differs from the
// forwarded host. Not needed on Vercel or a plain custom domain.
const extraActionOrigins = (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Native / Node-only packages stay out of the server bundle.
  serverExternalPackages: ["@node-rs/argon2", "pg", "nodemailer"],
  experimental: {
    serverActions: {
      // Logo uploads go through Server Actions; files themselves are capped
      // at 2 MB in src/server/files.ts.
      bodySizeLimit: "3mb",
      allowedOrigins: extraActionOrigins.length ? extraActionOrigins : undefined,
    },
  },
  async headers() {
    // Security headers for every response. The Content-Security-Policy is set
    // per request in src/proxy.ts because it carries a fresh nonce.
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
