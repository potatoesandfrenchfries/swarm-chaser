import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { apiMiddleware } from './server/api.ts';

// The API runs inside the dev and preview servers, so one command serves the app and its data.
// loadEnv with prefix '' reads NEO4J_* for the server only; the client bundle gets VITE_* and nothing else.
function api(env: Record<string, string>): Plugin {
  return {
    name: 'claim-spread-api',
    configureServer(server) {
      server.middlewares.use(apiMiddleware(env));
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware(env));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, import.meta.dirname, ''), ...process.env } as Record<string, string>;
  return {
    plugins: [react(), api(env)],
    build: { target: 'es2022', chunkSizeWarningLimit: 900 },
    // Unit tests only; e2e/ belongs to Playwright.
    test: { include: ['src/**/*.test.ts'] },
  };
});
