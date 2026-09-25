import { TurnLockTimeoutError, type DbTurnLock } from "@/lib/fsm/session/turn-lock";

type Tx = { $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number> };

export type AdvisoryLockClient = {
  $transaction<T>(
    callback: (tx: Tx) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
};

export type AdvisoryLockOptions = {
  lockTimeoutMs?: number;
  transactionTimeoutMs?: number;
  connectionWaitMs?: number;
  maxConcurrent?: number;
  slotWaitMs?: number;
  onAcquired?: (waId: string, ms: number) => void;
};

const SLOW_ACQUIRE_MS = 200;

function createSemaphore(size: number) {
  let free = size;
  const queue: Array<() => void> = [];

  return {
    acquire(waId: string, timeoutMs: number): Promise<void> {
      if (free > 0) {
        free--;
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const grant = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          const index = queue.indexOf(grant);
          if (index >= 0) queue.splice(index, 1);
          reject(new TurnLockTimeoutError(waId, "database"));
        }, timeoutMs);
        queue.push(grant);
      });
    },
    release() {
      const next = queue.shift();
      if (next) next();
      else free++;
    },
  };
}

function isLockTimeout(error: unknown): boolean {
  const candidate = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown } | null;
  return (
    candidate?.code === "55P03" ||
    candidate?.meta?.code === "55P03" ||
    /lock timeout|55P03/i.test(String(candidate?.message ?? ""))
  );
}

export function createPrismaAdvisoryLock(
  client: AdvisoryLockClient,
  options: AdvisoryLockOptions = {},
): DbTurnLock {
  const lockTimeoutMs = Math.trunc(options.lockTimeoutMs ?? 10_000);
  const transactionTimeoutMs = options.transactionTimeoutMs ?? 55_000;
  const connectionWaitMs = options.connectionWaitMs ?? 10_000;
  const slotWaitMs = options.slotWaitMs ?? 20_000;
  const slots = createSemaphore(options.maxConcurrent ?? 4);
  const onAcquired =
    options.onAcquired ??
    ((waId: string, ms: number) => {
      if (ms >= SLOW_ACQUIRE_MS) console.info(`[turn-lock] database lock for ...${waId.slice(-4)} took ${Math.round(ms)} ms`);
    });

  return async function withAdvisoryLock<T>(waId: string, task: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    await slots.acquire(waId, slotWaitMs);

    try {
      return await client.$transaction(
        async (tx) => {
          try {
            await tx.$executeRawUnsafe(
              "WITH cfg AS (SELECT set_config('lock_timeout', $2, true)) SELECT pg_advisory_xact_lock(hashtext($1)) FROM cfg",
              waId,
              `${lockTimeoutMs}ms`,
            );
          } catch (error) {
            if (isLockTimeout(error)) throw new TurnLockTimeoutError(waId, "database");
            throw error;
          }

          onAcquired(waId, performance.now() - startedAt);
          return task();
        },
        { maxWait: connectionWaitMs, timeout: transactionTimeoutMs },
      );
    } finally {
      slots.release();
    }
  };
}
