import { describe, expect, it } from "vitest";
import { MissingHandlerResultError } from "@/lib/errors/missing-handler-result-error";

describe("MissingHandlerResultError", () => {
  it("names the state that produced no result", () => {
    expect(new MissingHandlerResultError("ghost_state").message).toBe('handle: no result for state "ghost_state"');
  });

  it("is an Error named after its class that carries the state", () => {
    const error = new MissingHandlerResultError("ghost_state");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MissingHandlerResultError);
    expect(error.name).toBe("MissingHandlerResultError");
    expect(error.state).toBe("ghost_state");
  });
});
