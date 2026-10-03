import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SendEffect, Session } from "@/lib/fsm/core/types";

const store = vi.hoisted(() => ({ sessions: new Map<string, Session>() }));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) =>
    structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
}));

import { runTurnUnlocked, type TurnHooks } from "@/lib/fsm/core/executor";

const FROM = "51999000222";
const text = (value: string) => ({ from: FROM, type: "text" as const, text: value });

function recordingHooks() {
  const calls: Array<{ kind: "send"; effect: SendEffect } | { kind: "wait" }> = [];
  const hooks: TurnHooks = {
    onSend: async (effect) => {
      calls.push({ kind: "send", effect });
    },
    onWaitingForQuery: async () => {
      calls.push({ kind: "wait" });
    },
  };
  return { hooks, calls };
}

describe("runTurnUnlocked with hooks: the citizen sees each message as soon as it exists", () => {
  beforeEach(() => {
    store.sessions.clear();
  });

  it("delivers the message produced before a query, then waits, then delivers the rest", async () => {
    store.sessions.set(FROM, { state: "cita_awaiting_dni", slots: {}, counters: {} });
    const { hooks, calls } = recordingHooks();

    const result = await runTurnUnlocked(FROM, text("12345678"), hooks);

    const waitIndex = calls.findIndex((call) => call.kind === "wait");
    expect(waitIndex).toBeGreaterThan(-1);
    expect(calls.slice(0, waitIndex).every((call) => call.kind === "send")).toBe(true);
    expect(calls.slice(waitIndex + 1).some((call) => call.kind === "send")).toBe(true);

    const delivered = calls.flatMap((call) => (call.kind === "send" ? [call.effect] : []));
    expect(delivered).toEqual(result.sent);
  });

  it("calls onWaitingForQuery once per external query", async () => {
    store.sessions.set(FROM, { state: "cita_awaiting_dni", slots: {}, counters: {} });
    const { hooks, calls } = recordingHooks();

    await runTurnUnlocked(FROM, text("12345678"), hooks);

    const waits = calls.filter((call) => call.kind === "wait").length;
    expect(waits).toBeGreaterThanOrEqual(1);
  });

  it("a turn with no query delivers its messages and never waits", async () => {
    const { hooks, calls } = recordingHooks();

    const result = await runTurnUnlocked(FROM, text("hola"), hooks);

    expect(calls.every((call) => call.kind === "send")).toBe(true);
    expect(calls).toHaveLength(result.sent.length);
  });

  it("without hooks the turn only returns the messages, as before", async () => {
    store.sessions.set(FROM, { state: "cita_awaiting_dni", slots: {}, counters: {} });

    const result = await runTurnUnlocked(FROM, text("12345678"));

    expect(result.sent.length).toBeGreaterThan(0);
  });
});
