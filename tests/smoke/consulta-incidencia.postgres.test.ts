import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
import { createPrismaCupoDiarioStore } from "@/lib/consulta/cupo-diario";
import { consultarIncidencia } from "@/lib/recepcion/consulta";
import { registrarIncidencia } from "@/lib/recepcion/servicio";
import { processValue } from "@/lib/whatsapp/webhook/process";
import type { WhatsAppMessage } from "@/lib/whatsapp/webhook/payload";
import { crearAlmacenEvidencias } from "@/lib/recepcion/imagenes/almacen";
import { NO_UBICADA_TEXT } from "@/lib/constants/textos/consulta";
import { ConsultaEstablecimientoButtonId } from "@/lib/enums/consulta-establecimiento-button-id";
import { SessionChannel } from "@/lib/enums/session-channel";

const IPRESS = "6206";

describe.skipIf(!process.env.DATABASE_URL)("consultar una denuncia contra la base real", () => {
  let establecimientoId = 0;

  beforeAll(async () => {
    establecimientoId = (await prisma.establecimientoSalud.findUniqueOrThrow({ where: { codigoRenipress: IPRESS } })).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const person = (waId = `smoke-${randomUUID()}`) => {
    const send = async (message: Pick<WhatsAppMessage, "type"> & Partial<WhatsAppMessage>) => {
      sender.delivered.length = 0;
      await processValue({
        messages: [{ id: `wamid.${randomUUID()}`, from_user_id: waId, timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
      });
      return sender.delivered.filter((item) => item.waId === waId).map((item) => item.effect.text ?? "");
    };
    return {
      waId,
      text: (body: string) => send({ type: "text", text: { body } }),
      tap: (id: string) => send({ type: "interactive", interactive: { button_reply: { id } } }),
    };
  };

  const registrar = async (dni: string | null) => {
    const result = await registrarIncidencia(
      { waId: `smoke-${randomUUID()}`, canal: "whatsapp", dni, establecimientoId, descripcion: "El consultorio estaba cerrado sin aviso" },
      crearAlmacenEvidencias(),
    );
    if (result.status !== "accepted" || !result.codigo) throw new Error("no se registró la denuncia de prueba");
    return result.codigo;
  };

  it("por WhatsApp, una anónima se ve con el código y el establecimiento, sin datos de la persona", async () => {
    const codigo = await registrar(null);
    const ana = person();

    await ana.text(`quiero ver mi denuncia ${codigo}`);
    await ana.text(IPRESS);
    const respuesta = await ana.tap(ConsultaEstablecimientoButtonId.SI);

    expect(respuesta.join("\n")).toContain(`Denuncia ${codigo}`);
    expect(respuesta.join("\n")).toContain("Estado: Registrada");
    expect(respuesta.join("\n")).not.toContain("consultorio");
  });

  it("con DNI exige el DNI con el que se registró, y cada consulta cuenta en el cupo del día", async () => {
    const dni = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
    const codigo = await registrar(dni);
    const anonima = await registrar(null);
    const cupo = createPrismaCupoDiarioStore();
    const quien = { identificador: `smoke-${randomUUID()}`, canal: SessionChannel.WEB };

    await expect(consultarIncidencia({ codigo, establecimientoId, esAnonimo: false, dni }, quien, cupo)).resolves.toMatchObject({
      status: "found",
      codigo,
    });
    await expect(consultarIncidencia({ codigo, establecimientoId, esAnonimo: false, dni: "00000000" }, quien, cupo)).resolves.toEqual({
      status: "not_found",
    });
    await expect(consultarIncidencia({ codigo, establecimientoId, esAnonimo: true }, quien, cupo)).resolves.toEqual({
      status: "not_found",
    });
    await expect(
      consultarIncidencia({ codigo: anonima, establecimientoId: establecimientoId + 1, esAnonimo: true }, quien, cupo),
    ).resolves.toEqual({
      status: "not_found",
    });
    await expect(cupo.countDelDia(quien.identificador)).resolves.toBe(4);
  });

  it("no encontrada por WhatsApp responde lo mismo para una inexistente", async () => {
    const beto = person();

    await beto.text("mi denuncia MINSA-2026-A-999999");
    await beto.text(IPRESS);
    const respuesta = await beto.tap(ConsultaEstablecimientoButtonId.SI);

    expect(respuesta.at(-1)).toContain(NO_UBICADA_TEXT);
  });
});
