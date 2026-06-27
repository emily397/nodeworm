import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root: other lockfiles exist higher up the tree.
    root: path.join(__dirname),
  },
  // playwright-core drives the remote Browserbase session over CDP; keep it
  // external so the bundler does not try to trace its dynamic requires.
  serverExternalPackages: ["playwright-core"],
  // Pin the tracing root and force playwright-core's runtime files (browsers.json,
  // the protocol bundle) into the serverless function. Without this, connectOverCDP
  // fails at runtime on Vercel with "Cannot find module .../browsers.json".
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/playwright-core/**"],
  },
};

export default nextConfig;
