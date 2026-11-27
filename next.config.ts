import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['libsodium-wrappers', 'adm-zip'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
};

export default nextConfig;
