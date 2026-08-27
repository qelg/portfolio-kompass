import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: process.env.PORTFOLIO_BASE_PATH || "",
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
