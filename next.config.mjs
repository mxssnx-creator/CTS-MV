/** @type {import('next').NextConfig} */
// CTS v3.2 - Redis-only, Turbopack compatible
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['redis', 'ccxt', 'protobufjs'],
  turbopack: {},
  productionBrowserSourceMaps: false,
  compress: true,
}

export default nextConfig
