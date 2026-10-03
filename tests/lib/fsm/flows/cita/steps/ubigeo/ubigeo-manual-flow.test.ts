import { describe, expect, it } from "vitest";
import {
  handleAwaitingDepartamento,
  handleAwaitingDistrito,
  handleAwaitingProvincia,
} from "@/lib/fsm/flows/cita/steps/ubigeo/ubigeo";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "51999999999";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

describe("handleAwaitingDepartamento: ruido/gibberish no se guarda", () => {
  const awaiting = (): Session => ({ state: "cita_awaiting_departamento", slots: {}, counters: {} });

  it("texto gibberish no avanza, pide reintentar", () => {
    const result = handleAwaitingDepartamento(awaiting(), text("asdfgh"));

    expect(result.session.state).toBe("cita_awaiting_departamento");
    expect(result.session.slots[SlotKey.CITA_DEPARTAMENTO]).toBeUndefined();
    expect((sent(result)[0] as { text: string }).text).toBe("No pudimos leer eso. Indícanos el departamento.");
  });

  it("un departamento real sigue avanzando igual que hoy", () => {
    const result = handleAwaitingDepartamento(awaiting(), text("Lima"));

    expect(result.session.state).toBe("cita_awaiting_provincia");
    expect(result.session.slots[SlotKey.CITA_DEPARTAMENTO]).toBe("Lima");
  });
});

describe("handleAwaitingProvincia: ruido/gibberish no se guarda", () => {
  const awaiting = (): Session => ({ state: "cita_awaiting_provincia", slots: { [SlotKey.CITA_DEPARTAMENTO]: "Lima" }, counters: {} });

  it("texto gibberish no avanza, pide reintentar", () => {
    const result = handleAwaitingProvincia(awaiting(), text("qwrtpkjh"));

    expect(result.session.state).toBe("cita_awaiting_provincia");
    expect(result.session.slots[SlotKey.CITA_PROVINCIA]).toBeUndefined();
    expect((sent(result)[0] as { text: string }).text).toBe("No pudimos leer eso. ¿En qué provincia?");
  });

  it("una provincia real sigue avanzando igual que hoy", () => {
    const result = handleAwaitingProvincia(awaiting(), text("Lima"));

    expect(result.session.state).toBe("cita_awaiting_distrito");
    expect(result.session.slots[SlotKey.CITA_PROVINCIA]).toBe("Lima");
  });
});

describe("handleAwaitingDistrito (flujo manual): ruido/gibberish no se guarda", () => {
  const awaiting = (): Session => ({
    state: "cita_awaiting_distrito",
    slots: { [SlotKey.CITA_DEPARTAMENTO]: "Lima", [SlotKey.CITA_PROVINCIA]: "Lima" },
    counters: {},
  });

  it("texto gibberish no avanza, pide reintentar", () => {
    const result = handleAwaitingDistrito(awaiting(), text("zxcvbnqw"));

    expect(result.session.state).toBe("cita_awaiting_distrito");
    expect(result.session.slots[SlotKey.CITA_DISTRITO]).toBeUndefined();
    expect((sent(result)[0] as { text: string }).text).toBe("No pudimos leer eso. Indícanos el distrito.");
  });

  it("un distrito real sigue avanzando igual que hoy, dispara search_ubigeo", () => {
    const result = handleAwaitingDistrito(awaiting(), text("Miraflores"));

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(result.session.slots[SlotKey.CITA_DISTRITO]).toBe("Miraflores");
    expect(queries(result)[0].kind).toBe("search_ubigeo");
  });
});
