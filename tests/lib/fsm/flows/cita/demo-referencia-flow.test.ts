import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect, WHATSAPP_LIST_MAX_ROWS } from "@/lib/fsm/core/handlers-shared";
import { handleVerifyPending } from "@/lib/fsm/flows/cita/steps/identity";
import { serializeOffered } from "@/lib/fsm/parsing/selection-matchers";
import {
  DEMO_PEDIATRIA_DNI,
  DEMO_REFERENCIA_DNI,
  demoHoraSlots,
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
const texts = (result: HandlerResult): string[] =>
  sent(result).filter((e) => e.kind === "send_text").map((e) => (e as { text: string }).text);
const listRows = (result: HandlerResult) => {
  const list = sent(result).find((e) => e.kind === "send_interactive_list");
  return list?.kind === "send_interactive_list" ? list.rows : undefined;
};

function verifyPending(dni: string, extraSlots: Session["slots"] = {}): Session {
  return {
    state: "cita_verify_pending",
    slots: { citaDniPending: dni, citaTwofaId: "fake-twofa", ...extraSlots },
    counters: {},
  };
}

describe("verificación con los DNI demo (10308523 y 47391441)", () => {
  it("10308523 ignora cualquier pista de ubicación y ve solo sus 3 referencias", () => {
    const result = handleVerifyPending(
      verifyPending(DEMO_REFERENCIA_DNI, {
        citaDistritoHintText: "Miraflores",
        initialMessageText: "quiero una cita en Miraflores",
      }),
      verifyResult({ status: "verified", token: "token-demo" }),
    );

    expect(result.session.state).toBe("cita_demo_awaiting_referencia_select");
    expect(listRows(result)).toHaveLength(3);
    expect(listRows(result)?.map((r) => r.id)).toEqual(demoReferenciasForDni(DEMO_REFERENCIA_DNI).map((r) => r.codigo));
  });

  it("47391441 ve solo la referencia de Pediatría en San Bartolomé", () => {
    const result = handleVerifyPending(
      verifyPending(DEMO_PEDIATRIA_DNI),
      verifyResult({ status: "verified", token: "token-demo-pediatria" }),
    );

    expect(result.session.state).toBe("cita_demo_awaiting_referencia_select");
    expect(listRows(result)).toHaveLength(1);
    expect(listRows(result)?.[0].id).toBe("00006215");
  });

  it("no afecta a otros DNIs: pasan por el paso normal de referencias, no por el demo", () => {
    const result = handleVerifyPending(verifyPending("12345678"), verifyResult({ status: "verified", token: "token-real" }));
    expect(result.session.state).toBe("cita_references_pending");
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
  it("por tap: pasa a elegir hora y muestra la especialidad del hospital en el mensaje previo", () => {
    const result = handle(referenciaOffered(DEMO_REFERENCIA_DNI), tap("00006206"));

    expect(result.session.state).toBe("cita_demo_awaiting_hora_select");
    expect(result.session.slots.citaDemoReferenciaCodigo).toBe("00006206");
    expect(texts(result).join(" ")).toContain("Odontología");
    expect(texts(result).join(" ")).toContain("¿A qué hora deseas tu cita?");
    expect(listRows(result)).toHaveLength(Math.min(WHATSAPP_LIST_MAX_ROWS, demoHoraSlots().length));
    expect(listRows(result)?.[0].id).toBe("08:00|08:25");
  });

  it("por texto: reconoce el hospital escrito igual que por tap", () => {
    const result = handle(referenciaOffered(DEMO_REFERENCIA_DNI), text("HOSPITAL NACIONAL DOS DE MAYO"));
    expect(result.session.state).toBe("cita_demo_awaiting_hora_select");
    expect(result.session.slots.citaDemoReferenciaCodigo).toBe("00006206");
  });
});

function horaOffered(codigo: string): Session {
  return {
    state: "cita_demo_awaiting_hora_select",
    slots: {
      citaBearer: "token-demo",
      citaDni: DEMO_REFERENCIA_DNI,
      citaDemoReferenciaCodigo: codigo,
      citaOffered: serializeOffered({
        text: "Horarios disponibles:",
        rows: demoHoraSlots().map((s) => ({ id: `${s.start}|${s.end}`, title: `${s.start} - ${s.end}` })),
      }),
    },
    counters: {},
  };
}

describe("selección de hora demo", () => {
  it("al elegir un horario, pasa a confirmar mostrando ese turno exacto", () => {
    const result = handle(horaOffered("00006206"), tap("09:40|10:05"));

    expect(result.session.state).toBe("cita_demo_awaiting_confirm");
    expect(result.session.slots.citaDemoHoraId).toBe("09:40|10:05");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });
});

function confirmPending(dni: string, codigo: string, horaId: string): Session {
  return {
    state: "cita_demo_awaiting_confirm",
    slots: { citaBearer: "token-demo", citaDni: dni, citaDemoReferenciaCodigo: codigo, citaDemoHoraId: horaId },
    counters: {},
  };
}

describe("confirmación de la cita demo", () => {
  it("al confirmar, envía SOLO 2 mensajes (constancia + despedida) con el turno elegido, sin link, y cierra en cita_booked", () => {
    const result = handle(confirmPending(DEMO_REFERENCIA_DNI, "00006206", "09:40|10:05"), text("si"));

    expect(result.session.state).toBe("cita_booked");
    expect(result.effects.every((e) => !isQueryEffect(e))).toBe(true);
    expect(sent(result)).toHaveLength(2);
    expect(sent(result).every((e) => e.kind === "send_text")).toBe(true);
    expect(sent(result).some((e) => e.kind === "send_cta_url")).toBe(false);
    expect(texts(result).join(" ")).toContain("Odontología");
    expect(texts(result).join(" ")).toMatch(/9:40.*10:05/);
  });

  it("al rechazar, vuelve a ofrecer los horarios de la misma referencia", () => {
    const result = handle(confirmPending(DEMO_REFERENCIA_DNI, "00006206", "09:40|10:05"), text("no"));

    expect(result.session.state).toBe("cita_demo_awaiting_hora_select");
    expect(listRows(result)).toHaveLength(Math.min(WHATSAPP_LIST_MAX_ROWS, demoHoraSlots().length));
  });

  it("ante una respuesta ambigua, reintenta sin perder la hora elegida", () => {
    const result = handle(confirmPending(DEMO_REFERENCIA_DNI, "00006206", "09:40|10:05"), text("mmm no se"));

    expect(result.session.state).toBe("cita_demo_awaiting_confirm");
    expect(result.session.slots.citaDemoHoraId).toBe("09:40|10:05");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });
});
