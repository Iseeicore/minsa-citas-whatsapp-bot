import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { QueryKind } from "@/lib/enums/query-kind";
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
}));

vi.mock("@/lib/fsm/routing/first-contact", () => ({
  handleFirstContact: (): HandlerResult => ({
    session: { state: SessionState.MAIN_MENU_INTENT_PENDING, slots: {}, counters: {} },
    effects: [{ kind: QueryKind.ANALYZE_MAIN_MENU_INTENT, payload: { text: "dame un codigo" } }],
    outcome: "awaiting_query",
  }),
}));

vi.mock("@/lib/fsm/parsing/ai/main-menu-intent", () => ({
  analyzeMainMenuIntent: async () => ({ intent: "fuera_de_alcance" }),
}));

import { POST } from "@/app/api/sandbox/route";

const FROM = "sandbox-3f6a9c12-4d5e-4f70-8b82-93a4b5c6d7e8";

type Reply = { sent: Array<{ kind: string; rows?: Array<{ id: string }> }> };

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  store.sessions.clear();
});

describe("the first message of the Sandbox that starts with a query keeps the web channel", () => {
  it("the menu shown after the query still offers Consultar referencia", async () => {
    const request = new NextRequest("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, type: "text", text: "dame un codigo" }),
    });

    const reply = (await (await POST(request)).json()) as Reply;

    const list = reply.sent.find((effect) => effect.kind === "send_interactive_list");
    expect(list?.rows?.map((row) => row.id)).toContain(MenuChoice.CONSULTAR_REFERENCIA);
  });
});
