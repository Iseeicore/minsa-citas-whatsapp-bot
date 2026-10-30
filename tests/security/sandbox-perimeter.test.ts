import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sessionRowExists: vi.fn(async () => false),
  resetSession: vi.fn(async () => undefined),
  saveSession: vi.fn(async () => undefined),
  runTurn: vi.fn(async () => ({
    sent: [{ kind: "send_text", text: "respuesta del bot" }],
    session: { state: "main_menu", slots: {}, counters: {} },
  })),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  sessionRowExists: mocks.sessionRowExists,
  resetSession: mocks.resetSession,
  saveSession: mocks.saveSession,
}));
vi.mock("@/lib/fsm/core/executor", () => ({ runTurn: mocks.runTurn }));

import { POST } from "@/app/api/sandbox/route";
import { TurnLockTimeoutError } from "@/lib/errors/turn-lock-timeout-error";
import { TurnLockLayer } from "@/lib/enums/turn-lock-layer";
import { FIRST_MESSAGE_REJECTION_TEXT, MEDIA_WITHOUT_SESSION_TEXT } from "@/lib/constants/textos/seguridad";
import { SANDBOX_TEXT_MAX_LENGTH } from "@/lib/constants/sandbox-text-limit";
import { API_ERRORS } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";

async function send(body: Record<string, unknown>) {
  const request = new NextRequest("http://localhost/api/sandbox", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: "sandbox-qa", ...body }),
  });
  const response = await POST(request);
  return {
    status: response.status,
    json: (await response.json()) as { sent: Array<{ kind: string; text?: string }>; error?: string; message?: string },
  };
}

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  vi.clearAllMocks();
  mocks.sessionRowExists.mockResolvedValue(false);
});

