import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import { handleMainMenuIntentPending } from "@/lib/fsm/routing/main-menu";
import { OUT_OF_SCOPE_REQUEST_CITA_TEXT, SERVICE_DISABLED_CITA_TEXT } from "@/lib/constants/textos/menu";
import { FIRST_MESSAGE_REJECTION_CITA_TEXT } from "@/lib/constants/textos/seguridad";
import { checkFirstMessagePayload } from "@/lib/security/payload-filter";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-referencias-off";
const CHANNELS = [SessionChannel.WHATSAPP, SessionChannel.WEB];
const typed = (text: string, channel: SessionChannel): InboundEvent => ({ from: FROM, type: "text", text, channel });
const tapped = (listId: string, channel: SessionChannel): InboundEvent => ({ from: FROM, type: "list", listId, channel });
const at = (state: Session["state"], slots: Session["slots"] = {}): Session => ({ state, slots, counters: {} });
const aiSays = (intent: string, channel: SessionChannel): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind: "analyze_main_menu_intent",
  result: { intent },
  channel,
});

function expectNoticeAndMenu(result: HandlerResult, channel: SessionChannel) {
  expect(result.session.state).toBe(SessionState.MAIN_MENU);
  expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
  expect(result.effects.some(isQueryEffect)).toBe(false);
  expect(result.effects).toEqual([{ kind: "send_text", text: SERVICE_DISABLED_CITA_TEXT }, buildMenuEffect(channel)]);
}

beforeEach(() => {
  vi.stubEnv("INCIDENCIAS_ENABLED", "false");
  vi.stubEnv("REFERENCIAS_ENABLED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("with REFERENCIAS_ENABLED and INCIDENCIAS_ENABLED off", () => {
  it.each(CHANNELS)("the %s menu offers only the cita, also with the variable not defined", (channel) => {
    expect(buildMenuEffect(channel)).toMatchObject({ rows: [{ id: MenuChoice.AGENDAR_CITA }] });

    vi.stubEnv("REFERENCIAS_ENABLED", undefined);
    expect(buildMenuEffect(channel)).toMatchObject({ rows: [{ id: MenuChoice.AGENDAR_CITA }] });
    expectNoticeAndMenu(handle(at(SessionState.MAIN_MENU), typed("referencia", channel)), channel);
  });

  it.each(CHANNELS)("the word, the typed 2, the old row and the AI answer the notice and the menu in %s", (channel) => {
    expectNoticeAndMenu(handle(at(SessionState.MAIN_MENU), typed("quiero consultar mi referencia", channel)), channel);
    expectNoticeAndMenu(handle(at(SessionState.MAIN_MENU), typed("2", channel)), channel);
    expectNoticeAndMenu(handle(at(SessionState.MAIN_MENU), tapped(MenuChoice.CONSULTAR_REFERENCIA, channel)), channel);
    expectNoticeAndMenu(handleMainMenuIntentPending(at(SessionState.MAIN_MENU_INTENT_PENDING), aiSays("referencia", channel)), channel);
    expectNoticeAndMenu(handleFirstContact("referencia", channel), channel);
  });

  it("a session left inside the referencias goes back to the menu with the notice", () => {
    const channel = SessionChannel.WHATSAPP;
    const loggingIn = at(SessionState.CITA_AWAITING_DNI, { [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS });

    expectNoticeAndMenu(handle(at(SessionState.REFERENCIA_AWAITING_CITA_OFFER), typed("si", channel)), channel);
    expectNoticeAndMenu(handle(at(SessionState.MAIN_MENU_REFERENCIA_CHOICE), typed("referencia", channel)), channel);
    expectNoticeAndMenu(handle(loggingIn, typed("12345678", channel)), channel);
  });

  it("the texts that list what the bot offers name only the cita", () => {
    const outOfScope = handleMainMenuIntentPending(
      at(SessionState.MAIN_MENU_INTENT_PENDING),
      aiSays("fuera_de_alcance", SessionChannel.WEB),
    );

    expect(outOfScope.effects[0]).toEqual({ kind: "send_text", text: OUT_OF_SCOPE_REQUEST_CITA_TEXT });
    expect(checkFirstMessagePayload({ type: "text", text: "a".repeat(301) })).toMatchObject({ reply: FIRST_MESSAGE_REJECTION_CITA_TEXT });
  });
});
