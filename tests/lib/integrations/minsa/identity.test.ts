import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipoDocumento } from "@/lib/enums/tipo-documento";
import { FAKE_CARNET_EXTRANJERIA, FAKE_DNI, FAKE_TWOFA_ID } from "@/lib/integrations/minsa/fake-data";
import { validateUser, verifyCode } from "@/lib/integrations/minsa/identity";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { logger } from "@/lib/observability/logger";

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

  it.each([
    ["success con twofa_id en la raíz", { success: true, twofa_id: "tw-1" }],
    ["is_valid", { is_valid: true, twofa_id: "tw-1" }],
    ["valido y twofa_id dentro de data", { data: { valido: true, twofa_id: "tw-1" } }],
  ])("forma alterna pendiente de confirmar con MINSA: %s", async (_forma, body) => {
    vi.stubGlobal("fetch", minsaResponding(body));

    await expect(validateUser("10684750", TipoDocumento.DNI)).resolves.toEqual({ status: "valid", twofaId: "tw-1" });
  });

  it.each([
    ["valido en false", { valido: false, twofa_id: "tw-1" }, { status: "not_valid" }],
    ["un cuerpo vacío, sin respuesta explícita", {}, { status: "error" }],
    ["un cuerpo que no es objeto", null, { status: "error" }],
    ["válido sin twofa_id", { valido: true }, { status: "error" }],
    ["twofa_id que no es texto", { valido: true, twofa_id: 7 }, { status: "error" }],
  ])("%s", async (_caso, body, esperado) => {
    vi.stubGlobal("fetch", minsaResponding(body));

    await expect(validateUser("10684750", TipoDocumento.DNI)).resolves.toEqual(esperado);
  });

  it("un 500 es error", async () => {
    vi.stubGlobal("fetch", minsaResponding({}, 500));

    await expect(validateUser("10684750", TipoDocumento.DNI)).resolves.toEqual({ status: "error" });
  });
});

describe("real MINSA: verifyCode", () => {
  const minsaResponding = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
    vi.stubEnv("MINSA_INTEGRATION_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ["token en la raíz", { success: true, token: "jwt" }],
    ["token dentro de data", { success: true, data: { token: "jwt" } }],
  ])("verifica con %s (ninguna de las dos formas está confirmada con MINSA)", async (_forma, body) => {
    vi.stubGlobal("fetch", minsaResponding(body));

    await expect(verifyCode("tw-1", "1234")).resolves.toEqual({ status: "verified", token: "jwt" });
  });

  it("success en false es invalid", async () => {
    vi.stubGlobal("fetch", minsaResponding({ success: false, token: "jwt" }));

    await expect(verifyCode("tw-1", "1234")).resolves.toEqual({ status: "invalid" });
  });

  it.each([
    ["sin token", { success: true }],
    ["sin success", { token: "jwt" }],
    ["un cuerpo que no es objeto", null],
  ])("%s es un error de contrato que queda en el log, no un código incorrecto", async (_caso, body) => {
    const error = vi.spyOn(logger, "error");
    vi.stubGlobal("fetch", minsaResponding(body));

    await expect(verifyCode("tw-1", "1234")).resolves.toEqual({ status: "error" });
    expect(error).toHaveBeenCalledWith(
      "minsa.identity.contract_mismatch",
      expect.objectContaining({ endpoint: MinsaEndpoint.VERIFICAR_CODIGO }),
    );
  });

  it.each([
    [401, { status: "invalid" }],
    [500, { status: "error" }],
  ])("un %i es %o", async (httpStatus, esperado) => {
    vi.stubGlobal("fetch", minsaResponding({}, httpStatus));

    await expect(verifyCode("tw-1", "1234")).resolves.toEqual(esperado);
  });
});
