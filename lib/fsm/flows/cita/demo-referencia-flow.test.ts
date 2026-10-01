import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleVerifyPending } from "@/lib/fsm/flows/cita/steps/identity";
import { serializeOffered } from "@/lib/fsm/parsing/selection-matchers";
import {
  DEMO_PEDIATRIA_DNI,
  DEMO_REFERENCIA_DNI,
  demoReferenciasForDni,
} from "@/lib/fsm/flows/cita/demo-referencia";
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

function verifyPending(dni: string, extraSlots: Session["slots"] = {}): Session {
  return {
    state: "cita_verify_pending",
    slots: {
      citaDniPending: dni,
      citaTwofaId: "fake-twofa",
      ...extraSlots,
    },
    counters: {},
  };
}

describe("verificación con los DNI demo (32028036 y 47391441)", () => {
  it("32028036 ignora cualquier pista de ubicación y ve solo sus 3 referencias", () => {
    const result = handleVerifyPending(
      verifyPending(DEMO_REFERENCIA_DNI, {
        citaDistritoHintText: "Miraflores",
        initialMessageText: "quiero una cita en Miraflores",
      }),
      verifyResult({ status: "verified", token: "token-demo" }),
    );

    expect(result.session.state).toBe("cita_demo_awaiting_referencia_select");
    const list = sent(result).find((effect) => effect.kind === "send_interactive_list");
    expect(list?.kind).toBe("send_interactive_list");
    if (list?.kind === "send_interactive_list") {
      expect(list.rows).toHaveLength(3);
      expect(list.rows.map((row) => row.id)).toEqual(demoReferenciasForDni(DEMO_REFERENCIA_DNI).map((r) => r.codigo));
    }
  });

  it("47391441 ve solo la referencia de Pediatría en San Bartolomé", () => {
    const result = handleVerifyPending(
      verifyPending(DEMO_PEDIATRIA_DNI),
      verifyResult({ status: "verified", token: "token-demo-pediatria" }),
    );

    expect(result.session.state).toBe("cita_demo_awaiting_referencia_select");
    const list = sent(result).find((effect) => effect.kind === "send_interactive_list");
    if (list?.kind === "send_interactive_list") {
      expect(list.rows).toHaveLength(1);
      expect(list.rows[0].id).toBe("00006215");
    }
  });

  it("no afecta a otros DNIs: siguen preguntando el distrito como siempre", () => {
    const result = handleVerifyPending(
      verifyPending("12345678"),
      verifyResult({ status: "verified", token: "token-real" }),
    );

    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
  });
});

function referenciaOffered(dni: string): Session {
  return {
    state: "cita_demo_awaiting_referencia_select",
    slots: {
      citaBearer: "token-demo",
      citaDni: dni,
      citaOffered: serializeOffered({
        text: "Un momento, estamos analizando tu cuenta… cuenta con referencias:",
        rows: demoReferenciasForDni(dni).map((r) => ({
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
  it("por tap: guarda el código y pasa a confirmar con la especialidad del hospital y el turno fijo", () => {
    const result = handle(referenciaOffered(DEMO_REFERENCIA_DNI), tap("00006206"));

    expect(result.session.state).toBe("cita_demo_awaiting_confirm");
    expect(result.session.slots.citaDemoReferenciaCodigo).toBe("00006206");
    const texts = sent(result).filter((e) => e.kind === "send_text").map((e) => (e as { text: string }).text);
    expect(texts.join(" ")).toContain("Odontología");
    expect(texts.join(" ")).toContain("08:00 am - 08:25 am");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });

  it("por texto: reconoce el hospital escrito igual que por tap", () => {
    const result = handle(referenciaOffered(DEMO_REFERENCIA_DNI), text("HOSPITAL NACIONAL DOS DE MAYO"));
    expect(result.session.state).toBe("cita_demo_awaiting_confirm");
    expect(result.session.slots.citaDemoReferenciaCodigo).toBe("00006206");
  });

  it("la referencia de Pediatría (San Bartolomé) muestra esa especialidad al confirmar", () => {
    const result = handle(referenciaOffered(DEMO_PEDIATRIA_DNI), tap("00006215"));

    expect(result.session.state).toBe("cita_demo_awaiting_confirm");
    const texts = sent(result).filter((e) => e.kind === "send_text").map((e) => (e as { text: string }).text);
    expect(texts.join(" ")).toContain("Pediatría");
  });
});

function confirmPending(dni: string, codigo: string): Session {
  return {
    state: "cita_demo_awaiting_confirm",
    slots: {
      citaBearer: "token-demo",
      citaDni: dni,
      citaDemoReferenciaCodigo: codigo,
    },
    counters: {},
  };
}

describe("confirmación de la cita demo", () => {
  it("al confirmar, envía SOLO 2 mensajes (constancia + despedida), sin link, y cierra en cita_booked", () => {
    const result = handle(confirmPending(DEMO_REFERENCIA_DNI, "00006206"), text("si"));

    expect(result.session.state).toBe("cita_booked");
    expect(result.effects.every((e) => !isQueryEffect(e))).toBe(true);
    expect(sent(result)).toHaveLength(2);
    expect(sent(result).every((e) => e.kind === "send_text")).toBe(true);
    expect(sent(result).some((e) => e.kind === "send_cta_url")).toBe(false);
    const texts = sent(result).map((e) => (e as { text: string }).text);
    expect(texts.join(" ")).toContain("Odontología");
  });

  it("al rechazar, vuelve a ofrecer solo las referencias del mismo DNI", () => {
    const result = handle(confirmPending(DEMO_REFERENCIA_DNI, "00006206"), text("no"));

    expect(result.session.state).toBe("cita_demo_awaiting_referencia_select");
    const list = sent(result).find((effect) => effect.kind === "send_interactive_list");
    expect(list?.kind === "send_interactive_list" && list.rows).toHaveLength(3);
  });

  it("ante una respuesta ambigua, reintenta sin perder la referencia elegida", () => {
    const result = handle(confirmPending(DEMO_REFERENCIA_DNI, "00006206"), text("mmm no se"));

    expect(result.session.state).toBe("cita_demo_awaiting_confirm");
    expect(result.session.slots.citaDemoReferenciaCodigo).toBe("00006206");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });
});
