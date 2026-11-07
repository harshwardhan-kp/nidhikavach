import type { NextConfig } from "next";

// Files (scans, orders, heatmaps) and uploads go straight to the VM sidecar; nothing else is allowed.
const SIDECAR = "https://nidhikavach.172-198-62-117.sslip.io";
const csp = [
  "default-src 'self'",
  `img-src 'self' data: blob: ${SIDECAR}`,
  `connect-src 'self' ${SIDECAR}`,
  // Next.js inlines its bootstrap scripts; dev mode also needs eval for fast refresh.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "media-src 'self'",
  `frame-src ${SIDECAR}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["@node-rs/argon2"],
  // Enables forbidden() so permission failures render a real 403 page.
  experimental: { authInterrupts: true },
  async rewrites() {
    return {
      // The static landing page (built before the app) stays the site's front door.
      beforeFiles: [{ source: "/", destination: "/landing/index.html" }],
    };
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
