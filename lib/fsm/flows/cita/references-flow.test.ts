import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";

const FROM = "sandbox-references";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "list", listId: id });
const queryResult = (queryKind: "list_references", result: unknown): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind,
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

const REFERENCIA: ReferenciaItem = {
  idReferencia: "1364486",
  numero: "00123",
  fechaInicio: "24/07/2024 23:03",
  ipressOrigen: "SAN FERNANDO",
  ipressDestino: "HOSPITAL MARIA AUXILIADORA",
  upsOrigen: "MEDICINA GENERAL",
  upsDestino: "GASTROENTEROLOGÍA",
  estado: 7,
};

function referencesPending(): Session {
  return {
    state: "cita_references_pending",
    slots: { citaBearer: "token", citaDni: "12345678" },
    counters: {},
  };
}

describe("handleReferencesPending", () => {
  it("sin referencias (empty), sigue directo al flujo normal sin preguntar nada", () => {
    const result = handle(referencesPending(), queryResult("list_references", { status: "empty" }));

    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
    expect(texts(result).join(" ")).toContain("Cuéntanos en qué distrito");
  });

  it("con error, también sigue directo al flujo normal", () => {
    const result = handle(referencesPending(), queryResult("list_references", { status: "error" }));
    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
  });

  it("con referencias encontradas, pregunta si quiere revisarlas (no pasa a distrito todavía)", () => {
    const result = handle(referencesPending(), queryResult("list_references", { status: "found", items: [REFERENCIA] }));

    expect(result.session.state).toBe("cita_awaiting_references_offer");
    expect(texts(result).join(" ")).toContain("¿Deseas revisar tus referencias?");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });
});

function referencesOffered(): Session {
  return {
    state: "cita_awaiting_references_offer",
    slots: {
      citaBearer: "token",
      citaDni: "12345678",
      citaReferenciasData: JSON.stringify([REFERENCIA]),
    },
    counters: {},
  };
}

describe("handleAwaitingReferenciasOffer", () => {
  it("no: mensaje fijo y sigue con el flujo normal de cita", () => {
    const result = handle(referencesOffered(), text("no"));

    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
    expect(texts(result)[0]).toBe("Entendido, continuamos con tu cita médica.");
    expect(texts(result).join(" ")).toContain("Cuéntanos en qué distrito");
  });

  it("sí: muestra el listado con título=ipress_destino y descripción=fecha 12h + ipress_origen", () => {
    const result = handle(referencesOffered(), text("si"));

    expect(result.session.state).toBe("cita_awaiting_referencia_select");
    const rows = listRows(result);
    expect(rows).toHaveLength(1);
    expect(rows?.[0].id).toBe("1364486");
    expect(rows?.[0].title).toBe("HOSPITAL MARIA AUXILIAD…");
    expect(rows?.[0].description).toBe("24/07/2024 11:03 PM · SAN FERNANDO");
  });

  it("respuesta ambigua: vuelve a preguntar", () => {
    const result = handle(referencesOffered(), text("mmm no se"));
    expect(result.session.state).toBe("cita_awaiting_references_offer");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });
});

function referenciaOffered(): Session {
  return {
    state: "cita_awaiting_referencia_select",
    slots: {
      citaBearer: "token",
      citaDni: "12345678",
      citaReferenciasData: JSON.stringify([REFERENCIA]),
      citaOffered: JSON.stringify({
        text: "Estas son tus referencias:",
        rows: [{ id: "1364486", title: "HOSPITAL MARIA AUXILIADORA", description: "24/07/2024 11:03 pm · SAN FERNANDO" }],
      }),
    },
    counters: {},
  };
}

describe("handleAwaitingReferenciaSelect", () => {
  it("al elegir, muestra el detalle completo y pregunta si es esa", () => {
    const result = handle(referenciaOffered(), tap("1364486"));

    expect(result.session.state).toBe("cita_awaiting_referencia_confirm");
    const detalle = texts(result).join("\n");
    expect(detalle).toContain("N° : 00123");
    expect(detalle).toContain("24/07/2024 11:03 PM");
    expect(detalle).toContain("SAN FERNANDO (MEDICINA GENERAL)");
    expect(detalle).toContain("HOSPITAL MARIA AUXILIADORA (GASTROENTEROLOGÍA)");
    expect(detalle).toContain("PACIENTE CITADO");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(true);
  });
});

function referenciaConfirmPending(): Session {
  return {
    state: "cita_awaiting_referencia_confirm",
    slots: {
      citaBearer: "token",
      citaDni: "12345678",
      citaReferenciasData: JSON.stringify([REFERENCIA]),
      citaReferenciaSeleccionadaId: "1364486",
    },
    counters: {},
  };
}

describe("handleAwaitingReferenciaConfirm", () => {
  it("sí: por ahora continúa con el flujo normal de cita (placeholder)", () => {
    const result = handle(referenciaConfirmPending(), text("si"));

    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
  });

  it("no, ver otra: vuelve a mostrar el listado de referencias", () => {
    const result = handle(referenciaConfirmPending(), text("no"));

    expect(result.session.state).toBe("cita_awaiting_referencia_select");
    expect(listRows(result)).toHaveLength(1);
  });

  it("respuesta ambigua: reintenta mostrando el mismo detalle", () => {
    const result = handle(referenciaConfirmPending(), text("mmm no se"));

    expect(result.session.state).toBe("cita_awaiting_referencia_confirm");
    expect(texts(result).join(" ")).toContain("N° : 00123");
  });
});
