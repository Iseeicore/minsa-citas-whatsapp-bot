import { describe, expect, it } from "vitest";
import { toSandboxTurnFailureResponse } from "@/lib/http/sandbox-turn-failure";
import { API_ERRORS } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { TurnLockLayer } from "@/lib/enums/turn-lock-layer";
import { TurnLockTimeoutError } from "@/lib/errors/turn-lock-timeout-error";
import { captureLogs } from "@/tests/support/capture-logs";

const WA_ID = "51999000123";

describe("toSandboxTurnFailureResponse", () => {
  it("logs the cause of an unexpected failure without the full chat id and answers the generic 500", async () => {
    const lines = captureLogs();

    const response = toSandboxTurnFailureResponse(WA_ID, new Error("conexion caida"), { Vary: "Origin" });

    expect(response.status).toBe(API_ERRORS[ApiErrorCode.INTERNAL].status);
    expect(response.headers.get("Vary")).toBe("Origin");
    await expect(response.json()).resolves.toEqual({ error: ApiErrorCode.INTERNAL, message: API_ERRORS[ApiErrorCode.INTERNAL].message });
    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        event: "sandbox.turn_failed",
        waId: "...0123",
        error: { name: "Error", message: "conexion caida" },
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain(WA_ID);
  });

  it("answers BUSY when the turn lock timed out and leaves a warning instead of an error", async () => {
    const lines = captureLogs();

    const response = toSandboxTurnFailureResponse(WA_ID, new TurnLockTimeoutError(WA_ID, TurnLockLayer.PROCESS), {});

    expect(response.status).toBe(API_ERRORS[ApiErrorCode.BUSY].status);
    await expect(response.json()).resolves.toMatchObject({ error: ApiErrorCode.BUSY });
    expect(lines).toEqual([expect.objectContaining({ level: "warn", event: "turn.lock_timeout", waId: "...0123" })]);
  });
});
