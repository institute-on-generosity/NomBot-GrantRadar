import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Insights was renamed Research (Oct 16); old links keep working (query strings carry over).
  async redirects() {
    return [
      { source: "/insights", destination: "/research", permanent: true },
      { source: "/insights/orgs", destination: "/research/orgs", permanent: true },
    ];
  },
};

export default nextConfig;
