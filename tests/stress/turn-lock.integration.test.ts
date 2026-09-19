import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/fsm/types";

// The real session store is Postgres over the network. Here it is an in-memory
// map with latency that ALSO measures overlap: a turn is one getSession followed
// by one saveSession, so two getSession calls without a saveSession in between
// means two turns were inside the critical section at once.
const db = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  open: new Map<string, number>(),
  maxOpen: 0,
  readOrder: [] as string[],
  minMs: 8,
  maxMs: 20,
}));

vi.mock("@/lib/fsm/session-store", () => {
  const wait = () =>
    new Promise<void>((resolve) => setTimeout(resolve, db.minMs + Math.random() * (db.maxMs - db.minMs)));

  return {
    getSession: async (from: string) => {
      const open = (db.open.get(from) ?? 0) + 1;
      db.open.set(from, open);
      db.maxOpen = Math.max(db.maxOpen, open);
      await wait();
      const stored = db.sessions.get(from);
      return stored ? structuredClone(stored) : { state: "main_menu", slots: {}, counters: {} };
    },
    saveSession: async (from: string, session: unknown) => {
      await wait();
      db.sessions.set(from, structuredClone(session));
      db.open.set(from, (db.open.get(from) ?? 1) - 1);
    },
  };
});

import { createRunTurn, runTurn, runTurnUnlocked } from "@/lib/fsm/executor";
import { createTurnLock, TurnLockTimeoutError } from "@/lib/fsm/turn-lock";
import { createPrismaAdvisoryLock, type AdvisoryLockClient } from "@/lib/fsm/turn-lock-db";

const text = (waId: string, value: string) => ({ from: waId, type: "text" as const, text: value });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// A Postgres stand-in with the semantics that matter: advisory locks BLOCK
// until the holder's transaction ends, honor `SET LOCAL lock_timeout`, and are
// released when the transaction finishes (commit, rollback or error).
function createFakePostgres(): AdvisoryLockClient {
  const held = new Map<string, Promise<void>>();

  return {
    async $transaction(callback) {
      const releases: Array<() => void> = [];
      let lockTimeoutMs = Infinity;

      const tx = {
        async $executeRawUnsafe(sql: string, ...values: unknown[]) {
          if (sql.startsWith("SET LOCAL lock_timeout")) {
            lockTimeoutMs = Number(sql.split("=")[1]);
            return 0;
          }

          if (sql.includes("pg_advisory_xact_lock")) {
            const key = String(values[0]);
            const deadline = Date.now() + lockTimeoutMs;

            for (let current = held.get(key); current; current = held.get(key)) {
              const remaining = deadline - Date.now();
              const timedOut = await Promise.race([
                current.then(() => false),
                sleep(Math.max(0, remaining)).then(() => true),
              ]);
              if (timedOut) {
                throw Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
              }
            }

            let release!: () => void;
            held.set(
              key,
              new Promise<void>((resolve) => {
                release = () => {
                  held.delete(key);
                  resolve();
                };
              }),
            );
            releases.push(release);
          }
          return 0;
        },
      };

      try {
        return await callback(tx);
      } finally {
        releases.forEach((release) => release());
      }
    },
  };
}

// A dependent chain: each message only makes sense in the state the previous
// one produced.
const CHAIN = ["Hola", "quiero una cita de odontología", "12345678", "1234", "en Lurigancho"];

async function sequentialFinal(waId: string): Promise<Session> {
  db.sessions.delete(waId);
  for (const message of CHAIN) await runTurnUnlocked(waId, text(waId, message));
  return db.sessions.get(waId) as Session;
}

beforeEach(() => {
  db.sessions.clear();
  db.open.clear();
  db.maxOpen = 0;
  db.readOrder.length = 0;
  db.minMs = 8;
  db.maxMs = 20;
});

describe("5 simultaneous runTurn calls for one waId", () => {
  it("never overlap, and end exactly where sequential processing ends", async () => {
    const expected = await sequentialFinal("wa-expected");
    db.maxOpen = 0;

    // Fired in the same tick: the worst case for a read-modify-write.
    await Promise.all(CHAIN.map((message) => runTurn("wa-five", text("wa-five", message))));

    const final = db.sessions.get("wa-five") as Session;
    expect(db.maxOpen).toBe(1);
    expect(final.state).toBe(expected.state);
    expect(final.slots).toEqual(expected.slots);
    expect(final.counters).toEqual(expected.counters);
    expect(final.state).toBe("cita_awaiting_fecha_select");
  }, 60_000);

  it("holds over 15 repetitions (no flaky interleaving)", async () => {
    const expected = await sequentialFinal("wa-expected");

    for (let run = 0; run < 15; run++) {
      db.sessions.delete("wa-repeat");
      db.maxOpen = 0;

      await Promise.all(CHAIN.map((message) => runTurn("wa-repeat", text("wa-repeat", message))));

      const final = db.sessions.get("wa-repeat") as Session;
      expect(db.maxOpen, `run ${run}`).toBe(1);
      expect(final.state, `run ${run}`).toBe(expected.state);
    }
  }, 120_000);

  it("the same burst WITHOUT the lock corrupts the state (the defect this fixes)", async () => {
    const expected = await sequentialFinal("wa-expected");

    let corrupted = 0;
    for (let run = 0; run < 6; run++) {
      db.sessions.delete("wa-unlocked");
      db.maxOpen = 0;

      await Promise.all(CHAIN.map((message) => runTurnUnlocked("wa-unlocked", text("wa-unlocked", message))));

      const final = db.sessions.get("wa-unlocked") as Session;
      if (db.maxOpen > 1 || final.state !== expected.state) corrupted++;
    }

    expect(corrupted).toBeGreaterThan(0);
  }, 60_000);
});

