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
  }),
}));

import { prisma } from "@/lib/db/prisma";
import { NO_UBICADA_TEXT } from "@/lib/fsm/flows/consulta/handlers-consulta";
import { consultarIncidencia } from "@/lib/recepcion/consulta";
import { registrarIncidencia } from "@/lib/recepcion/servicio";
import { processValue } from "@/lib/whatsapp/webhook/process";
import type { WhatsAppMessage } from "@/lib/whatsapp/webhook/payload";

describe.skipIf(!process.env.DATABASE_URL)("consultar una incidencia contra la base real", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const person = (waId = `smoke-${randomUUID()}`) => ({
    waId,
    text: async (body: string) => {
      sender.delivered.length = 0;
      const message: WhatsAppMessage = {
        id: `wamid.${randomUUID()}`,
        from_user_id: waId,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body },
      };
      await processValue({ messages: [message] });
      return sender.delivered.filter((item) => item.waId === waId).map((item) => item.effect.text ?? "");
    },
  });

  const registrar = async (waId: string, extra: { dni?: string | null; nombreCompleto?: string | null } = {}) => {
    const result = await registrarIncidencia({ waId, dni: null, nombreCompleto: null, descripcion: "El consultorio estaba cerrado sin aviso", ...extra });
    if (result.status !== "accepted" || !result.codigo) throw new Error("no se registró la incidencia de prueba");
    return result.codigo;
  };

  it("por WhatsApp solo la ve quien la registró; inexistente y ajena responden lo mismo", async () => {
    const ana = person();
    const beto = person();
    const codigo = await registrar(ana.waId);

    const propia = await ana.text(`quiero ver mi incidencia ${codigo}`);
    expect(propia.join("\n")).toContain(`Incidencia ${codigo}`);
    expect(propia.join("\n")).toContain("Estado: Recibida, pendiente de revisión");
    expect(propia.join("\n")).not.toContain("consultorio");

    const ajena = await beto.text(`quiero ver mi incidencia ${codigo}`);
    const inexistente = await person().text("mi incidencia MINSA-2026-999999");
    expect(ajena.at(-1)).toBe(NO_UBICADA_TEXT);
    expect(inexistente.at(-1)).toBe(NO_UBICADA_TEXT);
    expect(ajena.join("\n")).not.toContain(codigo);
  });

  it("consultarIncidencia por la web exige el DNI verificado y deja fuera las anónimas", async () => {
    const dni = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
    const conNombre = await registrar(`smoke-${randomUUID()}`, { dni, nombreCompleto: "Ana de Prueba" });
    const anonima = await registrar(`smoke-${randomUUID()}`);

    await expect(consultarIncidencia(conNombre, { canal: "web", dni })).resolves.toMatchObject({ status: "found", codigo: conNombre });
    await expect(consultarIncidencia(conNombre, { canal: "web", dni: "00000000" })).resolves.toEqual({ status: "not_found" });
    await expect(consultarIncidencia(anonima, { canal: "web", dni })).resolves.toEqual({ status: "not_found" });
  });

  it("user_id_update: tras el cambio de identificador la persona sigue viendo su incidencia", async () => {
    const ana = person();
    const codigo = await registrar(ana.waId);
    const nuevo = `smoke-${randomUUID()}`;

    await ana.text("hola");
    await processValue({ user_id_update: [{ user_id: { previous: ana.waId, current: nuevo } }] });
    await processValue({ user_id_update: [{ user_id: { previous: ana.waId, current: nuevo } }] });

    const respuesta = await person(nuevo).text(`mi incidencia ${codigo}`);
    expect(respuesta.join("\n")).toContain(`Incidencia ${codigo}`);
    expect((await ana.text(`mi incidencia ${codigo}`)).at(-1)).toBe(NO_UBICADA_TEXT);
  });
});
