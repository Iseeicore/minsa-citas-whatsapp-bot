import { describe, expect, it } from "vitest";
import { MultipleQueryEffectsError } from "@/lib/errors/multiple-query-effects-error";

describe("MultipleQueryEffectsError", () => {
  it("keeps the message byte for byte", () => {
    expect(new MultipleQueryEffectsError(2).message).toBe("runTurn: handle() returned more than one query effect in a single pass");
  });

  it("is an Error named after its class that carries how many queries came back", () => {
    const error = new MultipleQueryEffectsError(3);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MultipleQueryEffectsError);
    expect(error.name).toBe("MultipleQueryEffectsError");
    expect(error.count).toBe(3);
  });
});
