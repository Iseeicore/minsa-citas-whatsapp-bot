import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { offerReferenciasList } from "@/lib/fsm/flows/cita/steps/booking/references";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, ListRow, SendEffect, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { ReferenciaTono } from "@/lib/enums/referencia-tono";
import { REFERENCIA_CONFIRM_BUTTONS, REFERENCIA_CONFIRM_QUESTION_TEXT } from "@/lib/constants/textos/cita-reserva";
import { REFERENCIAS_LIST_TEXT } from "@/lib/constants/textos/referencia";
import { WHATSAPP_ROW_DESCRIPTION_MAX, WHATSAPP_ROW_TITLE_MAX } from "@/lib/constants/limits/whatsapp";

const FROM = "sandbox-references";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "list", listId: id });

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] =>
  sent(result)
    .filter((e) => e.kind === "send_text")
    .map((e) => (e as { text: string }).text);
const listRows = (result: HandlerResult): ListRow[] | undefined => {
  const list = sent(result).find((e) => e.kind === "send_interactive_list");
  return list?.kind === "send_interactive_list" ? list.rows : undefined;
};
const listIds = (result: HandlerResult): string[] | undefined => listRows(result)?.map((row) => row.id);
const buttonIds = (result: HandlerResult): string[] => {
  const buttons = sent(result).find((e) => e.kind === "send_buttons");
  return buttons?.kind === "send_buttons" ? buttons.buttons.map((button) => button.id) : [];
};

const BLOQUEADA_TEXT = "Esta referencia está en estado Registrado y no permite agendar una cita. Elige otra.";

const REFERENCIA: ReferenciaItem = {
  idReferencia: "1364486",
  numero: "00123",
  fechaInicio: "24/07/2024 23:03",
  ipressOrigen: "SAN FERNANDO",
  ipressDestino: "HOSPITAL MARIA AUXILIADORA",
  upsOrigen: "MEDICINA GENERAL",
  upsDestino: "GASTROENTEROLOGÍA",
  codigoIpressDestino: "5987",
  codigoUpsDestino: "222800",
  estado: 7,
  estadoDescripcion: "PACIENTE CITADO",
};

const referencia = (idReferencia: string, estado: number, estadoDescripcion: string, fechaInicio: string, ipressDestino?: string) => ({
  ...REFERENCIA,
  idReferencia,
  estado,
  estadoDescripcion,
  fechaInicio,
  ...(ipressDestino ? { ipressDestino } : {}),
});

const SIETE: ReferenciaItem[] = [
  referencia("b-loayza", 1, "REGISTRADO", "10/10/2024 10:00", "HOSPITAL NACIONAL ARZOBISPO LOAYZA"),
  referencia("a1", 3, "ACEPTADO", "01/09/2024 09:00"),
  referencia("a2", 5, "PACIENTE RECIBIDO", "01/08/2024 09:00"),
  referencia("b2", 1, "REGISTRADO", "01/07/2024 09:00"),
  referencia("a3", 7, "PACIENTE CITADO", "01/06/2024 09:00"),
  referencia("b3", 1, "REGISTRADO", "01/05/2024 09:00"),
  referencia("a4", 3, "ACEPTADO", "01/04/2024 09:00"),
];

const PRIMERA_PAGINA = ["a1", "a2", "a3", "a4", "b-loayza"];

function listed(items: ReferenciaItem[]): Session {
  const session: Session = {
    state: "referencia_lookup_pending",
    slots: {
      [SlotKey.CITA_BEARER]: "token",
      [SlotKey.CITA_DNI]: "12345678",
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify(items),
    },
    counters: {},
  };
  return offerReferenciasList(session).session;
}

