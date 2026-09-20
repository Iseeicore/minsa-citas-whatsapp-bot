import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The webhook route end to end, with every external dependency replaced, to pin
// down ORDER: the perimeter must run before any database write and before the
// per-waId turn lock.
const mocks = vi.hoisted(() => ({
  afterPromises: [] as Promise<unknown>[],
  conversationUpsert: vi.fn(async () => ({ id: "conv-1" })),
  // The inbound row is inserted (never read first): a duplicate delivery is the
  // unique-constraint error P2002, which is how the webhook tells it is one.
  messageCreate: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  messageUpdateMany: vi.fn(async () => ({})),
  sessionFindUnique: vi.fn(async (): Promise<{ id: string; state: string } | null> => ({ id: "x", state: "main_menu" })),
  sessionRowExists: vi.fn(async () => false),
  saveSession: vi.fn(async () => undefined),
  sendWhatsAppEffect: vi.fn(async () => new Response("{}", { status: 200 })),
  sendAndRecordEffect: vi.fn(async () => undefined),
  sendAndRecordCtaUrl: vi.fn(async () => undefined),
  sendTypingIndicator: vi.fn(async () => undefined),
  downloadMedia: vi.fn(async () => "data:image/png;base64,AAAA"),
  runTurnUnlocked: vi.fn(async () => ({ sent: [], session: { state: "main_menu", slots: {}, counters: {} } })),
  withTurnLock: vi.fn(async (_waId: string, task: () => Promise<unknown>) => task()),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    // Run the background work now and remember it so the test can await it.
    after: (task: () => Promise<unknown>) => {
      mocks.afterPromises.push(task());
    },
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { upsert: mocks.conversationUpsert },
    message: { create: mocks.messageCreate, updateMany: mocks.messageUpdateMany },
    sandboxSession: { findUnique: mocks.sessionFindUnique },
  },
}));
vi.mock("@/lib/whatsapp-send", () => ({
  sendWhatsAppEffect: mocks.sendWhatsAppEffect,
  sendAndRecordEffect: mocks.sendAndRecordEffect,
  sendAndRecordCtaUrl: mocks.sendAndRecordCtaUrl,
  sendTypingIndicator: mocks.sendTypingIndicator,
}));
vi.mock("@/lib/whatsapp-media", () => ({ downloadWhatsAppMediaAsDataUri: mocks.downloadMedia }));
vi.mock("@/lib/fsm/session-store", () => ({ sessionRowExists: mocks.sessionRowExists, saveSession: mocks.saveSession }));
vi.mock("@/lib/fsm/executor", () => ({ runTurnUnlocked: mocks.runTurnUnlocked }));
// Only the lock itself is replaced; its timeout error and busy text stay real.
vi.mock("@/lib/fsm/turn-lock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fsm/turn-lock")>()),
  withTurnLock: mocks.withTurnLock,
}));

import { POST } from "@/app/webhook/whatsapp/route";
import { OOS_MESSAGES } from "@/lib/fsm/out-of-scope-messages";
import { TURN_FAILURE_TEXT, TurnLockTimeoutError } from "@/lib/fsm/turn-lock";
import { configureLogger } from "@/lib/observability/logger";
import { FIRST_MESSAGE_REJECTION_TEXT, MEDIA_WITHOUT_SESSION_TEXT } from "@/lib/security/payload-filter";
import { MUTE_NOTICE_TEXT } from "@/lib/security/perimeter";

const SECRET = "test-app-secret";
let counter = 0;
const freshWaId = () => `5191100${String(++counter).padStart(5, "0")}`;

type Message = { id: string; from_user_id: string; timestamp: string; type: string; text?: { body: string }; image?: { id: string } };

let messageCounter = 0;
const textMessage = (waId: string, body: string): Message => ({
  id: `wamid.${++messageCounter}`,
  from_user_id: waId,
  timestamp: "1780000000",
  type: "text",
  text: { body },
});

async function deliver(messages: Message[], extra: Record<string, unknown> = {}) {
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { contacts: [], messages, ...extra } }] }],
  });
  const signature = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  const request = new NextRequest("http://localhost/webhook/whatsapp", {
    method: "POST",
    headers: { "x-hub-signature-256": signature, "content-type": "application/json" },
    body,
  });

  const response = await POST(request);
  await Promise.all(mocks.afterPromises.splice(0));
  return response;
}

