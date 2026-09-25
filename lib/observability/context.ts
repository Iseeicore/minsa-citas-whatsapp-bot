import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<{ traceId: string; trace: unknown }>();

export function runWithTrace<T>(traceId: string, trace: unknown, run: () => T): T {
  return storage.run({ traceId, trace }, run);
}

export const currentTraceId = (): string | undefined => storage.getStore()?.traceId;

export function activeTrace<T>(): T | undefined {
  return storage.getStore()?.trace as T | undefined;
}
