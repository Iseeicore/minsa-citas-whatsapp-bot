import { describe, expect, it } from "vitest";
import { SESSION_IDLE_TIMEOUT_MS } from "@/lib/fsm/session/session-expiry-guard";
import { createMemorySessionStore, MEMORY_SESSION_TTL_MS } from "@/lib/fsm/session/memory-session-store";
import type { Session } from "@/lib/fsm/core/types";
import { CounterKey } from "@/lib/enums/counter-key";
import { SlotKey } from "@/lib/enums/slot-key";
import { CLOSED_SESSION_ID_PREFIX } from "@/lib/constants/session-ids";

function clock(start = Date.UTC(2026, 8, 25, 12)) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

const session = (state: Session["state"], slots: Session["slots"] = {}): Session => ({ state, slots, counters: {} });

describe("createMemorySessionStore", () => {
  it("returns a fresh main-menu session for an unknown citizen", async () => {
    const store = createMemorySessionStore();
    await expect(store.getSession("51999")).resolves.toEqual({ state: "main_menu", slots: {}, counters: {} });
    await expect(store.sessionRowExists("51999")).resolves.toBe(false);
    await expect(store.findSession("51999")).resolves.toBeUndefined();
  });

  it("keeps what was saved, stamped with the save time as updatedAt", async () => {
    const time = clock();
    const store = createMemorySessionStore({ now: time.now });
    await store.saveSession("51999", session("cita_awaiting_dni", { [SlotKey.CITA_DISTRITO]: "ATE" }));

    const read = await store.getSession("51999");
    expect(read.state).toBe("cita_awaiting_dni");
    expect(read.slots).toEqual({ [SlotKey.CITA_DISTRITO]: "ATE" });
    expect(read.updatedAt).toEqual(new Date(time.now()));
    await expect(store.sessionRowExists("51999")).resolves.toBe(true);
    await expect(store.findSession("51999")).resolves.toEqual({ state: "cita_awaiting_dni" });
  });

  it("stores a copy: mutating the saved or the read object never changes the stored session", async () => {
    const store = createMemorySessionStore();
    const saved = session("main_menu", { [SlotKey.CITA_DISTRITO]: "ATE" });
    await store.saveSession("51999", saved);
    saved.slots[SlotKey.CITA_DISTRITO] = "CHANGED";

    const read = await store.getSession("51999");
    read.slots[SlotKey.CITA_DISTRITO] = "ALSO CHANGED";

    expect((await store.getSession("51999")).slots[SlotKey.CITA_DISTRITO]).toBe("ATE");
  });

  it("forgets one citizen on reset, and only the sandbox- sessions on reset-all", async () => {
    const store = createMemorySessionStore();
    await store.saveSession("51999", session("main_menu"));
    await store.saveSession("sandbox-a", session("main_menu"));
    await store.saveSession("sandbox-b", session("main_menu"));

    await store.resetSession("sandbox-a");
    await expect(store.sessionRowExists("sandbox-a")).resolves.toBe(false);

    await store.resetAllSandboxTestSessions();
    await expect(store.sessionRowExists("sandbox-b")).resolves.toBe(false);
    await expect(store.sessionRowExists("51999")).resolves.toBe(true);
  });

  it("keeps an idle session long enough for the idle-expiry guard to see it", () => {
    expect(MEMORY_SESSION_TTL_MS).toBeGreaterThan(SESSION_IDLE_TIMEOUT_MS);
  });

  it("evicts a session idle for longer than the TTL, so memory cannot grow without bound", async () => {
    const time = clock();
    const store = createMemorySessionStore({ now: time.now, ttlMs: 1000 });
    await store.saveSession("idle", session("cita_awaiting_dni"));
    time.advance(500);
    await store.saveSession("active", session("main_menu"));
    time.advance(600);

    await expect(store.sessionRowExists("idle")).resolves.toBe(false);
    await expect(store.sessionRowExists("active")).resolves.toBe(true);
    expect(store.size()).toBe(1);
  });

  it("a save refreshes the TTL", async () => {
    const time = clock();
    const store = createMemorySessionStore({ now: time.now, ttlMs: 1000 });
    await store.saveSession("51999", session("main_menu"));
    time.advance(900);
    await store.saveSession("51999", session("cita_awaiting_dni"));
    time.advance(900);

    await expect(store.sessionRowExists("51999")).resolves.toBe(true);
  });

  describe("closeSession", () => {
    it("moves the session under a closed id keeping its data and modification time, and frees the original id", async () => {
      const time = clock();
      const store = createMemorySessionStore({ now: time.now });
      await store.saveSession("sandbox-a", {
        state: "cita_awaiting_dni",
        slots: { [SlotKey.CITA_DISTRITO]: "ATE" },
        counters: { [CounterKey.CITA_HORA_PAGE]: 2 },
      });
      const savedAt = time.now();
      time.advance(5000);

      await store.closeSession("sandbox-a");
      await store.closeSession("sandbox-missing");

      await expect(store.sessionRowExists("sandbox-a")).resolves.toBe(false);
      await expect(store.getSession(`${CLOSED_SESSION_ID_PREFIX}sandbox-a-${time.now()}`)).resolves.toEqual({
        state: "cita_awaiting_dni",
        slots: { [SlotKey.CITA_DISTRITO]: "ATE" },
        counters: { [CounterKey.CITA_HORA_PAGE]: 2 },
        updatedAt: new Date(savedAt),
      });

      await store.saveSession("sandbox-a", session("main_menu"));
      expect(store.size()).toBe(2);
    });

    it("reset-all removes the sandbox sessions but keeps the closed ones", async () => {
      const store = createMemorySessionStore();
      await store.saveSession("sandbox-a", session("main_menu"));
      await store.saveSession("sandbox-b", session("main_menu"));
      await store.closeSession("sandbox-a");

      await store.resetAllSandboxTestSessions();

      expect(store.size()).toBe(1);
    });

    it("closed sessions still expire with the TTL", async () => {
      const time = clock();
      const store = createMemorySessionStore({ now: time.now, ttlMs: 1000 });
      await store.saveSession("sandbox-a", session("main_menu"));
      await store.closeSession("sandbox-a");
      time.advance(1001);

      expect(store.size()).toBe(0);
    });
  });
});
