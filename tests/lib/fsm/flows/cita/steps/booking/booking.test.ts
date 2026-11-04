import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { TERMINAL_STATES } from "@/lib/fsm/core/handlers-shared";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { queryResult, sent } from "@/tests/support/fsm-events";

const MINSA_9000 = "Error al generar la cita en el servicio externo: 9000 | El paciente tiene una cita por atender en este servicio";

describe("MINSA 9000: weekly appointment limit", () => {
  it("sends one farewell and closes the conversation", () => {
    const result = handle(
      {
        state: SessionState.CITA_BOOKING_PENDING,
        slots: { [SlotKey.CITA_DNI]: "12345678", [SlotKey.CITA_FECHA]: "31/12/2099" },
        counters: {},
      },
      queryResult("book_appointment", { status: "weekly_limit", message: MINSA_9000 }),
    );

    expect(sent(result)).toEqual([
      {
        kind: "send_text",
        text: "Alcanzaste el máximo de citas permitidas por semana. Podrás agendar una nueva cita la próxima semana.\n\nGracias por comunicarte con el *Ministerio de Salud del Perú*. ¡Que tengas un buen día! 👋",
      },
    ]);
    expect(TERMINAL_STATES.has(result.session.state)).toBe(true);
    expect(result.session.slots).toEqual({});
    expect(result.notes).toEqual([{ kind: "booking_rejected", level: "warn", detail: { status: "weekly_limit", reason: "weekly_limit" } }]);
  });
});
