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
    typedRoutes: true
  }
};

export default nextConfig;
