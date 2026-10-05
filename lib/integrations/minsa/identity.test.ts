import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipoDocumento } from "@/lib/enums/tipo-documento";
import { FAKE_CARNET_EXTRANJERIA, FAKE_DNI, FAKE_TWOFA_ID } from "@/lib/integrations/minsa/fake-data";
import { validateUser } from "@/lib/integrations/minsa/identity";

describe("fake validateUser", () => {
  beforeEach(() => {
    delete process.env.SANDBOX_USE_REAL_MINSA;
  });

  it("valida el DNI de prueba", async () => {
    await expect(validateUser(FAKE_DNI, TipoDocumento.DNI)).resolves.toEqual({ status: "valid", twofaId: FAKE_TWOFA_ID });
  });

  it("valida el carnet de extranjería de prueba, con 9 dígitos", async () => {
    expect(FAKE_CARNET_EXTRANJERIA).toMatch(/^\d{9}$/);
    await expect(validateUser(FAKE_CARNET_EXTRANJERIA, TipoDocumento.CARNET_EXTRANJERIA)).resolves.toEqual({
      status: "valid",
      twofaId: FAKE_TWOFA_ID,
    });
  });

  it("rechaza cualquier otro documento", async () => {
    await expect(validateUser("87654321", TipoDocumento.DNI)).resolves.toEqual({ status: "not_valid" });
    await expect(validateUser("987654321", TipoDocumento.CARNET_EXTRANJERIA)).resolves.toEqual({ status: "not_valid" });
  });
});

describe("real MINSA: validateUser respeta el contrato de validar-usuario", () => {
  const minsaResponding = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const sentBody = (fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> =>
    JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);

  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
    vi.stubEnv("MINSA_INTEGRATION_SECRET", "test-secret");
    vi.stubEnv("MINSA_CONVERSATION_ID_PLACEHOLDER", "wa-session-550e8400-e29b-41d4-a716-446655440000");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ["10684750", TipoDocumento.DNI, "01"],
    ["123456789", TipoDocumento.CARNET_EXTRANJERIA, "03"],
  ])("manda %s con tipo_documento %s", async (documento, tipo, tipoEsperado) => {
    const fetchMock = minsaResponding({ valido: true, twofa_id: "tw-1" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateUser(documento, tipo)).resolves.toEqual({ status: "valid", twofaId: "tw-1" });

    expect(sentBody(fetchMock)).toEqual({
      numero_documento: documento,
      tipo_documento: tipoEsperado,
      conversation_id: "wa-session-550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("un 404 sigue siendo not_valid", async () => {
    vi.stubGlobal("fetch", minsaResponding({}, 404));

    await expect(validateUser("123456789", TipoDocumento.CARNET_EXTRANJERIA)).resolves.toEqual({ status: "not_valid" });
  });
});