// Same payload as deliver(), but with whatever signature header the test wants.
async function deliverWithSignature(messages: Message[], signature: string | null) {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [], messages } }] }] });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["x-hub-signature-256"] = signature;

  const response = await POST(new NextRequest("http://localhost/webhook/whatsapp", { method: "POST", headers, body }));
  await Promise.all(mocks.afterPromises.splice(0));
  return response;
}

beforeEach(() => {
  process.env.META_APP_SECRET = SECRET;
  vi.clearAllMocks();
  mocks.sessionRowExists.mockResolvedValue(false);
  mocks.sessionFindUnique.mockResolvedValue({ id: "x", state: "main_menu" });
});

describe("transport security: HMAC-SHA256 signature (Paso 0)", () => {
  const forged = "sha256=" + "0".repeat(64);

  it.each([
    ["a signature that does not match the payload", forged],
    ["a signature made with another secret", "sha256=" + crypto.createHmac("sha256", "other-secret").update("x").digest("hex")],
    ["no signature header at all", null],
    ["a signature of the wrong length", "sha256=abc"],
  ])("rejects %s with 403 and does nothing else", async (_name, signature) => {
    const response = await deliverWithSignature([textMessage(freshWaId(), "Hola")], signature);

    expect(response.status).toBe(403);
    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
    expect(mocks.withTurnLock).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppEffect).not.toHaveBeenCalled();
    expect(mocks.sendAndRecordEffect).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed payload", async () => {
    const response = await deliver([textMessage(freshWaId(), "Hola")]);

    expect(response.status).toBe(200);
  });
});

describe("rate limiting (drop the flood, tell the citizen once, still acknowledge Meta)", () => {
  it("processes 5 messages in a burst and drops the rest, with no database work for the dropped ones", async () => {
    const waId = freshWaId();
    const burst = Array.from({ length: 8 }, () => textMessage(waId, "hola"));

    const response = await deliver(burst);

    expect(response.status).toBe(200); // Meta must always get its 200 or it retries the flood
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.conversationUpsert).toHaveBeenCalledTimes(5);
    expect(mocks.runTurnUnlocked).toHaveBeenCalledTimes(5);
    expect(mocks.sessionRowExists).not.toHaveBeenCalled();
  });

  it("the citizen is told ONCE, when the mute starts, and the rest of the burst gets no reply", async () => {
    const waId = freshWaId();

    await deliver(Array.from({ length: 8 }, () => textMessage(waId, "hola")));

    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledTimes(1);
    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledWith(waId, { kind: "send_text", text: MUTE_NOTICE_TEXT });
    // The notice is a fixed reply: nothing was stored or locked for that 6th message.
    expect(mocks.conversationUpsert).toHaveBeenCalledTimes(5);
    expect(mocks.messageCreate).toHaveBeenCalledTimes(5);
    expect(mocks.withTurnLock).toHaveBeenCalledTimes(5);
  });

  it("while muted, further messages get no reply at all (the notice is not repeated)", async () => {
    const waId = freshWaId();
    await deliver(Array.from({ length: 6 }, () => textMessage(waId, "hola")));
    vi.clearAllMocks();

    await deliver([textMessage(waId, "hola"), textMessage(waId, "¿hay alguien?")]);

    expect(mocks.sendWhatsAppEffect).not.toHaveBeenCalled();
    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
  });

  it("a notice that fails to send does not break the webhook", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sendWhatsAppEffect.mockRejectedValueOnce(new Error("graph down"));
    const waId = freshWaId();

    const response = await deliver(Array.from({ length: 7 }, () => textMessage(waId, "hola")));

    expect(response.status).toBe(200);
    error.mockRestore();
  });

  it("another citizen is told nothing because someone else flooded", async () => {
    await deliver(Array.from({ length: 8 }, () => textMessage(freshWaId(), "hola")));
    vi.clearAllMocks();

    await deliver([textMessage(freshWaId(), "hola")]);

    expect(mocks.sendWhatsAppEffect).not.toHaveBeenCalled();
  });

  it("more than 20 messages in a minute bans the waId: later messages are dropped too", async () => {
    const waId = freshWaId();
    await deliver(Array.from({ length: 25 }, () => textMessage(waId, "hola")));
    vi.clearAllMocks();

    await deliver([textMessage(waId, "Hola, quiero una cita")]);

    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
    expect(mocks.withTurnLock).not.toHaveBeenCalled();
  });

  it("a number that just flooded stays muted: its next messages get no reply and no database work", async () => {
    const waId = freshWaId();
    await deliver(Array.from({ length: 8 }, () => textMessage(waId, "hola")));
    vi.clearAllMocks();

    await deliver([textMessage(waId, "Hola, quiero una cita")]);

    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppEffect).not.toHaveBeenCalled();
  });

  it("another citizen is not affected by someone else's flood", async () => {
    await deliver(Array.from({ length: 25 }, () => textMessage(freshWaId(), "hola")));
    vi.clearAllMocks();

    await deliver([textMessage(freshWaId(), "hola")]);

    expect(mocks.runTurnUnlocked).toHaveBeenCalledTimes(1);
  });
});

