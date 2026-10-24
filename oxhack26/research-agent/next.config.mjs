/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // Loaded with native/dynamic requires that the bundler should not trace.
  serverExternalPackages: ["pdf2json", "mammoth"],
};

export default config;
