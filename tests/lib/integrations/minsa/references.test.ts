import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listReferences } from "@/lib/integrations/minsa/references";
import { configureLogger } from "@/lib/observability/logger";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { ReferenceStatus } from "@/lib/enums/reference-status";

const SIN_REFERENCIAS = { statusReference: ReferenceStatus.EMPTY, message: "", data: [] };
const SIN_RESPUESTA = { statusReference: ReferenceStatus.ERROR, message: "", data: [] };

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

  const REFERENCIAS = [
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

  describe("sobre del backend: { status_reference, message, data }", () => {
    it("entrega el estado, el mensaje y las referencias tal como los envía el backend", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.FOUND, message: "Referencias encontradas", data: FILAS }));

      await expect(listReferences("40488601", "01")).resolves.toEqual({
        statusReference: ReferenceStatus.FOUND,
        message: "Referencias encontradas",
        data: REFERENCIAS,
      });
    });

    it("empty llega como empty con la colección vacía", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.EMPTY, message: "Sin referencias", data: [] }));

      await expect(listReferences("40488601", "01")).resolves.toEqual({
        statusReference: ReferenceStatus.EMPTY,
        message: "Sin referencias",
        data: [],
      });
    });

    it("sin data ni message, la colección queda vacía y el mensaje en blanco", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.EMPTY, data: null }));

      await expect(listReferences("40488601", "01")).resolves.toEqual(SIN_REFERENCIAS);
    });

    it("el estado no se deduce de las filas: manda el del backend", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.EMPTY, message: "", data: FILAS }));

      const result = await listReferences("40488601", "01");

      expect(result.statusReference).toBe(ReferenceStatus.EMPTY);
    });

    it("no filtra por estado de la referencia: entrega las que manda el backend", async () => {
      const registrada = { ...FILAS[0], id_referencia: "999", estado: { codigo: "1", descripcion: "REGISTRADO" } };
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.FOUND, message: "", data: [registrada] }));

      const result = await listReferences("40488601", "01");

      expect(result.data).toEqual([{ ...REFERENCIAS[0], idReferencia: "999", estado: 1 }]);
    });
  });

  describe("respuestas fuera del sobre", () => {
    it.each([
      ["un arreglo suelto", FILAS],
      ["las filas bajo referencias", { referencias: FILAS }],
      ["data sin status_reference", { data: FILAS }],
      ["un status_reference desconocido", { status_reference: "otra_cosa", data: FILAS }],
      ["un cuerpo nulo", "null"],
    ])("%s es error", async (_caso, body) => {
      vi.stubGlobal("fetch", minsaResponding(body));

      await expect(listReferences("40488601", "01")).resolves.toEqual(SIN_RESPUESTA);
    });
  });

  describe("filas inválidas", () => {
    it("se descartan y queda constancia", async () => {
      const records: Array<Record<string, unknown>> = [];
      const restore = configureLogger({
        level: "warn",
        sink: (_level, line) => records.push(JSON.parse(line) as Record<string, unknown>),
      });
      vi.stubGlobal(
        "fetch",
        minsaResponding({
          status_reference: ReferenceStatus.FOUND,
          message: "",
          data: [{ nro_referencia: "sin id" }, "texto", FILAS[0]],
        }),
      );

      const result = await listReferences("40488601", "01");
      restore();

      expect(result.data).toEqual([REFERENCIAS[0]]);
      const discarded = records.find((record) => record.event === "minsa.catalog.rows_discarded");
      expect(discarded).toMatchObject({ endpoint: MinsaEndpoint.REFERENCIAS, discarded: 2, total: 3 });
    });
  });

  describe("fallas del servicio", () => {
    it("un HTTP no-ok es error", async () => {
      vi.stubGlobal("fetch", minsaResponding("", 500));

      await expect(listReferences("12345678", "01")).resolves.toEqual(SIN_RESPUESTA);
    });

    it("un cuerpo que no es JSON es error", async () => {
      vi.stubGlobal("fetch", minsaResponding("<html>", 200));

      await expect(listReferences("12345678", "01")).resolves.toEqual(SIN_RESPUESTA);
    });
  });
});
