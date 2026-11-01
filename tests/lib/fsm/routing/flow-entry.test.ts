import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMenuEffect, offerReferenciaChoice, outOfScopeReply } from "@/lib/fsm/routing/flow-entry";
import { SERVICE_DISABLED_CITA_TEXT } from "@/lib/constants/textos/menu";
import { SessionChannel } from "@/lib/enums/session-channel";
import { oosMessage } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OosCategory } from "@/lib/enums/oos-category";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import type { Session } from "@/lib/fsm/core/types";

afterEach(() => {
  vi.unstubAllEnvs();
});

const channel = SessionChannel.WHATSAPP;
const slots: Session["slots"] = { [SlotKey.INITIAL_MESSAGE_TEXT]: "hola" };

const PLAIN_TEXT_CATEGORIES: Exclude<OosCategory, OosCategory.OOS_03>[] = [OosCategory.OOS_02, OosCategory.OOS_05, OosCategory.OOS_09];

describe("outOfScopeReply", () => {
  it("offers the referencia choice when the request is about a referencia (OOS-03)", () => {
    expect(outOfScopeReply(OosCategory.OOS_03, channel, slots)).toEqual(offerReferenciaChoice(slots));
  });

  it("does not offer the referencia choice when the referencias are off: says what is left and shows the menu", () => {
    vi.stubEnv("REFERENCIAS_ENABLED", "false");
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    const result = outOfScopeReply(OosCategory.OOS_03, channel, slots);

    expect(result.session.state).toBe(SessionState.MAIN_MENU);
    expect(result.effects).toEqual([{ kind: SendType.TEXT, text: SERVICE_DISABLED_CITA_TEXT }, buildMenuEffect(channel)]);
  });

  it.each(PLAIN_TEXT_CATEGORIES)("answers %s with its fixed text and stays in the main menu keeping the slots", (category) => {
    const result = outOfScopeReply(category, channel, slots);

    expect(result.session).toEqual({ state: SessionState.MAIN_MENU, slots, counters: {} });
    expect(result.effects).toEqual([{ kind: SendType.TEXT, text: oosMessage(category) }]);
    expect(result.notes).toBeUndefined();
  });

  it("starts from empty slots when none are given", () => {
    expect(outOfScopeReply(OosCategory.OOS_02, channel).session.slots).toEqual({});
  });
});
