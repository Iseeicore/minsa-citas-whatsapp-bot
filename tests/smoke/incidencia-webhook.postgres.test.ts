import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

const sender = vi.hoisted(() => {
  process.env.INBOUND_RATE_LIMIT = "off";
  return { delivered: [] as { waId: string; effect: { kind: string; text?: string } }[] };
});

vi.mock("@/lib/whatsapp/whatsapp-send", () => ({
  sendTypingIndicator: vi.fn(async () => undefined),
  sendWhatsAppEffect: vi.fn(async () => undefined),
  sendAndRecordEffect: vi.fn(async (_conversationId: string | null, waId: string, effect: { kind: string; text?: string }) => {
    sender.delivered.push({ waId, effect });
    return { kind: "sent_no_id" };
  }),
}));

import { prisma } from "@/lib/db/prisma";
import { processValue } from "@/lib/whatsapp/webhook/process";
import type { WhatsAppMessage } from "@/lib/whatsapp/webhook/payload";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";

const QR = "Hola quiero presentar una incidencia HOSPITAL NACIONAL DOS DE MAYO - CODIGO-IPRESS 6206";

describe.skipIf(!process.env.DATABASE_URL)("an incidencia through the real webhook, from the QR to the saved incident", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const person = () => {
    const waId = `smoke-${randomUUID()}`;
    const send = async (message: Pick<WhatsAppMessage, "type"> & Partial<WhatsAppMessage>) => {
      sender.delivered.length = 0;
      await processValue({
        messages: [{ id: `wamid.${randomUUID()}`, from_user_id: waId, timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
      });
      return sender.delivered.filter((item) => item.waId === waId).map((item) => item.effect);
    };
    return {
      waId,
      text: (body: string) => send({ type: "text", text: { body } }),
      tap: (id: string) => send({ type: "interactive", interactive: { button_reply: { id } } }),
      file: (type: "image" | "document" | "sticker") =>
        send(
          type === "document" ? { type, document: { id: "media-1" } } : type === "image" ? { type, image: { id: "media-1" } } : { type },
        ),
      state: async () => (await prisma.sesionConversacion.findUniqueOrThrow({ where: { waId } })).estado,
    };
  };

  it("the QR is answered with the consent, then with the place to confirm, and the whole conversation ends with a code in the database", async () => {
    const p = person();

    const consent = await p.text(QR);
    expect(consent.map((effect) => effect.kind)).toEqual(["send_consent"]);
    await expect(p.state()).resolves.toBe("incidencia_consent_choice");

    const confirm = await p.tap("incidencia_consent_si");
    expect(confirm).toHaveLength(1);
    expect(confirm[0].kind).toBe("send_buttons");
    expect(confirm[0].text).toContain("ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS");
    expect(confirm[0].text).toContain("*HOSPITAL NACIONAL DOS DE MAYO*");
    await expect(p.state()).resolves.toBe("incidencia_confirm_ubicacion");

    const identity = await p.tap("incidencia_ubicacion_si");
    expect(identity.map((effect) => effect.kind)).toEqual(["send_buttons"]);
    await p.tap("incidencia_anonimo");
    await expect(p.state()).resolves.toBe("incidencia_awaiting_descripcion");

    const asked = await p.text("Me cobraron sin recibo en la ventanilla de admisión.");
    expect(asked[0].text).toContain("evidencia");

    const sticker = await p.file("sticker");
    expect(sticker).toEqual([]);
    await expect(p.state()).resolves.toBe("incidencia_awaiting_foto");

    const rejected = await p.file("document");
    expect(rejected[0].text).toContain("ese archivo no se guardó");
    await expect(p.state()).resolves.toBe("incidencia_awaiting_foto");

    await p.tap("incidencia_foto_omitir");
    await expect(p.state()).resolves.toBe("incidencia_confirm_registro");

    const done = await p.tap("incidencia_confirmar_registro_si");
    expect(done.map((effect) => effect.text)).toEqual([
      expect.stringMatching(/código \*MINSA-\d{4}-A-\d{6,}\* en \*HOSPITAL NACIONAL DOS DE MAYO\*/),
    ]);

    const saved = await prisma.incidenciaPaciente.findFirstOrThrow({ where: { waId: p.waId }, include: { establecimiento: true } });
    expect(saved.establecimiento?.codigoRenipress).toBe("6206");
    expect(saved.esAnonimo).toBe(true);
    expect(saved.canalOrigenId).toBe(CanalOrigenId.WHATSAPP);
    expect(saved.descripcion).toBe("Me cobraron sin recibo en la ventanilla de admisión.");
    expect(done.at(-1)?.text).toContain(saved.codigo);
  }, 60_000);

  it("a QR with a center named C.S.M. gets through the first-message filters", async () => {
    const p = person();

    const consent = await p.text("Hola quiero presentar una incidencia C.S.M. COMUNITARIO LINCE - CODIGO-IPRESS 38137");
    expect(consent.map((effect) => effect.kind)).toEqual(["send_consent"]);

    const confirm = await p.tap("incidencia_consent_si");
    expect(confirm).toHaveLength(1);
    expect(confirm[0].text).toContain("C.S.M. COMUNITARIO LINCE");
  }, 60_000);

  it("«quiero cerrar» closes it and the next message starts over", async () => {
    const p = person();
    await p.text(QR);

    const closed = await p.text("quiero cerrar");
    expect(closed[0].text).toContain("no se registró ninguna denuncia");
    await expect(p.state()).resolves.toBe("incidencia_cancelled");
    expect(await prisma.incidenciaPaciente.count({ where: { waId: p.waId } })).toBe(0);
  }, 60_000);
});
