import { describe, expect, it } from "vitest";
import { channelOf } from "@/lib/fsm/core/channel";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import type { Session } from "@/lib/fsm/core/types";

const session = (channel?: Session["channel"]): Session => ({ state: SessionState.MAIN_MENU, slots: {}, counters: {}, channel });

describe("channelOf", () => {
  it("prefers the channel of the event", () => {
    expect(channelOf(session(SessionChannel.WHATSAPP), { channel: SessionChannel.WEB })).toBe(SessionChannel.WEB);
  });

  it("falls back to the channel of the session", () => {
    expect(channelOf(session(SessionChannel.WEB), {})).toBe(SessionChannel.WEB);
    expect(channelOf(session(SessionChannel.WEB))).toBe(SessionChannel.WEB);
  });

  it("falls back to whatsapp when nobody says", () => {
    expect(channelOf(session(), {})).toBe(SessionChannel.WHATSAPP);
    expect(channelOf(session())).toBe(SessionChannel.WHATSAPP);
  });
});
