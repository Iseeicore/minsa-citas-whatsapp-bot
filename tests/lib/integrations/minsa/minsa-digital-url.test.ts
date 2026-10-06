import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookAppointment } from "@/lib/integrations/minsa/booking";
import { fetchCatalogItems } from "@/lib/integrations/minsa/catalog-pipeline";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { configureLogger } from "@/lib/observability/logger";
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

describe("postWithBearer con el MINSA real no sale sin Origin ni Referer", () => {
  const blockedCall = async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
    vi.stubEnv("MINSA_API_HOST", "https://api.example.test");
    const lines: Array<Record<string, unknown>> = [];
    const restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line)), level: "info" });
    const response = await postWithBearer("/cita", { a: 1 }, "token-prueba");
    restore();
    return { fetchMock, response, lines };
  };

  it("sin la variable no llama al MINSA: responde un 503 sin cuerpo y deja el evento en el log", async () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");

    const { fetchMock, response, lines } = await blockedCall();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(response.ok).toBe(false);
    expect(lines).toEqual([
      expect.objectContaining({ level: "error", event: "minsa.request_blocked", path: "/cita", reason: "MINSA_DIGITAL_APP_URL_MISSING" }),
    ]);
  });

  it("con una variable que no es una URL tampoco llama al MINSA", async () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "portal-sin-esquema");

    const { fetchMock, response } = await blockedCall();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
  });

  it("con la variable definida llama al MINSA con Origin y Referer, como siempre", async () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", PORTAL);

    const { fetchMock, lines } = await blockedCall();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Origin).toBe(PORTAL);
    expect(headers.Referer).toBe(`${PORTAL}/`);
    expect(lines.filter((line) => line.event === "minsa.request_blocked")).toEqual([]);
  });
});

describe("los llamantes tratan el corte como un error del MINSA", () => {
  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
    vi.stubEnv("MINSA_API_HOST", "https://api.example.test");
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");
    vi.stubGlobal("fetch", vi.fn());
  });

  it("la reserva de una cita responde error sin lanzar", async () => {
    const params = {
      codigoRenipress: "6181",
      codigoUps: "222400",
      fechaCita: "20260923",
      horaCita: "1115",
      numeroDocumentoPaciente: "12345678",
    };

    await expect(bookAppointment(params, "token")).resolves.toEqual({ status: "error" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("un catálogo con bearer responde error sin lanzar", async () => {
    const result = await fetchCatalogItems({
      endpoint: MinsaEndpoint.CITAS,
      body: {},
      bearer: "token",
      rowsPath: ["data"],
      parseRow: () => undefined,
    });

    expect(result).toEqual({ status: "error" });
    expect(fetch).not.toHaveBeenCalled();
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
