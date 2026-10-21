import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleVerifyPending } from "@/lib/fsm/flows/cita/steps/identity/identity";
import { readOffered, serializeOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import {
  DEMO_PEDIATRIA_DNI,
  DEMO_REFERENCIA_DNI,
  demoHoraSlots,
  demoListReferences,
  demoReferenciaItem,
  demoReferenciasForDni,
} from "@/lib/fsm/flows/cita/steps/demo/demo-referencia";
import { esReferenciaAgendable, referenciaRows } from "@/lib/fsm/flows/referencia/presentacion";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { WHATSAPP_LIST_MAX_ROWS } from "@/lib/constants/limits/whatsapp";

const FROM = "sandbox-demo";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "list", listId: id });
const verifyResult = (result: unknown): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind: "verify_code",
  result,
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] =>
  sent(result)
    .filter((e) => e.kind === "send_text")
    .map((e) => (e as { text: string }).text);
const listRows = (result: HandlerResult) => {
  const list = sent(result).find((e) => e.kind === "send_interactive_list");
  return list?.kind === "send_interactive_list" ? list.rows : undefined;
};

function verifyPending(
  dni: string,
  extraSlots: Session["slots"] = {},
  purpose: Session["slots"] = { [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS },
): Session {
  return {
    state: "cita_verify_pending",
    slots: { [SlotKey.CITA_DNI_PENDING]: dni, [SlotKey.CITA_TWOFA_ID]: "fake-twofa", ...purpose, ...extraSlots },
    counters: {},
  };
}

describe("verificación con los DNI demo (10308523 y 47391441)", () => {
  it("10308523 ignora cualquier pista de ubicación y ve sus 4 referencias, la bloqueada al final y en gris", () => {
    const result = handleVerifyPending(
      verifyPending(DEMO_REFERENCIA_DNI, {
        [SlotKey.CITA_DISTRITO_HINT_TEXT]: "Miraflores",
        [SlotKey.INITIAL_MESSAGE_TEXT]: "quiero una cita en Miraflores",
      }),
      verifyResult({ status: "verified", token: "token-demo" }),
    );

    expect(result.session.state).toBe("cita_demo_awaiting_referencia_select");
    const items = demoReferenciasForDni(DEMO_REFERENCIA_DNI).map(demoReferenciaItem);
    expect(items.filter(esReferenciaAgendable)).toHaveLength(3);
    expect(listRows(result)).toHaveLength(4);
    expect(
      listRows(result)
        ?.slice(0, 3)
        .every((row) => !row.disabled),
    ).toBe(true);
    expect(listRows(result)?.[3]).toMatchObject({ id: DEMO_BLOQUEADA_CODIGO, disabled: true });
    expect(readOffered(result.session.slots)?.pageSize).toBe(5);
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

  it("no afecta a otros DNIs: con el propósito de referencias consultan las reales, no el demo", () => {
    const result = handleVerifyPending(verifyPending("12345678"), verifyResult({ status: "verified", token: "token-real" }));
    expect(result.session.state).toBe("referencia_lookup_pending");
  });

  it.each([DEMO_REFERENCIA_DNI, DEMO_PEDIATRIA_DNI])("%s en la cita consulta las referencias como cualquier documento", (dni) => {
    const result = handleVerifyPending(verifyPending(dni, {}, {}), verifyResult({ status: "verified", token: "token-demo" }));

    expect(result.session.state).toBe("referencia_lookup_pending");
    expect(listRows(result)).toBeUndefined();
  });

  it("en el Sandbox, la consulta de referencias de un DNI demo trae sus referencias, con códigos para agendar", () => {
    delete process.env.SANDBOX_USE_REAL_MINSA;
    const result = demoListReferences(DEMO_REFERENCIA_DNI);

    expect(result?.statusReference).toBe("found");
    expect(result?.data.map((item) => item.idReferencia)).toEqual(demoReferenciasForDni(DEMO_REFERENCIA_DNI).map((r) => r.codigo));
    expect(result?.data.filter(esReferenciaAgendable).every((item) => item.codigoIpressDestino && item.codigoUpsDestino)).toBe(true);
  });

  it("un DNI que no es demo, o el MINSA real, no reciben referencias de demo", () => {
    expect(demoListReferences("12345678")).toBeUndefined();
    process.env.SANDBOX_USE_REAL_MINSA = "true";
    expect(demoListReferences(DEMO_REFERENCIA_DNI)).toBeUndefined();
    delete process.env.SANDBOX_USE_REAL_MINSA;
  });
});

const DEMO_BLOQUEADA_CODIGO = "00005944";
const BLOQUEADA_TEXT = "Esta referencia está en estado Registrado y no permite agendar una cita. Elige otra.";

function referenciaOffered(dni: string): Session {
  return {
    state: "cita_demo_awaiting_referencia_select",
    slots: {
      [SlotKey.CITA_BEARER]: "token-demo",
      [SlotKey.CITA_DNI]: dni,
      [SlotKey.CITA_OFFERED]: serializeOffered({
        text: "Un momento, estamos analizando tu cuenta… cuenta con referencias:",
        pageSize: 5,
        rows: referenciaRows(demoReferenciasForDni(dni).map(demoReferenciaItem)),
      }),
    },
    counters: {},
  };
}

describe("selección de referencia demo", () => {
  it("por tap: pasa a elegir hora y muestra la especialidad del hospital en el mensaje previo", () => {
    const result = handle(referenciaOffered(DEMO_REFERENCIA_DNI), tap("00006206"));

    expect(result.session.state).toBe("cita_demo_awaiting_hora_select");
    expect(result.session.slots[SlotKey.CITA_DEMO_REFERENCIA_CODIGO]).toBe("00006206");
    expect(texts(result).join(" ")).toContain("Odontología");
    expect(texts(result).join(" ")).toContain("¿A qué hora deseas tu cita?");
    expect(listRows(result)).toHaveLength(Math.min(WHATSAPP_LIST_MAX_ROWS, demoHoraSlots().length));
    expect(listRows(result)?.[0].id).toBe("08:00|08:25");
  });

  it("por texto: reconoce el hospital escrito igual que por tap", () => {
    const result = handle(referenciaOffered(DEMO_REFERENCIA_DNI), text("HOSPITAL NACIONAL DOS DE MAYO"));
    expect(result.session.state).toBe("cita_demo_awaiting_hora_select");
    expect(result.session.slots[SlotKey.CITA_DEMO_REFERENCIA_CODIGO]).toBe("00006206");
  });

  it("la referencia bloqueada: avisa, vuelve la misma lista y no pasa a elegir hora", () => {
    const session = referenciaOffered(DEMO_REFERENCIA_DNI);
    const result = handle(session, tap(DEMO_BLOQUEADA_CODIGO));

    expect(result.session.state).toBe("cita_demo_awaiting_referencia_select");
    expect(texts(result)).toEqual([BLOQUEADA_TEXT]);
    expect(listRows(result)?.map((r) => r.id)).toEqual(readOffered(session.slots)?.rows.map((r) => r.id));
    expect(result.session.slots[SlotKey.CITA_DEMO_REFERENCIA_CODIGO]).toBeUndefined();
  });
});

function horaOffered(codigo: string): Session {
  return {
    state: "cita_demo_awaiting_hora_select",
    slots: {
      [SlotKey.CITA_BEARER]: "token-demo",
      [SlotKey.CITA_DNI]: DEMO_REFERENCIA_DNI,
      [SlotKey.CITA_DEMO_REFERENCIA_CODIGO]: codigo,
      [SlotKey.CITA_OFFERED]: serializeOffered({
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
    expect(result.session.slots[SlotKey.CITA_DEMO_HORA_ID]).toBe("09:40|10:05");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });
});

function confirmPending(dni: string, codigo: string, horaId: string): Session {
  return {
    state: "cita_demo_awaiting_confirm",
    slots: {
      [SlotKey.CITA_BEARER]: "token-demo",
      [SlotKey.CITA_DNI]: dni,
      [SlotKey.CITA_DEMO_REFERENCIA_CODIGO]: codigo,
      [SlotKey.CITA_DEMO_HORA_ID]: horaId,
    },
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
    expect(result.session.slots[SlotKey.CITA_DEMO_HORA_ID]).toBe("09:40|10:05");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });
});
