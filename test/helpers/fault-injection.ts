import type { PrismaClient } from "@prisma/client";

/**
 * Fault-injection harness for rollback tests: wraps a PrismaClient so that
 * inside interactive transactions, the Nth call to `<model>.<method>`
 * throws. Commands under test receive the wrapped client unchanged, so the
 * failure happens mid-transaction exactly like a real database error — and
 * the assertions then prove the transaction rolled back completely.
 */
export class InjectedFault extends Error {
  constructor(site: string) {
    super(`Injected fault at ${site}`);
    this.name = "InjectedFault";
  }
}

export interface FaultSpec {
  model: string;
  method: string;
  /** Which call to fail (1-based). Defaults to the first. */
  call?: number;
}

export function withFault(db: PrismaClient, spec: FaultSpec): PrismaClient {
  let calls = 0;
  const failAt = spec.call ?? 1;

  const wrapTx = (tx: object): object =>
    new Proxy(tx, {
      get(target, prop, receiver) {
        if (prop === spec.model) {
          const model = Reflect.get(target, prop, receiver) as Record<
            string,
            (...args: unknown[]) => unknown
          >;
          return new Proxy(model, {
            get(modelTarget, methodProp, modelReceiver) {
              if (methodProp === spec.method) {
                return (...args: unknown[]) => {
                  calls++;
                  if (calls === failAt) {
                    throw new InjectedFault(`${spec.model}.${spec.method}#${calls}`);
                  }
                  return modelTarget[spec.method]?.(...args);
                };
              }
              return Reflect.get(modelTarget, methodProp, modelReceiver);
            },
          });
        }
        return Reflect.get(target, prop, receiver);
      },
    });

  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        return (
          fnOrOps: ((tx: object) => Promise<unknown>) | unknown[],
          opts?: unknown,
        ) => {
          if (typeof fnOrOps === "function") {
            return (target.$transaction as (
              fn: (tx: object) => Promise<unknown>,
              opts?: unknown,
            ) => Promise<unknown>)((tx: object) => fnOrOps(wrapTx(tx)), opts);
          }
          return (target.$transaction as (ops: unknown[], opts?: unknown) => Promise<unknown>)(
            fnOrOps,
            opts,
          );
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as PrismaClient;
}