describe("out-of-scope consultations at first contact", () => {
  const repliedWith = () => mocks.sendAndRecordEffect.mock.calls.map((call) => (call as unknown as [string, string, unknown])[2]);

  it("a consultation gets its message and the session waits in the menu", async () => {
    mocks.sessionFindUnique.mockResolvedValue(null);

    await deliver([textMessage(freshWaId(), "¿Mi SIS está activo?")]);

    expect(repliedWith()).toEqual([{ kind: "send_text", text: OOS_MESSAGES["OOS-02"] }]);
    expect(mocks.saveSession).toHaveBeenCalledWith(expect.any(String), { state: "main_menu", slots: {}, counters: {} });
    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
  });

  it("an emergency that insults is answered as an emergency, not with the institutional warning", async () => {
    mocks.sessionFindUnique.mockResolvedValue(null);

    await deliver([textMessage(freshWaId(), "ustedes son unos idiotas, mi mamá no puede respirar")]);

    expect(repliedWith()).toEqual([{ kind: "send_text", text: OOS_MESSAGES["OOS-01"] }]);
  });

  it("an emergency as the first message ends the conversation: one message, and the session is closed", async () => {
    mocks.sessionFindUnique.mockResolvedValue(null);

    await deliver([textMessage(freshWaId(), "me duele el pecho, creo que es un infarto")]);

    expect(repliedWith()).toEqual([{ kind: "send_text", text: OOS_MESSAGES["OOS-01"] }]);
    expect(mocks.saveSession).toHaveBeenCalledWith(expect.any(String), { state: "emergency_closed", slots: {}, counters: {} });
    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
  });

  it("an insult that is not an emergency still gets the warning", async () => {
    mocks.sessionFindUnique.mockResolvedValue(null);

    await deliver([textMessage(freshWaId(), "eres un idiota")]);

    expect(repliedWith()).toHaveLength(1);
    expect(repliedWith()[0]).toMatchObject({ kind: "send_buttons" });
  });
});

