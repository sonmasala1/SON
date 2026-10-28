const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

const nextConfig = {
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
module.exports = phase => ({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});

