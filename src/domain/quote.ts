export class InputError extends Error {}

export interface Quote {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly currency: 'USD';
}

function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputError('Se esperaba un objeto JSON');
  }
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !allowed.includes(key))) {
    throw new InputError('Hay campos no permitidos');
  }
  return data;
}

function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new InputError(`${name} debe ser un entero entre ${min} y ${max}`);
  }
  return value;
}

export function calculateQuote(input: unknown): Quote {
  const data = object(input, ['lines', 'discountBasisPoints']);
  if (!Array.isArray(data.lines) || data.lines.length < 1 || data.lines.length > 100) {
    throw new InputError('lines debe contener entre 1 y 100 productos');
  }
  const subtotalCents = data.lines.reduce((sum: number, value: unknown) => {
    const line = object(value, ['unitPriceCents', 'quantity']);
    const price = integer(line.unitPriceCents, 'unitPriceCents', 0, 1_000_000_000);
    const quantity = integer(line.quantity, 'quantity', 1, 1_000);
    return sum + price * quantity;
  }, 0);
  const basisPoints = integer(
    data.discountBasisPoints === undefined ? 0 : data.discountBasisPoints,
    'discountBasisPoints',
    0,
    10_000,
  );
  const discountCents = Number((BigInt(subtotalCents) * BigInt(basisPoints) + 5_000n) / 10_000n);
  return {
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
    currency: 'USD',
  };
}
