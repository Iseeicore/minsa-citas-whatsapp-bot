import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/fsm/types";
import { gap } from "../support/known-gap";

// The real session store is Postgres over the network: every turn is
// read -> compute -> write, and a real turn also waits on MINSA/RENIEC/Gemini.
// Here the store is an in-memory map WITH latency so overlapping turns
// interleave the way they do in production.
const db = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  minMs: 30,
  maxMs: 90,
  reads: 0,
  writes: 0,
}));

vi.mock("@/lib/fsm/session-store", () => {
  const wait = () =>
    new Promise<void>((resolve) => setTimeout(resolve, db.minMs + Math.random() * (db.maxMs - db.minMs)));

  return {
    getSession: async (from: string) => {
      db.reads++;
      await wait();
      const stored = db.sessions.get(from);
      return stored ? structuredClone(stored) : { state: "main_menu", slots: {}, counters: {} };
    },
    saveSession: async (from: string, session: unknown) => {
      db.writes++;
      await wait();
      db.sessions.set(from, structuredClone(session));
    },
  };
});

import { runTurn, runTurnUnlocked } from "@/lib/fsm/executor";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Outcome = { state: string; slots: Record<string, unknown>; counters: Record<string, number>; replies: number };

const snapshot = (waId: string, replies: number): Outcome => {
  const session = db.sessions.get(waId) as Session;
  return { state: session.state, slots: session.slots, counters: session.counters, replies };
};

const text = (waId: string, value: string) => ({ from: waId, type: "text" as const, text: value });

async function sequential(waId: string, messages: string[]): Promise<Outcome> {
  db.sessions.delete(waId);
  let replies = 0;
  for (const message of messages) {
    replies += (await runTurn(waId, text(waId, message))).sent.length;
  }
  return snapshot(waId, replies);
}

type TurnFn = typeof runTurn;

// `perSecond` messages/second for the same waId, all launched on a timer and
// therefore in flight at the same time whenever a turn takes longer than the gap.
// Uses the production runTurn (locked) unless told otherwise.
async function burst(waId: string, messages: string[], perSecond: number, turn: TurnFn = runTurn): Promise<Outcome> {
  db.sessions.delete(waId);
  const spacing = 1000 / perSecond;

  const turns = messages.map(async (message, index) => {
    await sleep(index * spacing);
    return turn(waId, text(waId, message));
  });

  const results = await Promise.all(turns);
  return snapshot(waId, results.reduce((total, r) => total + r.sent.length, 0));
}

const same = (a: Outcome, b: Outcome) =>
  a.state === b.state &&
  a.replies === b.replies &&
  JSON.stringify(a.slots) === JSON.stringify(b.slots) &&
  JSON.stringify(a.counters) === JSON.stringify(b.counters);

// Messages that DEPEND on each other: each one is only meaningful in the state
// the previous one produced.
const DEPENDENT_CHAIN = ["Hola", "quiero una cita de odontología", "12345678", "1234"];
// The exact messages from the brief.
const BRIEF_CHAIN = ["Hola", "1", "Medicina general", "1"];

const RUNS = 6;
const LONG = 240_000;

beforeEach(() => {
  db.sessions.clear();
  db.reads = 0;
  db.writes = 0;
  db.minMs = 30; // ~Neon over HTTP from a serverless function
  db.maxMs = 90;
});

