import { AsyncLocalStorage } from "node:async_hooks";

// The trace of the turn that is running, reachable from anywhere below it (an
// adapter, an AI call) without passing it through every signature — that is what
// lets a log line written deep in lib/integrations/minsa/ carry the turn's traceId.
const storage = new AsyncLocalStorage<{ traceId: string; trace: unknown }>();

export function runWithTrace<T>(traceId: string, trace: unknown, run: () => T): T {
  return storage.run({ traceId, trace }, run);
}

export const currentTraceId = (): string | undefined => storage.getStore()?.traceId;

export function activeTrace<T>(): T | undefined {
  return storage.getStore()?.trace as T | undefined;
}
