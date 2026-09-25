import { TurnLockTimeoutError, type DbTurnLock } from "./turn-lock";

// Cross-instance layer of the per-waId turn lock.
//
// `pg_advisory_xact_lock(hashtext(waId))` is released automatically when the
// transaction ends, whether it commits, rolls back or the connection drops, so
// a crashed instance can never leave a citizen locked out. The transaction
// exists only to hold the lock: the turn's own reads/writes go through the
// normal client.
//
// Cost of that design: the lock transaction keeps ONE pool connection busy for
// the whole turn, including waits on MINSA/Gemini. If every connection were
// held that way the turns' own session reads/writes could never get one — a
// deadlock. `maxConcurrent` therefore caps the lock transactions per instance
// well below the pool size (the Neon adapter's pool defaults to 10), and turns
// beyond the cap wait in memory, holding no connection.

type Tx = { $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number> };

export type AdvisoryLockClient = {
  $transaction<T>(
    callback: (tx: Tx) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
};

export type AdvisoryLockOptions = {
  // How long Postgres may block waiting for the lock (SET LOCAL lock_timeout).
  lockTimeoutMs?: number;
  // Upper bound for the whole turn: must exceed the webhook's maxDuration.
  transactionTimeoutMs?: number;
  // How long to wait for a pool connection to open the transaction.
  connectionWaitMs?: number;
  // Lock transactions open at once on this instance.
  maxConcurrent?: number;
  // How long a turn may wait for one of those slots.
  slotWaitMs?: number;
  // Called with how long acquiring the lock took (slot + transaction + lock).
  // The default logs only when it is slow (200 ms or more).
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

// 55P03 = lock_not_available: what `lock_timeout` raises.
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
            // ONE round trip instead of two (each costs a network hop): the CTE
            // sets lock_timeout for this transaction and the lock is taken from it,
            // so the timeout is guaranteed to be in force when the wait starts.
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
