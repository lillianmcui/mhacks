import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MATCH_RADIUS_M } from '@ch4se/contracts';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const SAMPLE_FIXTURES_DIR = join(REPO_ROOT, 'services/core-api/sample-fixtures');

export interface Config {
  mode: 'live' | 'stub';
  host: string;
  port: number;
  /** Shared bearer token. Required. */
  token: string;
  corsOrigin: string;
  stdbUri: string;
  stdbDatabase: string;
  stdbToken: string | undefined;
  matchRadiusM: number;
  fixturesDir: string;
  grokEnabled: boolean;
  relayEnabled: boolean;
}

const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === '' ? fallback : !['0', 'false', 'no', 'off'].includes(value.toLowerCase());

/** Loads the repo-root .env (if any) without overriding variables already set. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const envFile = join(REPO_ROOT, '.env');
  if (env === process.env && existsSync(envFile)) process.loadEnvFile(envFile);

  const port = Number(env.CORE_API_PORT ?? '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CORE_API_PORT must be a port number');
  const matchRadiusM = Number(env.MATCH_RADIUS_M ?? DEFAULT_MATCH_RADIUS_M);
  if (!Number.isFinite(matchRadiusM) || matchRadiusM <= 0) throw new Error('MATCH_RADIUS_M must be a positive number');
  const mode = env.CORE_API_MODE ?? 'live';
  if (mode !== 'live' && mode !== 'stub') throw new Error('CORE_API_MODE must be "live" or "stub"');
  const fixturesDir = env.FIXTURES_DIR ?? 'data/fixtures';

  return {
    mode,
    host: env.CORE_API_HOST ?? '127.0.0.1',
    port,
    token: env.CORE_API_TOKEN ?? '',
    corsOrigin: env.CORS_ORIGIN ?? '*',
    stdbUri: env.SPACETIMEDB_URI ?? 'ws://127.0.0.1:3000',
    stdbDatabase: env.SPACETIMEDB_DATABASE ?? 'ch4se',
    stdbToken: env.SPACETIMEDB_TOKEN || undefined,
    matchRadiusM,
    fixturesDir: isAbsolute(fixturesDir) ? fixturesDir : join(REPO_ROOT, fixturesDir),
    grokEnabled: flag(env.GROK_ENABLED, true),
    relayEnabled: flag(env.RELAY_ENABLED, true),
  };
}
