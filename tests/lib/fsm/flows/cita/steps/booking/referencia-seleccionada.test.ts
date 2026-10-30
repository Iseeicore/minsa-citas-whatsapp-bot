import { afterEach, describe, expect, it, vi } from "vitest";
import { readReferencias, readReferenciasSinProgramacion } from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import type { Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { logger } from "@/lib/observability/logger";

const REFERENCIA: ReferenciaItem = {
  idReferencia: "r1",
  numero: "001",
  fechaInicio: "01/01/2026",
  ipressOrigen: "Centro",
  ipressDestino: "Hospital",
  upsOrigen: "Medicina",
  upsDestino: "Cardiología",
  codigoIpressDestino: "0000123",
  codigoUpsDestino: "02",
  estado: 1,
};

const at = (slots: Session["slots"]): Session => ({ state: "cita_awaiting_referencia_select", slots, counters: {} });

describe("readReferencias", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devuelve las referencias guardadas", () => {
    expect(readReferencias(at({ [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCIA]) }))).toEqual([REFERENCIA]);
  });

  it("con el slot dañado lo registra y no devuelve referencias", () => {
    const warn = vi.spyOn(logger, "warn");

    expect(readReferencias(at({ [SlotKey.CITA_REFERENCIAS_DATA]: "[{" }))).toEqual([]);
    expect(warn).toHaveBeenCalledWith("session.slot_corrupt", { slot: SlotKey.CITA_REFERENCIAS_DATA });
  });
});

describe("readReferenciasSinProgramacion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("con el slot dañado lo registra y no marca ninguna", () => {
    const warn = vi.spyOn(logger, "warn");

    expect(readReferenciasSinProgramacion(at({ [SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION]: "{}" })).size).toBe(0);
    expect(warn).toHaveBeenCalledWith("session.slot_corrupt", { slot: SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION });
  });
});
