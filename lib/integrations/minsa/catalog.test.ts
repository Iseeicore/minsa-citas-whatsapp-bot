import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listFechas, listHoras } from "@/lib/integrations/minsa/catalog";

describe("fake catalog", () => {
  beforeEach(() => {
    delete process.env.SANDBOX_USE_REAL_MINSA;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers the next three days, as seen in Lima, whatever today is", async () => {
    vi.setSystemTime(new Date("2026-12-30T22:00:00-05:00"));

    const result = await listFechas("0000123", "02", "fake-bearer-token");

    expect(result).toEqual({
      status: "found",
      items: [
        { fechaCupo: "20261231", cantidadCupos: 5 },
        { fechaCupo: "20270101", cantidadCupos: 3 },
        { fechaCupo: "20270102", cantidadCupos: 2 },
      ],
    });
  });

  it("uses Lima's calendar, not the server's (a UTC server just after midnight is still 'yesterday' in Lima)", async () => {
    vi.setSystemTime(new Date("2026-09-20T02:00:00Z"));

    const result = await listFechas("0000123", "02", "fake-bearer-token");

    expect(result).toMatchObject({
      items: [{ fechaCupo: "20260920" }, { fechaCupo: "20260921" }, { fechaCupo: "20260922" }],
    });
  });

  it("the third day has ONE horario, to try the confirmation asked before booking a lone horario", async () => {
    vi.setSystemTime(new Date("2026-09-20T02:00:00Z"));

    const result = await listHoras("0000123", "02", "20260922", "fake-bearer-token");

    expect(result).toEqual({ status: "found", items: [{ horaInicio: "13:00", horaFin: "13:30", cantidadCupos: 2 }] });
  });

  it("offers morning and afternoon slots so the 12h/24h cases can be tried by hand", async () => {
    const result = await listHoras("0000123", "02", "20260920", "fake-bearer-token");

    expect(result).toEqual({
      status: "found",
      items: [
        { horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 2 },
        { horaInicio: "09:30", horaFin: "10:00", cantidadCupos: 1 },
        { horaInicio: "13:00", horaFin: "13:30", cantidadCupos: 2 },
      ],
    });
  });
});
