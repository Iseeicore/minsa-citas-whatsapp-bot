import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { usuario: { upsert: db.upsert } },
}));

import { createMemoryDniVerificadoStore, createPrismaDniVerificadoStore, saveDniVerificado } from "@/lib/usuario/dni-verificado";
import { DniVerificadoStatus } from "@/lib/enums/cita/dni-verificado-status";
import type { DniVerificadoStore } from "@/lib/types/dni-verificado.types";
import { captureLogs } from "@/tests/support/capture-logs";

const WA_ID = "51999000111";
const DNI = "45678912";

afterEach(() => {
  db.upsert.mockReset();
});

describe("saveDniVerificado", () => {
  it("keeps the verified DNI of the chat in the user, creating the user when it does not exist yet", async () => {
    db.upsert.mockResolvedValue({});

    await expect(saveDniVerificado(WA_ID, ` ${DNI} `, createPrismaDniVerificadoStore())).resolves.toBe(DniVerificadoStatus.SAVED);

    expect(db.upsert).toHaveBeenCalledWith({ where: { waId: WA_ID }, create: { waId: WA_ID, dni: DNI }, update: { dni: DNI } });
  });

  it.each(["001234567", ""])("does not keep %j, which is not a DNI", async (documento) => {
    const save = vi.fn(async () => undefined);

    await expect(saveDniVerificado(WA_ID, documento, { save })).resolves.toBe(DniVerificadoStatus.SKIPPED);

    expect(save).not.toHaveBeenCalled();
  });

  it("answers FAILED when the store fails and logs it without the DNI nor the chat id", async () => {
    const lines = captureLogs();
    const broken: DniVerificadoStore = { save: () => Promise.reject(new Error("conexion caida")) };

    await expect(saveDniVerificado(WA_ID, DNI, broken)).resolves.toBe(DniVerificadoStatus.FAILED);

    expect(lines).toEqual([expect.objectContaining({ level: "error", event: "usuario.dni_persist_failed" })]);
    expect(JSON.stringify(lines)).not.toContain(DNI);
    expect(JSON.stringify(lines)).not.toContain(WA_ID);
  });

  it("the memory store keeps it without a database", async () => {
    await expect(saveDniVerificado(WA_ID, DNI, createMemoryDniVerificadoStore())).resolves.toBe(DniVerificadoStatus.SAVED);
  });
});
