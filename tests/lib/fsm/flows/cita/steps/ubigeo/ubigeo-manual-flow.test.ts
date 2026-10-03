import { describe, expect, it } from "vitest";
import {
  handleAwaitingDepartamento,
  handleAwaitingDistrito,
  handleAwaitingProvincia,
} from "@/lib/fsm/flows/cita/steps/ubigeo/ubigeo";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";

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
    expect(result.session.slots.citaDepartamento).toBeUndefined();
    expect((sent(result)[0] as { text: string }).text).toBe("No pudimos leer eso. Indícanos el departamento.");
  });

  it("un departamento real sigue avanzando igual que hoy", () => {
    const result = handleAwaitingDepartamento(awaiting(), text("Lima"));

    expect(result.session.state).toBe("cita_awaiting_provincia");
    expect(result.session.slots.citaDepartamento).toBe("Lima");
  });
});

describe("handleAwaitingProvincia: ruido/gibberish no se guarda", () => {
  const awaiting = (): Session => ({ state: "cita_awaiting_provincia", slots: { citaDepartamento: "Lima" }, counters: {} });

  it("texto gibberish no avanza, pide reintentar", () => {
    const result = handleAwaitingProvincia(awaiting(), text("qwrtpkjh"));

    expect(result.session.state).toBe("cita_awaiting_provincia");
    expect(result.session.slots.citaProvincia).toBeUndefined();
    expect((sent(result)[0] as { text: string }).text).toBe("No pudimos leer eso. ¿En qué provincia?");
  });

  it("una provincia real sigue avanzando igual que hoy", () => {
    const result = handleAwaitingProvincia(awaiting(), text("Lima"));

    expect(result.session.state).toBe("cita_awaiting_distrito");
    expect(result.session.slots.citaProvincia).toBe("Lima");
  });
});

describe("handleAwaitingDistrito (flujo manual): ruido/gibberish no se guarda", () => {
  const awaiting = (): Session => ({
    state: "cita_awaiting_distrito",
    slots: { citaDepartamento: "Lima", citaProvincia: "Lima" },
    counters: {},
  });

  it("texto gibberish no avanza, pide reintentar", () => {
    const result = handleAwaitingDistrito(awaiting(), text("zxcvbnqw"));

    expect(result.session.state).toBe("cita_awaiting_distrito");
    expect(result.session.slots.citaDistrito).toBeUndefined();
    expect((sent(result)[0] as { text: string }).text).toBe("No pudimos leer eso. Indícanos el distrito.");
  });

  it("un distrito real sigue avanzando igual que hoy, dispara search_ubigeo", () => {
    const result = handleAwaitingDistrito(awaiting(), text("Miraflores"));

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(result.session.slots.citaDistrito).toBe("Miraflores");
    expect(queries(result)[0].kind).toBe("search_ubigeo");
  });
});
