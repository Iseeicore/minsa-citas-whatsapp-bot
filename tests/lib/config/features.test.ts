import { afterEach, describe, expect, it, vi } from "vitest";
import { isIncidenciasEnabled, isTerminosEnabled } from "@/lib/config/features";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each([
  ["INCIDENCIAS_ENABLED", isIncidenciasEnabled],
  ["TERMINOS_ENABLED", isTerminosEnabled],
])("the %s flag", (variable, isEnabled) => {
  it.each(["true", "TRUE", "True", " true ", "\ttrue\n"])("turns on when the value is %j", (value) => {
    vi.stubEnv(variable, value);

    expect(isEnabled()).toBe(true);
  });

  it.each(["", "false", "1", "yes", "si", "truee", "on"])("stays off when the value is %j", (value) => {
    vi.stubEnv(variable, value);

    expect(isEnabled()).toBe(false);
  });

  it("stays off when the variable is not defined", () => {
    vi.stubEnv(variable, undefined);

    expect(isEnabled()).toBe(false);
  });

  it("is read on every call, so a change in the environment takes effect without reloading the module", () => {
    vi.stubEnv(variable, "true");
    expect(isEnabled()).toBe(true);

    vi.stubEnv(variable, "false");
    expect(isEnabled()).toBe(false);
  });
});
