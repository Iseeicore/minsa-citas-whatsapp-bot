import { afterEach, describe, expect, it, vi } from "vitest";
import { beginIncidencia, readInicio, writeInicio } from "@/lib/fsm/flows/incidencia/inicio";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { Session } from "@/lib/fsm/core/types";
import { IncidenciaOrigen } from "@/lib/enums/incidencia-origen";
import { SlotKey } from "@/lib/enums/slot-key";
import { logger } from "@/lib/observability/logger";

describe("beginIncidencia: the consent is the first step of every way in", () => {
  it("asks only whether the consent was already given, and sends nothing yet", () => {
    const result = beginIncidencia({}, "¡Hola!");

    expect(result.session.state).toBe("incidencia_consent_check_pending");
    expect(result.effects).toEqual([{ kind: "verificar_consentimiento", payload: {} }]);
    expect(result.effects.every(isQueryEffect)).toBe(true);
  });

  it("from the menu it keeps the origin and the greeting for the first message shown", () => {
    const result = beginIncidencia({}, "Lamentamos lo ocurrido.");

    expect(result.session.slots[SlotKey.INCIDENCIA_ORIGEN]).toBe(IncidenciaOrigen.MENU);
    expect(readInicio(result.session.slots)).toEqual({ lead: "Lamentamos lo ocurrido." });
  });

  it("a QR keeps its code, its name and what was written after it for after the consent", () => {
    const result = beginIncidencia({}, "¡Hola!", {
      origen: IncidenciaOrigen.QR,
      codigoRenipress: "6206",
      nombre: "HOSPITAL NACIONAL DOS DE MAYO",
      resto: "me cobraron sin recibo",
    });

    expect(result.session.slots[SlotKey.INCIDENCIA_ORIGEN]).toBe(IncidenciaOrigen.QR);
    expect(result.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBe("me cobraron sin recibo");
    expect(readInicio(result.session.slots)).toEqual({ codigoRenipress: "6206", nombre: "HOSPITAL NACIONAL DOS DE MAYO", lead: "¡Hola!" });
    expect(result.session.slots[SlotKey.INCIDENCIA_UBICACION_TEXTO]).toBeUndefined();
  });

  it("with no greeting nothing is kept as the greeting", () => {
    expect(readInicio(beginIncidencia({}, "").session.slots)).toEqual({});
  });

  it("starts with no counters and keeps the slots it was given", () => {
    const result = beginIncidencia({ [SlotKey.MENU_CHOICE]: "registrar_incidencia" }, "");

    expect(result.session.counters).toEqual({});
    expect(result.session.slots[SlotKey.MENU_CHOICE]).toBe("registrar_incidencia");
  });
});

describe("the start kept in the session", () => {
  it("reads back what was written", () => {
    const slots: Session["slots"] = {};
    writeInicio(slots, { nombre: "POSTA X" });

    expect(readInicio(slots)).toEqual({ nombre: "POSTA X" });
  });

  it("an empty or broken slot reads as an empty start", () => {
    expect(readInicio({})).toEqual({});
    expect(readInicio({ [SlotKey.INCIDENCIA_INICIO]: "{no es json" })).toEqual({});
  });
});

describe("readInicio con un slot dañado", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registra el slot dañado y sigue sin datos de inicio", () => {
    const warn = vi.spyOn(logger, "warn");

    expect(readInicio({ [SlotKey.INCIDENCIA_INICIO]: "{roto" })).toEqual({});
    expect(warn).toHaveBeenCalledWith("session.slot_corrupt", { slot: SlotKey.INCIDENCIA_INICIO });
  });
});
