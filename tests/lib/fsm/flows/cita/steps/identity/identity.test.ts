import { describe, expect, it } from "vitest";
import { handleRegistrationWait, handleVerifyPending } from "@/lib/fsm/flows/cita/steps/identity/identity";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { VERIFIED_ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-identidad";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { RegistrationButtonId } from "@/lib/enums/registration-button-id";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";

const FROM = "51999000111";
const DNI = "12345678";

const verified: QueryResultEvent = {
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind: QueryKind.VERIFY_CODE,
  result: { status: VerifyCodeStatus.VERIFIED, token: "token-real" },
};

function verifyPending(slots: Session["slots"] = {}): Session {
  return {
    state: SessionState.CITA_VERIFY_PENDING,
    slots: { [SlotKey.CITA_DNI_PENDING]: DNI, [SlotKey.CITA_TWOFA_ID]: "twofa", ...slots },
    counters: {},
  };
}

describe("handleVerifyPending", () => {
  it("continues the appointment with the district right after the code, without consulting references", () => {
    const result = handleVerifyPending(verifyPending(), verified);

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(result.effects).toEqual([{ kind: SendType.TEXT, text: VERIFIED_ASK_DISTRITO_TEXT }]);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
  });

  it("keeps the identity it verified for the rest of the appointment", () => {
    const result = handleVerifyPending(verifyPending(), verified);

    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe(DNI);
  });

  it("consults the references only when the person came for «Cita con referencia»", () => {
    const result = handleVerifyPending(verifyPending({ [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS }), verified);

    expect(result.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
    expect(result.effects.filter(isQueryEffect).map((effect) => effect.kind)).toEqual([QueryKind.LIST_REFERENCES]);
  });
});

describe("handleRegistrationWait", () => {
  it("validates the document again without an interim message", () => {
    const session: Session = {
      state: SessionState.CITA_REGISTRATION_WAIT,
      slots: { [SlotKey.CITA_DNI_PENDING]: DNI },
      counters: {},
    };
    const retry: InboundEvent = { from: FROM, type: "button", listId: RegistrationButtonId.RETRY };

    const result = handleRegistrationWait(session, retry);

    expect(result.session.state).toBe(SessionState.CITA_VALIDATE_PENDING);
    expect(result.effects.every(isQueryEffect)).toBe(true);
    expect(result.effects.filter(isQueryEffect).map((effect) => effect.kind)).toEqual([QueryKind.VALIDATE_USER]);
  });
});
