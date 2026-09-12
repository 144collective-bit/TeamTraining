import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  /**
   * Emits a self-contained server bundle with only the dependencies actually
   * reached at runtime, so the production image does not carry node_modules.
   * Migrations run from a separate image that does — see Dockerfile.
   */
  output: "standalone",
};

export default nextConfig;
