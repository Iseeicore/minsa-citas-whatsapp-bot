import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@/lib/fsm/core/types";

const store = vi.hoisted(() => ({ sessions: new Map<string, Session>() }));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
  sessionRowExists: async (from: string) => store.sessions.has(from),
  resetSession: async (from: string) => {
    store.sessions.delete(from);
  },
  resetAllSandboxTestSessions: async () => store.sessions.clear(),
}));

import { POST } from "@/app/api/sandbox/route";
import { SERVICE_DISABLED_TEXT } from "@/lib/constants/textos/menu";

const FROM = "sandbox-incidencias-off";

type Reply = { sent: Array<{ kind: string; text?: string; rows?: Array<{ id: string }> }>; session: { state: string } };

async function send(body: Record<string, unknown>): Promise<Reply> {
  const request = new NextRequest("http://localhost/api/sandbox", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, ...body }),
  });
  return (await POST(request)).json() as Promise<Reply>;
}

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  store.sessions.clear();
  vi.stubEnv("INCIDENCIAS_ENABLED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the Sandbox with INCIDENCIAS_ENABLED off", () => {
  it("a photo sent while the session waits for one answers with the notice and the menu", async () => {
    store.sessions.set(FROM, { state: "incidencia_awaiting_foto", slots: {}, counters: {} });

    const reply = await send({ type: "image", mediaId: "media-1", mediaDataUri: "data:image/png;base64,AAAA" });

    expect(reply.session.state).toBe("main_menu");
    expect(reply.sent[0]).toEqual({ kind: "send_text", text: SERVICE_DISABLED_TEXT });
    expect(reply.sent[1].rows?.map((row) => row.id)).toEqual(["agendar_cita"]);
    expect(store.sessions.get(FROM)?.state).toBe("main_menu");
  });

  it.each(["2", "3"])("a new conversation that starts typing %s answers with the notice and the menu", async (digit) => {
    const reply = await send({ type: "text", text: digit });

    expect(reply.session.state).toBe("main_menu");
    expect(reply.sent[0]).toEqual({ kind: "send_text", text: SERVICE_DISABLED_TEXT });
    expect(reply.sent[1].rows?.map((row) => row.id)).toEqual(["agendar_cita"]);
  });
});
