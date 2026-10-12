import { describe, expect, it } from "vitest";
import { payloadText, slotText } from "@/lib/fsm/core/slot-readers";
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

  it("convierte a texto un slot numérico o booleano, igual que String(valor ?? \"\")", () => {
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
