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

    await expect(listReferences(documento, "01", "token-real")).resolves.toEqual(SIN_REFERENCIAS);
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
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "https://portal.example.test");
    vi.stubEnv("MINSA_API_HOST", "https://api.example.test");
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
      estadoDescripcion: "PACIENTE CITADO",
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
      estadoDescripcion: "PACIENTE RECIBIDO",
    },
  ];

  describe("sobre del backend: { status_reference, message, data }", () => {
    it("entrega el estado, el mensaje y las referencias tal como los envía el backend", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.FOUND, message: "Referencias encontradas", data: FILAS }));

      await expect(listReferences("40488601", "01", "token-real")).resolves.toEqual({
        statusReference: ReferenceStatus.FOUND,
        message: "Referencias encontradas",
        data: REFERENCIAS,
      });
    });

    it("empty llega como empty con la colección vacía", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.EMPTY, message: "Sin referencias", data: [] }));

      await expect(listReferences("40488601", "01", "token-real")).resolves.toEqual({
        statusReference: ReferenceStatus.EMPTY,
        message: "Sin referencias",
        data: [],
      });
    });

    it("sin data ni message, la colección queda vacía y el mensaje en blanco", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.EMPTY, data: null }));

      await expect(listReferences("40488601", "01", "token-real")).resolves.toEqual(SIN_REFERENCIAS);
    });

    it("guarda la descripción del estado tal como la envía el backend", async () => {
      const sinDescripcion = { ...FILAS[0], estado: { codigo: "2" } };
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.FOUND, message: "", data: [FILAS[1], sinDescripcion] }));

      const result = await listReferences("40488601", "01", "token-real");

      expect(result.data.map((item) => [item.estado, item.estadoDescripcion])).toEqual([
        [5, "PACIENTE RECIBIDO"],
        [2, ""],
      ]);
    });

    it("el estado no se deduce de las filas: manda el del backend", async () => {
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.EMPTY, message: "", data: FILAS }));

      const result = await listReferences("40488601", "01", "token-real");

      expect(result.statusReference).toBe(ReferenceStatus.EMPTY);
    });

    it("no filtra por estado de la referencia: entrega las que manda el backend", async () => {
      const registrada = { ...FILAS[0], id_referencia: "999", estado: { codigo: "1", descripcion: "REGISTRADO" } };
      vi.stubGlobal("fetch", minsaResponding({ status_reference: ReferenceStatus.FOUND, message: "", data: [registrada] }));

      const result = await listReferences("40488601", "01", "token-real");

      expect(result.data).toEqual([{ ...REFERENCIAS[0], idReferencia: "999", estado: 1, estadoDescripcion: "REGISTRADO" }]);
    });
  });

  describe("autenticación", () => {
    it("consulta con el token del ciudadano y sin firma HMAC", async () => {
      const fetchMock = minsaResponding([]);
      vi.stubGlobal("fetch", fetchMock);

      await listReferences("40488601", "01", "token-real");

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(url).toBe(`https://api.example.test${MinsaEndpoint.REFERENCIAS}`);
      expect(headers.Authorization).toBe("Bearer token-real");
      expect(headers).not.toHaveProperty("X-WhatsApp-Signature");
      expect(JSON.parse(init.body as string)).toEqual({ numero_documento: "40488601", tipo_documento: "01" });
    });

    it("un 401 por credenciales faltantes es error", async () => {
      vi.stubGlobal("fetch", minsaResponding({ detail: "Credenciales faltantes" }, 401));

      await expect(listReferences("40488601", "01", "token-real")).resolves.toEqual(SIN_RESPUESTA);
    });
  });

  describe("arreglo suelto, como responde el backend real", () => {
    const FILAS_REALES = [
      {
        id_referencia: "ym4cjr3EWPH8",
        nro_referencia: "02441",
        fecha_inicio: "12/12/2017 13:19",
        ipress_origen: { codigo: "5991", descripcion: "CENTRO MATERNO INFANTIL DE SALUD VIRGEN DEL CARMEN" },
        ipress_destino: { codigo: "5987", descripcion: "HOSPITAL MARIA AUXILIADORA" },
        ups_origen: { codigo: "220000", descripcion: "CONSULTA EXTERNA" },
        ups_destino: { codigo: "221303", descripcion: "" },
        estado: { codigo: "7", descripcion: "PACIENTE CITADO" },
      },
      {
        id_referencia: "Qp7xLm2RtV9a",
        nro_referencia: "02442",
        fecha_inicio: "03/03/2018 09:45",
        ipress_origen: { codigo: "5991", descripcion: "CENTRO MATERNO INFANTIL DE SALUD VIRGEN DEL CARMEN" },
        ipress_destino: { codigo: "5987", descripcion: "HOSPITAL MARIA AUXILIADORA" },
        ups_origen: { codigo: "220000", descripcion: "CONSULTA EXTERNA" },
        ups_destino: { codigo: "222800", descripcion: "GASTROENTEROLOGÍA" },
        estado: { codigo: "5", descripcion: "PACIENTE RECIBIDO" },
      },
      {
        id_referencia: "Kd3nWs8YbH1c",
        nro_referencia: "02443",
        fecha_inicio: "15/06/2019 11:02",
        ipress_origen: { codigo: "5991", descripcion: "CENTRO MATERNO INFANTIL DE SALUD VIRGEN DEL CARMEN" },
        ipress_destino: { codigo: "6206", descripcion: "HOSPITAL NACIONAL  DOS DE MAYO" },
        ups_origen: { codigo: "220000", descripcion: "CONSULTA EXTERNA" },
        ups_destino: { codigo: "230101", descripcion: "" },
        estado: { codigo: "1", descripcion: "REGISTRADO" },
      },
      {
        id_referencia: "Zf6tGv4MqP0e",
        nro_referencia: "02444",
        fecha_inicio: "20/01/2020 16:30",
        ipress_origen: { codigo: "5991", descripcion: "CENTRO MATERNO INFANTIL DE SALUD VIRGEN DEL CARMEN" },
        ipress_destino: { codigo: "5987", descripcion: "HOSPITAL MARIA AUXILIADORA" },
        ups_origen: { codigo: "220000", descripcion: "CONSULTA EXTERNA" },
        ups_destino: { codigo: "221303", descripcion: "" },
        estado: { codigo: "7", descripcion: "PACIENTE CITADO" },
      },
    ];

    it("cuatro filas reales llegan como found con las cuatro referencias", async () => {
      vi.stubGlobal("fetch", minsaResponding(FILAS_REALES));

      const result = await listReferences("40488601", "01", "token-real");

      expect(result.statusReference).toBe(ReferenceStatus.FOUND);
      expect(result.message).toBe("");
      expect(result.data).toHaveLength(4);
      expect(result.data[0]).toEqual({
        idReferencia: "ym4cjr3EWPH8",
        numero: "02441",
        fechaInicio: "12/12/2017 13:19",
        ipressOrigen: "CENTRO MATERNO INFANTIL DE SALUD VIRGEN DEL CARMEN",
        ipressDestino: "HOSPITAL MARIA AUXILIADORA",
        upsOrigen: "CONSULTA EXTERNA",
        upsDestino: "",
        codigoIpressDestino: "5987",
        codigoUpsDestino: "221303",
        estado: 7,
        estadoDescripcion: "PACIENTE CITADO",
      });
    });

    it("el arreglo de filas del sobre también se lee suelto", async () => {
      vi.stubGlobal("fetch", minsaResponding(FILAS));

      await expect(listReferences("40488601", "01", "token-real")).resolves.toEqual({
        statusReference: ReferenceStatus.FOUND,
        message: "",
        data: REFERENCIAS,
      });
    });

    it("un arreglo vacío es empty", async () => {
      vi.stubGlobal("fetch", minsaResponding([]));

      await expect(listReferences("40488601", "01", "token-real")).resolves.toEqual(SIN_REFERENCIAS);
    });

    it("un arreglo sin filas válidas es empty", async () => {
      vi.stubGlobal("fetch", minsaResponding([{ nro_referencia: "sin id" }, "texto"]));

      await expect(listReferences("40488601", "01", "token-real")).resolves.toEqual(SIN_REFERENCIAS);
    });
  });

  describe("respuestas fuera del sobre", () => {
    it.each([
      ["las filas bajo referencias", { referencias: FILAS }],
      ["data sin status_reference", { data: FILAS }],
      ["un status_reference desconocido", { status_reference: "otra_cosa", data: FILAS }],
      ["un cuerpo nulo", "null"],
    ])("%s es error", async (_caso, body) => {
      vi.stubGlobal("fetch", minsaResponding(body));

      await expect(listReferences("40488601", "01", "token-real")).resolves.toEqual(SIN_RESPUESTA);
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

      const result = await listReferences("40488601", "01", "token-real");
      restore();

      expect(result.data).toEqual([REFERENCIAS[0]]);
      const discarded = records.find((record) => record.event === "minsa.catalog.rows_discarded");
      expect(discarded).toMatchObject({ endpoint: MinsaEndpoint.REFERENCIAS, discarded: 2, total: 3 });
    });
  });

  describe("found con todas las filas inválidas", () => {
    it("conserva el estado found y deja la colección vacía", async () => {
      vi.stubGlobal(
        "fetch",
        minsaResponding({ status_reference: ReferenceStatus.FOUND, message: "", data: [{ nro_referencia: "sin id" }, "texto"] }),
      );

      const result = await listReferences("40488601", "01", "token-real");

      expect(result).toEqual({ statusReference: ReferenceStatus.FOUND, message: "", data: [] });
    });
  });

  describe("fallas del servicio", () => {
    it("un HTTP no-ok es error", async () => {
      vi.stubGlobal("fetch", minsaResponding("", 500));

      await expect(listReferences("12345678", "01", "token-real")).resolves.toEqual(SIN_RESPUESTA);
    });

    it("un error de red es error y no hace caer el turno", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

      await expect(listReferences("12345678", "01", "token-real")).resolves.toEqual(SIN_RESPUESTA);
    });

    it("una consulta que supera el tiempo máximo es error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")));

      await expect(listReferences("12345678", "01", "token-real")).resolves.toEqual(SIN_RESPUESTA);
    });

    it("la consulta lleva un tiempo máximo", async () => {
      const fetchMock = minsaResponding([]);
      vi.stubGlobal("fetch", fetchMock);

      await listReferences("12345678", "01", "token-real");

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it("un cuerpo que no es JSON es error", async () => {
      vi.stubGlobal("fetch", minsaResponding("<html>", 200));

      await expect(listReferences("12345678", "01", "token-real")).resolves.toEqual(SIN_RESPUESTA);
    });
  });
});