describe("first-message payload filter (fixed reply, no transaction, no lock)", () => {
  it.each([
    ["longer than 300 characters", "a".repeat(301), FIRST_MESSAGE_REJECTION_TEXT],
    ["a link", "mira https://ofertas.example.com/gana", FIRST_MESSAGE_REJECTION_TEXT],
    ["a wa.me link", "escríbeme a wa.me/51999999999", FIRST_MESSAGE_REJECTION_TEXT],
    ["a bare .com domain", "visita ofertas.com", FIRST_MESSAGE_REJECTION_TEXT],
    ["a .pe domain", "entra a mipagina.pe", FIRST_MESSAGE_REJECTION_TEXT],
  ])("a first message %s gets the fixed rejection", async (_name, body, reply) => {
    const waId = freshWaId();

    await deliver([textMessage(waId, body)]);

    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledTimes(1);
    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledWith(waId, { kind: "send_text", text: reply });
    // Nothing was persisted or locked for it:
    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.withTurnLock).not.toHaveBeenCalled();
    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
    expect(mocks.saveSession).not.toHaveBeenCalled();
  });

  it.each(["image", "sticker", "audio"])("a %s as the first message gets the text-only reminder and is never downloaded", async (type) => {
    const waId = freshWaId();
    const message: Message = { id: `wamid.${++messageCounter}`, from_user_id: waId, timestamp: "1780000000", type, image: { id: "media-1" } };

    await deliver([message]);

    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledWith(waId, { kind: "send_text", text: MEDIA_WITHOUT_SESSION_TEXT });
    expect(mocks.downloadMedia).not.toHaveBeenCalled();
    expect(mocks.conversationUpsert).not.toHaveBeenCalled();
    expect(mocks.withTurnLock).not.toHaveBeenCalled();
  });

  it("the same long message inside an open session is NOT rejected (a complaint can be long)", async () => {
    mocks.sessionRowExists.mockResolvedValue(true);
    const waId = freshWaId();

    await deliver([textMessage(waId, "a".repeat(700))]);

    expect(mocks.sendWhatsAppEffect).not.toHaveBeenCalled();
    expect(mocks.conversationUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.runTurnUnlocked).toHaveBeenCalledTimes(1);
  });

  it("an ordinary first message pays no extra session lookup for the filter", async () => {
    await deliver([textMessage(freshWaId(), "Hola")]);

    expect(mocks.sessionRowExists).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppEffect).not.toHaveBeenCalled();
  });

  it("delivery statuses are untouched by the perimeter", async () => {
    await deliver([], { statuses: [{ id: "wamid.status-1", status: "delivered" }] });

    expect(mocks.messageUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("a failing Graph API send does not break the webhook", async () => {
    mocks.sendWhatsAppEffect.mockRejectedValueOnce(new Error("graph down"));

    const response = await deliver([textMessage(freshWaId(), "a".repeat(400))]);

    expect(response.status).toBe(200);
  });
});

describe("a message Meta delivers twice is answered once (DATA-01)", () => {
  const duplicate = () => Object.assign(new Error("Unique constraint failed on the fields: (`waMessageId`)"), { code: "P2002" });

  it("stores the inbound message with one insert, keyed by its WhatsApp id, and answers it", async () => {
    const message = textMessage(freshWaId(), "Hola");

    await deliver([message]);

    expect(mocks.messageCreate).toHaveBeenCalledTimes(1);
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ waMessageId: message.id, conversationId: "conv-1", content: "Hola" }),
    });
    expect(mocks.runTurnUnlocked).toHaveBeenCalledTimes(1);
  });

  it("a redelivery (unique-constraint error) is skipped: no turn, no lock, no reply", async () => {
    mocks.messageCreate.mockRejectedValueOnce(duplicate());

    const response = await deliver([textMessage(freshWaId(), "Hola")]);

    expect(response.status).toBe(200);
    expect(mocks.withTurnLock).not.toHaveBeenCalled();
    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppEffect).not.toHaveBeenCalled();
    expect(mocks.sendAndRecordEffect).not.toHaveBeenCalled();
  });

  it("two copies of the same message racing in one payload: only the one that inserted is answered", async () => {
    mocks.messageCreate.mockResolvedValueOnce({}).mockRejectedValueOnce(duplicate());
    const message = textMessage(freshWaId(), "Hola");

    await deliver([message, message]);

    expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
    expect(mocks.runTurnUnlocked).toHaveBeenCalledTimes(1);
  });

  it("any other database error is NOT taken for a redelivery: the turn does not run and the citizen is told to write again", async () => {
    const lines: Array<{ level: string; record: Record<string, unknown> }> = [];
    const restore = configureLogger({ sink: (level, line) => lines.push({ level, record: JSON.parse(line) }), level: "info" });
    const waId = freshWaId();
    mocks.messageCreate.mockRejectedValueOnce(new Error("connection reset"));

    const response = await deliver([textMessage(waId, "Hola")]);
    restore();

    expect(response.status).toBe(200);
    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledWith(waId, { kind: "send_text", text: TURN_FAILURE_TEXT });
    const entry = lines.find((line) => line.record.event === "webhook.message_failed");
    expect(entry?.level).toBe("error");
    expect(entry?.record).toMatchObject({ error: { message: "connection reset" } });
  });

  it("a redelivery does not stop the messages after it in the same payload", async () => {
    mocks.messageCreate.mockRejectedValueOnce(duplicate());

    await deliver([textMessage(freshWaId(), "Hola"), textMessage(freshWaId(), "Hola")]);

    expect(mocks.runTurnUnlocked).toHaveBeenCalledTimes(1);
  });
});

