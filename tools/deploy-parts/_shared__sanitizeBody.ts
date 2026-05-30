/** Whitelist keys from a parsed JSON object; unknown fields are dropped. */

export function pickBody<T extends string>(
  body: Record<string, unknown>,
  keys: readonly T[],
): Record<T, unknown> {
  const out = {} as Record<T, unknown>;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      out[k] = body[k];
    }
  }
  return out;
}
