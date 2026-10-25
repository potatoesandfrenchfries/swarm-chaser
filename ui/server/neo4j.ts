import neo4j, { type Driver } from 'neo4j-driver';
import { REL_TYPES, projectRun, type GEdge, type GNode, type NodeLabel, type Projection } from '../src/model/graph.ts';
import type { Bundle } from '../src/model/types.ts';

/**
 * Server-side only. The browser talks to /api/neo4j/*, never to the database, and never sees these
 * variables (Vite exposes only VITE_-prefixed ones). Every node this app writes carries :CSNode plus
 * one label from the projection, scoped by `bundle` and `run` properties.
 */
export interface Neo4jEnv {
  NEO4J_URI?: string;
  NEO4J_USER?: string;
  NEO4J_PASSWORD?: string;
  NEO4J_DATABASE?: string;
}

const LABELS: NodeLabel[] = ['Actor', 'Record', 'Claim', 'Event'];
let driver: Driver | undefined;
let driverUri: string | undefined;

export function configured(env: Neo4jEnv): boolean {
  return Boolean(env.NEO4J_URI && env.NEO4J_PASSWORD);
}

function getDriver(env: Neo4jEnv): Driver {
  if (!configured(env)) throw new Error('not-configured');
  if (!driver || driverUri !== env.NEO4J_URI) {
    driver = neo4j.driver(env.NEO4J_URI!, neo4j.auth.basic(env.NEO4J_USER || 'neo4j', env.NEO4J_PASSWORD!), {
      connectionTimeout: 4000,
      connectionAcquisitionTimeout: 5000,
      maxTransactionRetryTime: 3000,
    });
    driverUri = env.NEO4J_URI;
  }
  return driver;
}

/** Host and port only, for display. Never the credentials. */
function displayUri(uri: string | undefined): string {
  try {
    const u = new URL(uri ?? '');
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'configured database';
  }
}

export type Neo4jStatus =
  | { state: 'not-configured' }
  | { state: 'unreachable'; uri: string; message: string }
  | { state: 'connected'; uri: string; runs: { bundle: string; run: string; nodes: number }[] };

export async function status(env: Neo4jEnv): Promise<Neo4jStatus> {
  if (!configured(env)) return { state: 'not-configured' };
  const uri = displayUri(env.NEO4J_URI);
  try {
    const db = getDriver(env);
    const { records } = await db.executeQuery(
      'MATCH (n:CSNode) RETURN n.bundle AS bundle, n.run AS run, count(*) AS nodes ORDER BY bundle, run',
      {},
      { database: env.NEO4J_DATABASE || 'neo4j', routing: neo4j.routing.READ },
    );
    return { state: 'connected', uri, runs: records.map((r) => ({ bundle: r.get('bundle'), run: r.get('run'), nodes: toNumber(r.get('nodes')) })) };
  } catch (e) {
    return { state: 'unreachable', uri, message: friendly(e) };
  }
}

function friendly(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  if (/authentication|unauthorized/i.test(msg)) return 'The database refused the credentials in ui/.env.';
  if (/ECONNREFUSED|connect|ServiceUnavailable|timed? ?out/i.test(msg)) return 'Nothing answered at that address. Start it with npm run neo4j:start.';
  return 'The database could not be read.';
}

function toNumber(v: unknown): number {
  return neo4j.isInt(v) ? (v as { toNumber(): number }).toNumber() : Number(v);
}

/** Replace one bundle's runs in the database with its projection. Labels and relationship types come only from fixed lists. */
export async function loadBundle(env: Neo4jEnv, bundle: Bundle): Promise<{ run: string; nodes: number; edges: number }[]> {
  const db = getDriver(env);
  const config = { database: env.NEO4J_DATABASE || 'neo4j' };
  await db.executeQuery('CREATE CONSTRAINT cs_node_key IF NOT EXISTS FOR (n:CSNode) REQUIRE n.key IS UNIQUE', {}, config);
  const out = [];
  for (const run of bundle.runs) {
    const p = projectRun(bundle, run);
    await db.executeQuery('MATCH (n:CSNode {bundle: $bundle, run: $run}) DETACH DELETE n', { bundle: bundle.id, run: run.id }, config);
    for (const label of LABELS) {
      const rows = p.nodes.filter((n) => n.label === label).map((n) => ({ key: n.key, id: n.id, name: n.name, seq: n.seq, props: n.props }));
      if (!rows.length) continue;
      await db.executeQuery(
        `UNWIND $rows AS row
         CREATE (n:CSNode:${label} {key: row.key})
         SET n += row.props, n.id = row.id, n.name = row.name, n.seq = row.seq, n.bundle = $bundle, n.run = $run, n.provenance = $provenance`,
        { rows, bundle: bundle.id, run: run.id, provenance: bundle.provenance },
        config,
      );
    }
    for (const type of REL_TYPES) {
      const rows = p.edges.filter((e) => e.type === type).map((e) => ({ from: e.from, to: e.to, props: e.props }));
      if (!rows.length) continue;
      await db.executeQuery(
        `UNWIND $rows AS row
         MATCH (a:CSNode {key: row.from}), (b:CSNode {key: row.to})
         CREATE (a)-[r:${type}]->(b) SET r += row.props`,
        { rows },
        config,
      );
    }
    out.push({ run: run.id, nodes: p.nodes.length, edges: p.edges.length });
  }
  return out;
}

/** Read one run back as a projection, exactly as stored. Returns null when the run is not in the database. */
export async function readRun(env: Neo4jEnv, bundleId: string, runId: string): Promise<Projection | null> {
  const db = getDriver(env);
  const config = { database: env.NEO4J_DATABASE || 'neo4j', routing: neo4j.routing.READ };
  const nodeResult = await db.executeQuery(
    'MATCH (n:CSNode {bundle: $bundle, run: $run}) RETURN n, labels(n) AS labels',
    { bundle: bundleId, run: runId },
    config,
  );
  if (!nodeResult.records.length) return null;
  const relResult = await db.executeQuery(
    'MATCH (a:CSNode {bundle: $bundle, run: $run})-[r]->(b:CSNode {bundle: $bundle, run: $run}) RETURN a.key AS from, type(r) AS type, b.key AS to, properties(r) AS props',
    { bundle: bundleId, run: runId },
    config,
  );
  let provenance = 'unknown';
  const nodes: GNode[] = nodeResult.records.map((r) => {
    const props = plain(r.get('n').properties);
    const label = (r.get('labels') as string[]).find((l) => (LABELS as string[]).includes(l)) as NodeLabel;
    provenance = String(props.provenance ?? provenance);
    const { key, id, name, seq, bundle: _b, run: _r, provenance: _p, ...rest } = props;
    return { key: String(key), id: String(id), label, name: String(name), seq: seq === null || seq === undefined ? null : Number(seq), props: rest };
  });
  const edges: GEdge[] = relResult.records.map((r) => {
    const from = r.get('from') as string;
    const to = r.get('to') as string;
    const type = r.get('type') as GEdge['type'];
    return { key: `${from}-${type}-${to}`, type, from, to, props: plain(r.get('props')) };
  });
  nodes.sort((a, b) => (a.seq ?? -1) - (b.seq ?? -1) || a.key.localeCompare(b.key));
  return { bundle: bundleId, run: runId, provenance, nodes, edges };
}

function plain(o: Record<string, unknown>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, neo4j.isInt(v) ? toNumber(v) : (v as string | number | boolean | null)]));
}

export async function closeDriver() {
  await driver?.close();
  driver = undefined;
}
