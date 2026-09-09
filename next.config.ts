import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    deviceSizes: [360, 640, 768, 1024, 1280],
    formats: ["image/avif", "image/webp"],
    imageSizes: [48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 2_592_000,
  },
  turbopack: {
    root: process.cwd(),
  },
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/app-ads.txt",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
