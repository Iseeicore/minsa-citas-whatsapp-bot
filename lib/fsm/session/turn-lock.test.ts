import { describe, expect, it } from "vitest";
import { createTurnLock, TurnLockTimeoutError } from "./turn-lock";
import { createPrismaAdvisoryLock } from "./turn-lock-db";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Tracks how many tasks are inside the critical section at once.
function tracker() {
  let active = 0;
  let max = 0;
  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      active++;
      max = Math.max(max, active);
      try {
        return await work();
      } finally {
        active--;
      }
    },
    get max() {
      return max;
    },
  };
}

describe("level 1: in-process lock per waId", () => {
  it("runs tasks of the same waId one at a time, in arrival order", async () => {
    const lock = createTurnLock({});
    const inside = tracker();
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        lock("wa-1", () =>
          inside.run(async () => {
            await sleep(5 + (5 - n) * 3); // earlier tasks are the slowest: order must still hold
            order.push(n);
          }),
        ),
      ),
    );

    expect(inside.max).toBe(1);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not serialize different waIds against each other", async () => {
    const lock = createTurnLock({});
    const inside = tracker();

    const started = Date.now();
    await Promise.all(
      ["a", "b", "c", "d", "e"].map((waId) => lock(waId, () => inside.run(() => sleep(40)))),
    );

    expect(inside.max).toBe(5);
    expect(Date.now() - started).toBeLessThan(150);
  });

  it("returns the task's value and rethrows its error without blocking the queue", async () => {
    const lock = createTurnLock({});

    const failing = lock("wa-1", async () => {
      throw new Error("boom");
    });
    const following = lock("wa-1", async () => "still runs");

    await expect(failing).rejects.toThrow("boom");
    await expect(following).resolves.toBe("still runs");
  });

  it("gives up waiting after the timeout with a TurnLockTimeoutError, and later waiters still run", async () => {
    const lock = createTurnLock({ processTimeoutMs: 40 });
    const ran: string[] = [];

    const slow = lock("wa-1", async () => {
      await sleep(150);
      ran.push("slow");
    });
    const impatient = lock("wa-1", async () => {
      ran.push("impatient");
    });
    await expect(impatient).rejects.toBeInstanceOf(TurnLockTimeoutError);

    await slow;
    const later = await lock("wa-1", async () => {
      ran.push("later");
      return "ok";
    });

    expect(later).toBe("ok");
    expect(ran).toEqual(["slow", "later"]); // the timed-out task never ran
  });

  it("the timeout error names the waId and the layer", async () => {
    const lock = createTurnLock({ processTimeoutMs: 20 });
    void lock("wa-9", () => sleep(100));

    const error = await lock("wa-9", async () => "x").catch((caught) => caught);

    expect(error).toBeInstanceOf(TurnLockTimeoutError);
    expect(error).toMatchObject({ waId: "wa-9", layer: "process" });
  });
});

// A minimal stand-in for the Prisma client: records every statement and the
// transaction options, and can be told to fail a statement.
function fakePrisma(options: { failOn?: (sql: string) => Error | undefined } = {}) {
  const log: string[] = [];
  const transactions: Array<{ maxWait?: number; timeout?: number }> = [];
  let open = 0;
  let maxOpen = 0;

  const prisma = {
    async $transaction<T>(
      callback: (tx: { $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number> }) => Promise<T>,
      txOptions?: { maxWait?: number; timeout?: number },
    ): Promise<T> {
      transactions.push(txOptions ?? {});
      open++;
      maxOpen = Math.max(maxOpen, open);
      log.push("BEGIN");
      try {
        const result = await callback({
          async $executeRawUnsafe(sql, ...values) {
            log.push(values.length ? `${sql} [${values.join(",")}]` : sql);
            const failure = options.failOn?.(sql);
            if (failure) throw failure;
            return 0;
          },
        });
        log.push("COMMIT");
        return result;
      } catch (error) {
        log.push("ROLLBACK");
        throw error;
      } finally {
        open--;
      }
    },
  };

  return { prisma, log, transactions, get maxOpen() { return maxOpen; } };
}

