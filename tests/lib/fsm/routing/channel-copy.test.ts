import { afterEach, describe, expect, it, vi } from "vitest";
import { handleMainMenuIntentPending } from "@/lib/fsm/routing/main-menu";
import { checkFirstMessagePayload } from "@/lib/security/payload-filter";
import { ConsultaService } from "@/lib/services/consulta-service";
import { IncidenciaService } from "@/lib/services/incidencia-service";
import { OUT_OF_SCOPE_REQUEST_CITA_REFERENCIA_TEXT, OUT_OF_SCOPE_REQUEST_TEXT, SERVICE_DISABLED_TEXT } from "@/lib/constants/textos/menu";
import { FIRST_MESSAGE_REJECTION_CITA_REFERENCIA_TEXT, FIRST_MESSAGE_REJECTION_TEXT } from "@/lib/constants/textos/seguridad";
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

const rejectionReply = (): string | undefined => {
  const verdict = checkFirstMessagePayload(TOO_LONG);
  return verdict.kind === PayloadVerdictKind.REJECTED ? verdict.reply : undefined;
};

const CHANNELS = [Channel.WHATSAPP, Channel.WEB];

describe("the texts that list what the bot offers follow the incidencias flag, the same in both channels", () => {
  it.each(CHANNELS)("the out-of-scope request in %s", (channel) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", FLAG_ON);
    expect(outOfScopeText(channel)).toBe(OUT_OF_SCOPE_REQUEST_TEXT);

    vi.stubEnv("INCIDENCIAS_ENABLED", FLAG_OFF);
    expect(outOfScopeText(channel)).toBe(OUT_OF_SCOPE_REQUEST_CITA_REFERENCIA_TEXT);
  });

  it("the first-message rejection", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", FLAG_ON);
    expect(rejectionReply()).toBe(FIRST_MESSAGE_REJECTION_TEXT);

    vi.stubEnv("INCIDENCIAS_ENABLED", FLAG_OFF);
    expect(rejectionReply()).toBe(FIRST_MESSAGE_REJECTION_CITA_REFERENCIA_TEXT);
  });

  it("the numbers in the rejection point at the menu rows", () => {
    expect(FIRST_MESSAGE_REJECTION_TEXT).toContain("[1] Citas [2] Referencia [3] Denuncias anticorrupción");
    expect(FIRST_MESSAGE_REJECTION_CITA_REFERENCIA_TEXT).toContain("[1] Citas [2] Referencia.");
  });

  it.each([new IncidenciaService(), new ConsultaService()])(
    "the disabled reply of the %# service names the cita and the referencia",
    (service) => {
      expect(service.disabledReply()).toBe(SERVICE_DISABLED_TEXT);
    },
  );
});
