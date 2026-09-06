import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // lets a production build live next to the dev server: NEXT_DIST_DIR=.next-prod pnpm build / start
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // wagmi ships every connector; the ones we do not use pull optional packages that are not installed.
  webpack: (config) => {
    config.ignoreWarnings = [...(config.ignoreWarnings ?? []), { message: /Can't resolve '(@base-org|@coinbase|@metamask|@safe-global|@walletconnect|accounts)/ }];
    return config;
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "localhost" }] },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), accelerometer=(self), gyroscope=(self), geolocation=()" },
      ],
    },
    { source: "/sw.js", headers: [{ key: "Service-Worker-Allowed", value: "/" }, { key: "Cache-Control", value: "no-cache" }] },
  ],
};

export default nextConfig;
