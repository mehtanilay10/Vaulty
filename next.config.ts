import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://va.vercel-scripts.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://lh3.googleusercontent.com https://*.googleusercontent.com https://drive.google.com",
  "font-src 'self' data:",
  "connect-src 'self' https://cdnjs.cloudflare.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "worker-src 'self' blob: https://cdnjs.cloudflare.com",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://login.microsoftonline.com",
  "frame-ancestors 'none'",
  ...(!isDev ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: [
    "pdfjs-dist",
    "bcryptjs",
    "googleapis",
    "@google/genai",
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
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: cspHeader,
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
