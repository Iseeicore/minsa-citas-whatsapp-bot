import { describe, expect, it } from "vitest";
import { TurnLockTimeoutError } from "@/lib/errors/turn-lock-timeout-error";
import { TurnLockLayer } from "@/lib/enums/turn-lock-layer";

describe("TurnLockTimeoutError", () => {
  it.each([
    [TurnLockLayer.PROCESS, "Timed out waiting for the process turn lock of wa-9"],
    [TurnLockLayer.DATABASE, "Timed out waiting for the database turn lock of wa-9"],
  ])("keeps the message of the %s layer byte for byte", (layer, message) => {
    expect(new TurnLockTimeoutError("wa-9", layer).message).toBe(message);
  });

  it("is an Error named after its class that carries the waId and the layer", () => {
    const error = new TurnLockTimeoutError("wa-9", TurnLockLayer.DATABASE);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TurnLockTimeoutError);
    expect(error.name).toBe("TurnLockTimeoutError");
    expect(error.waId).toBe("wa-9");
    expect(error.layer).toBe(TurnLockLayer.DATABASE);
  });
});
