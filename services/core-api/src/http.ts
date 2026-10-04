// HTTP transport for the actions: POST /actions/{action_name}, JSON in, the
// §3.7 envelope out. Plain node:http; there is nothing here but routing, auth
// and the envelope.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { ACTION_NAMES, isOneOf, type ApiResponse } from '@ch4se/contracts';
import type { Actions } from './actions.ts';
import { ApiError, HTTP_STATUS } from './errors.ts';

const MAX_BODY_BYTES = 1_000_000;

export interface HttpOptions {
  actions: Actions;
  token: string;
  corsOrigin: string;
  /** Extra fields for GET /health. */
  health: () => Record<string, unknown>;
  log?: (message: string) => void;
}

function sameToken(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new ApiError('VALIDATION_ERROR', 'request body is too large');
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw === '') return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'request body is not valid JSON');
  }
}

export function createHttpServer({ actions, token, corsOrigin, health, log = () => {} }: HttpOptions): Server {
  if (token === '') throw new Error('CORE_API_TOKEN is required');

  function send(res: ServerResponse, status: number, body: ApiResponse<unknown>): void {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': corsOrigin,
    });
    res.end(JSON.stringify(body));
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': corsOrigin,
        'access-control-allow-methods': 'POST, GET, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '600',
      });
      res.end();
      return;
    }
    if (req.method === 'GET' && path === '/health') {
      send(res, 200, { ok: true, data: { service: 'ch4se-core-api', ...health() } });
      return;
    }

    const match = /^\/actions\/([a-z_]+)$/.exec(path);
    if (!match) throw new ApiError('NOT_FOUND', `no route for ${req.method ?? ''} ${path}`);
    if (req.method !== 'POST') throw new ApiError('VALIDATION_ERROR', 'actions are called with POST');

    const [scheme, given] = (req.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !given || !sameToken(given, token)) {
      throw new ApiError('UNAUTHORIZED', 'missing or invalid bearer token');
    }

    const name = match[1];
    if (!isOneOf(ACTION_NAMES, name)) throw new ApiError('NOT_FOUND', `unknown action ${name}`);
    const data = await actions[name](await readBody(req));
    log(`${name} ok`);
    send(res, 200, { ok: true, data });
  }

  return createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      if (error instanceof ApiError) {
        log(`${req.url ?? ''} ${error.code}: ${error.message}`);
        send(res, HTTP_STATUS[error.code], { ok: false, error: { code: error.code, message: error.message } });
        return;
      }
      // Not one of ours: a bug. Say so without leaking internals.
      console.error(error);
      send(res, 500, { ok: false, error: { code: 'UPSTREAM_UNAVAILABLE', message: 'internal error' } });
    });
  });
}
