import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The web inbox reads and writes the message history, which does not exist with
// DATABASE_ENABLED=false: every inbox endpoint answers 503 without touching Prisma.
const db = vi.hoisted(() => ({ touched: 0 }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        db.touched++;
        throw new Error("the inbox API touched Prisma with DATABASE_ENABLED=false");
      },
    },
  ),
}));

import { GET as listConversations } from "@/app/api/conversations/route";
import { GET as listMessages } from "@/app/api/conversations/[id]/messages/route";
import { POST as closeConversation } from "@/app/api/conversations/[id]/close/route";
import { POST as sendMessage } from "@/app/api/messages/send/route";

const params = { params: Promise.resolve({ id: "conv-1" }) };
const request = (body?: unknown) =>
  new NextRequest("http://localhost/api/x", {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });

describe("inbox API with DATABASE_ENABLED=false", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_ENABLED", "false");
    db.touched = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["GET /api/conversations", () => listConversations()],
    ["GET /api/conversations/[id]/messages", () => listMessages(request(), params)],
    ["POST /api/conversations/[id]/close", () => closeConversation(request({}), params)],
    ["POST /api/messages/send", () => sendMessage(request({ conversationId: "conv-1", text: "hola" }))],
  ])("%s answers 503 persistence disabled", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "persistence disabled" });
    expect(db.touched).toBe(0);
  });
});
