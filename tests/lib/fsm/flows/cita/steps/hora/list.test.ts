import { describe, expect, it } from "vitest";
import { handleHoraPending } from "@/lib/fsm/flows/cita/steps/hora/list";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { findLimitViolations } from "@/lib/whatsapp/message-limits";
import type { HandlerResult, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { HoraResultItem } from "@/lib/fsm/flows/cita/steps/hora/format";
import { SlotKey } from "@/lib/enums/slot-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";

const pending: Session = {
  state: "cita_hora_pending",
  slots: { [SlotKey.CITA_FECHA]: "31/12/2099", [SlotKey.CITA_COD_EESS]: "0000123", [SlotKey.CITA_ESPECIALIDAD_ID]: "02" },
  counters: {},
};

const horas = (items: HoraResultItem[]): QueryResultEvent => ({
  from: "51999999999",
  type: InternalEventType.QUERY_RESULT,
  queryKind: "list_horas",
  result: { status: "found", items },
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const item = (horaInicio: string, horaFin: string, cantidadCupos = 1): HoraResultItem => ({ horaInicio, horaFin, cantidadCupos });

describe("handleHoraPending: la lista de horarios respeta los límites de Meta", () => {
  it("si el MINSA repite un horario, la lista no lleva dos filas con el mismo identificador", () => {
    const result = handleHoraPending(pending, horas([item("08:00", "08:30"), item("08:00", "08:30", 2), item("09:00", "09:30")]));
    const list = sent(result).find((effect) => effect.kind === "send_interactive_list");

    expect(list).toMatchObject({ text: "Selecciona la hora de tu preferencia:" });
    expect(sent(result).flatMap(findLimitViolations)).toEqual([]);
  });

  it("si el MINSA devuelve dos horarios idénticos, se comporta como un único horario y no como una lista de una fila", () => {
    const result = handleHoraPending(pending, horas([item("08:00", "08:30"), item("08:00", "08:30", 2)]));

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots[SlotKey.CITA_HORA_CONFIRM_ID]).toBe("08:00|08:30");
    expect(result.session.slots[SlotKey.CITA_HORA_CONFIRM_ONLY]).toBe("1");
    expect(sent(result).map((effect) => effect.kind)).toEqual(["send_buttons"]);
  });

  it("con muchos horarios, la lista no pasa de diez filas y la paginación va en botones aparte", () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      item(`${String(7 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`, "23:59"),
    );
    const result = handleHoraPending(pending, horas(many));

    expect(sent(result).flatMap(findLimitViolations)).toEqual([]);
    expect(sent(result).map((effect) => effect.kind)).toEqual(["send_interactive_list", "send_buttons"]);
  });
});
