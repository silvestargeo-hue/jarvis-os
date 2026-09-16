/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mlc-ai/web-llm"],
  // Self-contained desktop builds: emit a minimal standalone server bundle.
  output: process.env.JARVIS_STANDALONE === "1" ? "standalone" : undefined,
  // WebLLM and WebCrypto paths rely on browser-only APIs; keep them client-side only.
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
      ],
    },
  ],
};

export default nextConfig;
