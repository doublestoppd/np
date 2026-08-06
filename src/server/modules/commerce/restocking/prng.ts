import { createHash, createHmac } from "node:crypto";

/**
 * Deterministic pseudorandom generator: SHA-256 in counter mode over a seed.
 * Same seed → same sequence, on any platform, forever — which is what makes
 * restocks reproducible and idempotent retries exact.
 */
export interface DeterministicRng {
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

export function createRng(seed: Buffer): DeterministicRng {
  let counter = 0;
  let pool = Buffer.alloc(0);
  let offset = 0;

  function nextUint32(): number {
    if (offset + 4 > pool.length) {
      const counterBuf = Buffer.alloc(4);
      counterBuf.writeUInt32BE(counter++);
      pool = createHash("sha256").update(seed).update(counterBuf).digest();
      offset = 0;
    }
    const value = pool.readUInt32BE(offset);
    offset += 4;
    return value;
  }

  return {
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error(`nextInt requires a positive integer bound, got ${maxExclusive}`);
      }
      // Rejection sampling avoids modulo bias.
      const range = 2 ** 32;
      const limit = Math.floor(range / maxExclusive) * maxExclusive;
      let value = nextUint32();
      while (value >= limit) {
        value = nextUint32();
      }
      return value % maxExclusive;
    },
  };
}

/**
 * Derives the seed material for one shop restock window. The server secret
 * is folded in via HMAC and never stored; `seedId` is a public identifier
 * for audit records.
 */
export function restockSeed(
  secret: string,
  shopId: string,
  windowStart: Date,
): { seed: Buffer; seedId: string } {
  const seed = createHmac("sha256", secret)
    .update(`${shopId}:${windowStart.toISOString()}`)
    .digest();
  return { seed, seedId: seed.toString("hex").slice(0, 16) };
}
