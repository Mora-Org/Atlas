import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  // A chave `eslint` foi REMOVIDA do NextConfig no Next 16 (`next lint` saiu).
  // Mantê-la fazia o servidor logar "Invalid next.config.ts options detected"
  // a cada boot e era 1 dos 3 erros do `tsc --noEmit`. Lint em PR é papel do CI.
};

export default nextConfig;
