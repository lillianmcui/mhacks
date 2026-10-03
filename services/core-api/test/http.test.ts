import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createHttpServer } from '../src/http.ts';
import { setup } from './helpers.ts';

const TOKEN = 'test-token';
let base = '';
let close = () => {};

before(async () => {
  const { actions } = await setup();
  const server = createHttpServer({ actions, token: TOKEN, corsOrigin: '*', health: () => ({ mode: 'test' }) });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(() => close());

const post = (path: string, body: unknown, token: string | null = TOKEN) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('a successful action returns { ok: true, data }', async () => {
  const res = await post('/actions/get_open_incidents', {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.data[0].incident_id, 'INC-0001');
});

test('missing or wrong bearer token is UNAUTHORIZED', async () => {
  for (const token of [null, 'wrong']) {
    const res = await post('/actions/get_open_incidents', {}, token);
    assert.equal(res.status, 401);
    assert.deepEqual((await res.json()).error.code, 'UNAUTHORIZED');
  }
});

test('errors use the envelope and a matching status', async () => {
  const notFound = await post('/actions/get_incident', { incident_id: 'INC-404' });
  assert.equal(notFound.status, 404);
  assert.deepEqual(await notFound.json(), { ok: false, error: { code: 'NOT_FOUND', message: 'incident INC-404 not found' } });

  const invalid = await post('/actions/set_incident_status', { incident_id: 'INC-0001', status: 'RESOLVED', actor: 'DASHBOARD' });
  assert.equal(invalid.status, 409);
  assert.equal((await invalid.json()).error.code, 'INVALID_TRANSITION');

  const badJson = await post('/actions/get_incident', '{not json');
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json()).error.code, 'VALIDATION_ERROR');

  const unknown = await post('/actions/drop_tables', {});
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, 'NOT_FOUND');
});

test('an empty body is treated as {}', async () => {
  const res = await fetch(`${base}/actions/get_open_incidents`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal((await res.json()).ok, true);
});

test('health needs no token; preflight allows the dashboard to send the bearer header', async () => {
  const health = await fetch(`${base}/health`);
  assert.equal((await health.json()).data.mode, 'test');
  const preflight = await fetch(`${base}/actions/get_open_incidents`, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /authorization/);
});
