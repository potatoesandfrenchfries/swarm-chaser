import type { IncomingMessage, ServerResponse } from 'node:http';
import { getBundle, loadAll } from './bundles.ts';
import { configured, readRun, status, type Neo4jEnv } from './neo4j.ts';

type Next = (err?: unknown) => void;

/**
 * Read-only JSON API, mounted on the Vite dev and preview servers.
 *   GET /api/bundles                      every bundle found, with validation problems
 *   GET /api/bundles/:id                  one valid bundle
 *   GET /api/neo4j/status                 not-configured | unreachable | connected (+ loaded runs)
 *   GET /api/neo4j/runs/:bundle/:run      a run's projection as stored in Neo4j
 */
export function apiMiddleware(env: Neo4jEnv) {
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/')) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const send = (code: number, body: unknown) => {
      res.statusCode = code;
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return send(405, { error: 'This API is read-only.' });
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); // ["api", ...]

    try {
      if (parts[1] === 'bundles' && parts.length === 2) return send(200, loadAll().map((l) => l.summary));
      if (parts[1] === 'bundles' && parts.length === 3) {
        const b = getBundle(parts[2]);
        return b ? send(200, b) : send(404, { error: `No valid bundle with id ${parts[2]}.` });
      }
      if (parts[1] === 'neo4j' && parts[2] === 'status') return send(200, await status(env));
      if (parts[1] === 'neo4j' && parts[2] === 'runs' && parts.length === 5) {
        if (!configured(env)) return send(503, { error: 'Neo4j is not configured on this server.' });
        const p = await readRun(env, parts[3], parts[4]);
        return p ? send(200, p) : send(404, { error: 'That run is not loaded in Neo4j. Run npm run neo4j:load.' });
      }
      return send(404, { error: 'Unknown API route.' });
    } catch {
      return send(503, { error: 'The server could not answer. Check the terminal running the app.' });
    }
  };
}
