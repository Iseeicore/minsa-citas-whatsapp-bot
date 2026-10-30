import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@/lib/fsm/core/types";

const storage = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  after: [] as Promise<unknown>[],
  outbound: [] as Array<{ text?: { body: string }; interactive?: { body: { text: string } } }>,
  consultar: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  buscar: vi.fn<(payload: unknown) => Promise<unknown>>(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => storage.after.push(task()),
}));
vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => structuredClone(storage.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  findSession: async (from: string) => structuredClone(storage.sessions.get(from)),
  sessionRowExists: async (from: string) => storage.sessions.has(from),
  saveSession: async (from: string, session: Session) => storage.sessions.set(from, structuredClone(session)),
}));
vi.mock("@/lib/security/rate-limiter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limiter")>();
  return { ...actual, inboundRateLimiter: actual.createRateLimiter({ enabled: false }) };
});
vi.mock("@/lib/recepcion/consulta", () => ({ consultarIncidencia: storage.consultar }));
vi.mock("@/lib/establecimientos/buscar", () => ({ buscarEstablecimiento: storage.buscar }));

import { POST } from "@/app/webhook/whatsapp/route";
import { ASK_ESTABLECIMIENTO_TEXT } from "@/lib/constants/textos/consulta";
import { SessionChannel } from "@/lib/enums/session-channel";

const SECRET = "synthetic-consulta-hmac-secret";
const CITIZEN = "PE.synthetic-consulta-citizen";
const CODIGO = "MINSA-2026-000001";
const HOSPITAL = { id: 7, areaId: 1, codigoRenipress: "5946", nombre: "Hospital Nacional Hipólito Unanue", distrito: null };
let sequence = 0;

async function send(body: string): Promise<string[]> {
  storage.outbound.length = 0;
  const message = {
    id: `synthetic-consulta-${++sequence}`,
    from_user_id: CITIZEN,
    timestamp: String(Math.floor(Date.now() / 1_000)),
    type: "text",
    text: { body },
  };
  const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [message] } }] }] });
  const response = await POST(
    new NextRequest("http://localhost/webhook/whatsapp", {
      method: "POST",
      body: payload,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=" + crypto.createHmac("sha256", SECRET).update(payload).digest("hex"),
      },
    }),
  );
  expect(response.status).toBe(200);
  await vi.runAllTimersAsync();
  await Promise.all(storage.after.splice(0));
  return storage.outbound.map((sent) => sent.text?.body ?? sent.interactive?.body.text ?? "");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T15:00:00Z"));
  vi.stubEnv("DATABASE_ENABLED", "false");
  vi.stubEnv("META_APP_SECRET", SECRET);
  vi.stubEnv("META_ACCESS_TOKEN", "synthetic-meta-consulta-token");
  vi.stubEnv("META_PHONE_NUMBER_ID", "synthetic-phone-id");
  vi.stubGlobal("fetch", async (_input: string | URL | Request, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body)) as { recipient?: string; text?: { body: string }; interactive?: { body: { text: string } } };
    if (body.recipient) storage.outbound.push(body);
    return Response.json({ messages: [{ id: `synthetic-out-${++sequence}` }] });
  });
  storage.sessions.clear();
  storage.consultar.mockReset().mockResolvedValue({ status: "not_found" });
  storage.buscar.mockReset().mockResolvedValue({ by: "codigo", status: "found", establecimiento: HOSPITAL });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("whatsapp-bot consulta una denuncia sin registro", () => {
  it("con DNI: código, establecimiento y DNI, contados para el remitente que entregó Meta", async () => {
    expect(await send(`mi denuncia ${CODIGO}`)).toEqual([ASK_ESTABLECIMIENTO_TEXT]);
    await send("5946");
    await send("sí");

    const done = await send("12345678");

    expect(done.at(-1)).toBe("No encontramos una denuncia con esos datos. Te quedan 2 consultas hoy.");
    expect(storage.sessions.get(CITIZEN)?.state).toBe("consulta_completed");
    expect(storage.consultar).toHaveBeenCalledWith(
      { codigo: CODIGO, establecimientoId: 7, esAnonimo: false, dni: "12345678" },
      { identificador: CITIZEN, canal: SessionChannel.WHATSAPP },
      expect.anything(),
    );
  });
});
