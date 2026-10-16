import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  closeSession: vi.fn(async () => undefined),
  sessionRowExists: vi.fn(async () => true),
  resetSession: vi.fn(async () => undefined),
  resetAll: vi.fn(async () => undefined),
  saveSession: vi.fn(async () => undefined),
  runTurn: vi.fn(async () => ({ sent: [], session: { state: "main_menu", slots: {}, counters: {} } })),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  closeSession: mocks.closeSession,
  sessionRowExists: mocks.sessionRowExists,
  resetSession: mocks.resetSession,
  saveSession: mocks.saveSession,
  resetAllSandboxTestSessions: mocks.resetAll,
}));
vi.mock("@/lib/fsm/core/executor", () => ({ runTurn: mocks.runTurn }));

import { POST } from "@/app/api/sandbox/route";

const ORIGIN = "https://portal.example.org";

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  process.env.SANDBOX_ALLOWED_ORIGINS = ORIGIN;
  vi.clearAllMocks();
});

describe("POST /api/sandbox with close", () => {
  it("closes the previous conversation and answers 200 { closed: true } without running any turn", async () => {
    const response = await post({ from: "sandbox-old", type: "text", close: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ closed: true });
    expect(mocks.closeSession).toHaveBeenCalledWith("sandbox-old");
    expect(mocks.runTurn).not.toHaveBeenCalled();
    expect(mocks.saveSession).not.toHaveBeenCalled();
    expect(mocks.sessionRowExists).not.toHaveBeenCalled();
    expect(mocks.resetSession).not.toHaveBeenCalled();
    expect(mocks.resetAll).not.toHaveBeenCalled();
  });

  it("carries the CORS headers of an allowed origin", async () => {
    const response = await post({ from: "sandbox-old", type: "text", close: true }, { origin: ORIGIN });

    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("is a 404 when the Sandbox is disabled, and closes nothing", async () => {
    process.env.SANDBOX_ENABLED = "false";

    const response = await post({ from: "sandbox-old", type: "text", close: true });

    expect(response.status).toBe(404);
    expect(mocks.closeSession).not.toHaveBeenCalled();
  });

  it("still validates the body: a missing from is rejected", async () => {
    const response = await post({ type: "text", close: true });

    expect(response.status).toBe(400);
    expect(mocks.closeSession).not.toHaveBeenCalled();
  });

  it("without close the request keeps running the turn as before", async () => {
    await post({ from: "sandbox-old", type: "button", listId: "agendar_cita" });

    expect(mocks.closeSession).not.toHaveBeenCalled();
    expect(mocks.runTurn).toHaveBeenCalledTimes(1);
  });
});
