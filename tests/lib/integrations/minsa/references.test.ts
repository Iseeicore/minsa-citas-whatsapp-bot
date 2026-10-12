import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listReferences } from "@/lib/integrations/minsa/references";
import { configureLogger } from "@/lib/observability/logger";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { ReferenceStatus } from "@/lib/enums/reference-status";

const SIN_REFERENCIAS = { status: "empty", items: [] };
const ERROR = { status: "error", items: [] };

describe("MINSA simulado — listReferences", () => {
  beforeEach(() => {
    delete process.env.SANDBOX_USE_REAL_MINSA;
  });

  it.each(["12345678", "123456789", "87654321"])("no hay referencias simuladas para ningún documento (%s)", async (documento) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(listReferences(documento, "01")).resolves.toEqual(SIN_REFERENCIAS);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe("MINSA real — listReferences", () => {
  const minsaResponding = (body: unknown, status = 200) =>
    vi.fn().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
    vi.stubEnv("MINSA_INTEGRATION_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const FILAS = [
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

  const ITEMS = [
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
  ];

  const fueraDeEstado = { ...FILAS[0], id_referencia: "999", estado: { codigo: "1", descripcion: "REGISTRADO" } };

  describe("respuesta actual: arreglo suelto, sin estado del backend", () => {
    it("con filas visibles devuelve found y los items normalizados", async () => {
      vi.stubGlobal("fetch", minsaResponding(FILAS));

      await expect(listReferences("40488601", "01")).resolves.toEqual({ status: "found", items: ITEMS });
    });

    it("un arreglo vacío es empty con la colección vacía", async () => {
      vi.stubGlobal("fetch", minsaResponding([]));

      await expect(listReferences("12345678", "01")).resolves.toEqual(SIN_REFERENCIAS);
    });

    it("una referencia en un estado fuera de 3, 5 y 7 no se ofrece", async () => {
      vi.stubGlobal("fetch", minsaResponding([fueraDeEstado]));

      await expect(listReferences("40488601", "01")).resolves.toEqual(SIN_REFERENCIAS);
    });
  });

  describe("sobre acordado: { status_reference, message, data }", () => {
    it("usa el estado y el mensaje del backend", async () => {
      vi.stubGlobal(
        "fetch",
        minsaResponding({ status_reference: ReferenceStatus.FOUND, message: "Referencias encontradas", data: FILAS }),
      );

      await expect(listReferences("40488601", "01")).resolves.toEqual({
        status: "found",
        items: ITEMS,
        message: "Referencias encontradas",
      });
    });

    it("si el backend dice empty, es empty aunque no mande data", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.EMPTY, message: "Sin referencias", data: null }));

      await expect(listReferences("40488601", "01")).resolves.toEqual({
        status: "empty",
        items: [],
        message: "Sin referencias",
      });
    });

    it("si el backend dice empty, no se ofrecen las filas que acompañen", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.EMPTY, data: FILAS }));

      await expect(listReferences("40488601", "01")).resolves.toEqual(SIN_REFERENCIAS);
    });

    it("found sin ninguna referencia visible queda en empty: no hay nada que ofrecer", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.FOUND, message: "ok", data: [fueraDeEstado] }));

      await expect(listReferences("40488601", "01")).resolves.toEqual({ status: "empty", items: [], message: "ok" });
    });

    it("sin status_reference, el estado sale de data", async () => {
      vi.stubGlobal("fetch", minsaResponding({ data: FILAS }));
      await expect(listReferences("40488601", "01")).resolves.toEqual({ status: "found", items: ITEMS });

      vi.stubGlobal("fetch", minsaResponding({ data: [] }));
      await expect(listReferences("40488601", "01")).resolves.toEqual(SIN_REFERENCIAS);
    });

    it("un status_reference desconocido es error", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: "otra_cosa", data: FILAS }));

      await expect(listReferences("40488601", "01")).resolves.toEqual(ERROR);
    });
  });

  describe("formas que ya no se toleran", () => {
    it.each([
      ["referencias", { referencias: FILAS }],
      ["items", { items: FILAS }],
    ])("las filas bajo %s no se leen", async (_clave, body) => {
      vi.stubGlobal("fetch", minsaResponding(body));

      await expect(listReferences("40488601", "01")).resolves.toEqual(SIN_REFERENCIAS);
    });

    it("data que no es un arreglo es error", async () => {
      vi.stubGlobal("fetch", minsaResponding({ data: { referencias: FILAS } }));

      await expect(listReferences("40488601", "01")).resolves.toEqual(ERROR);
    });

    it.each([
      ["idReferencia en camelCase", { ...FILAS[0], id_referencia: undefined, idReferencia: "1364486" }],
      ["estado como número suelto", { ...FILAS[0], estado: 7 }],
      ["sin id_referencia", { ...FILAS[0], id_referencia: null }],
    ])("una fila con %s se descarta", async (_caso, fila) => {
      vi.stubGlobal("fetch", minsaResponding([fila, FILAS[1]]));

      await expect(listReferences("40488601", "01")).resolves.toEqual({ status: "found", items: [ITEMS[1]] });
    });
  });

  describe("filas inválidas", () => {
    it("deja constancia de las descartadas", async () => {
      const records: Array<Record<string, unknown>> = [];
      const restore = configureLogger({
        level: "warn",
        sink: (_level, line) => records.push(JSON.parse(line) as Record<string, unknown>),
      });
      vi.stubGlobal("fetch", minsaResponding([{ nro_referencia: "sin id" }, "texto", FILAS[0]]));

      await listReferences("40488601", "01");
      restore();

      const discarded = records.find((record) => record.event === "minsa.catalog.rows_discarded");
      expect(discarded).toMatchObject({ endpoint: MinsaEndpoint.REFERENCIAS, discarded: 2, total: 3 });
    });

    it("si llegaron filas y ninguna es válida, es error y no empty", async () => {
      vi.stubGlobal("fetch", minsaResponding([{ nro_referencia: "sin id" }]));

      await expect(listReferences("40488601", "01")).resolves.toEqual(ERROR);
    });
  });

  describe("fallas del servicio", () => {
    it("un HTTP no-ok es error", async () => {
      vi.stubGlobal("fetch", minsaResponding("", 500));

      await expect(listReferences("12345678", "01")).resolves.toEqual(ERROR);
    });

    it("un cuerpo que no es JSON es error", async () => {
      vi.stubGlobal("fetch", minsaResponding("<html>", 200));

      await expect(listReferences("12345678", "01")).resolves.toEqual(ERROR);
    });

    it("un cuerpo que no es arreglo ni objeto es error", async () => {
      vi.stubGlobal("fetch", minsaResponding("null", 200));

      await expect(listReferences("12345678", "01")).resolves.toEqual(ERROR);
    });
  });
});
