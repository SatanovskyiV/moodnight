import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The workspace package ships compiled CJS; Next bundles it from source-adjacent
  // dist without extra config, but transpiling keeps it treeshakeable.
  transpilePackages: ["@moodnight/shared"],
};

export default withNextIntl(nextConfig);
