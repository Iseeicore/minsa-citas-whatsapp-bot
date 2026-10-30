import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sessionRowExists: vi.fn(async () => true),
  runTurn: vi.fn(async () => ({
    sent: [{ kind: "send_text", text: "respuesta del bot" }],
    session: { state: "main_menu", slots: {}, counters: {} },
  })),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  sessionRowExists: mocks.sessionRowExists,
  resetSession: vi.fn(async () => undefined),
  saveSession: vi.fn(async () => undefined),
  closeSession: vi.fn(async () => undefined),
  resetAllSandboxTestSessions: vi.fn(async () => undefined),
}));
vi.mock("@/lib/fsm/core/executor", () => ({ runTurn: mocks.runTurn }));

import { POST } from "@/app/api/sandbox/route";
import { SANDBOX_TEXT_MAX_LENGTH } from "@/lib/constants/sandbox-text-limit";

const TOO_LONG_TEXT = "No podemos procesar tu mensaje: reduce la cantidad de caracteres (máximo 1000).";

async function send(body: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "sandbox-qa", ...body }),
    }),
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.stubEnv("SANDBOX_ENABLED", "true");
  vi.stubEnv("SANDBOX_SHARED_SECRET", "");
  vi.clearAllMocks();
});

describe("the Chat-bot API limits the text to the shared maximum", () => {
  it("accepts a text of exactly the limit and runs the turn", async () => {
    const text = "a".repeat(SANDBOX_TEXT_MAX_LENGTH);

    const { status } = await send({ type: "text", text });

    expect(status).toBe(200);
    expect(mocks.runTurn).toHaveBeenCalledWith("sandbox-qa", expect.objectContaining({ text }), expect.anything());
  });

  it("answers 422 TEXT_TOO_LONG with the citizen message for one character more, without running the turn", async () => {
    const { status, json } = await send({ type: "text", text: "a".repeat(SANDBOX_TEXT_MAX_LENGTH + 1) });

    expect(status).toBe(422);
    expect(json).toEqual({ error: "TEXT_TOO_LONG", message: TOO_LONG_TEXT });
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("keeps INVALID_BODY for any other validation error", async () => {
    const { status, json } = await send({ type: "voz", text: "hola" });

    expect(status).toBe(400);
    expect(json).toMatchObject({ error: "INVALID_BODY" });
  });
});
