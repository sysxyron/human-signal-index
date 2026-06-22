// =============================================================================
// Phase 56.1 — HTTP security headers (remediation of Phase 56 audit finding H1).
//
// CSP is shipped REPORT-ONLY first so it cannot break Supabase auth, Vercel,
// Resend, Cloudflare, Stripe, or existing inline scripts/styles (Next + framer-
// motion). It only reports violations; promote to an enforcing
// `Content-Security-Policy` once the report stream is clean. The other five
// headers are enforced immediately (safe, no functional impact).
// =============================================================================
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Next.js + framer-motion inject inline styles; Next injects inline/eval'd
  // bootstrap scripts. Keep 'unsafe-inline'/'unsafe-eval' until a nonce strategy
  // is added (tracked as a follow-up); report-only means nothing is blocked yet.
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  // MapLibre (local npm bundle) fetches OSM raster tiles + glyph PBFs over the
  // network → connect-src must list those exact origins. img-src already allows
  // https: for the rendered tile images. worker-src 'self' blob: covers the
  // MapLibre web worker. No CDN script/style origins are needed (bundled locally).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.vercel-insights.com https://*.vercel.app https://tile.openstreetmap.org https://fonts.openmaptiles.org",
  "frame-src 'self' https://js.stripe.com",
  "form-action 'self'",
  "worker-src 'self' blob:",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@hsi/ui',
    '@hsi/database',
    '@hsi/world-models',
    '@hsi/simulation-engine',
    '@hsi/timeline-engine',
    '@hsi/counterfactuals',
  ],
  experimental: {
    typedRoutes: true,
    // Phase 14B: enable instrumentation.ts (startup env validation hook).
    instrumentationHook: true
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  }
};

export default nextConfig;
