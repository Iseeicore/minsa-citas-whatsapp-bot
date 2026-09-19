import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sessionRowExists: vi.fn(async () => false),
  resetSession: vi.fn(async () => undefined),
  resetAll: vi.fn(async () => undefined),
  runTurn: vi.fn(async () => ({
    sent: [{ kind: "send_text", text: "respuesta del bot" }],
    session: { state: "main_menu", slots: {}, counters: {} },
  })),
}));

vi.mock("@/lib/fsm/session-store", () => ({
  sessionRowExists: mocks.sessionRowExists,
  resetSession: mocks.resetSession,
  resetAllSandboxTestSessions: mocks.resetAll,
}));
vi.mock("@/lib/fsm/executor", () => ({ runTurn: mocks.runTurn }));

import { POST } from "@/app/api/sandbox/route";
import { TurnLockTimeoutError } from "@/lib/fsm/turn-lock";
import { FIRST_MESSAGE_REJECTION_TEXT, MEDIA_WITHOUT_SESSION_TEXT } from "@/lib/security/payload-filter";

async function send(body: Record<string, unknown>) {
  const request = new NextRequest("http://localhost/api/sandbox", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: "sandbox-qa", ...body }),
  });
  const response = await POST(request);
  return { status: response.status, json: (await response.json()) as { sent: Array<{ kind: string; text?: string }> } };
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

  it("an ordinary first message and a first button tap are not filtered", async () => {
    await send({ type: "text", text: "Hola" });
    await send({ type: "button", listId: "agendar_cita" });

    expect(mocks.runTurn).toHaveBeenCalledTimes(2);
  });

  it("after a reset the next message is a first message again (so the rules apply again)", async () => {
    mocks.sessionRowExists.mockResolvedValue(false); // reset wiped the row

    const { json } = await send({ type: "text", text: "a".repeat(400), reset: true });

    expect(mocks.resetSession).toHaveBeenCalledTimes(1);
    expect(json.sent[0].text).toBe(FIRST_MESSAGE_REJECTION_TEXT);
  });
});

describe("turn lock timeout", () => {
  it("answers 503 BUSY instead of replying from a stale session", async () => {
    mocks.runTurn.mockRejectedValueOnce(new TurnLockTimeoutError("sandbox-qa", "process"));

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
