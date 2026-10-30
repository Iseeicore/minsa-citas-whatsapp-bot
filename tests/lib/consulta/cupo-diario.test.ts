import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ create: vi.fn(), queryRaw: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { consultaIncidenciaIntento: { create: db.create }, $queryRaw: db.queryRaw },
}));

import {
  countIntentosDelDia,
  createMemoryCupoDiarioStore,
  createPrismaCupoDiarioStore,
  saveIntentoConsulta,
} from "@/lib/consulta/cupo-diario";
import type { CupoDiarioStore, IntentoConsulta } from "@/lib/types/cupo-diario.types";
import { CupoDiarioStatus } from "@/lib/enums/cupo-diario-status";
import { ResultadoIntentoConsulta } from "@/lib/enums/resultado-intento-consulta";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { SessionChannel } from "@/lib/enums/session-channel";
import { captureLogs } from "@/tests/support/capture-logs";

const INTENTO: IntentoConsulta = {
  identificador: "PE.111111111111",
  canal: SessionChannel.WHATSAPP,
  resultado: ResultadoIntentoConsulta.NO_ENCONTRADA,
};

const HOY = () => "20261030";

const brokenStore: CupoDiarioStore = {
  save: () => Promise.reject(new Error("conexion caida")),
  countDelDia: () => Promise.reject(new Error("conexion caida")),
};

afterEach(() => {
  db.create.mockReset();
  db.queryRaw.mockReset();
});

describe("createMemoryCupoDiarioStore", () => {
  it("counts the attempts of each identifier separately", async () => {
    const store = createMemoryCupoDiarioStore(HOY);

    await store.save(INTENTO);
    await store.save({ ...INTENTO, resultado: ResultadoIntentoConsulta.ERROR });
    await store.save({ ...INTENTO, identificador: "sandbox-otro" });

    await expect(store.countDelDia(INTENTO.identificador)).resolves.toBe(2);
    await expect(store.countDelDia("sandbox-otro")).resolves.toBe(1);
    await expect(store.countDelDia("sin-intentos")).resolves.toBe(0);
  });

  it("starts a new count when the date it receives changes", async () => {
    let hoy = "20261029";
    const store = createMemoryCupoDiarioStore(() => hoy);

    await store.save(INTENTO);
    await expect(store.countDelDia(INTENTO.identificador)).resolves.toBe(1);

    hoy = "20261030";
    await expect(store.countDelDia(INTENTO.identificador)).resolves.toBe(0);
    await store.save(INTENTO);
    await expect(store.countDelDia(INTENTO.identificador)).resolves.toBe(1);
  });
});

describe("createPrismaCupoDiarioStore", () => {
  it.each([
    [SessionChannel.WHATSAPP, CanalOrigenId.WHATSAPP],
    [SessionChannel.WEB, CanalOrigenId.WEB],
  ])("saves a %s attempt with its catalog channel and its result", async (canal, canalOrigenId) => {
    db.create.mockResolvedValue({});

    await createPrismaCupoDiarioStore().save({ ...INTENTO, canal });

    expect(db.create).toHaveBeenCalledWith({
      data: { identificador: INTENTO.identificador, canalOrigenId, resultado: ResultadoIntentoConsulta.NO_ENCONTRADA },
    });
  });

  it("counts the attempts of the Lima day for the identifier and returns a number", async () => {
    db.queryRaw.mockResolvedValue([{ total: BigInt(2) }]);

    await expect(createPrismaCupoDiarioStore().countDelDia(INTENTO.identificador)).resolves.toBe(2);

    const [sql, ...values] = db.queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(sql.join("?")).toContain("chatbot.consulta_incidencia_intento");
    expect(values).toContain(INTENTO.identificador);
    expect(values).toContain("America/Lima");
  });

  it("lets a database failure through instead of answering zero attempts", async () => {
    db.queryRaw.mockRejectedValue(new Error("conexion caida"));

    await expect(createPrismaCupoDiarioStore().countDelDia(INTENTO.identificador)).rejects.toThrow("conexion caida");
  });
});

describe("saveIntentoConsulta", () => {
  it("keeps the attempt in the store it receives", async () => {
    const store = createMemoryCupoDiarioStore(HOY);

    await expect(saveIntentoConsulta(INTENTO, store)).resolves.toEqual({ statusCupo: CupoDiarioStatus.SAVED });
    await expect(store.countDelDia(INTENTO.identificador)).resolves.toBe(1);
  });

  it("answers FAILED and logs the failure without the identifier when the store fails", async () => {
    const lines = captureLogs();

    await expect(saveIntentoConsulta(INTENTO, brokenStore)).resolves.toEqual({ statusCupo: CupoDiarioStatus.FAILED });

    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        event: "consulta.intento_persist_failed",
        canal: SessionChannel.WHATSAPP,
        resultado: ResultadoIntentoConsulta.NO_ENCONTRADA,
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain(INTENTO.identificador);
  });
});

describe("countIntentosDelDia", () => {
  it("answers COUNTED with the attempts of the day", async () => {
    const store = createMemoryCupoDiarioStore(HOY);
    await store.save(INTENTO);

    await expect(countIntentosDelDia(INTENTO.identificador, store)).resolves.toEqual({ statusCupo: CupoDiarioStatus.COUNTED, total: 1 });
  });

  it("answers FAILED, never zero attempts, and logs the failure without the identifier when the store fails", async () => {
    const lines = captureLogs();

    await expect(countIntentosDelDia(INTENTO.identificador, brokenStore)).resolves.toEqual({ statusCupo: CupoDiarioStatus.FAILED });

    expect(lines).toEqual([expect.objectContaining({ level: "error", event: "consulta.cupo_count_failed" })]);
    expect(JSON.stringify(lines)).not.toContain(INTENTO.identificador);
  });
});
