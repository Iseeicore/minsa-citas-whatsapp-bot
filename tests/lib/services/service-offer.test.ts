import { afterEach, describe, expect, it, vi } from "vitest";
import { currentServiceOffer } from "@/lib/services/service-offer";
import { ServiceOffer } from "@/lib/enums/service-offer";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("currentServiceOffer", () => {
  it.each([
    [undefined, undefined, ServiceOffer.CITA],
    ["false", "true", ServiceOffer.CITA_REFERENCIA],
    ["true", "false", ServiceOffer.CITA_INCIDENCIA],
    ["true", "true", ServiceOffer.COMPLETA],
  ])("with INCIDENCIAS_ENABLED=%j and REFERENCIAS_ENABLED=%j offers %s", (incidencias, referencias, offer) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", incidencias);
    vi.stubEnv("REFERENCIAS_ENABLED", referencias);

    expect(currentServiceOffer()).toBe(offer);
  });
});
