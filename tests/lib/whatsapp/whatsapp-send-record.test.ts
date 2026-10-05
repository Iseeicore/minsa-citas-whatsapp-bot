import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendType } from "@/lib/enums/send-type";

const db = vi.hoisted(() => ({
  mensajeCreate: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  usuarioUpdate: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  executeRaw: vi.fn<(...args: unknown[]) => Promise<number>>(async () => 1),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    mensaje: { create: db.mensajeCreate },
    usuario: { update: db.usuarioUpdate },
    $executeRaw: db.executeRaw,
    $transaction: async (steps: Promise<unknown>[]) => Promise.all(steps),
  },
}));

import { sendAndRecordCtaUrl, sendAndRecordEffect } from "@/lib/whatsapp/whatsapp-send";

const graphOk = () => new Response(JSON.stringify({ messages: [{ id: "wamid.out-1" }] }), { status: 200 });

describe("recording what the bot sends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("META_PHONE_NUMBER_ID", "123");
    vi.stubEnv("META_ACCESS_TOKEN", "token");
    vi.stubGlobal("fetch", vi.fn(async () => graphOk()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("stores the outbound text as a sent message of the user and refreshes the last-message time, signed by the bot", async () => {
    await sendAndRecordEffect("user-1", "51987654321", { kind: SendType.TEXT, text: "hola" });

    expect(db.mensajeCreate).toHaveBeenCalledWith({
      data: {
        usuarioId: "user-1",
        direccionMensajeId: 2,
        tipoMensajeId: 1,
        contenido: "hola",
        waMessageId: "wamid.out-1",
        estadoMensajeId: 2,
        fechaHora: expect.any(Date),
      },
    });
    expect(db.usuarioUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { ultimoMensajeEn: expect.any(Date) } });
    expect(db.executeRaw.mock.calls.map((call) => call[1])).toEqual(["sistema:bot"]);
  });

  it("records the body of a CTA button the same way", async () => {
    await sendAndRecordCtaUrl("user-1", "51987654321", { bodyText: "Regístrate", buttonText: "Ir", url: "https://example.org" });

    expect(db.mensajeCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ usuarioId: "user-1", contenido: "Regístrate" }) });
  });

  it("records nothing when there is no stored user (database disabled)", async () => {
    await sendAndRecordEffect(null, "51987654321", { kind: SendType.TEXT, text: "hola" });

    expect(db.mensajeCreate).not.toHaveBeenCalled();
  });
});
