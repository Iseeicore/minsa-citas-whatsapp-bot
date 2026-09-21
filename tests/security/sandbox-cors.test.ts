import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sessionRowExists: vi.fn(async () => false),
  resetSession: vi.fn(async () => undefined),
  resetAll: vi.fn(async () => undefined),
  saveSession: vi.fn(async () => undefined),
  runTurn: vi.fn(async () => ({
    sent: [{ kind: "send_text", text: "respuesta del bot" }],
    session: { state: "main_menu", slots: {}, counters: {} },
  })),
}));

vi.mock("@/lib/fsm/session-store", () => ({
  sessionRowExists: mocks.sessionRowExists,
  resetSession: mocks.resetSession,
  saveSession: mocks.saveSession,
  resetAllSandboxTestSessions: mocks.resetAll,
}));
vi.mock("@/lib/fsm/executor", () => ({ runTurn: mocks.runTurn }));

import { OPTIONS, POST } from "@/app/api/sandbox/route";

// The widget embedded in a different frontend (a different origin) needs the
// browser to actually let the response through — same-origin callers (the
// /sandbox page itself) never send an Origin header at all and must keep
// working exactly as before, untouched by any of this.

function postFrom(origin: string | undefined) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost/api/sandbox", {
    method: "POST",
    headers,
    body: JSON.stringify({ from: "sandbox-qa", type: "text", text: "hola" }),
  });
}

function preflightFrom(origin: string) {
  return new NextRequest("http://localhost/api/sandbox", {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
}

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  vi.clearAllMocks();
  mocks.sessionRowExists.mockResolvedValue(false);
});

afterEach(() => {
  delete process.env.SANDBOX_ALLOWED_ORIGINS;
});

describe("SANDBOX_ALLOWED_ORIGINS unset (default: same-origin only, today's behavior)", () => {
  it("a same-origin POST (no Origin header) works exactly as before, no CORS headers", async () => {
    const response = await POST(postFrom(undefined));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("a cross-origin POST still runs the turn (the route itself doesn't block it) but carries no CORS header, so the browser discards the response", async () => {
    const response = await POST(postFrom("https://minsadigital-front.example.org"));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("a preflight OPTIONS from any origin gets no Access-Control-Allow-Origin", async () => {
    const response = await OPTIONS(preflightFrom("https://minsadigital-front.example.org"));

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("SANDBOX_ALLOWED_ORIGINS configured with the new frontend's origin", () => {
  beforeEach(() => {
    process.env.SANDBOX_ALLOWED_ORIGINS = "https://minsadigital-front.example.org,https://staging.minsadigital-front.example.org";
  });

  it("a POST from a listed origin gets that exact origin echoed back", async () => {
    const response = await POST(postFrom("https://minsadigital-front.example.org"));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://minsadigital-front.example.org");
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("a second listed origin (staging) also gets echoed back — never a static single value", async () => {
    const response = await POST(postFrom("https://staging.minsadigital-front.example.org"));

    expect(response.headers.get("access-control-allow-origin")).toBe("https://staging.minsadigital-front.example.org");
  });

  it("an origin NOT on the list gets no CORS header — never a wildcard fallback", async () => {
    const response = await POST(postFrom("https://an-unrelated-site.example.org"));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("same-origin (no Origin header) keeps working exactly as before", async () => {
    const response = await POST(postFrom(undefined));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("the preflight OPTIONS for a listed origin answers with the CORS headers the browser needs before it will send the real POST", async () => {
    const response = await OPTIONS(preflightFrom("https://minsadigital-front.example.org"));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://minsadigital-front.example.org");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
  });

  it("the preflight OPTIONS for an unlisted origin gets no CORS headers", async () => {
    const response = await OPTIONS(preflightFrom("https://an-unrelated-site.example.org"));

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