describe("B.1 one waId, bursts of 5-10 messages per second (store latency 30-90 ms)", () => {
  it("the sequential baseline is deterministic (the reference for every comparison)", async () => {
    const first = await sequential("wa-baseline", DEPENDENT_CHAIN);
    const second = await sequential("wa-baseline", DEPENDENT_CHAIN);

    expect(first.state).toBe("cita_awaiting_distrito_ai");
    expect(same(first, second)).toBe(true);
  }, LONG);

  // The race needs a turn to last longer than the gap between two messages.
  // Two realistic ways to get there (measured: a 5 msg/s burst against a fast
  // 30-90 ms store did NOT diverge, 0/12; both scenarios below do):
  //  - 10 msg/s against a Neon-like store (30-90 ms per query);
  //  - 5 msg/s when the turn also waits on MINSA / RENIEC / Gemini (modelled as
  //    100-250 ms per store operation).
  const SCENARIOS = [
    { label: "10 msg/s, Neon-like store (30-90 ms)", rate: 10, minMs: 30, maxMs: 90 },
    { label: "5 msg/s, slow turns (100-250 ms)", rate: 5, minMs: 100, maxMs: 250 },
  ];

  // Regression for the race fixed by the per-waId turn lock (lib/fsm/turn-lock.ts):
  // turn N used to read the session before turn N-1 had written it, ran against
  // a stale state, and the last writer won (lost update). runTurn is now locked.
  for (const scenario of SCENARIOS) {
    it(
      `${scenario.label}: a burst reaches the same final state as sequential processing`,
      async () => {
        db.minMs = scenario.minMs;
        db.maxMs = scenario.maxMs;
        const expected = await sequential(`wa-ref-${scenario.rate}`, DEPENDENT_CHAIN);

        let diverged = 0;
        const finals = new Map<string, number>();
        for (let run = 0; run < RUNS; run++) {
          const outcome = await burst(`wa-burst-${scenario.rate}`, DEPENDENT_CHAIN, scenario.rate);
          if (!same(outcome, expected)) diverged++;
          finals.set(outcome.state, (finals.get(outcome.state) ?? 0) + 1);
        }

        console.info(
          `[B.1] ${scenario.label}: ${diverged}/${RUNS} bursts diverged from sequential; final states ${JSON.stringify(
            Object.fromEntries(finals),
          )} (sequential ends in ${expected.state})`,
        );
        expect(diverged).toBe(0);
      },
      LONG,
    );
  }

  it("evidence: WITHOUT the lock (runTurnUnlocked) bursts DO lose updates and end in states the sequential run never reaches", async () => {
    db.minMs = 100;
    db.maxMs = 250;
    const expected = await sequential("wa-ref-evidence", DEPENDENT_CHAIN);

    let diverged = 0;
    const wrongStates = new Set<string>();
    for (let run = 0; run < RUNS; run++) {
      const outcome = await burst("wa-evidence", DEPENDENT_CHAIN, 5, runTurnUnlocked);
      if (!same(outcome, expected)) {
        diverged++;
        wrongStates.add(outcome.state);
      }
    }

    console.info(`[B.1] evidence 5 msg/s, slow turns: ${diverged}/${RUNS} diverged; wrong final states ${[...wrongStates].join(", ")}`);
    expect(diverged).toBeGreaterThan(0);
  }, LONG);

  it("evidence: every turn is one read + one write, so N overlapping turns = N stale reads", async () => {
    await burst("wa-counts", DEPENDENT_CHAIN, 10);

    expect(db.reads).toBe(DEPENDENT_CHAIN.length);
    expect(db.writes).toBe(DEPENDENT_CHAIN.length);
  }, LONG);
});

describe("B.2 the messages from the brief", () => {
  // The brief calls "1" a Cita selection. The approved main-menu rule is that a
  // bare "1"/"2" only shows the static menu (like "hola"), so this sequence
  // never leaves the menu.
  it("current behavior: 'Hola', '1', 'Medicina general', '1' stays in main_menu", async () => {
    const outcome = await sequential("wa-brief", BRIEF_CHAIN);
    expect(outcome.state).toBe("main_menu");
  }, LONG);

  gap("'1' in the main menu selects 'Agendar una cita médica'", async () => {
    const outcome = await sequential("wa-brief-1", ["Hola", "1"]);
    expect(outcome.state).toBe("cita_awaiting_dni");
  }, LONG);
});

describe("B.3 the lock is per waId", () => {
  it("different users are not serialized against each other", async () => {
    db.minMs = 20;
    db.maxMs = 20;

    const started = Date.now();
    await Promise.all(Array.from({ length: 10 }, (_, index) => runTurn(`wa-par-${index}`, text(`wa-par-${index}`, "Hola"))));
    const elapsed = Date.now() - started;

    // One turn = 2 x 20 ms of store latency; 10 users in parallel take about
    // one turn, nowhere near ten (400 ms).
    expect(elapsed).toBeLessThan(200);
  }, LONG);
});

describe("B.4 isolation and throughput: many different users at once", () => {
  it("200 users, each running the 4-message chain, never leak state into each other", async () => {
    db.minMs = 1;
    db.maxMs = 6;

    const expected = await sequential("wa-iso-ref", DEPENDENT_CHAIN);
    const users = Array.from({ length: 200 }, (_, index) => `wa-user-${index}`);

    const started = performance.now();
    const outcomes = await Promise.all(
      users.map(async (waId) => {
        let replies = 0;
        for (const message of DEPENDENT_CHAIN) {
          replies += (await runTurn(waId, text(waId, message))).sent.length;
        }
        return snapshot(waId, replies);
      }),
    );
    const elapsed = performance.now() - started;

    console.info(
      `[B.4] 200 users x ${DEPENDENT_CHAIN.length} turns in ${elapsed.toFixed(0)} ms (${(
        (200 * DEPENDENT_CHAIN.length * 1000) / elapsed
      ).toFixed(0)} turns/s, in-memory store latency 1-6 ms)`,
    );
    expect(outcomes.every((outcome) => same(outcome, expected))).toBe(true);
  }, LONG);
});
