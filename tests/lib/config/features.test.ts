import { afterEach, describe, expect, it, vi } from "vitest";
import { isIncidenciasEnabled } from "@/lib/config/features";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isIncidenciasEnabled", () => {
  it.each(["true", "TRUE", "True", " true ", "\ttrue\n"])("enables the incidencias when INCIDENCIAS_ENABLED is %j", (value) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", value);

    expect(isIncidenciasEnabled()).toBe(true);
  });

  it.each(["", "false", "1", "yes", "si", "truee", "on"])("keeps them off when the value is %j", (value) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", value);

    expect(isIncidenciasEnabled()).toBe(false);
  });

  it("keeps them off when the variable is not defined", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", undefined);

    expect(isIncidenciasEnabled()).toBe(false);
  });

  it("is read on every call, so a change in the environment takes effect without reloading the module", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    expect(isIncidenciasEnabled()).toBe(true);

    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    expect(isIncidenciasEnabled()).toBe(false);
  });
});
