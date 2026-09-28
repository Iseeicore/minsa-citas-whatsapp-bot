import { logger } from "@/lib/observability/logger";
import { tail as maskWaId } from "@/lib/observability/mask";
import { isDatabaseEnabled } from "@/lib/db/persistence";

export type TurnLockLayer = "process" | "database";

export class TurnLockTimeoutError extends Error {
  constructor(
    readonly waId: string,
    readonly layer: TurnLockLayer,
  ) {
    super(`Timed out waiting for the ${layer} turn lock of ${waId}`);
    this.name = "TurnLockTimeoutError";
  }
}

export { TURN_FAILURE_TEXT } from "@/lib/fsm/core/failure-texts";

export type TurnTask<T> = () => Promise<T>;
export type TurnLock = <T>(waId: string, task: TurnTask<T>) => Promise<T>;

export type DbTurnLock = TurnLock;

export type TurnLockOptions = {
  processTimeoutMs?: number;
  dbLock?: DbTurnLock;
  slowWaitMs?: number;
  log?: (line: string) => void;
};

const DEFAULT_PROCESS_TIMEOUT_MS = 30_000;
const DEFAULT_SLOW_WAIT_MS = 150;

function waitFor(promise: Promise<unknown>, timeoutMs: number, onTimeout: () => Error): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), timeoutMs);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

/** Serializa los turnos de un mismo ciudadano: cola en memoria del proceso y, con base de datos, advisory lock de Postgres entre instancias. */
export function createTurnLock(options: TurnLockOptions = {}): TurnLock {
  const timeoutMs = options.processTimeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;
  const slowWaitMs = options.slowWaitMs ?? DEFAULT_SLOW_WAIT_MS;
  const tails = new Map<string, Promise<void>>();

  return async function withTurnLock<T>(waId: string, task: TurnTask<T>): Promise<T> {
    const previous = tails.get(waId) ?? Promise.resolve();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    tails.set(waId, tail);

    try {
      const queuedAt = Date.now();
      await waitFor(previous, timeoutMs, () => new TurnLockTimeoutError(waId, "process"));

      const waited = Date.now() - queuedAt;
      if (waited >= slowWaitMs) {
        if (options.log) options.log(`[turn-lock] turn waited ${waited} ms behind an earlier turn of ...${waId.slice(-4)}`);
        else logger.info("turn_lock.waited", { waId: maskWaId(waId), waitedMs: waited, layer: "process" });
      }

      return await (options.dbLock ? options.dbLock(waId, task) : task());
    } finally {
      release();
      if (tails.get(waId) === tail) tails.delete(waId);
    }
  };
}

function numberFromEnv(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function defaultDbLock(): DbTurnLock | undefined {
  if (!process.env.DATABASE_URL || process.env.TURN_DB_LOCK === "off" || !isDatabaseEnabled()) return undefined;

  let lock: DbTurnLock | undefined;

  return async (waId, task) => {
    if (!lock) {
      const [{ prisma }, { createPrismaAdvisoryLock }] = await Promise.all([
        import("@/lib/db/prisma"),
        import("@/lib/fsm/session/turn-lock-db"),
      ]);
      lock = createPrismaAdvisoryLock(prisma, {
        lockTimeoutMs: numberFromEnv("TURN_LOCK_TIMEOUT_MS"),
        maxConcurrent: numberFromEnv("TURN_LOCK_MAX_CONCURRENCY"),
      });
    }
    return lock(waId, task);
  };
}

let current: TurnLock = createTurnLock({
  processTimeoutMs: numberFromEnv("TURN_PROCESS_LOCK_TIMEOUT_MS"),
  dbLock: defaultDbLock(),
});

export const withTurnLock: TurnLock = (waId, task) => current(waId, task);

export function configureTurnLock(lock: TurnLock): void {
  current = lock;
}
