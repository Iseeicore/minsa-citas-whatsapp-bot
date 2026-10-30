import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => {
  process.env.DATABASE_ENABLED = "true";
  return {
    usuarioFindMany: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
    usuarioFindUnique: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
    usuarioUpdate: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
    mensajeFindMany: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
    mensajeFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
    mensajeCreate: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
    executeRaw: vi.fn<(...args: unknown[]) => Promise<number>>(async () => 1),
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    usuario: { findMany: db.usuarioFindMany, findUnique: db.usuarioFindUnique, update: db.usuarioUpdate },
    mensaje: { findMany: db.mensajeFindMany, findFirst: db.mensajeFindFirst, create: db.mensajeCreate },
    $executeRaw: db.executeRaw,
    $transaction: async (steps: Promise<unknown>[]) => Promise.all(steps),
  },
}));

import { GET as listConversations } from "@/app/api/conversations/route";
import { GET as listMessages } from "@/app/api/conversations/[id]/messages/route";
import { POST as closeConversation } from "@/app/api/conversations/[id]/close/route";
import { POST as sendMessage } from "@/app/api/messages/send/route";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { captureLogs } from "@/tests/support/capture-logs";

const FECHA = new Date("2026-10-04T10:00:00.000Z");
const usuario = (extra: Record<string, unknown> = {}) => ({
  id: "u-1",
  waId: "wa-1",
  profileName: "Ana",
  phoneNumber: "51999",
  estadoConversacionId: 1,
  ultimoMensajeEn: FECHA,
  fechaCreacion: FECHA,
  ...extra,
});
const mensaje = (extra: Record<string, unknown> = {}) => ({
  id: "m-1",
  usuarioId: "u-1",
  direccionMensajeId: 1,
  tipoMensajeId: 1,
  contenido: "hola",
  mediaId: null,
  waMessageId: "wamid.1",
  estadoMensajeId: 2,
  fechaHora: FECHA,
  fechaCreacion: FECHA,
  ...extra,
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("the inbox API keeps its contract on top of usuario and mensaje", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SANDBOX_PAGE_ENABLED", "true");
    vi.stubEnv("META_PHONE_NUMBER_ID", "123");
    vi.stubEnv("META_ACCESS_TOKEN", "token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("lists the active users, newest message first, as conversations", async () => {
    db.usuarioFindMany.mockResolvedValueOnce([usuario({ estadoConversacionId: 2 })]);

    const response = await listConversations();

    expect(db.usuarioFindMany).toHaveBeenCalledWith({ where: { activo: true }, orderBy: { ultimoMensajeEn: "desc" } });
    expect(await response.json()).toEqual([
      {
        id: "u-1",
        waId: "wa-1",
        phoneNumber: "51999",
        profileName: "Ana",
        status: "CLOSED",
        lastMessageAt: FECHA.toISOString(),
        createdAt: FECHA.toISOString(),
      },
    ]);
  });

  it("returns the messages with the legacy names, and the 24 h window from the last inbound one", async () => {
    const reciente = new Date(Date.now() - 60 * 60 * 1000);
    db.usuarioFindUnique.mockResolvedValueOnce({ estadoConversacionId: 1 });
    db.mensajeFindMany.mockResolvedValueOnce([
      mensaje({ direccionMensajeId: 2, tipoMensajeId: 2, mediaId: "media-9", estadoMensajeId: 4 }),
    ]);
    db.mensajeFindFirst.mockResolvedValueOnce(mensaje({ fechaHora: reciente }));

    const response = await listMessages(new NextRequest("http://localhost/api"), params("u-1"));
    const body = await response.json();

    expect(db.mensajeFindMany).toHaveBeenCalledWith({ where: { usuarioId: "u-1" }, orderBy: { fechaHora: "asc" } });
    expect(db.mensajeFindFirst).toHaveBeenCalledWith({
      where: { usuarioId: "u-1", direccionMensajeId: 1 },
      orderBy: { fechaHora: "desc" },
    });
    expect(body.status).toBe("OPEN");
    expect(body.windowOpen).toBe(true);
    expect(body.windowExpiresAt).toBe(new Date(reciente.getTime() + 24 * 60 * 60 * 1000).toISOString());
    expect(body.messages).toEqual([
      {
        id: "m-1",
        conversationId: "u-1",
        direction: "OUTBOUND",
        type: "IMAGE",
        content: "hola",
        mediaUrl: "media-9",
        waMessageId: "wamid.1",
        status: "READ",
        timestamp: FECHA.toISOString(),
        createdAt: FECHA.toISOString(),
      },
    ]);
  });

  it("reports the window closed when the citizen never wrote", async () => {
    db.usuarioFindUnique.mockResolvedValueOnce({ estadoConversacionId: 1 });

    const body = await (await listMessages(new NextRequest("http://localhost/api"), params("u-1"))).json();

    expect(body).toMatchObject({ windowOpen: false, windowExpiresAt: null, status: "OPEN" });
  });

  it("answers 404 for a conversation that does not exist, never an empty list", async () => {
    const response = await listMessages(new NextRequest("http://localhost/api"), params("nope"));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: ApiErrorCode.NOT_FOUND });
    expect(db.mensajeFindMany).not.toHaveBeenCalled();
  });

  it("closes a conversation as the inbox operator", async () => {
    db.usuarioFindUnique.mockResolvedValueOnce(usuario());
    db.usuarioUpdate.mockResolvedValueOnce(usuario({ estadoConversacionId: 2 }));

    const response = await closeConversation(new NextRequest("http://localhost/api", { method: "POST" }), params("u-1"));

    expect(db.usuarioUpdate).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { estadoConversacionId: 2 } });
    expect(db.executeRaw.mock.calls.map((call) => call[1])).toEqual(["operador:bandeja"]);
    expect(await response.json()).toMatchObject({ id: "u-1", status: "CLOSED" });
  });

  it("answers 404 when the conversation to close does not exist", async () => {
    const response = await closeConversation(new NextRequest("http://localhost/api", { method: "POST" }), params("nope"));

    expect(response.status).toBe(404);
    expect(db.usuarioUpdate).not.toHaveBeenCalled();
  });

  it("sends a message inside the window and records it as an outbound one signed by the operator", async () => {
    db.usuarioFindUnique.mockResolvedValueOnce(usuario());
    db.mensajeFindFirst.mockResolvedValueOnce(mensaje({ fechaHora: new Date() }));
    db.mensajeCreate.mockResolvedValueOnce(mensaje({ direccionMensajeId: 2, waMessageId: "wamid.out" }));
    vi.stubEnv("META_GRAPH_API_VERSION", "v22.0");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendMessage(post({ conversationId: "u-1", text: "hola" }));

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith("https://graph.facebook.com/v22.0/123/messages", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        recipient: usuario().waId,
        type: "text",
        text: { body: "hola" },
      }),
    });
    expect(db.mensajeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: "u-1",
        direccionMensajeId: 2,
        tipoMensajeId: 1,
        contenido: "hola",
        estadoMensajeId: 2,
        waMessageId: "wamid.out",
      }),
    });
    expect(db.executeRaw.mock.calls.map((call) => call[1])).toEqual(["operador:bandeja"]);
    expect(await response.json()).toMatchObject({ conversationId: "u-1", direction: "OUTBOUND", type: "TEXT", status: "SENT" });
  });

  it("refuses to send when the 24 h window expired", async () => {
    db.usuarioFindUnique.mockResolvedValueOnce(usuario());
    db.mensajeFindFirst.mockResolvedValueOnce(mensaje({ fechaHora: new Date(Date.now() - 25 * 60 * 60 * 1000) }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendMessage(post({ conversationId: "u-1", text: "hola" }));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.mensajeCreate).not.toHaveBeenCalled();
  });

  it.each<[string, () => Promise<Response>, ApiErrorCode, number]>([
    [
      "WhatsApp rejects the message",
      async () => new Response(JSON.stringify({ error: { code: 131047, message: "Re-engagement message" } }), { status: 400 }),
      ApiErrorCode.WHATSAPP_REJECTED,
      502,
    ],
    ["WhatsApp is down", async () => new Response("busy", { status: 503 }), ApiErrorCode.WHATSAPP_UNAVAILABLE, 503],
    ["WhatsApp throttles the number", async () => new Response("{}", { status: 429 }), ApiErrorCode.WHATSAPP_UNAVAILABLE, 503],
    ["the request never reaches WhatsApp", () => Promise.reject(new Error("network down")), ApiErrorCode.WHATSAPP_UNAVAILABLE, 503],
  ])("answers with the standard error format when %s, records nothing and logs the failure", async (_label, respond, errorCode, status) => {
    db.usuarioFindUnique.mockResolvedValueOnce(usuario());
    db.mensajeFindFirst.mockResolvedValueOnce(mensaje({ fechaHora: new Date() }));
    vi.stubGlobal("fetch", vi.fn(respond));
    const logs = captureLogs();

    const response = await sendMessage(post({ conversationId: "u-1", text: "hola" }));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: errorCode });
    expect(db.mensajeCreate).not.toHaveBeenCalled();
    expect(logs.map((line) => line.event)).toContain("inbox.send_failed");
  });

  it.each<[string, () => Promise<Response>, string]>([
    ["no message id", async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }), "missing_id"],
    ["a body that is not JSON", async () => new Response("<html>ok</html>", { status: 200 }), "unreadable_body"],
  ])("records a message WhatsApp accepted with %s, without its id, and warns about it", async (_label, respond, reason) => {
    db.usuarioFindUnique.mockResolvedValueOnce(usuario());
    db.mensajeFindFirst.mockResolvedValueOnce(mensaje({ fechaHora: new Date() }));
    db.mensajeCreate.mockResolvedValueOnce(mensaje({ direccionMensajeId: 2, waMessageId: null }));
    vi.stubGlobal("fetch", vi.fn(respond));
    const logs = captureLogs();

    const response = await sendMessage(post({ conversationId: "u-1", text: "hola" }));

    expect(response.status).toBe(201);
    expect(db.mensajeCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ waMessageId: null }) });
    expect(logs).toContainEqual(expect.objectContaining({ level: "warn", event: "whatsapp.sent_without_id", reason }));
  });

  it.each(["META_ACCESS_TOKEN", "META_PHONE_NUMBER_ID"])(
    "answers 503 without calling WhatsApp when %s is missing, and names the variable in the log",
    async (variable) => {
      db.usuarioFindUnique.mockResolvedValueOnce(usuario());
      db.mensajeFindFirst.mockResolvedValueOnce(mensaje({ fechaHora: new Date() }));
      vi.stubEnv(variable, "");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const logs = captureLogs();

      const response = await sendMessage(post({ conversationId: "u-1", text: "hola" }));

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: ApiErrorCode.WHATSAPP_UNAVAILABLE });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.mensajeCreate).not.toHaveBeenCalled();
      expect(logs).toContainEqual(expect.objectContaining({ event: "whatsapp.config_missing", variable }));
      expect(logs.map((line) => line.event)).toContain("inbox.send_failed");
    },
  );
});
