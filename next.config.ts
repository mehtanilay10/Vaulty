import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: [
    "pdfjs-dist",
    "bcryptjs",
    "googleapis",
    "@google/genai",
    "nodemailer",
    "xlsx",
    "web-push",
  ],
  typescript: {
    // In-build typechecking disabled for maximum build performance.
    // Type integrity is strictly enforced pre-push (.husky/pre-push) and in CI via `yarn type-check`.
    ignoreBuildErrors: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "react-markdown", "remark-gfm"],
  },
  async headers() {
    return [
      {
        source: "/(favicon.svg|vaulty-icon.svg|manifest.json)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "cdnjs.cloudflare.com",
      },
    ],
  },
};

const isAnalyze = process.env.ANALYZE === "true";
let configExport: NextConfig = nextConfig;

if (isAnalyze) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const withBundleAnalyzer = require("@next/bundle-analyzer")({ enabled: true });
    configExport = withBundleAnalyzer(nextConfig);
  } catch {
    console.warn(
      "[next.config] @next/bundle-analyzer is not installed. Run `yarn add -D @next/bundle-analyzer` to enable bundle analysis.",
    );
  }
}

export default configExport;
