import { afterEach, describe, expect, it, vi } from "vitest";
import { readImagenes, writeImagenes } from "@/lib/fsm/flows/incidencia/imagenes";
import type { Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { logger } from "@/lib/observability/logger";

describe("readImagenes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devuelve las imágenes guardadas", () => {
    const slots: Session["slots"] = {};
    writeImagenes(slots, ["data:image/png;base64,aGk="]);

    expect(readImagenes(slots)).toEqual(["data:image/png;base64,aGk="]);
  });

  it("sin imágenes guardadas devuelve una lista vacía sin registrar nada", () => {
    const warn = vi.spyOn(logger, "warn");

    expect(readImagenes({})).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("con el slot dañado lo registra y sigue sin imágenes", () => {
    const warn = vi.spyOn(logger, "warn");

    expect(readImagenes({ [SlotKey.INCIDENCIA_IMAGENES]: '["a",' })).toEqual([]);
    expect(warn).toHaveBeenCalledWith("session.slot_corrupt", { slot: SlotKey.INCIDENCIA_IMAGENES });
  });
});
