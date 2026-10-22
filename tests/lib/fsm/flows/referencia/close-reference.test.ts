import { describe, expect, it } from "vitest";
import { closeReferencia } from "@/lib/fsm/flows/referencia/close-reference";
import { REFERENCIA_GOODBYE_TEXT } from "@/lib/constants/textos/referencia";
import { HandlerOutcome } from "@/lib/enums/handler-outcome";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";

describe("closeReferencia", () => {
  it("cierra con la despedida existente y elimina toda información de la sesión", () => {
    const result = closeReferencia();
    expect(result.session).toEqual({ state: SessionState.REFERENCIA_CLOSED, slots: {}, counters: {} });
    expect(result.effects).toEqual([{ kind: SendType.TEXT, text: REFERENCIA_GOODBYE_TEXT }]);
    expect(result.outcome).toBe(HandlerOutcome.CLOSED);
  });
});
