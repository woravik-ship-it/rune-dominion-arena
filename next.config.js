/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Phase 12: Performance — บีบอัด response + ลด bundle ของ lib ที่ใช้บ่อย
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    optimizePackageImports: ['zod'],
  },
  allowedDevOrigins: [
    // รองรับการเข้าจากมือถือในวง LAN — IP เปลี่ยนได้ทุกวัน จึงไม่ hardcode
    'localhost',
    '127.0.0.1',
    '192.168.*.*',
    '10.*.*.*',
    '172.16.*.*',
    '172.17.*.*',
    '172.18.*.*',
    '172.19.*.*',
    '172.2*.*.*',
    '172.30.*.*',
    '172.31.*.*',
    '*.local',
    '*.lan',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    // Phase 12: รูปการ์ดเป็น static — cache นานและยอมให้ optimizer ทำงาน
    minimumCacheTTL: 60 * 60 * 24 * 7,
    formats: ['image/webp'],
  },
  // Phase 12: cache header สำหรับ asset ที่ไม่เปลี่ยน
  async headers() {
    return [
      {
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, immutable' }],
      },
      {
        source: '/sounds/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, immutable' }],
      },
    ];
  },
};

module.exports = nextConfig;
