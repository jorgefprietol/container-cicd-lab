import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { test, type TestContext } from 'node:test';
import { createApp, type RequestLog } from '../src/http/app.js';

async function fixture(t: TestContext) {
  const logs: RequestLog[] = [];
  const app = createApp({ revision: 'test-revision', logger: (entry) => logs.push(entry) });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      app.server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  return { ...app, logs, url };
}

test('liveness, readiness, HEAD, metadatos y consulta no alteran la ruta', async (t) => {
  const { url } = await fixture(t);
  for (const path of ['/health/live', '/health/ready', '/health/live?probe=1']) {
    const response = await fetch(url + path);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revision, 'test-revision');
  }
  const head = await fetch(url + '/health/live', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const root = await fetch(url);
  assert.equal((await root.json()).service, 'container-cicd-lab');
});

test('POST calcula y publica cabeceras y logs sin datos del cuerpo', async (t) => {
  const { url, logs } = await fixture(t);
  const response = await fetch(url + '/api/v1/quotes', {
    method: 'POST',
    headers: { 'content-type': 'Application/JSON; charset=utf-8', 'x-request-id': 'test-123' },
    body: JSON.stringify({
      lines: [
        { unitPriceCents: 4_500, quantity: 1 },
        { unitPriceCents: 800, quantity: 2 },
      ],
      discountBasisPoints: 1_000,
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    subtotalCents: 6_100,
    discountCents: 610,
    totalCents: 5_490,
    currency: 'USD',
  });
  assert.equal(response.headers.get('x-request-id'), 'test-123');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('content-security-policy'));
  assert.deepEqual(Object.keys(logs[0] ?? {}).sort(), [
    'durationMs',
    'event',
    'method',
    'requestId',
    'route',
    'status',
  ]);
});

test('genera ID seguro cuando el recibido es inválido o está ausente', async (t) => {
  const { url } = await fixture(t);
  const response = await fetch(url + '/health/live', { headers: { 'x-request-id': 'unsafe"id' } });
  assert.match(response.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
});

test('errores JSON, validación y tipo de contenido devuelven códigos explícitos', async (t) => {
  const { url } = await fixture(t);
  const cases = [
    { body: '{broken', contentType: 'application/json', status: 400, code: 'invalid_json' },
    { body: '', contentType: 'application/json', status: 400, code: 'invalid_json' },
    { body: '{}', contentType: 'application/json', status: 400, code: 'invalid_input' },
    { body: '{}', contentType: 'text/plain', status: 415, code: 'unsupported_media_type' },
  ];
  for (const item of cases) {
    const response = await fetch(url + '/api/v1/quotes', {
      method: 'POST',
      headers: { 'content-type': item.contentType },
      body: item.body,
    });
    assert.equal(response.status, item.status);
    assert.equal((await response.json()).error.code, item.code);
  }
  const noType = await fetch(url + '/api/v1/quotes', { method: 'POST' });
  assert.equal(noType.status, 415);
});

test('rechaza un cuerpo excesivo sin cerrar la conexión antes de responder', async (t) => {
  const { url } = await fixture(t);
  const response = await fetch(url + '/api/v1/quotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'x'.repeat(20_000) }),
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'payload_too_large');
});

test('rutas desconocidas y métodos no admitidos devuelven 404 y 405', async (t) => {
  const { url } = await fixture(t);
  assert.equal((await fetch(url + '/missing')).status, 404);
  for (const [path, allow] of [
    ['/api/v1/quotes', 'POST'],
    ['/health/live', 'GET, HEAD'],
    ['/metrics', 'GET'],
  ]) {
    const response = await fetch(url + path, { method: 'DELETE' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), allow);
  }
});

test('draining desactiva readiness y las compras sin alterar liveness', async (t) => {
  const app = await fixture(t);
  app.setReady(false);
  const ready = await fetch(app.url + '/health/ready');
  assert.equal(ready.status, 503);
  assert.equal((await ready.json()).status, 'draining');
  assert.equal((await fetch(app.url + '/health/live')).status, 200);
  assert.equal((await fetch(app.url + '/api/v1/quotes', { method: 'POST' })).status, 503);
});

test('métricas agregan estados sin cardinalidad arbitraria por URL', async (t) => {
  const { url } = await fixture(t);
  await fetch(url + '/health/live');
  await fetch(url + '/random-1');
  await fetch(url + '/random-2');
  const response = await fetch(url + '/metrics');
  assert.equal(response.status, 200);
  const metrics = await response.text();
  assert.match(metrics, /http_requests_total\{route="\/health\/live",status="200"\} 1/);
  assert.match(metrics, /http_requests_total\{route="unmatched",status="404"\} 2/);
  assert.ok(!metrics.includes('random-1'));
});

test('una petición abortada no deja el servidor inutilizable', async (t) => {
  const { url } = await fixture(t);
  await new Promise<void>((resolve) => {
    const pending = request(url + '/api/v1/quotes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    pending.on('error', () => resolve());
    pending.flushHeaders();
    pending.write('{"lines":');
    setTimeout(() => pending.destroy(), 20);
  });
  assert.equal((await fetch(url + '/health/live')).status, 200);
});
