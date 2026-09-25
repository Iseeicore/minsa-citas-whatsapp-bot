import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, QueryResultEvent, Session } from "@/lib/fsm/core/types";

const FROM = "sandbox-slots";
const MESSAGE = "Apúrense cojudos quiero cita de odontología en San Borja";

const menu = (): Session => ({ state: "main_menu", slots: {}, counters: {} });
const text = (value: string) => ({ from: FROM, type: "text" as const, text: value });
const result = (queryKind: QueryResultEvent["queryKind"], value: unknown): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind,
  result: value,
});
const queries = (r: HandlerResult) => r.effects.filter(isQueryEffect);

describe("B.3 an insulting request for a cita keeps the flow AND what was asked for", () => {
  it("the guard routes to the Cita flow with a respect reminder and no AI call", () => {
    const routed = handle(menu(), text(MESSAGE));

    expect(routed.session.state).toBe("cita_awaiting_dni");
    expect(queries(routed)).toHaveLength(0);
  });

  it("the specialty and district hints are preserved", () => {
    const routed = handle(menu(), text(MESSAGE));

    expect(routed.session.slots.citaEspecialidadHintText).toBe("Odontología");
    expect(routed.session.slots.citaDistritoHintText).toBe("San Borja");
  });

  it("the insulting text itself is never stored as context for later AI calls", () => {
    const routed = handle(menu(), text(MESSAGE));

    expect(routed.session.slots.initialMessageText).toBeUndefined();
  });

  it("an insult with no specialty or district leaves no hints behind", () => {
    const routed = handle(menu(), text("cojudos denme una cita"));

    expect(routed.session.state).toBe("cita_awaiting_dni");
    expect(routed.session.slots).toEqual({});
  });

  it("the existing flow then resolves San Borja right after the OTP, with no extra question", () => {
    let step = handle(menu(), text(MESSAGE));
    step = handle(step.session, text("12345678"));
    step = handle(step.session, result("validate_user", { status: "valid", twofaId: "tw" }));
    step = handle(step.session, text("1234"));
    step = handle(step.session, result("verify_code", { status: "verified", token: "jwt" }));

    expect(step.session.state).toBe("cita_ubigeo_pending");
    const [search] = queries(step);
    expect(search.kind).toBe("search_ubigeo");
    expect(String(search.payload.distrito).toUpperCase()).toBe("SAN BORJA");
    expect(step.session.slots.citaEspecialidadHintText).toBe("Odontología");
  });
});
