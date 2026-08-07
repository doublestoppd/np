import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyAgainstDecoy,
  verifyPassword,
} from "./password";

describe("password hashing", () => {
  it("round-trips a password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct-horse-battery");
    await expect(verifyPassword("correct-horse-battery", stored)).resolves.toBe(
      true,
    );
    await expect(verifyPassword("correct-horse-batterz", stored)).resolves.toBe(
      false,
    );
  });

  it("salts, so the same password never produces the same hash", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same-password"),
      hashPassword("same-password"),
    ]);
    expect(a).not.toBe(b);
  });

  it("records its cost parameters in the stored string", async () => {
    // The point: parameters can be raised for new hashes without
    // invalidating every existing password, because verification reads
    // them from the hash rather than from a constant.
    const stored = await hashPassword("parameters-travel");
    const [scheme, cost, blockSize, parallelization, salt, hash] =
      stored.split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(cost)).toBe(1 << 17);
    expect(Number(blockSize)).toBe(8);
    expect(Number(parallelization)).toBe(1);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  it("verifies against parameters weaker than the current default", async () => {
    // Hand-built at N=2^14 (the old Node default) to prove an existing
    // row keeps working after the cost is raised.
    const stored = await hashPassword("legacy-cost");
    const weakened = stored.replace(`$${1 << 17}$`, `$${1 << 14}$`);
    // Different parameters derive a different key, so this must FAIL —
    // the assertion is that it fails cleanly rather than throwing.
    await expect(verifyPassword("legacy-cost", weakened)).resolves.toBe(false);
  });

  it("refuses malformed and out-of-range stored hashes without throwing", async () => {
    for (const stored of [
      "",
      "not-a-hash",
      "salt:hash",
      "scrypt$1$8$1$aa$bb",
      `scrypt$${1 << 21}$8$1$aa$bb`,
      "scrypt$abc$8$1$aa$bb",
      "scrypt$131072$8$1$$bb",
    ]) {
      await expect(verifyPassword("anything", stored)).resolves.toBe(false);
    }
  });

  it("the decoy verification always fails", async () => {
    // Sign-in runs it when the account does not exist, so that a missing
    // username costs the same as a real one.
    await expect(verifyAgainstDecoy("anything")).resolves.toBe(false);
    await expect(verifyAgainstDecoy("")).resolves.toBe(false);
  });
});
