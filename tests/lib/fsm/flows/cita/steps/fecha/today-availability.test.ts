import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withoutTodayIfNoHorasLeft } from "@/lib/fsm/flows/cita/steps/fecha/today-availability";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import type { ListFechasResult, ListHorasResult } from "@/lib/integrations/minsa/types";

const TODAY = { fechaCupo: "03/11/2026", cantidadCupos: 7 };
const TOMORROW = { fechaCupo: "04/11/2026", cantidadCupos: 3 };
const FECHAS: ListFechasResult = { status: CatalogStatus.FOUND, items: [TODAY, TOMORROW] };
const horas = (...starts: string[]): ListHorasResult => ({
  status: CatalogStatus.FOUND,
  items: starts.map((horaInicio) => ({ horaInicio, horaFin: "23:59", cantidadCupos: 1 })),
});

describe("today is offered only while it still has slots ahead", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T15:00:00-05:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops today when every slot already started, asking the hours of today once", async () => {
    const horasOf = vi.fn().mockResolvedValue(horas("08:00", "14:30"));

    await expect(withoutTodayIfNoHorasLeft(FECHAS, horasOf)).resolves.toEqual({ status: CatalogStatus.FOUND, items: [TOMORROW] });
    expect(horasOf).toHaveBeenCalledOnce();
    expect(horasOf).toHaveBeenCalledWith("20261103");
    await expect(withoutTodayIfNoHorasLeft({ status: CatalogStatus.FOUND, items: [TODAY] }, horasOf)).resolves.toEqual({
      status: CatalogStatus.EMPTY,
    });
  });

  it("keeps today when a slot starts later or the hours of today cannot be read", async () => {
    const answers = [
      vi.fn().mockResolvedValue(horas("08:00", "16:00")),
      vi.fn().mockResolvedValue({ status: CatalogStatus.ERROR }),
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    ];

    for (const horasOf of answers) await expect(withoutTodayIfNoHorasLeft(FECHAS, horasOf)).resolves.toEqual(FECHAS);
  });

  it("does not ask the hours when today is not among the dates", async () => {
    const horasOf = vi.fn();

    await expect(withoutTodayIfNoHorasLeft({ status: CatalogStatus.FOUND, items: [TOMORROW] }, horasOf)).resolves.toMatchObject({
      items: [TOMORROW],
    });
    expect(horasOf).not.toHaveBeenCalled();
  });
});
