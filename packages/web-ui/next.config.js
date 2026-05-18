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
};
module.exports = nextConfig;
