import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/fsm/core/types";

// The turn executor with a real trace, an in-memory session store and the fake
// MINSA/Gemini adapters: what a turn leaves in the logs, end to end.
const store = vi.hoisted(() => ({ sessions: new Map<string, Session>() }));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) =>
    structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
}));

import { configureLogger } from "@/lib/observability/logger";
import { deriveTraceId } from "@/lib/observability/tracer";
import { runTurnUnlocked } from "@/lib/fsm/core/executor";

type Line = Record<string, unknown> & { level: string; event: string; traceId?: string };

let raw: string[] = [];
let restore: () => void;
const lines = () => raw.map((line) => JSON.parse(line) as Line);
const event = (name: string) => lines().find((line) => line.event === name);

const FROM = "51999000111";
const DNI = "12345678";
const text = (value: string, messageId?: string) => ({ from: FROM, type: "text" as const, text: value, messageId });

beforeEach(() => {
  raw = [];
  store.sessions.clear();
  restore = configureLogger({ sink: (_level, line) => raw.push(line), level: "info" });
});
afterEach(() => restore());

describe("what a turn leaves in the logs", () => {
  it("a clear cita request: start, the shortcut that decided it, and the end with the seeded slots — all under one traceId", async () => {
    await runTurnUnlocked(FROM, text("Quiero una cita en San Juan de Lurigancho para medicina general", "wamid.1"));

    const id = deriveTraceId(FROM, "wamid.1");
    expect(lines().map((line) => line.event)).toEqual(["turn.start", "turn.note", "turn.end"]);
    expect(lines().every((line) => line.traceId === id)).toBe(true);

    expect(event("turn.start")).toMatchObject({ waId: "...0111", stateBefore: "main_menu", eventType: "text" });
    expect(event("turn.note")).toMatchObject({ kind: "shortcut", name: "cita_request" });
    expect(event("turn.end")).toMatchObject({
      stateAfter: "cita_awaiting_dni",
      notes: ["shortcut"],
      externalCalls: 0,
      slots: { citaEspecialidadHintText: "Medicina General", citaDistritoHintText: "San Juan de Lurigancho" },
    });
    expect(typeof event("turn.end")?.durationMs).toBe("number");
  });

  it("a DNI turn: times the call to MINSA, and neither the DNI nor a token ever appears", async () => {
    store.sessions.set(FROM, { state: "cita_awaiting_dni", slots: {}, counters: {} });

    await runTurnUnlocked(FROM, text(DNI));

    expect(event("turn.start")).toMatchObject({ stateBefore: "cita_awaiting_dni", inputLength: 8 });
    expect(event("turn.start")).not.toHaveProperty("inputPreview");
    expect(event("turn.external")).toMatchObject({
      service: "minsa",
      operation: "validate_user",
      outcome: "ok",
      resultStatus: "valid",
    });
    expect(event("turn.end")).toMatchObject({
      stateAfter: "cita_awaiting_otp",
      externalCalls: 1,
      slots: { citaDniPending: "****5678" },
    });
    expect(raw.join("\n")).not.toContain(DNI);
  });

  it("an expired session: a warning with the reason and how long it was idle, and no token", async () => {
    const stale = new Date(Date.now() - 15 * 60_000);
    store.sessions.set(FROM, {
      state: "cita_awaiting_hora_select",
      slots: { citaBearer: "header.payload.signature-of-a-real-token", citaDni: DNI },
      counters: {},
      updatedAt: stale,
    });

    await runTurnUnlocked(FROM, text("Miraflores"));

    const note = event("turn.note");
    expect(note).toMatchObject({ level: "warn", kind: "session_expired", reason: "IDLE_TIMEOUT", state: "cita_awaiting_hora_select" });
    expect(note?.idleMs as number).toBeGreaterThanOrEqual(15 * 60_000);
    expect(event("turn.end")).toMatchObject({ stateAfter: "cita_awaiting_reauth", slots: { citaDni: "****5678" } });
    expect(raw.join("\n")).not.toContain("signature-of-a-real-token");
    expect(raw.join("\n")).not.toContain(DNI);
  });

  it("a confirmation that reads UNKNOWN is a warning that says which step", async () => {
    store.sessions.set(FROM, {
      state: "cita_awaiting_hora_confirm",
      slots: { citaBearer: "t", citaHoraConfirmId: "13:45|13:50" },
      counters: {},
    });

    await runTurnUnlocked(FROM, text("si pero mejor a las 3"));

    expect(event("turn.note")).toMatchObject({ level: "warn", kind: "confirmation_unknown", step: "hora_confirm" });
    expect(event("turn.end")).toMatchObject({ stateAfter: "cita_awaiting_hora_confirm", friction: "no_progress" });
  });

  it("a menu that answers a typed message with the menu again is flagged as a loop, with the AI call timed", async () => {
    await runTurnUnlocked(FROM, text("blah blah sin sentido"));

    expect(lines().map((line) => line.event)).toEqual(["turn.start", "turn.external", "turn.note", "turn.end"]);
    expect(event("turn.external")).toMatchObject({ service: "gemini", operation: "analyze_main_menu_intent" });
    expect(event("turn.note")).toMatchObject({ level: "warn", kind: "menu_fallback", reason: "intent_unclear" });
    expect(event("turn.end")).toMatchObject({ level: "warn", stateAfter: "main_menu", friction: "menu_loop" });
  });

  it("the same message delivered twice gets the same traceId", async () => {
    await runTurnUnlocked(FROM, text("hola", "wamid.retry"));
    const first = event("turn.start")?.traceId;
    raw = [];
    store.sessions.clear();

    await runTurnUnlocked(FROM, text("hola", "wamid.retry"));

    expect(event("turn.start")?.traceId).toBe(first);
  });
});
