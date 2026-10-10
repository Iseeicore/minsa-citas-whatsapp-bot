import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, QueryEffect, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { startBooking } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-referencia-booking";

const fechasResult = (result: unknown): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind: "list_fechas",
  result,
});

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string => sent(result).map((e) => ("text" in e ? e.text : "")).join("\n");
const queries = (result: HandlerResult): QueryEffect[] =>
  result.effects.filter((effect): effect is QueryEffect => isQueryEffect(effect));

function fechaPending(withReferencia: boolean): Session {
  return {
    state: "cita_fecha_pending",
    slots: {
      [SlotKey.CITA_BEARER]: "token",
      [SlotKey.CITA_DNI]: "32028036",
      [SlotKey.CITA_COD_EESS]: "5987",
      [SlotKey.CITA_ESPECIALIDAD_ID]: "222800",
      ...(withReferencia ? { [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: "1364486" } : {}),
    },
    counters: {},
  };
}

describe("referencia médica: no hay fechas con cupo en el destino", () => {
  it("cierra con una disculpa y la recomendación de acudir a su centro de salud, sin buscar otro establecimiento", () => {
    const result = handle(fechaPending(true), fechasResult({ status: "empty" }));

    expect(result.session.state).toBe("cita_declined_closed");
    const mensaje = texts(result);
    expect(mensaje).toContain("referencia médica");
    expect(mensaje).toContain("centro de salud principal");
    expect(queries(result)).toHaveLength(0);
  });

  it("también cuando MINSA responde found con la lista vacía", () => {
    const result = handle(fechaPending(true), fechasResult({ status: "found", items: [] }));

    expect(result.session.state).toBe("cita_declined_closed");
  });

  it("en una cita normal el comportamiento no cambia: no se cierra con el mensaje de referencia", () => {
    const result = handle(fechaPending(false), fechasResult({ status: "empty" }));

    expect(texts(result)).not.toContain("referencia médica");
    expect(result.session.state).not.toBe("cita_declined_closed");
  });

  it("si hay fechas, las muestra como siempre", () => {
    const result = handle(
      fechaPending(true),
      fechasResult({
        status: "found",
        items: [
          { fechaCupo: "07/10/2026", cantidadCupos: 2 },
          { fechaCupo: "08/10/2026", cantidadCupos: 1 },
        ],
      }),
    );

    expect(result.session.state).toBe("cita_awaiting_fecha_select");
  });
});

describe("referencia médica: al agendar", () => {
  const bookingPayload = (session: Session) => {
    const result = startBooking(session, "18:00");
    return queries(result).find((effect) => effect.kind === "book_appointment")?.payload;
  };

  it("con una referencia elegida, envía su identificador", () => {
    const session = fechaPending(true);
    session.slots[SlotKey.CITA_FECHA] = "07/10/2026";

    expect(bookingPayload(session)).toMatchObject({
      codigoRenipress: "5987",
      codigoUps: "222800",
      numeroDocumentoPaciente: "32028036",
      referenciaId: "1364486",
    });
  });

  it("en una cita normal, el pedido no incluye referenciaId", () => {
    const session = fechaPending(false);
    session.slots[SlotKey.CITA_FECHA] = "07/10/2026";

    expect(bookingPayload(session)).not.toHaveProperty("referenciaId");
  });
});
