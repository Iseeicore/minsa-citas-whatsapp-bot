import { describe, expect, it } from "vitest";
import { UnknownStateError } from "@/lib/errors/unknown-state-error";

describe("UnknownStateError", () => {
  it.each([
    ["handle", 'handle: unknown state "ghost_state"'],
    ["handleCita", 'handleCita: unknown state "ghost_state"'],
    ["handleConsulta", 'handleConsulta: unknown state "ghost_state"'],
    ["handleIncidencia", 'handleIncidencia: unknown state "ghost_state"'],
  ])("keeps the message of the %s dispatcher byte for byte", (handler, message) => {
    expect(new UnknownStateError(handler, "ghost_state").message).toBe(message);
  });

  it("is an Error named after its class that carries the handler and the state", () => {
    const error = new UnknownStateError("handleCita", "ghost_state");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UnknownStateError);
    expect(error.name).toBe("UnknownStateError");
    expect(error.handler).toBe("handleCita");
    expect(error.state).toBe("ghost_state");
  });
});
