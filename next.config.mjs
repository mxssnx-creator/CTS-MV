/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [
    'ccxt',
    'redis',
  ],
  webpack: (config, { isServer }) => {
    config.externals = {
      ...config.externals,
      'redis': 'commonjs redis',
    }
    return config
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  productionBrowserSourceMaps: false,
  compress: true,
}

export default nextConfig
