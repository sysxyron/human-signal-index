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
  }
};

export default nextConfig;
