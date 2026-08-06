import { randomUUID } from "node:crypto";

/**
 * Minimal structured logger (docs/operations.md). One JSON object per line
 * on stdout — greppable locally, ingestible by any log stack. Never log
 * passwords, session tokens, secrets, full headers, or unnecessary
 * personal data; money values are logged as decimal strings.
 */

type LogValue = string | number | boolean | null | undefined;

export interface LogFields {
  [key: string]: LogValue;
}

function emit(level: "info" | "warn" | "error", event: string, fields: LogFields): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const serialized = JSON.stringify(line);
  if (level === "error") {
    console.error(serialized);
  } else {
    console.log(serialized);
  }
}

export const log = {
  info: (event: string, fields: LogFields = {}) => emit("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => emit("warn", event, fields),
  error: (event: string, fields: LogFields = {}) => emit("error", event, fields),
};

/** Correlation id for tying multi-step operation logs together. */
export function correlationId(): string {
  return randomUUID().slice(0, 13);
}

/** Runs an operation, logging duration and result code. */
export async function timed<T>(
  event: string,
  fields: LogFields,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    log.info(event, { ...fields, durationMs: Date.now() - started, result: "ok" });
    return result;
  } catch (error) {
    log.warn(event, {
      ...fields,
      durationMs: Date.now() - started,
      result: error instanceof Error ? error.message.slice(0, 120) : "error",
    });
    throw error;
  }
}
