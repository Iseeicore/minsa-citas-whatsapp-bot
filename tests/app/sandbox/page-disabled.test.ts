import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/components/SandboxWidgetDemo", () => ({ default: () => null }));

import SandboxPage, { generateMetadata } from "@/app/sandbox/page";
import { SANDBOX_PAGE_DESCRIPTION_CITA_REFERENCIA_TEXT } from "@/lib/constants/textos/menu";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the sandbox page description", () => {
  it("names the incidencias when INCIDENCIAS_ENABLED is on", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");

    expect(generateMetadata().description).toBe("Agenda tu cita o registra una denuncia anticorrupción con el Ministerio de Salud del Perú.");
  });

  it("names the citas and the referencias when it is off", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(generateMetadata().description).toBe(SANDBOX_PAGE_DESCRIPTION_CITA_REFERENCIA_TEXT);
  });

  it("names the citas and the referencias when the variable is not defined", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", undefined);

    expect(generateMetadata().description).toBe(SANDBOX_PAGE_DESCRIPTION_CITA_REFERENCIA_TEXT);
  });

  it("keeps the title in both modes", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(generateMetadata().title).toBe("MINSA Responde");
  });
});

describe("the sandbox page", () => {
  it("hands the chat the evidence image limit read on the server from EVIDENCE_IMAGE_MAX_MB", () => {
    vi.stubEnv("SANDBOX_PAGE_ENABLED", "true");
    vi.stubEnv("EVIDENCE_IMAGE_MAX_MB", "3");

    expect(SandboxPage().props.imageMaxBytes).toBe(3 * 1024 * 1024);
  });
});
