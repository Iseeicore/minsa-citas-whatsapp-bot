import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import type { InboundEvent, Session } from "@/lib/fsm/core/types";
import { UnknownStateError } from "@/lib/errors/unknown-state-error";
import { InboundEventType } from "@/lib/enums/inbound-event-type";

const NOW = Date.parse("2026-10-12T15:00:00.000Z");

function sessionIn(state: string): Session {
  return { state, slots: {}, counters: {} } as unknown as Session;
}

function thrownBy(state: string): unknown {
  const event: InboundEvent = { from: "wa-1", type: InboundEventType.TEXT, text: "hola" };
  try {
    handle(sessionIn(state), event, NOW);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("a session in a state nobody owns", () => {
  it.each([
    ["ghost_state", "handle", 'handle: unknown state "ghost_state"'],
    ["cita_ghost_state", "handleCita", 'handleCita: unknown state "cita_ghost_state"'],
    ["consulta_ghost_state", "handleConsulta", 'handleConsulta: unknown state "consulta_ghost_state"'],
    ["incidencia_ghost_state", "handleIncidencia", 'handleIncidencia: unknown state "incidencia_ghost_state"'],
  ])("%s makes %s throw an UnknownStateError with the same message as before", (state, handler, message) => {
    const error = thrownBy(state);

    expect(error).toBeInstanceOf(UnknownStateError);
    expect(error).toMatchObject({ name: "UnknownStateError", handler, state, message });
  });
});
