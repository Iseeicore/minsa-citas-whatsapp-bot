// Mutual exclusion for the turns of ONE waId.
//
// A turn is read session -> compute (possibly calling MINSA / RENIEC / Gemini)
// -> write session. Two turns of the same citizen that overlap both read the
// same stale session and the last writer wins (a lost update: the citizen's
// answer is silently dropped, or a step runs twice). Two layers prevent that:
//
//  1. an in-process queue per waId — serializes rapid bursts on one instance
//     without spending a database connection;
//  2. a Postgres advisory lock (lib/fsm/session/turn-lock-db.ts) — serializes turns
//     that land on DIFFERENT serverless instances.

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

// What a citizen reads when their message could not be processed: the lock gave up
// waiting for the turn before it, or the turn (or its storage) failed in a way the
// bot did not expect. Either way the message is not answered, so they are asked to
// write again instead of being left in silence.
export const TURN_FAILURE_TEXT =
  "Ocurrió un inconveniente temporal al procesar tu solicitud. Por favor, intenta escribir nuevamente en unos instantes.";

export type TurnTask<T> = () => Promise<T>;
export type TurnLock = <T>(waId: string, task: TurnTask<T>) => Promise<T>;

// Wraps a task in the cross-instance lock; supplied by lib/fsm/session/turn-lock-db.ts.
export type DbTurnLock = TurnLock;

export type TurnLockOptions = {
  // How long a turn may wait behind earlier turns of the same waId in this
  // process before giving up.
  processTimeoutMs?: number;
  dbLock?: DbTurnLock;
  // A wait at least this long is logged, so a tester (or an operator reading
  // the logs) can SEE the lock serializing a burst. Never logs the full waId.
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

export function createTurnLock(options: TurnLockOptions = {}): TurnLock {
  const timeoutMs = options.processTimeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;
  const slowWaitMs = options.slowWaitMs ?? DEFAULT_SLOW_WAIT_MS;
  const log = options.log ?? ((line: string) => console.info(line));
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
        log(`[turn-lock] turn waited ${waited} ms behind an earlier turn of ...${waId.slice(-4)}`);
      }

      return await (options.dbLock ? options.dbLock(waId, task) : task());
    } finally {
      // Also runs when this waiter timed out without ever starting: releasing
      // the gate keeps the chain moving for everyone queued behind it.
      release();
      if (tails.get(waId) === tail) tails.delete(waId);
    }
  };
}

// ---- The instance the app uses ----------------------------------------------

function numberFromEnv(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

// The database layer is only wired when there IS a database to lock on, and can
// be switched off with TURN_DB_LOCK=off. Prisma is imported lazily so modules
// (and tests) that never take a turn don't open a connection.
function defaultDbLock(): DbTurnLock | undefined {
  if (!process.env.DATABASE_URL || process.env.TURN_DB_LOCK === "off") return undefined;

  let lock: DbTurnLock | undefined;

  return async (waId, task) => {
    if (!lock) {
      const [{ prisma }, { createPrismaAdvisoryLock }] = await Promise.all([
        import("@/lib/db/prisma"),
        import("./turn-lock-db"),
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

// Composition hooks (tests, or a different deployment topology).
export function configureTurnLock(lock: TurnLock): void {
  current = lock;
}
