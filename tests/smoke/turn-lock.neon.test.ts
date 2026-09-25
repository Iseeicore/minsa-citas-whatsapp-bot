import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTurnLock, TurnLockTimeoutError } from "@/lib/fsm/session/turn-lock";
import { createPrismaAdvisoryLock } from "@/lib/fsm/session/turn-lock-db";
import { prisma } from "@/lib/db/prisma";

const MAX_ACQUIRE_MS = Number(process.env.SMOKE_MAX_ACQUIRE_MS ?? 200);
const MAX_RELEASE_MS = Number(process.env.SMOKE_MAX_RELEASE_MS ?? 200);
const POOL_SIZE = 10;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const waId = () => `smoke-${randomUUID()}`;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const ms = (value: number) => Math.round(value);

const report: Record<string, unknown> = {};

async function advisoryLocksNow(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      "SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'",
    );
    return rows[0]?.n ?? null;
  } catch {
    return null;
  }
}

describe.skipIf(!process.env.DATABASE_URL)("turn lock against Neon (WebSocket pool)", () => {
  let baselineLocks: number | null = null;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL as string);
    report.host = url.hostname;
    report.pooler = url.hostname.includes("-pooler");
    report.limits = { MAX_ACQUIRE_MS, MAX_RELEASE_MS, POOL_SIZE };

    const wake = performance.now();
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await prisma.$queryRawUnsafe("SELECT 1");
        break;
      } catch (error) {
        if (attempt === 9) throw error;
        await sleep(1500);
      }
    }
    report.connectFirstQueryMs = ms(performance.now() - wake);
    baselineLocks = await advisoryLocksNow();
    report.advisoryLocksBaseline = baselineLocks;
  }, 60_000);

  afterAll(async () => {
    report.advisoryLocksAfter = await advisoryLocksNow();
    console.info(`[neon-smoke] ${JSON.stringify(report, null, 2)}`);
    await prisma.$disconnect();
  });

  it("1. an uncontended lock is acquired and released within the latency budget", async () => {
    const pings: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      await prisma.$queryRawUnsafe("SELECT 1");
      pings.push(performance.now() - t0);
    }
    const rtt = median(pings);
    const nearDatabase = rtt < 60;
    const acquireBudget = nearDatabase ? MAX_ACQUIRE_MS : Math.ceil(2.6 * rtt + 40);
    const releaseBudget = nearDatabase ? MAX_RELEASE_MS : Math.ceil(1.6 * rtt + 40);

    const acquireTimes: number[] = [];
    const releaseTimes: number[] = [];
    const lock = createPrismaAdvisoryLock(prisma, { onAcquired: (_id, took) => acquireTimes.push(took) });

    for (let run = 0; run < 8; run++) {
      const started = performance.now();
      let taskMs = 0;
      await lock(waId(), async () => {
        const inside = performance.now();
        await prisma.$queryRawUnsafe("SELECT 1");
        taskMs = performance.now() - inside;
      });
      const total = performance.now() - started;
      releaseTimes.push(total - acquireTimes[run] - taskMs);
    }

    const warmAcquire = median(acquireTimes.slice(1));
    const warmRelease = median(releaseTimes.slice(1));
    report.networkRttMs = ms(rtt);
    report.acquireMs = {
      first: ms(acquireTimes[0]),
      warmMedian: ms(warmAcquire),
      max: ms(Math.max(...acquireTimes)),
      inRoundTrips: Number((warmAcquire / rtt).toFixed(2)),
      absoluteBudgetMet: warmAcquire < MAX_ACQUIRE_MS,
      budgetUsedMs: acquireBudget,
    };
    report.releaseMs = {
      first: ms(releaseTimes[0]),
      warmMedian: ms(warmRelease),
      max: ms(Math.max(...releaseTimes)),
      absoluteBudgetMet: warmRelease < MAX_RELEASE_MS,
      budgetUsedMs: releaseBudget,
    };
    report.budgetMode = nearDatabase ? "absolute (near the database)" : "network-normalized (far from the database)";

    expect(warmAcquire, "median warm acquisition").toBeLessThan(acquireBudget);
    expect(warmRelease, "median warm release (COMMIT)").toBeLessThan(releaseBudget);
  }, 60_000);

  it("2. four concurrent requests for the SAME waId are serialized by Postgres itself (no deadlock)", async () => {
    const lock = createPrismaAdvisoryLock(prisma, { maxConcurrent: 4, lockTimeoutMs: 20_000 });
    const same = waId();
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];

    const started = performance.now();
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        lock(same, async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await prisma.$queryRawUnsafe("SELECT 1");
          await sleep(120);
          order.push(n);
          active--;
        }),
      ),
    );
    const elapsed = performance.now() - started;

    report.sameWaId4 = { maxActive, elapsedMs: ms(elapsed), order };
    expect(maxActive).toBe(1);
    expect(order).toHaveLength(4);
    expect(elapsed).toBeLessThan(15_000);
  }, 60_000);

  it("3. both layers together: 4 concurrent turns for one waId, repeated, never overlap or fail", async () => {
    const lock = createTurnLock({ dbLock: createPrismaAdvisoryLock(prisma, { maxConcurrent: 4 }) });
    let overlapped = 0;

    for (let round = 0; round < 3; round++) {
      const same = waId();
      let active = 0;
      await Promise.all(
        [1, 2, 3, 4].map(() =>
          lock(same, async () => {
            active++;
            if (active > 1) overlapped++;
            await prisma.$queryRawUnsafe("SELECT 1");
            await sleep(60);
            active--;
          }),
        ),
      );
    }

    report.bothLayers = { rounds: 3, overlapped };
    expect(overlapped).toBe(0);
  }, 90_000);

  it("4. TURN_LOCK_MAX_CONCURRENCY = 4 never starves the shared pool", async () => {
    const lock = createPrismaAdvisoryLock(prisma, { maxConcurrent: 4 });
    let heldNow = 0;
    let peakHeld = 0;
    let peakAdvisory = 0;

    const started = performance.now();
    const holders = Array.from({ length: 12 }, () =>
      lock(waId(), async () => {
        heldNow++;
        peakHeld = Math.max(peakHeld, heldNow);
        for (let query = 0; query < 3; query++) await prisma.$queryRawUnsafe("SELECT 1");
        const advisory = await advisoryLocksNow();
        if (advisory !== null) peakAdvisory = Math.max(peakAdvisory, advisory);
        await sleep(150);
        heldNow--;
      }),
    );
    const outsiders = Array.from({ length: 6 }, async () => {
      const t0 = performance.now();
      await prisma.$queryRawUnsafe("SELECT 1");
      return performance.now() - t0;
    });

    const outsiderLatencies = await Promise.all(outsiders);
    await Promise.all(holders);
    const elapsed = performance.now() - started;

    report.pool = {
      concurrentCitizens: 12,
      peakLockHolders: peakHeld,
      peakAdvisoryLocksSeenInDb: peakAdvisory,
      outsiderQueryMaxMs: ms(Math.max(...outsiderLatencies)),
      totalMs: ms(elapsed),
    };

    expect(peakHeld).toBeLessThanOrEqual(4);
    expect(Math.max(...outsiderLatencies), "unrelated queries were not starved").toBeLessThan(5000);
    expect(elapsed).toBeLessThan(30_000);
  }, 90_000);

  it("5. a second instance waiting past lock_timeout is aborted cleanly (real 55P03 mapping), then the lock is free again", async () => {
    const holderInstance = createPrismaAdvisoryLock(prisma, { lockTimeoutMs: 10_000 });
    const impatientInstance = createPrismaAdvisoryLock(prisma, { lockTimeoutMs: 400 });
    const nextInstance = createPrismaAdvisoryLock(prisma, { lockTimeoutMs: 5000 });
    const same = waId();

    const holder = holderInstance(same, async () => {
      await sleep(1600);
    });
    await sleep(300);

    const waitStarted = performance.now();
    const error = await impatientInstance(same, async () => "never").catch((caught) => caught);
    const abortedAfter = performance.now() - waitStarted;

    await holder;

    const handoffStarted = performance.now();
    await nextInstance(same, async () => "free");
    const handoff = performance.now() - handoffStarted;

    report.timeout = { abortedAfterMs: ms(abortedAfter), errorLayer: (error as TurnLockTimeoutError).layer, handoffAfterReleaseMs: ms(handoff) };

    expect(error).toBeInstanceOf(TurnLockTimeoutError);
    expect(error).toMatchObject({ layer: "database" });
    expect(abortedAfter).toBeGreaterThan(300);
    expect(abortedAfter).toBeLessThan(2000);
    expect(handoff, "acquiring right after release").toBeLessThan(MAX_ACQUIRE_MS * 3);
  }, 60_000);

  it("6. no advisory lock is left behind after everything finished", async () => {
    await sleep(500);
    const after = await advisoryLocksNow();

    if (baselineLocks === null || after === null) return;
    expect(after).toBeLessThanOrEqual(baselineLocks);
  }, 30_000);
});
