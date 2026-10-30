import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createPrismaCupoDiarioStore } from "@/lib/consulta/cupo-diario";
import { ResultadoIntentoConsulta } from "@/lib/enums/resultado-intento-consulta";
import { SessionChannel } from "@/lib/enums/session-channel";
import { processValue } from "@/lib/whatsapp/webhook/process";

describe.skipIf(!process.env.DATABASE_URL)("cupo diario de consultas contra la base real", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const store = createPrismaCupoDiarioStore();

  it("cuenta las consultas del día de cada identificador, de cualquier resultado", async () => {
    const identificador = `smoke-${randomUUID()}`;

    await store.save({ identificador, canal: SessionChannel.WEB, resultado: ResultadoIntentoConsulta.NO_ENCONTRADA });
    await store.save({ identificador, canal: SessionChannel.WEB, resultado: ResultadoIntentoConsulta.ERROR });

    await expect(store.countDelDia(identificador)).resolves.toBe(2);
    await expect(store.countDelDia(`smoke-${randomUUID()}`)).resolves.toBe(0);
  });

  it("una consulta guardada no se borra", async () => {
    const identificador = `smoke-${randomUUID()}`;
    await store.save({ identificador, canal: SessionChannel.WEB, resultado: ResultadoIntentoConsulta.ENCONTRADA });

    await expect(prisma.consultaIncidenciaIntento.deleteMany({ where: { identificador } })).rejects.toThrow();
  });

  it("user_id_update: las consultas del día pasan al identificador nuevo y el cupo no se reinicia", async () => {
    const anterior = `smoke-${randomUUID()}`;
    const nuevo = `smoke-${randomUUID()}`;
    await store.save({ identificador: anterior, canal: SessionChannel.WHATSAPP, resultado: ResultadoIntentoConsulta.NO_ENCONTRADA });
    await store.save({ identificador: anterior, canal: SessionChannel.WHATSAPP, resultado: ResultadoIntentoConsulta.REINTENTOS_AGOTADOS });

    await processValue({ user_id_update: [{ user_id: { previous: anterior, current: nuevo } }] });

    await expect(store.countDelDia(nuevo)).resolves.toBe(2);
    await expect(store.countDelDia(anterior)).resolves.toBe(0);
  });
});
