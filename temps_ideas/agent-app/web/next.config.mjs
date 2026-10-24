// The Flue agent server (../agent). `pnpm dev` there serves on :5173; a
// production build (`node dist/server.mjs`) defaults to :3000.
const FLUE_SERVER_URL = process.env.FLUE_SERVER_URL ?? "http://localhost:5173";

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // Same-origin proxy: the browser only talks to Next, never to Flue directly,
  // so there is no CORS setup and provider keys never leave the agent process.
  rewrites() {
    return [
      {
        source: "/api/agents/:path*",
        destination: `${FLUE_SERVER_URL}/agents/:path*`,
      },
    ];
  },
};

export default config;
