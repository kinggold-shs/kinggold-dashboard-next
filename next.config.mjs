/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'kinggoldretail.e-jewelry-softwarehouse.com',
        pathname: '/media/**',
      },
    ],
  },

  async headers() {
    return [
      {
        // Allow Shopify to embed this app in an iframe
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors *",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
