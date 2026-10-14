import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/components/SandboxWidgetDemo", () => ({ default: () => null }));

import { generateMetadata } from "@/app/sandbox/page";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the sandbox page description", () => {
  it("names the incidencias when INCIDENCIAS_ENABLED is on", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");

    expect(generateMetadata().description).toBe("Agenda tu cita o registra una incidencia con el Ministerio de Salud del Perú.");
  });

  it("names only the citas when it is off", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(generateMetadata().description).toBe("Agenda tu cita con el Ministerio de Salud del Perú.");
  });

  it("names only the citas when the variable is not defined", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", undefined);

    expect(generateMetadata().description).toBe("Agenda tu cita con el Ministerio de Salud del Perú.");
  });

  it("keeps the title in both modes", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(generateMetadata().title).toBe("MINSA Digital");
  });
});
