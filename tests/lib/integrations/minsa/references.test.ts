import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listReferences } from "@/lib/integrations/minsa/references";

describe("fake references", () => {
  beforeEach(() => {
    delete process.env.SANDBOX_USE_REAL_MINSA;
  });

  it("el sandbox no tiene referencias por defecto, para no interrumpir el flujo feliz existente", async () => {
    await expect(listReferences("12345678", "01")).resolves.toEqual({ status: "empty" });
  });

  it("el sandbox ofrece referencias solo al DNI de prueba 32028036, con los códigos de destino", async () => {
    const result = await listReferences("32028036", "01");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.items).toHaveLength(6);
    expect(result.items[0]).toMatchObject({
      idReferencia: "1364486",
      codigoIpressDestino: "5987",
      codigoUpsDestino: "222800",
      estado: 7,
    });
    expect(result.items.every((item) => [3, 5, 7].includes(item.estado))).toBe(true);
  });
});

describe("real MINSA — listReferences", () => {
  const minsaResponding = (body: string, status: number) => vi.fn().mockResolvedValue(new Response(body, { status }));

  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
    vi.stubEnv("MINSA_INTEGRATION_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const RESPUESTA_REAL = [
    {
      id_referencia: "1364486",
      nro_referencia: "00123",
      fecha_inicio: "24/07/2024 23:03",
      ipress_origen: { codigo: "5966", descripcion: "SAN FERNANDO" },
      ipress_destino: { codigo: "5987", descripcion: "HOSPITAL MARIA AUXILIADORA" },
      ups_origen: { codigo: "222400", descripcion: "MEDICINA GENERAL" },
      ups_destino: { codigo: "222800", descripcion: "GASTROENTEROLOGÍA" },
      estado: { codigo: "7", descripcion: "PACIENTE CITADO" },
    },
    {
      id_referencia: "1364178",
      nro_referencia: "00275",
      fecha_inicio: "24/11/2023 10:08",
      ipress_origen: { codigo: "5987", descripcion: "HOSPITAL MARIA AUXILIADORA" },
      ipress_destino: { codigo: "6206", descripcion: "HOSPITAL NACIONAL  DOS DE MAYO" },
      ups_origen: { codigo: "230101", descripcion: "" },
      ups_destino: { codigo: "230101", descripcion: "" },
      estado: { codigo: "5", descripcion: "PACIENTE RECIBIDO" },
    },
  ];

  it("parsea la respuesta real tal cual la trae el endpoint (array suelto, estado como objeto con código en texto, nro_referencia)", async () => {
    vi.stubGlobal("fetch", minsaResponding(JSON.stringify(RESPUESTA_REAL), 200));

    await expect(listReferences("40488601", "01")).resolves.toEqual({
      status: "found",
      items: [
        {
          idReferencia: "1364486",
          numero: "00123",
          fechaInicio: "24/07/2024 23:03",
          ipressOrigen: "SAN FERNANDO",
          ipressDestino: "HOSPITAL MARIA AUXILIADORA",
          upsOrigen: "MEDICINA GENERAL",
          upsDestino: "GASTROENTEROLOGÍA",
          codigoIpressDestino: "5987",
          codigoUpsDestino: "222800",
          estado: 7,
        },
        {
          idReferencia: "1364178",
          numero: "00275",
          fechaInicio: "24/11/2023 10:08",
          ipressOrigen: "HOSPITAL MARIA AUXILIADORA",
          ipressDestino: "HOSPITAL NACIONAL  DOS DE MAYO",
          upsOrigen: "",
          upsDestino: "",
          codigoIpressDestino: "6206",
          codigoUpsDestino: "230101",
          estado: 5,
        },
      ],
    });
  });

  it("filtra un estado fuera de {3,5,7}", async () => {
    vi.stubGlobal(
      "fetch",
      minsaResponding(
        JSON.stringify([{ ...RESPUESTA_REAL[0], id_referencia: "999", estado: { codigo: "1", descripcion: "REGISTRADO" } }]),
        200,
      ),
    );

    await expect(listReferences("40488601", "01")).resolves.toEqual({ status: "empty" });
  });

  it("sin referencias visibles, devuelve empty", async () => {
    vi.stubGlobal("fetch", minsaResponding(JSON.stringify([]), 200));

    await expect(listReferences("12345678", "01")).resolves.toEqual({ status: "empty" });
  });

  it("un HTTP no-ok es error", async () => {
    vi.stubGlobal("fetch", minsaResponding("", 500));

    await expect(listReferences("12345678", "01")).resolves.toEqual({ status: "error" });
  });
});
