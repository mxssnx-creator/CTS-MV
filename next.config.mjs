/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  transpilePackages: ['lucide-react'],
  serverExternalPackages: [
    'ccxt',
    'protobufjs',
    '@dydxprotocol/v4-proto',
    'long',
    'protobufjs/minimal',
    'redis',
  ],
  webpack: (config, { isServer }) => {
    config.externals = {
      ...config.externals,
      'redis': 'commonjs redis',
    }
    return config
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  productionBrowserSourceMaps: false,
  compress: true,
  turbopack: {},
}

export default nextConfig
