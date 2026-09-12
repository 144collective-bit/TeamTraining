import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  /**
   * Only for the container build, which sets BUILD_STANDALONE=true. It emits a
   * self-contained server bundle carrying just the dependencies reached at
   * runtime, started with `node server.js`.
   *
   * It is off everywhere else because `next start` — what a managed Node host
   * runs — warns that it does not support this output, and a platform that
   * treats that warning as an error would fail the deploy.
   */
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
};

export default nextConfig;
