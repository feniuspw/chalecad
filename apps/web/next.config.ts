import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@chalecad/engine', '@chalecad/catalog', '@chalecad/ui'],
  serverExternalPackages: ['better-sqlite3'],
  reactStrictMode: true,
};

export default nextConfig;
