import type { IncomingMessage, ServerResponse } from 'node:http';
import { apiMiddleware } from '../server/api.ts';

// Vercel only mounts a function on its own file path. Nested routes are rewritten here, and the original path is put back before the shared middleware reads it.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  const incoming = new URL(req.url ?? '/', 'http://local');
  const route = incoming.searchParams.get('route');
  if (route) {
    incoming.pathname = route.startsWith('/') ? route : `/api/${route}`;
    incoming.searchParams.delete('route');
    req.url = `${incoming.pathname}${incoming.search}`;
  }
  const env = {
    NEO4J_URI: process.env.NEO4J_URI,
    NEO4J_USER: process.env.NEO4J_USER,
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,
    NEO4J_DATABASE: process.env.NEO4J_DATABASE,
  };
  return apiMiddleware(env)(req, res, () => {
    if (res.writableEnded) return;
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Unknown API route.' }));
  });
}