describe("two server instances sharing one Postgres", () => {
  const instance = (postgres: AdvisoryLockClient, options: { lockTimeoutMs?: number } = {}) =>
    createRunTurn(createTurnLock({ dbLock: createPrismaAdvisoryLock(postgres, options) }));

  it("the advisory lock serializes turns that land on different instances", async () => {
    const postgres = createFakePostgres();
    const a = instance(postgres);
    const b = instance(postgres);

    // 5 turns of one citizen, alternating instances, all at once.
    await Promise.all(CHAIN.map((message, index) => (index % 2 === 0 ? a : b)("wa-two", text("wa-two", message))));

    expect(db.maxOpen).toBe(1);
  }, 60_000);

  it("wrong OTP codes hitting both instances at once are all counted (no lost update)", async () => {
    const postgres = createFakePostgres();
    const a = instance(postgres);
    const b = instance(postgres);
    db.sessions.set("wa-otp", {
      state: "cita_awaiting_otp",
      slots: { citaTwofaId: "fake-twofa-12345678", citaDniPending: "12345678" },
      counters: {},
    });

    await Promise.all([a("wa-otp", text("wa-otp", "0000")), b("wa-otp", text("wa-otp", "1111"))]);

    const final = db.sessions.get("wa-otp") as Session;
    expect(final.counters.citaOtpAttempts).toBe(2);
    expect(final.state).toBe("cita_awaiting_otp");
  }, 30_000);

  it("evidence: with only the in-process layer, two instances DO lose the update", async () => {
    const a = createRunTurn(createTurnLock({}));
    const b = createRunTurn(createTurnLock({}));

    let lost = 0;
    for (let run = 0; run < 6; run++) {
      db.sessions.set("wa-otp-l1", {
        state: "cita_awaiting_otp",
        slots: { citaTwofaId: "fake-twofa-12345678", citaDniPending: "12345678" },
        counters: {},
      });
      await Promise.all([a("wa-otp-l1", text("wa-otp-l1", "0000")), b("wa-otp-l1", text("wa-otp-l1", "1111"))]);
      if (((db.sessions.get("wa-otp-l1") as Session).counters.citaOtpAttempts ?? 0) < 2) lost++;
    }

    expect(lost).toBeGreaterThan(0);
  }, 30_000);

  it("a turn that waits longer than the lock timeout aborts cleanly and leaves the session untouched", async () => {
    const postgres = createFakePostgres();
    const a = instance(postgres);
    const b = instance(postgres, { lockTimeoutMs: 40 });
    db.minMs = 120; // instance A's turn holds the lock well past B's timeout
    db.maxMs = 120;
    db.sessions.set("wa-timeout", { state: "cita_awaiting_dni", slots: {}, counters: {} });

    const first = a("wa-timeout", text("wa-timeout", "12345678"));
    await sleep(20);
    const second = b("wa-timeout", text("wa-timeout", "99999999"));

    await expect(second).rejects.toBeInstanceOf(TurnLockTimeoutError);
    await first;

    const final = db.sessions.get("wa-timeout") as Session;
    expect(final.slots.citaDniPending).toBe("12345678"); // only A's turn was applied
  }, 30_000);

  it("a turn that throws releases the lock, so the next one is not stuck", async () => {
    const postgres = createFakePostgres();
    const a = instance(postgres);
    const b = instance(postgres);
    db.sessions.set("wa-crash", { state: "no_such_state", slots: {}, counters: {} });

    await expect(a("wa-crash", text("wa-crash", "hola"))).rejects.toThrow(/unknown state/);

    db.sessions.set("wa-crash", { state: "main_menu", slots: {}, counters: {} });
    const result = await b("wa-crash", text("wa-crash", "hola"));
    expect(result.sent.length).toBeGreaterThan(0);
  }, 30_000);
});
