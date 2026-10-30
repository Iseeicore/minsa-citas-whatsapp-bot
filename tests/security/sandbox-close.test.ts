import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  closeSession: vi.fn(async () => undefined),
  sessionRowExists: vi.fn(async () => true),
  resetSession: vi.fn(async () => undefined),
  saveSession: vi.fn(async () => undefined),
  runTurn: vi.fn(async () => ({ sent: [], session: { state: "main_menu", slots: {}, counters: {} } })),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  closeSession: mocks.closeSession,
  sessionRowExists: mocks.sessionRowExists,
  resetSession: mocks.resetSession,
  saveSession: mocks.saveSession,
}));
vi.mock("@/lib/fsm/core/executor", () => ({ runTurn: mocks.runTurn }));

import { POST } from "@/app/api/sandbox/route";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  vi.clearAllMocks();
});

describe("POST /api/sandbox with close", () => {
  it("closes the previous conversation and answers 200 { closed: true } without running any turn", async () => {
    const response = await post({ from: "sandbox-1d4e7a90-2b3c-4d5e-8f60-718293a4b5c6", type: "text", close: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ closed: true });
    expect(mocks.closeSession).toHaveBeenCalledWith("sandbox-1d4e7a90-2b3c-4d5e-8f60-718293a4b5c6");
    expect(mocks.runTurn).not.toHaveBeenCalled();
    expect(mocks.saveSession).not.toHaveBeenCalled();
    expect(mocks.sessionRowExists).not.toHaveBeenCalled();
    expect(mocks.resetSession).not.toHaveBeenCalled();
  });

  it("is a 404 when the Sandbox is disabled, and closes nothing", async () => {
    process.env.SANDBOX_ENABLED = "false";

    const response = await post({ from: "sandbox-1d4e7a90-2b3c-4d5e-8f60-718293a4b5c6", type: "text", close: true });

    expect(response.status).toBe(404);
    expect(mocks.closeSession).not.toHaveBeenCalled();
  });
});
