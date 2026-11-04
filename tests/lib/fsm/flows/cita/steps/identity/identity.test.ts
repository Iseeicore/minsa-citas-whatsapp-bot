import { describe, expect, it } from "vitest";
import { handleValidatePending } from "@/lib/fsm/flows/cita/steps/identity/identity";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { NO_INSURANCE_TEXT } from "@/lib/constants/textos/cita-identidad";

const validatePending: Session = { state: "cita_validate_pending", slots: { [SlotKey.CITA_DNI_PENDING]: "75969078" }, counters: {} };

const noInsurance: QueryResultEvent = {
  channel: "web",
  from: "sandbox-sin-seguro",
  type: InternalEventType.QUERY_RESULT,
  queryKind: "validate_user",
  result: { status: "no_insurance" },
};

describe("handleValidatePending", () => {
  it("sin seguro, avisa que no es posible continuar, se despide y cierra la conversación", () => {
    const result = handleValidatePending(validatePending, noInsurance);
    const sent = result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

    expect(result.session.state).toBe("cita_no_insurance_closed");
    expect(result.outcome).toBe("closed");
    expect(sent).toEqual([{ kind: "send_text", text: NO_INSURANCE_TEXT }]);
  });
});
