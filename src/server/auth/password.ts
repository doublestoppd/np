import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { ScryptOptions } from "node:crypto";

/**
 * `promisify(scrypt)` resolves to the overload without options, so the
 * cost parameters below would be silently dropped. Wrapping it by hand
 * keeps them typed.
 */
function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

const KEY_LENGTH = 64;

/**
 * scrypt parameters for NEW hashes. `cost` is N: 2^17 is the current
 * OWASP interactive recommendation, four times Node's default and about
 * 128 MB of memory per derivation.
 *
 * These live in the stored string, not only here, so they can be raised
 * later without invalidating every existing password: `verifyPassword`
 * derives with whatever the stored hash recorded. The old parameterless
 * `salt:hash` format is deliberately not supported — the project is
 * pre-alpha (CLAUDE.md), development accounts are disposable, and
 * carrying a compatibility branch for them would outlive them.
 */
const PARAMS = { cost: 1 << 17, blockSize: 8, parallelization: 1 } as const;

/**
 * scrypt with N=2^17 needs more than Node's 32 MB default working memory:
 * roughly 128·N·r bytes. Passing it explicitly rather than raising a
 * global keeps the requirement next to the parameter that causes it.
 */
function memoryFor(cost: number, blockSize: number): number {
  return 256 * cost * blockSize;
}

/** Serialized as `scrypt$N$r$p$salt$hash` — parameters travel with it. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: PARAMS.cost,
    r: PARAMS.blockSize,
    p: PARAMS.parallelization,
    maxmem: memoryFor(PARAMS.cost, PARAMS.blockSize),
  });
  return [
    "scrypt",
    PARAMS.cost,
    PARAMS.blockSize,
    PARAMS.parallelization,
    salt,
    derived.toString("hex"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const [, costRaw, blockSizeRaw, parallelizationRaw, salt, hash] = parts;
  const cost = Number(costRaw);
  const blockSize = Number(blockSizeRaw);
  const parallelization = Number(parallelizationRaw);
  if (
    !Number.isSafeInteger(cost) ||
    !Number.isSafeInteger(blockSize) ||
    !Number.isSafeInteger(parallelization) ||
    cost < 2 ||
    blockSize < 1 ||
    parallelization < 1 ||
    // A stored string is not attacker-controlled, but a corrupted row must
    // not be able to ask for an unbounded allocation.
    cost > 1 << 20 ||
    blockSize > 32 ||
    parallelization > 16 ||
    !salt ||
    !hash
  ) {
    return false;
  }
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: memoryFor(cost, blockSize),
  });
  const expected = Buffer.from(hash, "hex");
  return (
    expected.length === derived.length && timingSafeEqual(derived, expected)
  );
}

/**
 * A hash of a value nobody knows, derived once at startup, for verifying
 * against when the account does not exist.
 *
 * Without it, sign-in short-circuits: a missing username returns after one
 * indexed lookup while a real one additionally pays the full scrypt
 * derivation — a difference of ~100ms that a wordlist can time. The
 * per-username rate limit does not bound that at all, because the attacker
 * changes the username each request. Doing the work either way makes the
 * two paths cost the same.
 */
const DECOY_HASH = hashPassword(randomBytes(32).toString("hex"));

/** Burns the same work a real verification would, and always fails. */
export async function verifyAgainstDecoy(password: string): Promise<false> {
  await verifyPassword(password, await DECOY_HASH);
  return false;
}
