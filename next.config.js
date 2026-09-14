/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    // รองรับการเข้าผ่าน IP วง LAN / ชื่อเครื่อง (เช่น เข้าจากมือถือผ่าน 192.168.x.x)
    '192.168.1.52',
    '*.local',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