describe("listado de referencias", () => {
  it("muestra todas de 5 en 5, primero las que permiten agendar, con el texto aprobado", () => {
    const result = offerReferenciasList(listed(SIETE));

    expect(result.session.state).toBe("cita_awaiting_referencia_select");
    const list = sent(result).find((e) => e.kind === "send_interactive_list");
    expect(list).toMatchObject({ text: REFERENCIAS_LIST_TEXT });
    expect(listIds(result)).toEqual(PRIMERA_PAGINA);
    expect(buttonIds(result)).toEqual(["lista_pagina_siguiente"]);
  });

  it("la segunda página trae las 2 restantes y vuelve atrás", () => {
    const second = handle(listed(SIETE), tap("lista_pagina_siguiente"));

    expect(listIds(second)).toEqual(["b2", "b3"]);
    expect(buttonIds(second)).toEqual(["lista_pagina_anterior"]);
  });

  it("cada fila lleva su tono y las bloqueadas salen deshabilitadas", () => {
    const rows = listRows(offerReferenciasList(listed(SIETE))) ?? [];

    expect(rows.find((row) => row.id === "a1")).toMatchObject({ tone: ReferenciaTono.EXITO });
    expect(rows.find((row) => row.id === "a1")?.disabled).toBeUndefined();
    expect(rows.find((row) => row.id === "a3")).toMatchObject({ tone: ReferenciaTono.INFO });
    expect(rows.find((row) => row.id === "b-loayza")).toMatchObject({ tone: ReferenciaTono.NEUTRO, disabled: true });
  });

  it("las filas respetan los límites de WhatsApp aun con nombres largos", () => {
    const largo = referencia(
      "largo",
      4,
      "REFERENCIA OBSERVADA POR EL ESTABLECIMIENTO DE DESTINO PENDIENTE DE SUBSANAR",
      "01/01/2024 08:00",
      "HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME DE LIMA METROPOLITANA",
    );

    for (const row of listRows(offerReferenciasList(listed([largo, ...SIETE]))) ?? []) {
      expect(row.title.length).toBeLessThanOrEqual(WHATSAPP_ROW_TITLE_MAX);
      expect((row.description ?? "").length).toBeLessThanOrEqual(WHATSAPP_ROW_DESCRIPTION_MAX);
    }
  });
});

describe("elegir una referencia que no permite agendar", () => {
  it.each([
    ["por toque", tap("b-loayza")],
    ["por número", text("5")],
    ["por nombre", text("arzobispo")],
  ])("%s: avisa, vuelve a mostrar la misma página y no avanza", (_caso, event) => {
    const session = listed(SIETE);
    const result = handle(session, event);

    expect(result.session.state).toBe("cita_awaiting_referencia_select");
    expect(texts(result)).toEqual([BLOQUEADA_TEXT]);
    expect(listIds(result)).toEqual(PRIMERA_PAGINA);
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
  });

  it("desde la segunda página, por número de otra página, avisa y se queda en la página actual", () => {
    const second = handle(listed(SIETE), tap("lista_pagina_siguiente")).session;

    const result = handle(second, text("7"));

    expect(texts(result)).toEqual([BLOQUEADA_TEXT]);
    expect(listIds(result)).toEqual(["b2", "b3"]);
    expect(result.session.counters[CounterKey.CITA_LIST_PAGE]).toBe(1);
  });

  it("después del aviso la lista guardada conserva las 5 filas por página y el gris", () => {
    const result = handle(listed(SIETE), tap("b-loayza"));
    const offered = readOffered(result.session.slots);

    expect(offered?.pageSize).toBe(5);
    expect(offered?.rows.find((row) => row.id === "b-loayza")).toMatchObject({ disabled: true, tone: ReferenciaTono.NEUTRO });
    expect(listRows(result)?.find((row) => row.id === "b-loayza")).toMatchObject({ disabled: true });
  });

  it("una que sí permite agendar pasa a la confirmación", () => {
    const result = handle(listed(SIETE), tap("a1"));

    expect(result.session.state).toBe("cita_awaiting_referencia_confirm");
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("a1");
  });
});

