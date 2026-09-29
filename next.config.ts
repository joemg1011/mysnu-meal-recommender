import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isGitHubPages ? "/mysnu-meal-recommender" : "",
  assetPrefix: isGitHubPages ? "/mysnu-meal-recommender/" : undefined,
  images: { unoptimized: true }
};

export default nextConfig;
