/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.externals = {
      ...config.externals,
      'redis': 'commonjs redis',
    }
    return config
  },
  productionBrowserSourceMaps: false,
  compress: true,
}

export default nextConfig
