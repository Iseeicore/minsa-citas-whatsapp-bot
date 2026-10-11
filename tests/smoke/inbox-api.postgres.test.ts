import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/whatsapp/webhook/answer", () => ({
  answerMessage: vi.fn(async () => undefined),
  sendFixedReply: vi.fn(async () => undefined),
  answerFailure: vi.fn(async () => undefined),
}));

import { prisma } from "@/lib/db/prisma";
import { GET as listConversations } from "@/app/api/conversations/route";
import { GET as listMessages } from "@/app/api/conversations/[id]/messages/route";
import { POST as closeConversation } from "@/app/api/conversations/[id]/close/route";
import { POST as sendMessage } from "@/app/api/messages/send/route";
import { processValue } from "@/lib/whatsapp/webhook/process";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (body?: unknown) =>
  new NextRequest("http://localhost/api", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe.skipIf(!process.env.DATABASE_URL)("inbox API against a real PostgreSQL", () => {
  const waId = `smoke-${randomUUID()}`;
  let usuarioId = "";

  beforeAll(async () => {
    vi.stubEnv("SANDBOX_PAGE_ENABLED", "true");
    vi.stubEnv("META_PHONE_NUMBER_ID", "123");
    vi.stubEnv("META_ACCESS_TOKEN", "token");
    await processValue({
      contacts: [{ user_id: waId, profile: { name: "Ana" } }],
      messages: [{ id: `wamid.${randomUUID()}`, from_user_id: waId, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Hola" } }],
    });
    usuarioId = (await prisma.usuario.findUniqueOrThrow({ where: { waId } })).id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  });

  it("lists the conversation with the legacy contract", async () => {
    const lista = (await (await listConversations()).json()) as Array<Record<string, unknown>>;

    expect(lista.find((c) => c.id === usuarioId)).toMatchObject({ waId, profileName: "Ana", status: "OPEN" });
  });

  it("shows the inbound message and an open 24 h window", async () => {
    const body = await (await listMessages(request(), params(usuarioId))).json();

    expect(body.windowOpen).toBe(true);
    expect(body.status).toBe("OPEN");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({ conversationId: usuarioId, direction: "INBOUND", type: "TEXT", content: "Hola", status: "PENDING" });
  });

  it("sends a reply and stores it as an outbound message signed by the inbox operator", async () => {
    const wamid = `wamid.${randomUUID()}`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: wamid }] }), { status: 200 })));

    const response = await sendMessage(request({ conversationId: usuarioId, text: "Buenas" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ conversationId: usuarioId, direction: "OUTBOUND", status: "SENT", waMessageId: wamid });
    const fila = await prisma.mensaje.findUniqueOrThrow({ where: { waMessageId: wamid } });
    expect(fila.usuarioCreacion).toBe("operador:bandeja");
  });

  it("closes the conversation and the audit columns say who", async () => {
    const response = await closeConversation(request(), params(usuarioId));

    expect(await response.json()).toMatchObject({ id: usuarioId, status: "CLOSED" });
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(usuario.usuarioModificacion).toBe("operador:bandeja");
    expect(usuario.versionFila).toBeGreaterThan(1);
  });
});