describe("Sandbox mirrors the first-message perimeter of WhatsApp", () => {
  it.each([
    ["longer than 300 characters", "a".repeat(301), FIRST_MESSAGE_REJECTION_TEXT],
    ["with a link", "http://spam.example.org", FIRST_MESSAGE_REJECTION_TEXT],
    ["with wa.me", "wa.me/51999999999", FIRST_MESSAGE_REJECTION_TEXT],
    ["with a .com domain", "ofertas.com", FIRST_MESSAGE_REJECTION_TEXT],
  ])("a first message %s gets the fixed rejection and never reaches the FSM", async (_name, text, reply) => {
    const { status, json } = await send({ type: "text", text });

    expect(status).toBe(200);
    expect(json.sent).toEqual([{ kind: "send_text", text: reply }]);
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("a photo as the first message gets the text-only reminder", async () => {
    const { json } = await send({ type: "image", mediaDataUri: "data:image/png;base64,AAAA" });

    expect(json.sent).toEqual([{ kind: "send_text", text: MEDIA_WITHOUT_SESSION_TEXT }]);
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("a long message with an open session passes through to the FSM", async () => {
    mocks.sessionRowExists.mockResolvedValue(true);

    await send({ type: "text", text: "a".repeat(700) });

    expect(mocks.runTurn).toHaveBeenCalledTimes(1);
  });

  it("an ordinary first message is not filtered: it gets the web welcome with the main menu in one message", async () => {
    const { json } = await send({ type: "text", text: "Hola" });

    expect(json.sent.map((effect) => effect.kind)).toEqual(["send_interactive_list"]);
    expect(json.sent[0].text).toContain("Soy tu asistente virtual");
    expect(mocks.saveSession).toHaveBeenCalledWith("sandbox-qa", expect.objectContaining({ state: "main_menu" }));
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("a first message asking for a cita goes straight to the DNI", async () => {
    const { json } = await send({ type: "text", text: "Sabes quiero una cita para san Juan de Lurigancho para medicina general" });

    expect(json.sent).toHaveLength(1);
    expect(json.sent[0].text).toContain("Medicina General en San Juan de Lurigancho");
    expect(mocks.saveSession).toHaveBeenCalledWith("sandbox-qa", expect.objectContaining({ state: "cita_awaiting_dni" }));
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("a first message that is an emergency and insults gets the emergency message, not the guard's warning", async () => {
    const { json } = await send({ type: "text", text: "idiotas, mi hijo no respira" });

    expect(json.sent).toHaveLength(1);
    expect(json.sent[0].text).toContain("106");
    expect(mocks.saveSession).toHaveBeenCalledWith("sandbox-qa", { state: "emergency_closed", slots: {}, counters: {} });
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("a message once the conversation is open reaches the FSM", async () => {
    mocks.sessionRowExists.mockResolvedValue(true);

    await send({ type: "button", listId: "agendar_cita" });

    expect(mocks.runTurn).toHaveBeenCalledTimes(1);
  });

  it("after a reset the next message is a first message again (so the rules apply again)", async () => {
    mocks.sessionRowExists.mockResolvedValue(false);

    const { json } = await send({ type: "text", text: "a".repeat(400), reset: true });

    expect(mocks.resetSession).toHaveBeenCalledTimes(1);
    expect(json.sent[0].text).toBe(FIRST_MESSAGE_REJECTION_TEXT);
  });

  it("after a reset it does not ask the database whether the session exists: it was just deleted", async () => {
    await send({ type: "text", text: "Hola", reset: true });

    expect(mocks.resetSession).toHaveBeenCalledTimes(1);
    expect(mocks.sessionRowExists).not.toHaveBeenCalled();
    expect(mocks.saveSession).toHaveBeenCalledWith("sandbox-qa", expect.objectContaining({ state: "main_menu" }));
  });
});

describe("the Chat-bot API limits the text to the shared maximum", () => {
  beforeEach(() => {
    mocks.sessionRowExists.mockResolvedValue(true);
  });

  it("accepts a text of exactly the limit and runs the turn", async () => {
    const text = "a".repeat(SANDBOX_TEXT_MAX_LENGTH);

    const { status } = await send({ type: "text", text });

    expect(status).toBe(200);
    expect(mocks.runTurn).toHaveBeenCalledWith("sandbox-qa", expect.objectContaining({ text }), expect.anything());
  });

  it("answers 422 TEXT_TOO_LONG with the citizen message for one character more, without running the turn", async () => {
    const { status, json } = await send({ type: "text", text: "a".repeat(SANDBOX_TEXT_MAX_LENGTH + 1) });

    expect(status).toBe(422);
    expect(json).toEqual({ error: ApiErrorCode.TEXT_TOO_LONG, message: API_ERRORS[ApiErrorCode.TEXT_TOO_LONG].message });
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("keeps INVALID_BODY for any other validation error", async () => {
    const { status, json } = await send({ type: "voz", text: "hola" });

    expect(status).toBe(400);
    expect(json).toMatchObject({ error: ApiErrorCode.INVALID_BODY });
  });
});

describe("turn lock timeout", () => {
  it("answers 503 BUSY instead of replying from a stale session", async () => {
    mocks.sessionRowExists.mockResolvedValue(true);
    mocks.runTurn.mockRejectedValueOnce(new TurnLockTimeoutError("sandbox-qa", TurnLockLayer.PROCESS));

    const request = new NextRequest("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "sandbox-qa", type: "text", text: "Hola" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "BUSY" });
  });
});

describe("unexpected failure inside the turn", () => {
  it("answers 500 with an error code and a message instead of an empty body", async () => {
    mocks.sessionRowExists.mockResolvedValue(true);
    mocks.runTurn.mockRejectedValueOnce(new TypeError("fetch failed"));

    const { status, json } = await send({ type: "text", text: "75969078" });

    expect(status).toBe(500);
    expect(json).toMatchObject({ error: "INTERNAL" });
    expect(json.message).toEqual(expect.any(String));
    expect(JSON.stringify(json)).not.toContain("fetch failed");
  });
});
