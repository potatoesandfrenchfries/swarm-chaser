/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // Fully static: no server, so it can be hosted anywhere (Pages, Netlify, nginx).
  output: "export",
};

export default config;
