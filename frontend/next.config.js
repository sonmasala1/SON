const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');
const { resolveApiBaseUrl } = require('./config/api-base');

const nextConfig = {
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_PROXY !== 'true') return [];
    const target = resolveApiBaseUrl({ nodeEnv: process.env.NODE_ENV, configuredUrl: process.env.NEXT_PUBLIC_API_BASE_URL });
    return [{ source: '/api/v1/:path*', destination: `${target}/:path*` }];
  },
  reactStrictMode: true,
  swcMinify: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    unoptimized: true, // already using unoptimized on Image components
  },
};

// Keep a production build from replacing assets used by the running dev server.
module.exports = phase => {
  resolveApiBaseUrl({ nodeEnv: process.env.NODE_ENV, configuredUrl: process.env.NEXT_PUBLIC_API_BASE_URL });
  return { ...nextConfig, distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next') };
};

