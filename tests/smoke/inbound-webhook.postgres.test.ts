import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

const answers = vi.hoisted(() => ({
  answerMessage: vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
  sendFixedReply: vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
  answerFailure: vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
}));

vi.mock("@/lib/whatsapp/webhook/answer", () => answers);

import { prisma } from "@/lib/db/prisma";
import { DireccionMensajeId } from "@/lib/enums/direccion-mensaje-id";
import { EstadoConversacionId } from "@/lib/enums/estado-conversacion-id";
import { EstadoMensajeId } from "@/lib/enums/estado-mensaje-id";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";
import { processValue } from "@/lib/whatsapp/webhook/process";

/** El bot descarta lo que llega con más de 2 minutos de antigüedad, así que el mensaje de prueba lleva la hora de ahora. */
const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const textMessage = (waId: string, wamid: string, body: string) => ({
  id: wamid,
  from_user_id: waId,
  timestamp: String(nowSeconds()),
  type: "text",
  text: { body },
});

describe.skipIf(!process.env.DATABASE_URL)("inbound webhook against a real PostgreSQL", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("stores the citizen and the message, signed by the citizen, and answers once", async () => {
    const waId = `smoke-${randomUUID()}`;
    const wamid = `wamid.${randomUUID()}`;

    await processValue({
      contacts: [{ user_id: waId, wa_id: "51999000111", profile: { name: "Ana" } }],
      messages: [textMessage(waId, wamid, "Hola")],
    });

    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { waId } });
    expect(usuario).toMatchObject({
      profileName: "Ana",
      estadoConversacionId: EstadoConversacionId.ABIERTA,
      usuarioCreacion: `ciudadano:${waId}`,
      versionFila: 1,
    });

    const mensaje = await prisma.mensaje.findUniqueOrThrow({ where: { waMessageId: wamid } });
    expect(mensaje).toMatchObject({
      usuarioId: usuario.id,
      direccionMensajeId: DireccionMensajeId.ENTRANTE,
      tipoMensajeId: TipoMensajeId.TEXTO,
      estadoMensajeId: EstadoMensajeId.PENDIENTE,
      contenido: "Hola",
      usuarioCreacion: `ciudadano:${waId}`,
    });
    expect(answers.answerMessage).toHaveBeenCalledWith(expect.objectContaining({ id: wamid }), usuario.id);
  });

  it("a redelivery of the same WhatsApp message is skipped: one row, one answer", async () => {
    const waId = `smoke-${randomUUID()}`;
    const wamid = `wamid.${randomUUID()}`;
    answers.answerMessage.mockClear();

    await processValue({ messages: [textMessage(waId, wamid, "Hola")] });
    await processValue({ messages: [textMessage(waId, wamid, "Hola")] });

    expect(await prisma.mensaje.count({ where: { waMessageId: wamid } })).toBe(1);
    expect(answers.answerMessage).toHaveBeenCalledTimes(1);
    expect(answers.answerFailure).not.toHaveBeenCalled();
  });

  it("a delivery status updates the message and is signed by Meta", async () => {
    const waId = `smoke-${randomUUID()}`;
    const wamid = `wamid.${randomUUID()}`;
    await processValue({ messages: [textMessage(waId, wamid, "Hola")] });

    await processValue({ statuses: [{ id: wamid, status: "delivered" }] });

    // versión 1 al guardarlo, 2 al marcarlo atendido (procesado_en) y 3 con el aviso de entrega de Meta.
    const mensaje = await prisma.mensaje.findUniqueOrThrow({ where: { waMessageId: wamid } });
    expect(mensaje).toMatchObject({
      estadoMensajeId: EstadoMensajeId.ENTREGADO,
      usuarioModificacion: "externo:meta",
      usuarioCreacion: `ciudadano:${waId}`,
      versionFila: 3,
    });
  });

  it("a second message from the same citizen keeps one user and refreshes the last-message time", async () => {
    const waId = `smoke-${randomUUID()}`;
    await processValue({ messages: [textMessage(waId, `wamid.${randomUUID()}`, "uno")] });
    const later = nowSeconds() + 100;
    await processValue({ messages: [{ ...textMessage(waId, `wamid.${randomUUID()}`, "dos"), timestamp: String(later) }] });

    expect(await prisma.usuario.count({ where: { waId } })).toBe(1);
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { waId } });
    expect(usuario.ultimoMensajeEn.getTime()).toBe(later * 1000);
    expect(usuario.versionFila).toBe(2);
  });
});
