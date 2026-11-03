import { expect } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { sendButtons } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult } from "@/lib/fsm/core/types";
import { CUENTA_MINSA_AVISO_BUTTONS, CUENTA_MINSA_AVISO_TEXT } from "@/lib/constants/textos/cita-identidad";
import { CuentaMinsaButtonId } from "@/lib/enums/botones/cuenta-minsa-button-id";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { sent, tap } from "@/tests/support/fsm-events";

export const cuentaMinsaAviso = () => sendButtons(CUENTA_MINSA_AVISO_TEXT, CUENTA_MINSA_AVISO_BUTTONS);

export function confirmCuentaMinsa(result: HandlerResult, channel: SessionChannel = SessionChannel.WHATSAPP): HandlerResult {
  if (channel === SessionChannel.WHATSAPP) {
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    return result;
  }
  expect(result.session.state).toBe(SessionState.CITA_AWAITING_CUENTA_MINSA);
  expect(sent(result).at(-1)).toEqual(cuentaMinsaAviso());
  return handle(result.session, tap(CuentaMinsaButtonId.TIENE, channel));
}
