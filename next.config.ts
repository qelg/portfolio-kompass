import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: process.env.PORTFOLIO_BASE_PATH || "",
  skipTrailingSlashRedirect: true,
  allowedDevOrigins: process.env.PUBLIC_URL ? [new URL(process.env.PUBLIC_URL).hostname] : undefined,
};

export default nextConfig;
