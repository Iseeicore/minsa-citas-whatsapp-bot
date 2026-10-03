import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleDistritoAiPending } from "@/lib/fsm/flows/cita/steps/ubigeo";
import { UNRECOGNIZED_DISTRITO_TEXT } from "@/lib/fsm/parsing/gibberish";
import { DISTRITO_MANUAL_FALLBACK_TEXT } from "@/lib/fsm/flows/cita/distrito-resolver";
import type { HandlerResult, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

beforeEach(() => {
  vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const pending = (counters: Session["counters"] = {}): Session => ({
  state: "cita_distrito_ai_pending",
  slots: { citaBearer: "token" },
  counters,
});

const aiResult = (result: unknown): QueryResultEvent => ({
  from: "wa-1",
  type: "query_result",
  queryKind: "resolve_distrito_ai",
  result,
});

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const lima = { departamento: "Lima", provincia: "Lima", distrito: "Comas" };
const cusco = { departamento: "Cusco", provincia: "Cusco", distrito: "Cusco" };

describe("handleDistritoAiPending: what the citizen gets when the AI finds nothing or fails", () => {
  it("a failed AI call moves to the manual departamento step instead of sending the citizen away", () => {
    const result = handleDistritoAiPending(pending(), aiResult({ outcome: "failed", candidates: [] }));

    expect(result.session.state).toBe("cita_awaiting_departamento");
    expect(sent(result)).toEqual([{ kind: "send_text", text: DISTRITO_MANUAL_FALLBACK_TEXT }]);
  });

  it("the manual fallback text is the one agreed with the team", () => {
    expect(DISTRITO_MANUAL_FALLBACK_TEXT).toBe(
      "No pudimos identificar tu distrito en este momento. Vamos por partes: indícanos el departamento donde buscas atención.",
    );
  });

  it("a first 'not found' asks for the district again", () => {
    const result = handleDistritoAiPending(pending(), aiResult({ outcome: "not_found", candidates: [] }));

    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
    expect(sent(result)).toEqual([{ kind: "send_text", text: UNRECOGNIZED_DISTRITO_TEXT }]);
    expect(result.session.counters.distritoNotFound).toBe(1);
  });

  it("a second 'not found' in a row moves to the manual departamento step", () => {
    const result = handleDistritoAiPending(
      pending({ distritoNotFound: 1 }),
      aiResult({ outcome: "not_found", candidates: [] }),
    );

    expect(result.session.state).toBe("cita_awaiting_departamento");
    expect(sent(result)).toEqual([{ kind: "send_text", text: DISTRITO_MANUAL_FALLBACK_TEXT }]);
  });

  it("a district found outside Lima still redirects to the national booking site", () => {
    const result = handleDistritoAiPending(pending(), aiResult({ outcome: "found", candidates: [cusco] }));

    expect(result.session.state).toBe("cita_national_redirect");
    expect(sent(result)[0]).toMatchObject({ kind: "send_cta_url" });
  });

  it("a district found in Lima continues to the ubigeo search and clears the not-found count", () => {
    const result = handleDistritoAiPending(
      pending({ distritoNotFound: 1 }),
      aiResult({ outcome: "found", candidates: [lima] }),
    );

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(result.session.counters.distritoNotFound).toBeUndefined();
  });
});
