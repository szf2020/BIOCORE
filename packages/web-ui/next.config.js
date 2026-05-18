/** @type {import('next').NextConfig} */
const API_HOST = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_HOST}/api/:path*`,
      },
    ];
  },
  // SP-FX-44: PWA — SW 与 manifest 的 HTTP 头
  async headers() {
    return [
      {
        // Service Worker: 不缓存 (保证每次更新检测)
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // manifest: 短缓存 (1 小时), 允许及时更新
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
