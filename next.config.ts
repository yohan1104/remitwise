import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next doesn't warn about lockfiles higher up the tree.
  outputFileTracingRoot: path.resolve(),
};

export default nextConfig;
