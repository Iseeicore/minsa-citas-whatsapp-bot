import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@/lib/fsm/core/types";

const store = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  consultar: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  buscar: vi.fn<(payload: unknown) => Promise<unknown>>(),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
  sessionRowExists: async (from: string) => store.sessions.has(from),
  resetSession: async (from: string) => {
    store.sessions.delete(from);
  },
}));
vi.mock("@/lib/recepcion/consulta", () => ({ consultarIncidencia: store.consultar }));
vi.mock("@/lib/establecimientos/buscar", () => ({ buscarEstablecimiento: store.buscar }));

import { POST } from "@/app/api/sandbox/route";
import { getCupoDiarioStore } from "@/lib/composition/stores";
import { ASK_ESTABLECIMIENTO_TEXT, LIMITE_DIARIO_TEXT } from "@/lib/constants/textos/consulta";
import { MAX_CONSULTAS_POR_DIA } from "@/lib/constants/limits/consulta";
import { ResultadoIntentoConsulta } from "@/lib/enums/resultado-intento-consulta";
import { SessionChannel } from "@/lib/enums/session-channel";

const FROM = "sandbox-6f1c2d3e-4a5b-4c6d-8e7f-a1b2c3d4e5f6";
const CODIGO = "MINSA-2026-A-000001";
const HOSPITAL = { id: 7, areaId: 1, codigoRenipress: "5946", nombre: "Hospital Nacional Hipólito Unanue", distrito: null };

type Reply = { sent: Array<{ kind: string; text?: string }>; session: { state: string } };

async function send(text: string, from = FROM): Promise<Reply> {
  const request = new NextRequest("http://localhost/api/sandbox", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from, type: "text", text }),
  });
  return (await POST(request)).json() as Promise<Reply>;
}

beforeEach(() => {
  vi.stubEnv("SANDBOX_ENABLED", "true");
  vi.stubEnv("DATABASE_ENABLED", "false");
  store.sessions.clear();
  store.consultar
    .mockReset()
    .mockResolvedValue({ status: "found", codigo: CODIGO, estado: "RESUELTO", fechaRegistro: "2026-10-30T15:00:00Z" });
  store.buscar.mockReset().mockResolvedValue({ by: "codigo", status: "found", establecimiento: HOSPITAL });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("el Chat-bot consulta una denuncia sin registro", () => {
  it("código, establecimiento y estado, con el identificador de la sesión del Chat-bot", async () => {
    expect((await send(`quiero ver mi denuncia ${CODIGO}`)).sent.map((effect) => effect.text)).toEqual([ASK_ESTABLECIMIENTO_TEXT]);
    expect((await send("5946")).session.state).toBe("consulta_confirm_establecimiento");

    const done = await send("sí");

    expect(done.session.state).toBe("consulta_completed");
    expect(done.sent.at(-1)?.text).toBe(`Denuncia ${CODIGO}\nEstado: Resuelta\nRegistrada el 30/10/2026`);
    expect(store.consultar).toHaveBeenCalledWith(
      { codigo: CODIGO, establecimientoId: 7, esAnonimo: true },
      { identificador: FROM, canal: SessionChannel.WEB },
      expect.anything(),
    );
  });

  it("con las consultas del día usadas, responde el límite", async () => {
    const otro = "sandbox-0a1b2c3d-4e5f-4a6b-8c7d-e8f9a0b1c2d3";
    for (let index = 0; index < MAX_CONSULTAS_POR_DIA; index++) {
      await getCupoDiarioStore().save({
        identificador: otro,
        canal: SessionChannel.WEB,
        resultado: ResultadoIntentoConsulta.NO_ENCONTRADA,
      });
    }

    const reply = await send("consultar mi denuncia", otro);

    expect(reply.session.state).toBe("consulta_failed");
    expect(reply.sent.map((effect) => effect.text)).toEqual([LIMITE_DIARIO_TEXT]);
  });
});
