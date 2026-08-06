/** Per-domain change accounting for the seed run. */
export type SeedAction = "created" | "updated" | "unchanged" | "deactivated" | "skipped";

export class SeedReport {
  private readonly counts = new Map<string, Record<SeedAction, number>>();
  private readonly notes: string[] = [];

  record(domain: string, action: SeedAction, count = 1): void {
    const row =
      this.counts.get(domain) ??
      ({ created: 0, updated: 0, unchanged: 0, deactivated: 0, skipped: 0 } as Record<
        SeedAction,
        number
      >);
    row[action] += count;
    this.counts.set(domain, row);
  }

  note(message: string): void {
    this.notes.push(message);
  }

  print(): void {
    console.log("Content seed complete");
    for (const [domain, row] of this.counts) {
      const parts = (Object.entries(row) as Array<[SeedAction, number]>)
        .filter(([, count]) => count > 0)
        .map(([action, count]) => `${action} ${count}`);
      console.log(`  ${domain}: ${parts.length > 0 ? parts.join(", ") : "unchanged 0"}`);
    }
    for (const note of this.notes) {
      console.log(`  ${note}`);
    }
  }
}

/** True when every listed field is equal between the two records. */
export function sameFields<T extends object>(
  existing: T,
  next: Partial<T>,
): boolean {
  return (Object.keys(next) as Array<keyof T>).every((key) => {
    const a = existing[key];
    const b = next[key];
    if (a instanceof Date || b instanceof Date) {
      return (
        (a === null && b === null) ||
        (a instanceof Date && b instanceof Date && a.getTime() === b.getTime())
      );
    }
    return a === b;
  });
}
