import { describe, expect, it } from "vitest";
import { MaxPassesExceededError } from "@/lib/errors/max-passes-exceeded-error";
import { MAX_PASSES } from "@/lib/constants/limits/engine";

describe("MaxPassesExceededError", () => {
  it("keeps the message byte for byte", () => {
    expect(new MaxPassesExceededError(12).message).toBe(
      "runTurn: exceeded 12 query-resolution passes in a single turn — state machine bug",
    );
  });

  it("names the limit the engine really uses", () => {
    expect(new MaxPassesExceededError(MAX_PASSES).message).toBe(
      `runTurn: exceeded ${MAX_PASSES} query-resolution passes in a single turn — state machine bug`,
    );
  });

  it("is an Error named after its class that carries the limit", () => {
    const error = new MaxPassesExceededError(12);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MaxPassesExceededError);
    expect(error.name).toBe("MaxPassesExceededError");
    expect(error.maxPasses).toBe(12);
  });
});
