// Load every valid bundle (synthetic and recorded) into Neo4j, replacing earlier copies of the same runs.
//   npm run neo4j:load          reads ui/.env for NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD / NEO4J_DATABASE
import { loadAll } from './bundles.ts';
import { closeDriver, configured, loadBundle } from './neo4j.ts';

const env = process.env;
if (!configured(env)) {
  console.error('Neo4j is not configured. Run npm run neo4j:start, or copy .env.example to .env and fill it in.');
  process.exit(1);
}
try {
  for (const l of loadAll()) {
    if (!l.bundle) {
      console.log(`skip ${l.summary.file}: ${l.summary.problems.join(' ')}`);
      continue;
    }
    for (const r of await loadBundle(env, l.bundle)) console.log(`loaded ${l.bundle.id}/${r.run} (${l.bundle.provenance}): ${r.nodes} nodes, ${r.edges} relationships`);
  }
} catch (e) {
  console.error(`Load failed: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDriver();
}
