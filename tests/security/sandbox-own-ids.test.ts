import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@/lib/fsm/core/types";
import { SessionState } from "@/lib/enums/session-state";

const store = vi.hoisted(() => ({ sessions: new Map<string, Session>() }));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
  sessionRowExists: async (from: string) => store.sessions.has(from),
  resetSession: async (from: string) => {
    store.sessions.delete(from);
  },
  closeSession: async (from: string) => {
    store.sessions.delete(from);
  },
}));

import { POST } from "@/app/api/sandbox/route";

const MENU: Session = { state: SessionState.MAIN_MENU, slots: {}, counters: {} };

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  store.sessions.clear();
});

describe("the Chat-bot only speaks for its own identifiers", () => {
  it.each([
    ["a real WhatsApp number", "51987654321"],
    ["a closed session id", "cerrada-sandbox-x-1"],
    ["the bare prefix", "sandbox-"],
  ])("rejects %s as from with 400 INVALID_BODY and touches no session", async (_case, from) => {
    store.sessions.set(from, MENU);

    const response = await post({ from, type: "text", text: "hola" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_BODY" });
    expect(store.sessions.get(from)).toEqual(MENU);
  });

  it("accepts its own sandbox- identifier", async () => {
    const response = await post({ from: "sandbox-propio", type: "text", text: "hola" });

    expect(response.status).toBe(200);
  });

  it("a reset of everyone only resets the caller's own conversation", async () => {
    store.sessions.set("sandbox-mia", MENU);
    store.sessions.set("sandbox-de-otra-persona", MENU);

    const response = await post({ from: "sandbox-mia", type: "text", resetAll: true });

    expect(response.status).toBe(200);
    expect(store.sessions.get("sandbox-de-otra-persona")).toEqual(MENU);
  });
});
