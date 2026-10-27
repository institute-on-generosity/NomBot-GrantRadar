import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Safe deploys: build into another folder (NEXT_DIST_DIR=.next-build), then swap it in only after a clean build,
  // so the live server never serves a half-written .next (Oct 27).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // Public origin for links printed on exported slides (lib/slide); empty → the browser's origin.
  env: { PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "" },
  // Insights was renamed Research (Oct 16); old links keep working (query strings carry over).
  async redirects() {
    return [
      { source: "/insights", destination: "/research", permanent: true },
      { source: "/insights/orgs", destination: "/research/orgs", permanent: true },
    ];
  },
};

export default nextConfig;
