import { describe, expect, it } from "vitest";
import { API_ERRORS, apiError } from "@/lib/http/api-error";

describe("apiError", () => {
  it("answers every error with one shape: the code, a Spanish message and the code's status", async () => {
    for (const [code, { status, message }] of Object.entries(API_ERRORS)) {
      const response = apiError(code as keyof typeof API_ERRORS);
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ error: code, message });
    }
  });

  it("maps each code to its HTTP status", () => {
    expect(API_ERRORS.INVALID_BODY.status).toBe(400);
    expect(API_ERRORS.NOT_FOUND.status).toBe(404);
    expect(API_ERRORS.WINDOW_EXPIRED.status).toBe(422);
    expect(API_ERRORS.PERSISTENCE_DISABLED.status).toBe(503);
    expect(API_ERRORS.BUSY.status).toBe(503);
  });

  it("accepts a more specific message, a technical detail and extra headers", async () => {
    const response = apiError("INVALID_BODY", {
      message: "Falta el texto.",
      detail: "text: Required",
      headers: { "Access-Control-Allow-Origin": "https://front.example.org" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("https://front.example.org");
    await expect(response.json()).resolves.toEqual({ error: "INVALID_BODY", message: "Falta el texto.", detail: "text: Required" });
  });
});
