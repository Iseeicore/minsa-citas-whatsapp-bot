import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { payloadText, readSlotJson, requirePayloadText, requireSlotText, slotText } from "@/lib/fsm/core/slot-readers";
import { SlotJsonStatus } from "@/lib/enums/slot-json-status";
import { logger } from "@/lib/observability/logger";
import { MissingSlotError } from "@/lib/errors/missing-slot-error";
import { QueryKind } from "@/lib/enums/query-kind";
import type { Slots } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

describe("slotText", () => {
  it("devuelve el texto guardado en el slot, sin recortarlo", () => {
    const slots: Slots = { [SlotKey.CITA_UBIGEO]: "150101", [SlotKey.CITA_DISTRITO]: " Lima " };

    expect(slotText(slots, SlotKey.CITA_UBIGEO)).toBe("150101");
    expect(slotText(slots, SlotKey.CITA_DISTRITO)).toBe(" Lima ");
  });

  it("devuelve texto vacío cuando el slot no existe o guarda null", () => {
    const slots: Slots = { [SlotKey.CITA_DNI]: null };

    expect(slotText(slots, SlotKey.CITA_DNI)).toBe("");
    expect(slotText(slots, SlotKey.CITA_FECHA)).toBe("");
    expect(slotText({}, SlotKey.CITA_BEARER)).toBe("");
  });

  it('convierte a texto un slot numérico o booleano, igual que String(valor ?? "")', () => {
    const slots: Slots = { [SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID]: 0, [SlotKey.AWAITING_CONTINUE]: false };

    expect(slotText(slots, SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID)).toBe("0");
    expect(slotText(slots, SlotKey.AWAITING_CONTINUE)).toBe("false");
  });

  it("convierte a texto un valor que llegó con otro tipo desde la sesión guardada", () => {
    const slots = { [SlotKey.CITA_COD_EESS]: 5947 } as unknown as Slots;

    expect(slotText(slots, SlotKey.CITA_COD_EESS)).toBe("5947");
  });
});

describe("payloadText", () => {
  it("devuelve el campo del payload como texto", () => {
    expect(payloadText({ dni: "12345678" }, "dni")).toBe("12345678");
    expect(payloadText({ codEess: 5947 }, "codEess")).toBe("5947");
    expect(payloadText({ activo: false }, "activo")).toBe("false");
  });

  it("devuelve texto vacío cuando el campo falta o es null", () => {
    expect(payloadText({}, "dni")).toBe("");
    expect(payloadText({ dni: null }, "dni")).toBe("");
    expect(payloadText({ dni: undefined }, "dni")).toBe("");
  });
});

describe("readSlotJson", () => {
  const schema = z.array(z.string());

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devuelve OK con el valor que cumple el esquema", () => {
    const slots: Slots = { [SlotKey.INCIDENCIA_IMAGENES]: JSON.stringify(["a", "b"]) };

    expect(readSlotJson(slots, SlotKey.INCIDENCIA_IMAGENES, schema)).toEqual({ status: SlotJsonStatus.OK, value: ["a", "b"] });
  });

  it("devuelve ABSENT, sin registrar nada, cuando el slot no existe o está vacío", () => {
    const warn = vi.spyOn(logger, "warn");

    expect(readSlotJson({}, SlotKey.INCIDENCIA_IMAGENES, schema)).toEqual({ status: SlotJsonStatus.ABSENT });
    expect(readSlotJson({ [SlotKey.INCIDENCIA_IMAGENES]: "" }, SlotKey.INCIDENCIA_IMAGENES, schema)).toEqual({
      status: SlotJsonStatus.ABSENT,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["un JSON roto", '["a"'],
    ["un JSON que no cumple el esquema", JSON.stringify([1, 2])],
    ["un JSON de otro tipo", JSON.stringify({ a: 1 })],
  ])("devuelve CORRUPT y lo registra con %s, nunca lo toma como ausencia", (_label, raw) => {
    const warn = vi.spyOn(logger, "warn");

    expect(readSlotJson({ [SlotKey.INCIDENCIA_IMAGENES]: raw }, SlotKey.INCIDENCIA_IMAGENES, schema)).toEqual({
      status: SlotJsonStatus.CORRUPT,
    });
    expect(warn).toHaveBeenCalledWith("session.slot_corrupt", { slot: SlotKey.INCIDENCIA_IMAGENES });
  });
});

describe("requireSlotText y requirePayloadText", () => {
  it("devuelven el texto cuando el dato está", () => {
    expect(requireSlotText({ [SlotKey.CITA_BEARER]: "token" }, SlotKey.CITA_BEARER, QueryKind.LIST_FECHAS)).toBe("token");
    expect(requirePayloadText({ codEess: 5947 }, "codEess", QueryKind.LIST_FECHAS)).toBe("5947");
  });

  it.each<[string, () => string]>([
    ["un slot ausente", () => requireSlotText({}, SlotKey.CITA_BEARER, QueryKind.LIST_FECHAS)],
    ["un slot vacío", () => requireSlotText({ [SlotKey.CITA_BEARER]: "" }, SlotKey.CITA_BEARER, QueryKind.LIST_FECHAS)],
    ["un slot null", () => requireSlotText({ [SlotKey.CITA_DNI]: null }, SlotKey.CITA_DNI, QueryKind.BOOK_APPOINTMENT)],
    ["un campo ausente", () => requirePayloadText({}, "codEess", QueryKind.LIST_FECHAS)],
    ["un campo en blanco", () => requirePayloadText({ codEess: "  " }, "codEess", QueryKind.LIST_FECHAS)],
  ])("lanzan MissingSlotError con %s, nunca devuelven texto vacío", (_label, read) => {
    expect(read).toThrow(MissingSlotError);
  });

  it("el error nombra el dato y la consulta, sin su valor", () => {
    expect(() => requirePayloadText({ codEess: "" }, "codEess", QueryKind.LIST_FECHAS)).toThrow(
      expect.objectContaining({ field: "codEess", queryKind: QueryKind.LIST_FECHAS }),
    );
  });
});
