import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitQueja } from "@/lib/integrations/quejas";

const basePayload = {
  celular: "51999999999",
  nombreCompleto: null,
  queja: "El consultorio estaba cerrado sin aviso.",
};

describe("reclamo anónimo (sin DNI): mockeado a propósito, no llama al backend real", () => {
  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("con dni null, responde 'accepted' sin tocar la red, aunque el flag esté en true", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(submitQueja({ ...basePayload, dni: null })).resolves.toEqual({ status: "accepted" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("con dni presente, sigue llamando al backend real como siempre", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(submitQueja({ ...basePayload, dni: "12345678" })).resolves.toEqual({ status: "accepted" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
