import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export async function smoke(baseUrl, expectedRevision) {
  const live = await fetch(`${baseUrl}/health/live`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(live.status, 200);
  const health = await live.json();
  if (expectedRevision) assert.equal(health.revision, expectedRevision);
  const ready = await fetch(`${baseUrl}/health/ready`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(ready.status, 200);
  const quote = await fetch(`${baseUrl}/api/v1/quotes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      lines: [{ unitPriceCents: 2_000, quantity: 2 }],
      discountBasisPoints: 1_000,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(quote.status, 200);
  assert.deepEqual(await quote.json(), {
    subtotalCents: 4_000,
    discountCents: 400,
    totalCents: 3_600,
    currency: 'USD',
  });
  console.log(`Smoke OK: ${baseUrl} · ${health.revision}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await smoke(process.argv[2] ?? 'http://127.0.0.1:8088', process.argv[3]);
}
