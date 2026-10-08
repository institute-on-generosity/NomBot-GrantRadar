import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // GrantRadar stands alone: the home page is the funder match.
  async redirects() {
    return [{ source: "/", destination: "/grants", permanent: false }];
  },
};

export default nextConfig;
