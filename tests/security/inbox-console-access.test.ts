import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(async () => []),
  findUser: vi.fn(async () => null),
  findUserState: vi.fn(async () => null),
  listMessages: vi.fn(async () => []),
  findLastInbound: vi.fn(async () => null),
  closeUser: vi.fn(async () => null),
  recordOutboundMessage: vi.fn(async () => null),
}));

vi.mock("@/lib/inbox/repository", () => mocks);

import { GET as listConversations } from "@/app/api/conversations/route";
import { GET as listMessages } from "@/app/api/conversations/[id]/messages/route";
import { POST as closeConversation } from "@/app/api/conversations/[id]/close/route";
import { POST as sendMessage } from "@/app/api/messages/send/route";

const params = { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000001" }) };

const request = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/x", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const handlers = {
  "GET /api/conversations": () => listConversations(),
  "GET /api/conversations/[id]/messages": () => listMessages(request("GET"), params),
  "POST /api/conversations/[id]/close": () => closeConversation(request("POST"), params),
  "POST /api/messages/send": () => sendMessage(request("POST", { conversationId: "x", text: "hola" })),
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.unstubAllEnvs();
  Object.values(mocks).forEach((mock) => mock.mockClear());
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("web inbox routes without SANDBOX_PAGE_ENABLED", () => {
  it.each(Object.entries(handlers))("%s answers 404 and never reads the database or calls Meta, even with the database enabled", async (_name, call) => {
    vi.stubEnv("DATABASE_ENABLED", "true");

    const response = await call();

    expect(response.status).toBe(404);
    Object.values(mocks).forEach((mock) => expect(mock).not.toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["", "false", "TRUE", "1"])("stays closed when SANDBOX_PAGE_ENABLED is %j", async (value) => {
    vi.stubEnv("DATABASE_ENABLED", "true");
    vi.stubEnv("SANDBOX_PAGE_ENABLED", value);

    expect((await listConversations()).status).toBe(404);
  });

  it("is not opened by SANDBOX_ENABLED, which only controls POST /api/sandbox", async () => {
    vi.stubEnv("DATABASE_ENABLED", "true");
    vi.stubEnv("SANDBOX_ENABLED", "true");

    expect((await listConversations()).status).toBe(404);
  });
});

describe("web inbox routes with SANDBOX_PAGE_ENABLED=true", () => {
  it.each(Object.entries(handlers))("%s keeps its previous behavior: 503 when persistence is disabled", async (_name, call) => {
    vi.stubEnv("SANDBOX_PAGE_ENABLED", "true");
    vi.stubEnv("DATABASE_ENABLED", "false");

    expect((await call()).status).toBe(503);
  });

  it("lists the conversations when the database is enabled", async () => {
    vi.stubEnv("SANDBOX_PAGE_ENABLED", "true");
    vi.stubEnv("DATABASE_ENABLED", "true");

    const response = await listConversations();

    expect(response.status).toBe(200);
    expect(mocks.listUsers).toHaveBeenCalledTimes(1);
  });
});
