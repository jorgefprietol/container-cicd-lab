import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateQuote, InputError } from '../src/domain/quote.js';

const line = { unitPriceCents: 1_001, quantity: 2 };

test('calcula centavos y descuentos con redondeo medio hacia arriba', () => {
  assert.deepEqual(calculateQuote({ lines: [line], discountBasisPoints: 1_000 }), {
    subtotalCents: 2_002,
    discountCents: 200,
    totalCents: 1_802,
    currency: 'USD',
  });
  assert.equal(
    calculateQuote({ lines: [{ unitPriceCents: 101, quantity: 1 }], discountBasisPoints: 5_000 })
      .discountCents,
    51,
  );
});

test('descuento omitido, cero, 100%, productos gratis y suma de líneas', () => {
  assert.equal(calculateQuote({ lines: [line] }).totalCents, 2_002);
  assert.equal(calculateQuote({ lines: [line], discountBasisPoints: 0 }).totalCents, 2_002);
  assert.equal(calculateQuote({ lines: [line], discountBasisPoints: 10_000 }).totalCents, 0);
  assert.equal(calculateQuote({ lines: [{ unitPriceCents: 0, quantity: 1 }] }).totalCents, 0);
  assert.equal(calculateQuote({ lines: [line, line] }).totalCents, 4_004);
});

test('los límites máximos preservan precisión y no desbordan', () => {
  const lines = Array.from({ length: 100 }, () => ({
    unitPriceCents: 1_000_000_000,
    quantity: 1_000,
  }));
  const quote = calculateQuote({ lines, discountBasisPoints: 10_000 });
  assert.equal(quote.subtotalCents, 100_000_000_000_000);
  assert.equal(quote.totalCents, 0);
});

test('rechaza estructura, campos desconocidos y líneas vacías o excesivas', () => {
  for (const input of [
    null,
    [],
    'data',
    3,
    {},
    { lines: [] },
    { lines: 'bad' },
    { lines: [line], extra: true },
    { lines: [null] },
    { lines: [[]] },
    { lines: [{ ...line, price: 1 }] },
    { lines: Array.from({ length: 101 }, () => line) },
  ]) {
    assert.throws(() => calculateQuote(input), InputError);
  }
});

test('rechaza precios, cantidades y porcentajes fuera del contrato', () => {
  for (const price of [undefined, null, -1, 1.5, NaN, Infinity, '100', 1_000_000_001]) {
    assert.throws(
      () => calculateQuote({ lines: [{ ...line, unitPriceCents: price }] }),
      InputError,
    );
  }
  for (const quantity of [undefined, null, 0, -1, 0.5, '2', 1_001]) {
    assert.throws(() => calculateQuote({ lines: [{ ...line, quantity }] }), InputError);
  }
  for (const discount of [null, -1, 1.5, '10', 10_001]) {
    assert.throws(
      () => calculateQuote({ lines: [line], discountBasisPoints: discount }),
      InputError,
    );
  }
});
