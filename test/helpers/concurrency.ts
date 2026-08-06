/** Runs thunks concurrently and tallies outcomes for contention tests. */
export async function runConcurrently<T>(
  thunks: Array<() => Promise<T>>,
): Promise<{
  fulfilled: T[];
  rejected: unknown[];
  durationMs: number;
}> {
  const started = Date.now();
  const results = await Promise.allSettled(thunks.map((thunk) => thunk()));
  const fulfilled: T[] = [];
  const rejected: unknown[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      fulfilled.push(result.value);
    } else {
      rejected.push(result.reason);
    }
  }
  return { fulfilled, rejected, durationMs: Date.now() - started };
}
