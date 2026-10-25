// A throwaway local Neo4j for the explorer: Community image, localhost-only ports, 1 GB / 1 CPU, no volume.
//   npm run neo4j:start   writes a random password to ui/.env (git-ignored, mode 600) on first use
//   npm run neo4j:stop
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const NAME = 'claim-spread-neo4j';
const BOLT = 'bolt://127.0.0.1:17688';
const IMAGE = 'neo4j:2026.10.1';

function docker(args, opts = {}) {
  const r = spawnSync('docker', args, { encoding: 'utf8', ...opts });
  if (r.error) throw r.error;
  return r;
}

if (process.argv.includes('--stop')) {
  docker(['stop', NAME], { stdio: 'inherit' });
  process.exit(0);
}

const env = {};
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}
if (env.NEO4J_URI && env.NEO4J_URI !== BOLT) {
  console.error(`ui/.env already points at ${env.NEO4J_URI}. Leaving it alone; this script only manages ${BOLT}.`);
  process.exit(1);
}
const password = env.NEO4J_PASSWORD || randomBytes(24).toString('hex');
if (!env.NEO4J_PASSWORD) {
  writeFileSync('.env', `NEO4J_URI=${BOLT}\nNEO4J_USER=neo4j\nNEO4J_PASSWORD=${password}\nNEO4J_DATABASE=neo4j\n`, { mode: 0o600 });
}

const running = docker(['inspect', '--format', '{{.State.Running}}', NAME]);
if (running.status === 0 && running.stdout.trim() === 'true') {
  console.log(`${NAME} is already running at ${BOLT}.`);
  process.exit(0);
}
const r = docker(
  [
    'run', '--detach', '--rm', '--name', NAME, '--memory', '1g', '--cpus', '1',
    '--env', `NEO4J_AUTH=neo4j/${password}`,
    '--env', 'NEO4J_server_memory_heap_initial__size=256m',
    '--env', 'NEO4J_server_memory_heap_max__size=256m',
    '--env', 'NEO4J_server_memory_pagecache_size=128m',
    '--publish', '127.0.0.1:17475:7474', '--publish', '127.0.0.1:17688:7687',
    IMAGE,
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Starting ${NAME}: browser http://127.0.0.1:17475, bolt ${BOLT}. Give it ~15 s, then npm run neo4j:load.`);
