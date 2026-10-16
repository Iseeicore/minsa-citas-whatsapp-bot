import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerResult, InboundEvent, Session, SessionChannel } from "@/lib/fsm/core/types";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionChannel as Channel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";

const store = vi.hoisted(() => ({ sessions: new Map<string, Session>() }));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
}));

vi.mock("@/lib/fsm/parsing/ai/main-menu-intent", () => ({
  analyzeMainMenuIntent: async () => ({ intent: "fuera_de_alcance" }),
}));

import { runTurnUnlocked } from "@/lib/fsm/core/executor";

const FROM = "51999000333";

const startWithAiQuery = (): HandlerResult => ({
  session: { state: SessionState.MAIN_MENU_INTENT_PENDING, slots: {}, counters: {} },
  effects: [{ kind: QueryKind.ANALYZE_MAIN_MENU_INTENT, payload: { text: "dame un codigo" } }],
  outcome: "awaiting_query",
});

const eventIn = (channel: SessionChannel): InboundEvent => ({ from: FROM, type: "text", text: "dame un codigo", channel });

async function menuRowIds(channel: SessionChannel): Promise<string[]> {
  const { sent } = await runTurnUnlocked(FROM, eventIn(channel), undefined, startWithAiQuery());
  const list = sent.find((effect) => effect.kind === "send_interactive_list");
  return list?.kind === "send_interactive_list" ? list.rows.map((row) => row.id) : [];
}

beforeEach(() => {
  store.sessions.clear();
});

describe("the executor hands the channel of the turn to the answer of a query", () => {
  it("the web menu shown after the AI answered keeps the Consultar referencia row", async () => {
    expect(await menuRowIds(Channel.WEB)).toContain(MenuChoice.CONSULTAR_REFERENCIA);
  });

  it("the whatsapp menu shown after the AI answered does not have it", async () => {
    expect(await menuRowIds(Channel.WHATSAPP)).not.toContain(MenuChoice.CONSULTAR_REFERENCIA);
  });
});
