import { describe, expect, it } from "vitest";
import { offerReferenciaChoice, outOfScopeReply } from "@/lib/fsm/routing/flow-entry";
import { oosMessage } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OosCategory } from "@/lib/enums/oos-category";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import type { Session } from "@/lib/fsm/core/types";

const slots: Session["slots"] = { [SlotKey.INITIAL_MESSAGE_TEXT]: "hola" };

const PLAIN_TEXT_CATEGORIES: Exclude<OosCategory, OosCategory.OOS_03>[] = [OosCategory.OOS_02, OosCategory.OOS_05, OosCategory.OOS_09];

describe("outOfScopeReply", () => {
  it("offers the referencia choice when the request is about a referencia (OOS-03)", () => {
    expect(outOfScopeReply(OosCategory.OOS_03, slots)).toEqual(offerReferenciaChoice(slots));
  });

  it.each(PLAIN_TEXT_CATEGORIES)("answers %s with its fixed text and stays in the main menu keeping the slots", (category) => {
    const result = outOfScopeReply(category, slots);

    expect(result.session).toEqual({ state: SessionState.MAIN_MENU, slots, counters: {} });
    expect(result.effects).toEqual([{ kind: SendType.TEXT, text: oosMessage(category) }]);
    expect(result.notes).toBeUndefined();
  });

  it("starts from empty slots when none are given", () => {
    expect(outOfScopeReply(OosCategory.OOS_02).session.slots).toEqual({});
  });
});
