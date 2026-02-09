/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Disable problematic transpilation analysis
    config.resolve.conditionNames = config.resolve.conditionNames.filter(
      (c) => c !== 'edge-light'
    )
    
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