describe("level 2: Postgres advisory lock", () => {
  it("takes pg_advisory_xact_lock(hashtext(waId)) inside a transaction, before running the task", async () => {
    const db = fakePrisma();
    const lock = createPrismaAdvisoryLock(db.prisma, { lockTimeoutMs: 7000, transactionTimeoutMs: 40000, connectionWaitMs: 9000 });

    const value = await lock("5491100000000", async () => {
      db.log.push("TASK");
      return 42;
    });

    expect(value).toBe(42);
    expect(db.log).toEqual([
      "BEGIN",
      "WITH cfg AS (SELECT set_config('lock_timeout', $2, true)) SELECT pg_advisory_xact_lock(hashtext($1)) FROM cfg [5491100000000,7000ms]",
      "TASK",
      "COMMIT",
    ]);
    expect(db.transactions).toEqual([{ maxWait: 9000, timeout: 40000 }]);
  });

  it("maps a Postgres lock timeout to a clean TurnLockTimeoutError and never runs the task", async () => {
    const lockTimeout = Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
    const db = fakePrisma({ failOn: (sql) => (sql.includes("pg_advisory_xact_lock") ? lockTimeout : undefined) });
    const lock = createPrismaAdvisoryLock(db.prisma);
    let ran = false;

    const error = await lock("wa-1", async () => {
      ran = true;
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(TurnLockTimeoutError);
    expect(error).toMatchObject({ waId: "wa-1", layer: "database" });
    expect(ran).toBe(false);
    expect(db.log.at(-1)).toBe("ROLLBACK");
  });

  it("lets other database errors through unchanged", async () => {
    const db = fakePrisma({ failOn: (sql) => (sql.includes("set_config") ? new Error("connection reset") : undefined) });
    const lock = createPrismaAdvisoryLock(db.prisma);

    await expect(lock("wa-1", async () => "x")).rejects.toThrow("connection reset");
  });

  it("propagates the task's own error and rolls the transaction back (releasing the lock)", async () => {
    const db = fakePrisma();
    const lock = createPrismaAdvisoryLock(db.prisma);

    await expect(
      lock("wa-1", async () => {
        throw new Error("turn failed");
      }),
    ).rejects.toThrow("turn failed");
    expect(db.log.at(-1)).toBe("ROLLBACK");
  });

  it("caps open lock transactions so they can never starve the connection pool", async () => {
    const db = fakePrisma();
    const lock = createPrismaAdvisoryLock(db.prisma, { maxConcurrent: 2 });

    await Promise.all(Array.from({ length: 8 }, (_, index) => lock(`wa-${index}`, () => sleep(15))));

    expect(db.maxOpen).toBe(2);
    expect(db.transactions).toHaveLength(8);
  });

  it("gives up waiting for a free slot with a TurnLockTimeoutError instead of piling up forever", async () => {
    const db = fakePrisma();
    const lock = createPrismaAdvisoryLock(db.prisma, { maxConcurrent: 1, slotWaitMs: 30 });

    const holder = lock("wa-1", () => sleep(120));
    const waiting = lock("wa-2", async () => "never");

    await expect(waiting).rejects.toBeInstanceOf(TurnLockTimeoutError);
    await holder;
    expect(db.transactions).toHaveLength(1);
  });
});

describe("both levels together", () => {
  it("the process lock is outermost: the database lock is taken once per waId at a time", async () => {
    const db = fakePrisma();
    const lock = createTurnLock({ dbLock: createPrismaAdvisoryLock(db.prisma) });

    await Promise.all(Array.from({ length: 5 }, () => lock("wa-1", () => sleep(10))));

    expect(db.maxOpen).toBe(1);
    expect(db.transactions).toHaveLength(5);
  });

  it("without a database lock (no DATABASE_URL) it degrades to the in-process lock only", async () => {
    const lock = createTurnLock({});
    await expect(lock("wa-1", async () => "ok")).resolves.toBe("ok");
  });
});

describe("observability: waits are logged so a tester can see the lock working", () => {
  it("logs a turn that waited behind another one, with the masked waId and the wait", async () => {
    const lines: string[] = [];
    const lock = createTurnLock({ slowWaitMs: 20, log: (line) => lines.push(line) });

    await Promise.all([lock("5491100001234", () => sleep(60)), lock("5491100001234", async () => "second")]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[turn-lock\] turn waited \d+ ms behind an earlier turn of \.\.\.1234$/);
  });

  it("stays silent when nothing had to wait", async () => {
    const lines: string[] = [];
    const lock = createTurnLock({ slowWaitMs: 20, log: (line) => lines.push(line) });

    await lock("wa-1", async () => "alone");
    await lock("wa-1", async () => "alone again");

    expect(lines).toEqual([]);
  });

  it("the database layer reports how long it took to get the lock", async () => {
    const seen: Array<{ waId: string; ms: number }> = [];
    const db = fakePrisma();
    const lock = createPrismaAdvisoryLock(db.prisma, { onAcquired: (waId, ms) => seen.push({ waId, ms }) });

    await lock("wa-9", async () => "ok");

    expect(seen).toHaveLength(1);
    expect(seen[0].waId).toBe("wa-9");
    expect(seen[0].ms).toBeGreaterThanOrEqual(0);
  });
});
