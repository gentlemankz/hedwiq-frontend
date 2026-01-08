import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  // REQUIRED for Docker: Creates standalone output with minimal dependencies
  // This reduces the production image from ~1GB to ~200MB
  output: 'standalone',

  // Security and cache headers
  headers: async () => {
    const headers: Awaited<ReturnType<NonNullable<NextConfig['headers']>>> = [
      // Security headers for all routes (always applied)
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
        ]
      },
    ];

    // Cache headers only in production
    // In dev, Next.js uses no-cache headers by default which is needed
    // because static assets don't have content hashes in dev mode
    if (isProd) {
      headers.push(
        // Cache headers for Next.js static assets (immutable, 1 year)
        {
          source: '/_next/static/:path*',
          headers: [
            {
              key: 'Cache-Control',
              value: 'public, max-age=31536000, immutable'
            }
          ]
        },
        // Cache headers for fonts (immutable, 1 year)
        {
          source: '/fonts/:path*',
          headers: [
            {
              key: 'Cache-Control',
              value: 'public, max-age=31536000, immutable'
            }
          ]
        },
        // Cache headers for favicon (1 day)
        {
          source: '/favicon.ico',
          headers: [
            {
              key: 'Cache-Control',
              value: 'public, max-age=86400'
            }
          ]
        },
        // Cache headers for images (1 month)
        {
          source: '/images/:path*',
          headers: [
            {
              key: 'Cache-Control',
              value: 'public, max-age=2592000'
            }
          ]
        }
      );
    }

    return headers;
  },
};

export default nextConfig;
