import { afterEach, describe, expect, it, vi } from "vitest";
import { handleMainMenuIntentPending } from "@/lib/fsm/routing/main-menu";
import { checkFirstMessagePayload } from "@/lib/security/payload-filter";
import { ConsultaService } from "@/lib/services/consulta-service";
import { IncidenciaService } from "@/lib/services/incidencia-service";
import {
  OUT_OF_SCOPE_REQUEST_CITA_REFERENCIA_TEXT,
  OUT_OF_SCOPE_REQUEST_ONLY_CITA_TEXT,
  OUT_OF_SCOPE_REQUEST_TEXT,
  SERVICE_DISABLED_TEXT,
  SERVICE_DISABLED_WEB_TEXT,
} from "@/lib/constants/textos/menu";
import {
  FIRST_MESSAGE_REJECTION_CITA_REFERENCIA_TEXT,
  FIRST_MESSAGE_REJECTION_ONLY_CITA_TEXT,
  FIRST_MESSAGE_REJECTION_TEXT,
  FIRST_MESSAGE_REJECTION_WEB_TEXT,
} from "@/lib/constants/textos/seguridad";
import type { QueryResultEvent, Session, SessionChannel } from "@/lib/fsm/core/types";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { PayloadVerdictKind } from "@/lib/enums/payload-verdict-kind";
import { SessionChannel as Channel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";

afterEach(() => {
  vi.unstubAllEnvs();
});

const FLAG_ON = "true";
const FLAG_OFF = "false";
const TOO_LONG = { type: "text", text: "a".repeat(301) };

const aiSaysOutOfScope = (channel: SessionChannel): QueryResultEvent => ({
  from: "sandbox-channel-copy",
  type: InternalEventType.QUERY_RESULT,
  queryKind: "analyze_main_menu_intent",
  result: { intent: "fuera_de_alcance" },
  channel,
});
const pending: Session = { state: SessionState.MAIN_MENU_INTENT_PENDING, slots: {}, counters: {} };

const outOfScopeText = (channel: SessionChannel): unknown => {
  const first = handleMainMenuIntentPending(pending, aiSaysOutOfScope(channel)).effects[0];
  return first.kind === "send_text" ? first.text : undefined;
};

const rejectionReply = (channel: SessionChannel): string | undefined => {
  const verdict = checkFirstMessagePayload(TOO_LONG, channel);
  return verdict.kind === PayloadVerdictKind.REJECTED ? verdict.reply : undefined;
};

describe("the texts that list what the bot offers follow the channel and the incidencias flag", () => {
  it.each([
    [FLAG_ON, Channel.WHATSAPP, OUT_OF_SCOPE_REQUEST_TEXT],
    [FLAG_ON, Channel.WEB, OUT_OF_SCOPE_REQUEST_TEXT],
    [FLAG_OFF, Channel.WHATSAPP, OUT_OF_SCOPE_REQUEST_ONLY_CITA_TEXT],
    [FLAG_OFF, Channel.WEB, OUT_OF_SCOPE_REQUEST_CITA_REFERENCIA_TEXT],
  ])("the out-of-scope request with the flag %s in %s", (flag, channel, expected) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", flag);

    expect(outOfScopeText(channel)).toBe(expected);
  });

  it.each([
    [FLAG_ON, Channel.WHATSAPP, FIRST_MESSAGE_REJECTION_TEXT],
    [FLAG_ON, Channel.WEB, FIRST_MESSAGE_REJECTION_WEB_TEXT],
    [FLAG_OFF, Channel.WHATSAPP, FIRST_MESSAGE_REJECTION_ONLY_CITA_TEXT],
    [FLAG_OFF, Channel.WEB, FIRST_MESSAGE_REJECTION_CITA_REFERENCIA_TEXT],
  ])("the first-message rejection with the flag %s in %s", (flag, channel, expected) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", flag);

    expect(rejectionReply(channel)).toBe(expected);
  });

  it("the first-message rejection of the whatsapp webhook is the default channel", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", FLAG_ON);

    expect(checkFirstMessagePayload(TOO_LONG)).toMatchObject({ reply: FIRST_MESSAGE_REJECTION_TEXT });
  });

  it("the web numbers in the rejection point at the web menu rows", () => {
    expect(FIRST_MESSAGE_REJECTION_WEB_TEXT).toContain("[2] Referencia");
    expect(FIRST_MESSAGE_REJECTION_WEB_TEXT).toContain("[3] Incidencias");
    expect(FIRST_MESSAGE_REJECTION_CITA_REFERENCIA_TEXT).toContain("[2] Referencia");
  });

  it.each([new IncidenciaService(), new ConsultaService()])("the disabled reply of the %# service follows the channel", (service) => {
    expect(service.disabledReply(Channel.WHATSAPP)).toBe(SERVICE_DISABLED_TEXT);
    expect(service.disabledReply(Channel.WEB)).toBe(SERVICE_DISABLED_WEB_TEXT);
  });
});