describe("a failed turn or a lock timeout never leaves the citizen in silence (G3, C4.3)", () => {
  it("sends the fixed friendly text instead of leaving the message unanswered", async () => {
    const waId = freshWaId();
    mocks.withTurnLock.mockRejectedValueOnce(new TurnLockTimeoutError(waId, "process"));

    const response = await deliver([textMessage(waId, "Hola")]);

    expect(response.status).toBe(200);
    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledTimes(1);
    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledWith(waId, { kind: "send_text", text: TURN_FAILURE_TEXT });
    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
  });

  it("the text is the institutional one: a temporary problem, and to write again in a moment", () => {
    expect(TURN_FAILURE_TEXT).toBe(
      "Ocurrió un inconveniente temporal al procesar tu solicitud. Por favor, intenta escribir nuevamente en unos instantes.",
    );
  });

  it("the database layer timing out is answered the same way", async () => {
    const waId = freshWaId();
    mocks.withTurnLock.mockRejectedValueOnce(new TurnLockTimeoutError(waId, "database"));

    await deliver([textMessage(waId, "Hola")]);

    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledWith(waId, { kind: "send_text", text: TURN_FAILURE_TEXT });
  });

  it("the timeout is logged as a warning with the layer, and the waId is masked", async () => {
    const lines: Array<{ level: string; record: Record<string, unknown> }> = [];
    const restore = configureLogger({ sink: (level, line) => lines.push({ level, record: JSON.parse(line) }), level: "info" });
    const waId = freshWaId();
    mocks.withTurnLock.mockRejectedValueOnce(new TurnLockTimeoutError(waId, "database"));

    await deliver([textMessage(waId, "Hola")]);
    restore();

    const entry = lines.find((line) => line.record.event === "turn.lock_timeout");
    expect(entry?.level).toBe("warn");
    expect(entry?.record).toMatchObject({ layer: "database", waId: `...${waId.slice(-4)}` });
    expect(JSON.stringify(entry?.record)).not.toContain(waId);
  });

  it("another citizen in the same payload is still answered", async () => {
    mocks.withTurnLock.mockRejectedValueOnce(new TurnLockTimeoutError("x", "process"));

    await deliver([textMessage(freshWaId(), "Hola"), textMessage(freshWaId(), "Hola")]);

    expect(mocks.runTurnUnlocked).toHaveBeenCalledTimes(1);
  });

  it("an unexpected error of the turn gets the same friendly text, and is logged as an error", async () => {
    const lines: Array<{ level: string; record: Record<string, unknown> }> = [];
    const restore = configureLogger({ sink: (level, line) => lines.push({ level, record: JSON.parse(line) }), level: "info" });
    const waId = freshWaId();
    mocks.withTurnLock.mockRejectedValueOnce(new Error("boom"));

    const response = await deliver([textMessage(waId, "Hola")]);
    restore();

    expect(response.status).toBe(200);
    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledTimes(1);
    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledWith(waId, { kind: "send_text", text: TURN_FAILURE_TEXT });
    const entry = lines.find((line) => line.record.event === "webhook.message_failed");
    expect(entry?.level).toBe("error");
    expect(entry?.record).toMatchObject({ waId: `...${waId.slice(-4)}`, error: { message: "boom" } });
    expect(JSON.stringify(entry?.record)).not.toContain(waId);
  });

  it("a failure while storing the conversation is answered too, and the turn never runs", async () => {
    const waId = freshWaId();
    mocks.conversationUpsert.mockRejectedValueOnce(new Error("database is down"));

    await deliver([textMessage(waId, "Hola")]);

    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledWith(waId, { kind: "send_text", text: TURN_FAILURE_TEXT });
    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
  });

  it("a failure inside the turn itself (after it started) is answered", async () => {
    const waId = freshWaId();
    mocks.runTurnUnlocked.mockRejectedValueOnce(new Error("MINSA exploded"));

    await deliver([textMessage(waId, "Hola")]);

    expect(mocks.sendWhatsAppEffect).toHaveBeenCalledWith(waId, { kind: "send_text", text: TURN_FAILURE_TEXT });
  });

  it("one citizen's failure does not stop the other messages of the same delivery", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.withTurnLock.mockRejectedValueOnce(new Error("boom"));

    await deliver([textMessage(freshWaId(), "Hola"), textMessage(freshWaId(), "Hola")]);

    expect(mocks.runTurnUnlocked).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("if even the friendly text cannot be sent, the webhook still answers Meta", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.withTurnLock.mockRejectedValueOnce(new Error("boom"));
    mocks.sendWhatsAppEffect.mockRejectedValueOnce(new Error("graph down"));

    const response = await deliver([textMessage(freshWaId(), "Hola")]);

    expect(response.status).toBe(200);
    error.mockRestore();
  });

  it("a redelivery (already received) is never answered with the failure text", async () => {
    const waId = freshWaId();
    mocks.messageCreate.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));

    await deliver([textMessage(waId, "Hola")]);

    expect(mocks.sendWhatsAppEffect).not.toHaveBeenCalled();
  });
});
