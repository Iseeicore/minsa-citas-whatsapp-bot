import { afterEach, describe, expect, it, vi } from "vitest";
import {
  minsaDigitalAppUrl,
  minsaDigitalOrigin,
  minsaDigitalUrl,
  postWithBearer,
} from "@/lib/integrations/minsa/wire";

const PORTAL = "https://portal-prueba.example.test";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("la URL de MINSA Digital sale solo de MINSA_DIGITAL_APP_URL", () => {
  it("devuelve la variable tal cual cuando es una URL limpia", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", PORTAL);

    expect(minsaDigitalAppUrl()).toBe(PORTAL);
  });

  it("recorta espacios y la barra final para no armar enlaces con doble barra", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", `  ${PORTAL}//  `);

    expect(minsaDigitalAppUrl()).toBe(PORTAL);
    expect(minsaDigitalUrl("/login")).toBe(`${PORTAL}/login`);
  });

  it("sin variable no inventa ningún dominio: la URL base queda vacía y los enlaces son null", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");

    expect(minsaDigitalAppUrl()).toBe("");
    expect(minsaDigitalUrl("/login")).toBeNull();
    expect(minsaDigitalUrl()).toBeNull();
    expect(minsaDigitalOrigin()).toBeNull();
  });

  it("el origen es esquema, dominio y puerto, sin la ruta", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", `${PORTAL}:8443/inicio/`);

    expect(minsaDigitalOrigin()).toBe(`${PORTAL}:8443`);
    expect(minsaDigitalUrl("/login")).toBe(`${PORTAL}:8443/inicio/login`);
  });

  it("una variable que no es una URL no produce origen", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "portal-sin-esquema");

    expect(minsaDigitalOrigin()).toBeNull();
  });
});

describe("postWithBearer arma Origin y Referer desde la variable", () => {
  const callHeaders = async (): Promise<Record<string, string>> => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MINSA_API_HOST", "https://api.example.test");

    await postWithBearer("/cita", { a: 1 }, "token-prueba");

    return fetchMock.mock.calls[0][1].headers as Record<string, string>;
  };

  it("con la variable definida las cabeceras siguen al dominio configurado", async () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", PORTAL);

    const headers = await callHeaders();

    expect(headers.Origin).toBe(PORTAL);
    expect(headers.Referer).toBe(`${PORTAL}/`);
    expect(headers.Authorization).toBe("Bearer token-prueba");
  });

  it("cambiar la variable cambia las cabeceras sin tocar código", async () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "https://otro-portal.example.test/");

    const headers = await callHeaders();

    expect(headers.Origin).toBe("https://otro-portal.example.test");
    expect(headers.Referer).toBe("https://otro-portal.example.test/");
  });

  it("sin la variable no se envían Origin ni Referer inventados, pero sí el resto", async () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");

    const headers = await callHeaders();

    expect(headers).not.toHaveProperty("Origin");
    expect(headers).not.toHaveProperty("Referer");
    expect(headers.Authorization).toBe("Bearer token-prueba");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
