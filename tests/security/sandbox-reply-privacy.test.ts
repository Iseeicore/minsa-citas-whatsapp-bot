import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SANDBOX_VISIBLE_SLOT_KEYS } from "@/lib/constants/sandbox-visible-slots";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const FAKE_JWT = "fake.jwt.value";
const FAKE_DNI = "00000000";

const mocks = vi.hoisted(() => ({
  runTurn: vi.fn(),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  sessionRowExists: vi.fn(async () => true),
  resetSession: vi.fn(async () => undefined),
  saveSession: vi.fn(async () => undefined),
  closeSession: vi.fn(async () => undefined),
}));
vi.mock("@/lib/fsm/core/executor", () => ({ runTurn: mocks.runTurn }));

import { POST } from "@/app/api/sandbox/route";

async function send(body: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return response.text();
}

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  mocks.runTurn.mockResolvedValue({
    sent: [],
    session: {
      state: SessionState.CITA_AWAITING_DISTRITO,
      slots: {
        [SlotKey.CITA_BEARER]: FAKE_JWT,
        [SlotKey.CITA_DNI]: FAKE_DNI,
        [SlotKey.CITA_DEPARTAMENTO]: "LIMA",
      },
      counters: {},
    },
  });
});

describe("POST /api/sandbox privacy", () => {
  it("never sends the token or the document to the browser and returns only allowed slots", async () => {
    const raw = await send({ from: "sandbox-qa", type: "text", text: "Miraflores" });
    const { session } = JSON.parse(raw) as { session: { slots: Record<string, unknown> } };

    expect(raw).not.toContain(FAKE_JWT);
    expect(raw).not.toContain(FAKE_DNI);
    expect(Object.keys(session.slots)).toEqual([SlotKey.CITA_DEPARTAMENTO]);
    expect(SANDBOX_VISIBLE_SLOT_KEYS).toContain(SlotKey.CITA_DEPARTAMENTO);
  });
});
