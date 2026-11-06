const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');
const { resolveApiBaseUrl } = require('./config/api-base');

const nextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== 'development' && process.env.NEXT_PUBLIC_API_PROXY !== 'true') return [];
    const target = resolveApiBaseUrl({ nodeEnv: process.env.NODE_ENV, configuredUrl: process.env.NEXT_PUBLIC_API_BASE_URL });
    const destination = new URL(target);
    if (process.env.NODE_ENV === 'development') destination.hostname = '127.0.0.1';
    return [{ source: '/api/v1/:path*', destination: `${destination.toString().replace(/\/+$/, '')}/:path*` }];
  },
  reactStrictMode: true,
  swcMinify: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    formats: ['image/webp'],
    deviceSizes: [320, 480, 640, 768, 1024, 1280, 1600],
    imageSizes: [64, 96, 128, 256],
    minimumCacheTTL: 60,
  },
};

// Keep a production build from replacing assets used by the running dev server.
module.exports = phase => {
  resolveApiBaseUrl({ nodeEnv: process.env.NODE_ENV, configuredUrl: process.env.NEXT_PUBLIC_API_BASE_URL });
  return { ...nextConfig, distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next') };
};

