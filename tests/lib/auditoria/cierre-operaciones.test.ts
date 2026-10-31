import { afterEach, describe, expect, it, vi } from "vitest";
import { cerrarOperacionesSinCierre, detenerCierreOperaciones, programarCierreOperaciones } from "@/lib/auditoria/cierre-operaciones";
import { CIERRE_OPERACIONES_INTERVALO_MS, CIERRE_OPERACIONES_LOTE, OPERACION_SIN_CIERRE_MS } from "@/lib/constants/limits/auditoria";
import { configureLogger } from "@/lib/observability/logger";

function captureLogs() {
  const lines: Array<Record<string, unknown>> = [];
  const restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line)), level: "info" });
  return { lines, restore };
}

describe("cierre de operaciones interrumpidas", () => {
  afterEach(() => {
    detenerCierreOperaciones();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("cierra con la antigüedad y el lote de las constantes y registra cuántas cerró", async () => {
    const cerrar = vi.fn(async () => 2);
    const { lines, restore } = captureLogs();

    await cerrarOperacionesSinCierre(cerrar);
    restore();

    expect(cerrar).toHaveBeenCalledWith(OPERACION_SIN_CIERRE_MS, CIERRE_OPERACIONES_LOTE);
    expect(lines).toEqual([expect.objectContaining({ level: "info", event: "auditoria.operaciones_interrumpidas", cerradas: 2 })]);
  });

  it("registra la falla como error y no la propaga", async () => {
    const { lines, restore } = captureLogs();

    await expect(cerrarOperacionesSinCierre(async () => Promise.reject(new Error("sin base")))).resolves.toBeUndefined();
    restore();

    expect(lines).toEqual([expect.objectContaining({ level: "error", event: "auditoria.cierre_failed" })]);
  });

  it("corre al arrancar y después cada hora, una sola vez aunque se programe dos veces", async () => {
    vi.useFakeTimers();
    const cerrar = vi.fn(async () => 0);
    const { restore } = captureLogs();

    programarCierreOperaciones(cerrar);
    programarCierreOperaciones(cerrar);
    await vi.advanceTimersByTimeAsync(CIERRE_OPERACIONES_INTERVALO_MS * 2);
    restore();

    expect(cerrar).toHaveBeenCalledTimes(3);
  });

  it("no corre con la base apagada", async () => {
    vi.useFakeTimers();
    vi.stubEnv("DATABASE_ENABLED", "false");
    const cerrar = vi.fn(async () => 0);

    programarCierreOperaciones(cerrar);
    await vi.advanceTimersByTimeAsync(CIERRE_OPERACIONES_INTERVALO_MS);

    expect(cerrar).not.toHaveBeenCalled();
  });
});