function referenciaConfirmPending(items: ReferenciaItem[] = [REFERENCIA], selectedId = "1364486"): Session {
  return {
    state: "cita_awaiting_referencia_confirm",
    slots: {
      [SlotKey.CITA_BEARER]: "token",
      [SlotKey.CITA_DNI]: "12345678",
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify(items),
      [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: selectedId,
    },
    counters: {},
  };
}

describe("confirmación de la referencia", () => {
  it("muestra el detalle con mayúscula inicial y el mensaje del estado, y pregunta una sola vez", () => {
    const result = handle(listed([REFERENCIA]), tap("1364486"));

    expect(result.session.state).toBe("cita_awaiting_referencia_confirm");
    expect(texts(result)).toEqual([
      [
        "N° : 00123",
        "Fecha: 24/07/2024 11:03 PM",
        "Origen: San Fernando (Medicina General)",
        "Destino: Hospital Maria Auxiliadora (Gastroenterología)",
        "Estado: Paciente citado",
        "",
        "San Fernando te derivó por Medicina General a Hospital Maria Auxiliadora. Tu referencia está vigente; puedes agendar una nueva cita.",
      ].join("\n"),
    ]);
    expect(sent(result)).toContainEqual({
      kind: "send_buttons",
      text: REFERENCIA_CONFIRM_QUESTION_TEXT,
      buttons: REFERENCIA_CONFIRM_BUTTONS,
    });
    expect(texts(result).join("\n")).not.toContain(REFERENCIA_CONFIRM_QUESTION_TEXT);
  });

  it("sin UPS no deja paréntesis vacíos", () => {
    const sinUps = { ...REFERENCIA, upsOrigen: "", upsDestino: "" };
    const result = handle(referenciaConfirmPending([sinUps]), text("mmm no se"));

    const detalle = texts(result).join("\n");
    expect(detalle).toContain("Origen: San Fernando\n");
    expect(detalle).toContain("Destino: Hospital Maria Auxiliadora\n");
    expect(detalle).not.toContain("()");
  });

  it("sí: usa el destino de la referencia y salta directo a buscar fechas, sin preguntar distrito", () => {
    const result = handle(referenciaConfirmPending(), text("si"));

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("5987");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe("222800");
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]).toBe("HOSPITAL MARIA AUXILIADORA");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE]).toBe("GASTROENTEROLOGÍA");
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("1364486");
    expect(texts(result).join(" ")).not.toContain("distrito");

    const fechas = result.effects.find((effect) => isQueryEffect(effect) && effect.kind === "list_fechas");
    expect(fechas).toEqual({ kind: "list_fechas", payload: { codEess: "5987", especialidadId: "222800" } });
  });

  it("sí sobre una referencia que no permite agendar: la rechaza y vuelve al listado sin buscar fechas", () => {
    const bloqueada = { ...REFERENCIA, estado: 1, estadoDescripcion: "REGISTRADO" };
    const result = handle(referenciaConfirmPending([bloqueada]), text("si"));

    expect(result.session.state).toBe("cita_awaiting_referencia_select");
    expect(texts(result)).toEqual([BLOQUEADA_TEXT]);
    expect(result.effects.some(isQueryEffect)).toBe(false);
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBeUndefined();
  });

  it("sí, pero la referencia llegó sin códigos de destino: sigue con el flujo normal de cita", () => {
    const sinCodigos: ReferenciaItem = { ...REFERENCIA, codigoIpressDestino: "", codigoUpsDestino: "" };
    const result = handle(referenciaConfirmPending([sinCodigos]), text("si"));

    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
  });

  it("no, ver otra: vuelve a mostrar el listado de referencias", () => {
    const result = handle(referenciaConfirmPending(), text("no"));

    expect(result.session.state).toBe("cita_awaiting_referencia_select");
    expect(listRows(result)).toHaveLength(1);
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
  });

  it("respuesta ambigua: reintenta mostrando el mismo detalle", () => {
    const result = handle(referenciaConfirmPending(), text("mmm no se"));

    expect(result.session.state).toBe("cita_awaiting_referencia_confirm");
    expect(texts(result).join(" ")).toContain("N° : 00123");
  });
});
