import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The workspace package ships compiled CJS; Next bundles it from source-adjacent
  // dist without extra config, but transpiling keeps it treeshakeable.
  transpilePackages: ["@moodnight/shared"],
};

export default nextConfig;
