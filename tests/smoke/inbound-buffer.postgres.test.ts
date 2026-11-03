import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ACTOR_SISTEMA_BOT, actorCiudadano, declararActor } from "@/lib/db/actor";
import { DireccionMensajeId } from "@/lib/enums/direccion-mensaje-id";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";
import { createPostgresInboundBuffer } from "@/lib/whatsapp/inbound/postgres-inbound-buffer";

type MensajeSembrado = { waMessageId: string; contenido: string; fechaHora: Date; procesadoEn?: Date };

async function sembrar(mensajes: MensajeSembrado[]): Promise<string> {
  const waId = `smoke-${randomUUID()}`;
  const [, usuario] = await prisma.$transaction([declararActor(actorCiudadano(waId)), prisma.usuario.create({ data: { waId } })]);
  await prisma.$transaction([
    declararActor(actorCiudadano(waId)),
    prisma.mensaje.createMany({
      data: mensajes.map((mensaje) => ({
        ...mensaje,
        usuarioId: usuario.id,
        direccionMensajeId: DireccionMensajeId.ENTRANTE,
        tipoMensajeId: TipoMensajeId.TEXTO,
      })),
    }),
  ]);
  return usuario.id;
}

const leer = (waMessageId: string) => prisma.mensaje.findUniqueOrThrow({ where: { waMessageId } });

describe.skipIf(!process.env.DATABASE_URL)("inbound buffer against a real PostgreSQL", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const buffer = createPostgresInboundBuffer();

  it("discard marks only the pending message, signed by the bot, and leaves an already processed one untouched", async () => {
    const pendiente = `wamid.${randomUUID()}`;
    await sembrar([{ waMessageId: pendiente, contenido: "hola", fechaHora: new Date() }]);

    await buffer.discard(pendiente);
    const descartado = await leer(pendiente);
    await buffer.discard(pendiente);

    expect(descartado).toMatchObject({ procesadoEn: expect.any(Date), usuarioModificacion: ACTOR_SISTEMA_BOT });
    expect((await leer(pendiente)).procesadoEn).toEqual(descartado.procesadoEn);
  });

  it("wasRepeated finds the same text already processed by another message since the moment, and nothing else", async () => {
    const procesado = `wamid.${randomUUID()}`;
    const nuevo = `wamid.${randomUUID()}`;
    const antes = new Date(Date.now() - 60_000);
    const usuarioId = await sembrar([
      { waMessageId: procesado, contenido: "123456", fechaHora: new Date(), procesadoEn: new Date() },
      { waMessageId: nuevo, contenido: "123456", fechaHora: new Date() },
    ]);

    await expect(buffer.wasRepeated(usuarioId, nuevo, "123456", antes)).resolves.toBe(true);
    await expect(buffer.wasRepeated(usuarioId, procesado, "123456", antes)).resolves.toBe(false);
    await expect(buffer.wasRepeated(usuarioId, nuevo, "otro texto", antes)).resolves.toBe(false);
    await expect(buffer.wasRepeated(usuarioId, nuevo, "123456", new Date(Date.now() + 60_000))).resolves.toBe(false);
  });

  it("expireStale closes only the pending messages older than the moment and returns how many", async () => {
    const viejo = `wamid.${randomUUID()}`;
    const reciente = `wamid.${randomUUID()}`;
    await sembrar([
      { waMessageId: viejo, contenido: "viejo", fechaHora: new Date("2000-01-01T00:00:00Z") },
      { waMessageId: reciente, contenido: "reciente", fechaHora: new Date() },
    ]);

    await expect(buffer.expireStale(new Date("2000-01-02T00:00:00Z"))).resolves.toBe(1);

    expect(await leer(viejo)).toMatchObject({ procesadoEn: expect.any(Date), usuarioModificacion: ACTOR_SISTEMA_BOT });
    expect((await leer(reciente)).procesadoEn).toBeNull();
  });
});
