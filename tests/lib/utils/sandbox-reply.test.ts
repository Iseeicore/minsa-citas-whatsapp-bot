import { describe, expect, it } from "vitest";
import { SANDBOX_VISIBLE_SLOT_KEYS, SANDBOX_WITHHELD_SLOT_KEYS } from "@/lib/constants/sandbox-visible-slots";
import { CounterKey } from "@/lib/enums/counter-key";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import type { Session } from "@/lib/fsm/core/types";
import { buildSandboxReply } from "@/lib/utils/sandbox-reply";

const FAKE_JWT = "fake.jwt.value";
const FAKE_DNI = "00000000";
const SENT = [{ kind: SendType.TEXT as const, text: "hola" }];

function sessionWithEverySlot(): Session {
  const slots = Object.fromEntries(Object.values(SlotKey).map((key) => [key, `valor-${key}`]));
  slots[SlotKey.CITA_BEARER] = FAKE_JWT;
  slots[SlotKey.CITA_DNI] = FAKE_DNI;
  return {
    state: SessionState.CITA_AWAITING_DISTRITO,
    slots,
    counters: { [CounterKey.CITA_OTP_ATTEMPTS]: 2 },
  };
}

describe("buildSandboxReply", () => {
  it("classifies every slot key exactly once as visible or withheld", () => {
    const visible: string[] = [...SANDBOX_VISIBLE_SLOT_KEYS];
    const withheld: string[] = [...SANDBOX_WITHHELD_SLOT_KEYS];

    expect(visible.filter((key) => withheld.includes(key))).toEqual([]);
    expect([...visible, ...withheld].sort()).toEqual(Object.values(SlotKey).sort());
  });

  it("never carries the token or the document anywhere in the serialized reply", () => {
    const serialized = JSON.stringify(buildSandboxReply(SENT, sessionWithEverySlot()));

    expect(serialized).not.toContain(FAKE_JWT);
    expect(serialized).not.toContain(FAKE_DNI);
  });

  it("returns only the allowed slots", () => {
    const { session } = buildSandboxReply(SENT, sessionWithEverySlot());

    expect(Object.keys(session.slots).sort()).toEqual([...SANDBOX_VISIBLE_SLOT_KEYS].sort());
  });

  it.each(SANDBOX_WITHHELD_SLOT_KEYS)("withholds %s", (key) => {
    const { session } = buildSandboxReply(SENT, sessionWithEverySlot());

    expect(session.slots).not.toHaveProperty(key);
  });

  it("keeps the sent effects, the state and the counters", () => {
    const reply = buildSandboxReply(SENT, sessionWithEverySlot());

    expect(reply.sent).toEqual(SENT);
    expect(reply.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO);
    expect(reply.session.counters).toEqual({ [CounterKey.CITA_OTP_ATTEMPTS]: 2 });
  });

  it("does not mutate the session it receives", () => {
    const session = sessionWithEverySlot();
    const before = structuredClone(session);

    buildSandboxReply(SENT, session);

    expect(session).toEqual(before);
  });
});
