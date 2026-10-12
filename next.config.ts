import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(self)",
  },
];

const nextConfig: NextConfig = {
  // Cloud Run runs the self-contained server produced by `output: "standalone"`.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["firebase-admin", "exifr"],
  /**
   * The app never uses next/image: report photos and voice notes are streamed by our own
   * session-checked route, so Next's optimiser has nothing to do. Saying so keeps its native
   * image binaries out of the container.
   */
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * Two directories are read from disk at runtime with paths the bundler cannot follow: the regional
   * road datasets and the saved evaluation results. Both are named here so they are copied into the
   * standalone output; without this the tracer cannot see them and they are simply missing in the
   * container, which fails at the first map render rather than at build time.
   */
  outputFileTracingIncludes: {
    "/*": ["data/regions/**/*", "data/eval/**/*"],
  },
  /**
   * Everything else in the repository is development material. Excluding it stops the tracer from
   * treating the whole project as runtime input, which is what the "dynamic filesystem access"
   * warning is about, and keeps the image small.
   */
  outputFileTracingExcludes: {
    "/*": ["tests/**", "scripts/**", "docs/**", ".data/**", "**/*.md", "**/*.map"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
