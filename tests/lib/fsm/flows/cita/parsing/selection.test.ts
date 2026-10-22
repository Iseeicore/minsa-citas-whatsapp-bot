import { describe, expect, it, vi } from "vitest";
import { resolveSelection } from "@/lib/fsm/flows/cita/parsing/selection";
import { serializeOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import { packHoraSlots } from "@/lib/fsm/parsing/date/time-parser";
import type { InboundEvent, Session } from "@/lib/fsm/core/types";
import { CounterKey } from "@/lib/enums/counter-key";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const rows = Array.from({ length: 21 }, (_, index) => ({ id: `row-${index}`, title: `Opción ${index + 1}` }));
const text = (value: string): InboundEvent => ({ from: "synthetic-wa", type: InboundEventType.TEXT, text: value });
const passthroughIds = [HoraPageButtonId.PREV, HoraPageButtonId.NEXT];

function offered(page = 0, state: Session["state"] = SessionState.CITA_AWAITING_FECHA_SELECT): Session {
  return {
    channel: SessionChannel.WHATSAPP,
    state,
    slots: {
      [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: "synthetic-reference",
      [SlotKey.CITA_OFFERED]: serializeOffered({ text: "Elige", rows }),
    },
    counters: { [CounterKey.CITA_LIST_PAGE]: page },
  };
}

function hours(page = 0): Session {
  const session = offered(2, SessionState.CITA_AWAITING_HORA_SELECT);
  session.counters[CounterKey.CITA_HORA_PAGE] = page;
  session.slots[SlotKey.CITA_OFFERED] = serializeOffered({ text: "Elige hora", rows: rows.slice(page * 7, (page + 1) * 7) });
  session.slots[SlotKey.CITA_HORAS_DIA] = packHoraSlots(
    rows.map((_, index) => ({
      start: `${String(index + 1).padStart(2, "0")}:00`,
      end: `${String(index + 1).padStart(2, "0")}:30`,
      cupos: 1,
    })),
  );
  return session;
}

describe("respuestas escritas para listas de referencia de WhatsApp", () => {
  it.each([SessionState.CITA_AWAITING_REFERENCIA_SELECT, SessionState.CITA_AWAITING_FECHA_SELECT])(
    "interpreta 1 y 7 sobre las opciones visibles de las páginas segunda y tercera en %s",
    (state) => {
      for (const page of [1, 2]) {
        const session = offered(page, state);
        const before = structuredClone(session);
        expect(resolveSelection(session, text("1"))).toEqual({ replyId: rows[page * 7].id, typed: "1" });
        expect(resolveSelection(session, text("7"))).toEqual({ replyId: rows[page * 7 + 6].id, typed: "7" });
        expect(session).toEqual(before);
      }
    },
  );

  it.each([1, 2])("en la página %s de horarios los números se refieren a sus siete filas ya recortadas", (page) => {
    const customMatch = vi.fn();
    expect(resolveSelection(hours(page), text("1"), { customMatch, passthroughIds })).toEqual({ replyId: rows[page * 7].id, typed: "1" });
    expect(customMatch).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "+1", "8", "99", "99999"])("rechaza %s sin interpretarlo como una opción o como un horario", (value) => {
    const customMatch = vi.fn();
    expect(resolveSelection(hours(1), text(value), { customMatch, passthroughIds })).toHaveProperty("result");
    expect(customMatch).not.toHaveBeenCalled();
  });

  it("permite escribir los controles visibles de lista con acentos y conserva límites de página", () => {
    const next = resolveSelection(offered(), text("  Ver más opciones  "));
    expect("result" in next && next.result.session.counters[CounterKey.CITA_LIST_PAGE]).toBe(1);
    const previous = resolveSelection(offered(2), text("anteriores"));
    expect("result" in previous && previous.result.session.counters[CounterKey.CITA_LIST_PAGE]).toBe(1);
    for (const [page, value] of [
      [0, "Anteriores"],
      [2, "Ver más opciones"],
    ] as const) {
      const rejected = resolveSelection(offered(page), text(value));
      expect("result" in rejected && rejected.result.session.counters[CounterKey.CITA_LIST_PAGE]).toBe(page);
    }
  });

  it("los comandos de horarios solo producen navegación si ese control está permitido y existe la página", () => {
    expect(resolveSelection(hours(1), text("Ver más horarios"), { passthroughIds })).toEqual({ replyId: HoraPageButtonId.NEXT });
    expect(resolveSelection(hours(1), text("Horarios anteriores"), { passthroughIds })).toEqual({ replyId: HoraPageButtonId.PREV });
    expect(resolveSelection(hours(), text("Ver más horarios"))).toHaveProperty("result");
    expect(resolveSelection(hours(), text("Horarios anteriores"), { passthroughIds })).toHaveProperty("result");
    expect(resolveSelection(hours(2), text("Ver más horarios"), { passthroughIds })).toHaveProperty("result");
    expect(resolveSelection(offered(), text("Ver más horarios"), { passthroughIds })).toHaveProperty("result");
    expect(resolveSelection(hours(), text("Ver más opciones"), { passthroughIds })).toHaveProperty("result");
  });

  it("conserva la interpretación anterior para web y citas nuevas de WhatsApp", () => {
    const web = { ...offered(1), channel: SessionChannel.WEB };
    const newAppointment = offered(1);
    delete newAppointment.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
    expect(resolveSelection(web, text("1"))).toEqual({ replyId: rows[0].id, typed: "1" });
    expect(resolveSelection(newAppointment, text("1"))).toEqual({ replyId: rows[0].id, typed: "1" });
  });
});
