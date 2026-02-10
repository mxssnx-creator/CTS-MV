/** @type {import('next').NextConfig} */
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
