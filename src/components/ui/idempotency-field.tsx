import { randomUUID } from "node:crypto";

/**
 * Hidden idempotency key for economic mutation forms. Generated per render
 * on the server: retries/double-submits of the same rendered form reuse the
 * key (and replay the original result), while a freshly rendered page gets
 * a new key for a genuinely new operation.
 */
export function IdempotencyField() {
  return <input type="hidden" name="idempotencyKey" value={randomUUID()} />;
}
