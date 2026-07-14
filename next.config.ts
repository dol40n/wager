import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid auto-selecting a parent lockfile as the workspace root. Besides
  // incorrect file tracing, Turbopack can panic when that relative path
  // contains multibyte characters.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
