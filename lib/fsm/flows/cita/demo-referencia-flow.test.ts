import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleVerifyPending } from "@/lib/fsm/flows/cita/steps/identity";
import { serializeOffered } from "@/lib/fsm/parsing/selection-matchers";
import { DEMO_REFERENCIAS, DEMO_REFERENCIA_DNI } from "@/lib/fsm/flows/cita/demo-referencia";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const FROM = "sandbox-demo";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "list", listId: id });
const verifyResult = (result: unknown): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind: "verify_code",
  result,
});

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

function verifyPending(extraSlots: Session["slots"] = {}): Session {
  return {
    state: "cita_verify_pending",
    slots: {
      citaDniPending: DEMO_REFERENCIA_DNI,
      citaTwofaId: "fake-twofa",
      ...extraSlots,
    },
    counters: {},
  };
}

describe("verificación con el DNI demo (10308523)", () => {
  it("ignora cualquier pista de ubicación y ofrece las 4 referencias", () => {
    const result = handleVerifyPending(
      verifyPending({ citaDistritoHintText: "Miraflores", initialMessageText: "quiero una cita en Miraflores" }),
      verifyResult({ status: "verified", token: "token-demo" }),
    );

    expect(result.session.state).toBe("cita_demo_awaiting_referencia_select");
    const list = sent(result).find((effect) => effect.kind === "send_interactive_list");
    expect(list?.kind).toBe("send_interactive_list");
    if (list?.kind === "send_interactive_list") {
      expect(list.rows).toHaveLength(4);
      expect(list.rows.map((row) => row.id)).toEqual(DEMO_REFERENCIAS.map((r) => r.codigo));
    }
  });

  it("no afecta a otros DNIs: siguen preguntando el distrito como siempre", () => {
    const result = handleVerifyPending(
      verifyPending({ citaDniPending: "12345678" }),
      verifyResult({ status: "verified", token: "token-real" }),
    );

    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
  });
});

function referenciaOffered(): Session {
  return {
    state: "cita_demo_awaiting_referencia_select",
    slots: {
      citaBearer: "token-demo",
      citaDni: DEMO_REFERENCIA_DNI,
      citaOffered: serializeOffered({
        text: "Un momento, estamos analizando tu cuenta… cuenta con referencias:",
        rows: DEMO_REFERENCIAS.map((r) => ({
          id: r.codigo,
          title: r.hospital.slice(0, 24),
          description: `${r.red} · ${r.ris} · ${r.distrito}`,
        })),
      }),
    },
    counters: {},
  };
}

describe("selección de referencia demo", () => {
  it("por tap: guarda el código y pasa a confirmar con Medicina General y el turno fijo", () => {
    const result = handle(referenciaOffered(), tap("00006206"));

    expect(result.session.state).toBe("cita_demo_awaiting_confirm");
    expect(result.session.slots.citaDemoReferenciaCodigo).toBe("00006206");
    const texts = sent(result).filter((e) => e.kind === "send_text").map((e) => (e as { text: string }).text);
    expect(texts.join(" ")).toContain("Medicina General");
    expect(texts.join(" ")).toContain("08:00 am - 08:25 am");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });

  it("por texto: reconoce el hospital escrito igual que por tap", () => {
    const result = handle(referenciaOffered(), text("HOSPITAL NACIONAL DOS DE MAYO"));
    expect(result.session.state).toBe("cita_demo_awaiting_confirm");
    expect(result.session.slots.citaDemoReferenciaCodigo).toBe("00006206");
  });
});

function confirmPending(): Session {
  return {
    state: "cita_demo_awaiting_confirm",
    slots: {
      citaBearer: "token-demo",
      citaDni: DEMO_REFERENCIA_DNI,
      citaDemoReferenciaCodigo: "00006206",
    },
    counters: {},
  };
}

describe("confirmación de la cita demo", () => {
  it("al confirmar, envía SOLO 2 mensajes (constancia + despedida), sin link, y cierra en cita_booked", () => {
    const result = handle(confirmPending(), text("si"));

    expect(result.session.state).toBe("cita_booked");
    expect(result.effects.every((e) => !isQueryEffect(e))).toBe(true);
    expect(sent(result)).toHaveLength(2);
    expect(sent(result).every((e) => e.kind === "send_text")).toBe(true);
    expect(sent(result).some((e) => e.kind === "send_cta_url")).toBe(false);
  });

  it("al rechazar, vuelve a ofrecer las 4 referencias", () => {
    const result = handle(confirmPending(), text("no"));

    expect(result.session.state).toBe("cita_demo_awaiting_referencia_select");
    const list = sent(result).find((effect) => effect.kind === "send_interactive_list");
    expect(list?.kind === "send_interactive_list" && list.rows).toHaveLength(4);
  });

  it("ante una respuesta ambigua, reintenta sin perder la referencia elegida", () => {
    const result = handle(confirmPending(), text("mmm no se"));

    expect(result.session.state).toBe("cita_demo_awaiting_confirm");
    expect(result.session.slots.citaDemoReferenciaCodigo).toBe("00006206");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });
});
