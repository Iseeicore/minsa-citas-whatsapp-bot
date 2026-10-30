import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listReferences } from "@/lib/integrations/minsa/references";
import { configureLogger } from "@/lib/observability/logger";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { ReferenceStatus } from "@/lib/enums/reference-status";

const SIN_REFERENCIAS = { statusReference: ReferenceStatus.EMPTY, message: "", data: [] };
const SIN_RESPUESTA = { statusReference: ReferenceStatus.ERROR, message: "", data: [] };
const NO_DISPONIBLE = { statusReference: ReferenceStatus.UNAVAILABLE, message: "", data: [] };
const SESSION_TOKEN = "synthetic-session-token";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("MINSA simulado: listReferences", () => {
  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "false");
  });

  it.each(["12345678", "123456789", "87654321"])("sin MINSA real la consulta no esta disponible, no vacia (%s)", async (documento) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(listReferences(documento, "01", SESSION_TOKEN)).resolves.toEqual(NO_DISPONIBLE);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("respuesta real de MINSA: listReferences", () => {
  const minsaResponding = (body: unknown, status = 200) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
    vi.stubEnv("MINSA_API_HOST", "https://fake-minsa-api.test");
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "https://fake-minsa-digital.test");
  });

  const FILAS = [
    {
      id_referencia: "ref_Az9-opaque/001==",
      nro_referencia: "000123",
      fecha_inicio: "24/07/2024 23:03",
      ipress_origen: { codigo: "005966", descripcion: "CENTRO DE ORIGEN" },
      ipress_destino: { codigo: "005987", descripcion: "HOSPITAL DE DESTINO" },
      ups_origen: { codigo: "0222400", descripcion: "MEDICINA GENERAL" },
      ups_destino: { codigo: "0222800", descripcion: "CARDIOLOGIA" },
      estado: { codigo: "3", descripcion: "ACEPTADO" },
    },
    {
      id_referencia: "ref-B_2opaque==",
      nro_referencia: "000275",
      fecha_inicio: "24/11/2023 10:08",
      ipress_origen: { codigo: "005966", descripcion: "CENTRO DE ORIGEN" },
      ipress_destino: { codigo: "005987", descripcion: "HOSPITAL DE DESTINO" },
      ups_origen: { codigo: "0222400", descripcion: "MEDICINA GENERAL" },
      ups_destino: { codigo: "0222800", descripcion: "CARDIOLOGIA" },
      estado: { codigo: "5", descripcion: "PACIENTE RECIBIDO" },
    },
    {
      id_referencia: "opaque-referencia-3-xYz",
      nro_referencia: "000042",
      fecha_inicio: "01/10/2026 08:00",
      ipress_origen: { codigo: "005966", descripcion: "CENTRO DE ORIGEN" },
      ipress_destino: { codigo: "006206", descripcion: "OTRO HOSPITAL DE DESTINO" },
      ups_origen: { codigo: "0230101", descripcion: "" },
      ups_destino: { codigo: "0230101", descripcion: "" },
      estado: { codigo: "7", descripcion: "PACIENTE CITADO" },
    },
  ];

  const REFERENCIAS = [
    {
      idReferencia: "ref_Az9-opaque/001==",
      numero: "000123",
      fechaInicio: "24/07/2024 23:03",
      ipressOrigen: "CENTRO DE ORIGEN",
      ipressDestino: "HOSPITAL DE DESTINO",
      upsOrigen: "MEDICINA GENERAL",
      upsDestino: "CARDIOLOGIA",
      codigoIpressDestino: "005987",
      codigoUpsDestino: "0222800",
      estado: 3,
      estadoDescripcion: "ACEPTADO",
    },
    {
      idReferencia: "ref-B_2opaque==",
      numero: "000275",
      fechaInicio: "24/11/2023 10:08",
      ipressOrigen: "CENTRO DE ORIGEN",
      ipressDestino: "HOSPITAL DE DESTINO",
      upsOrigen: "MEDICINA GENERAL",
      upsDestino: "CARDIOLOGIA",
      codigoIpressDestino: "005987",
      codigoUpsDestino: "0222800",
      estado: 5,
      estadoDescripcion: "PACIENTE RECIBIDO",
    },
    {
      idReferencia: "opaque-referencia-3-xYz",
      numero: "000042",
      fechaInicio: "01/10/2026 08:00",
      ipressOrigen: "CENTRO DE ORIGEN",
      ipressDestino: "OTRO HOSPITAL DE DESTINO",
      upsOrigen: "",
      upsDestino: "",
      codigoIpressDestino: "006206",
      codigoUpsDestino: "0230101",
      estado: 7,
      estadoDescripcion: "PACIENTE CITADO",
    },
  ];

  it("autentica con el token de sesion en Authorization y envia solo el documento en el cuerpo", async () => {
    const fetchMock = minsaResponding([]);
    vi.stubGlobal("fetch", fetchMock);

    await expect(listReferences("40488601", "01", SESSION_TOKEN)).resolves.toEqual(SIN_REFERENCIAS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    const headers = new Headers(request?.headers);
    expect(url).toBe(`https://fake-minsa-api.test${MinsaEndpoint.REFERENCIAS}`);
    expect(request?.method).toBe("POST");
    expect(headers.get("Authorization")).toBe(`Bearer ${SESSION_TOKEN}`);
    expect(request?.body).toBe(JSON.stringify({ numero_documento: "40488601", tipo_documento: "01" }));
    expect(request?.body).not.toContain(SESSION_TOKEN);
  });

  it("lee el arreglo raiz conservando identificadores opacos, ceros iniciales y estados 3, 5 y 7", async () => {
    vi.stubGlobal("fetch", minsaResponding(FILAS));

    await expect(listReferences("40488601", "01", SESSION_TOKEN)).resolves.toEqual({
      statusReference: ReferenceStatus.FOUND,
      message: "",
      data: REFERENCIAS,
    });
  });

  it("conserva referencias distintas aunque compartan hospital y atencion", async () => {
    vi.stubGlobal("fetch", minsaResponding(FILAS.slice(0, 2)));

    const result = await listReferences("40488601", "01", SESSION_TOKEN);

    expect(result.statusReference).toBe(ReferenceStatus.FOUND);
    expect(result.data).toEqual(REFERENCIAS.slice(0, 2));
    expect(result.data.map((item) => item.idReferencia)).toEqual(["ref_Az9-opaque/001==", "ref-B_2opaque=="]);
  });

  it("una descripcion de UPS vacia no elimina la referencia ni pierde su codigo", async () => {
    vi.stubGlobal("fetch", minsaResponding([FILAS[2]]));

    await expect(listReferences("40488601", "01", SESSION_TOKEN)).resolves.toEqual({
      statusReference: ReferenceStatus.FOUND,
      message: "",
      data: [REFERENCIAS[2]],
    });
  });

  it("un arreglo vacio es una consulta exitosa sin referencias", async () => {
    vi.stubGlobal("fetch", minsaResponding([]));

    await expect(listReferences("40488601", "01", SESSION_TOKEN)).resolves.toEqual(SIN_REFERENCIAS);
  });

  it("no introduce filtros de estados adicionales a los de MINSA", async () => {
    const registrada = { ...FILAS[0], estado: { codigo: "1", descripcion: "REGISTRADO" } };
    vi.stubGlobal("fetch", minsaResponding([registrada]));

    const result = await listReferences("40488601", "01", SESSION_TOKEN);

    expect(result.data).toEqual([{ ...REFERENCIAS[0], estado: 1, estadoDescripcion: "REGISTRADO" }]);
  });

  it("conserva la descripcion del estado que manda MINSA y la deja vacia si no llega", async () => {
    const sinDescripcion = { ...FILAS[0], id_referencia: "sin-descripcion", estado: { codigo: "9" } };
    const anulada = { ...FILAS[1], estado: { codigo: "4", descripcion: "ANULADO" } };
    vi.stubGlobal("fetch", minsaResponding([sinDescripcion, anulada]));

    const result = await listReferences("40488601", "01", SESSION_TOKEN);

    expect(result.data.map((item) => [item.estado, item.estadoDescripcion])).toEqual([
      [9, ""],
      [4, "ANULADO"],
    ]);
  });

  it.each([
    ["el sobre anterior", { status_reference: ReferenceStatus.FOUND, message: "", data: FILAS }],
    ["filas dentro de un objeto referencias", { referencias: FILAS }],
    ["filas dentro de un objeto data", { data: FILAS }],
    ["un objeto vacio", {}],
    ["un cuerpo nulo", null],
    ["un numero", 42],
  ])("%s es un error de contrato", async (_caso, body) => {
    vi.stubGlobal("fetch", minsaResponding(body));

    await expect(listReferences("40488601", "01", SESSION_TOKEN)).resolves.toEqual(SIN_RESPUESTA);
  });

  it("conserva las filas validas y registra las descartadas sin convertir la respuesta en una lista vacia", async () => {
    const records: Array<Record<string, unknown>> = [];
    const restore = configureLogger({
      level: "warn",
      sink: (_level, line) => records.push(JSON.parse(line) as Record<string, unknown>),
    });
    vi.stubGlobal("fetch", minsaResponding([{ nro_referencia: "sin id" }, "texto", FILAS[0]]));

    try {
      const result = await listReferences("40488601", "01", SESSION_TOKEN);

      expect(result).toEqual({ statusReference: ReferenceStatus.FOUND, message: "", data: [REFERENCIAS[0]] });
      expect(records.find((record) => record.event === "minsa.catalog.rows_discarded")).toMatchObject({
        endpoint: MinsaEndpoint.REFERENCIAS,
        discarded: 2,
        total: 3,
      });
    } finally {
      restore();
    }
  });

  it("descarta la fila sin numero o sin fecha de inicio en lugar de inventarlos vacios", async () => {
    const sinNumero = { ...FILAS[0], nro_referencia: undefined };
    const sinFecha = { ...FILAS[1], fecha_inicio: "" };
    vi.stubGlobal("fetch", minsaResponding([sinNumero, sinFecha, FILAS[2]]));

    await expect(listReferences("40488601", "01", SESSION_TOKEN)).resolves.toEqual({
      statusReference: ReferenceStatus.FOUND,
      message: "",
      data: [REFERENCIAS[2]],
    });
  });

  it("un arreglo no vacio sin filas validas es un error, no ausencia de referencias", async () => {
    vi.stubGlobal("fetch", minsaResponding([{ nro_referencia: "sin id" }, "texto", null, { id_referencia: "sin-estado" }]));

    await expect(listReferences("40488601", "01", SESSION_TOKEN)).resolves.toEqual(SIN_RESPUESTA);
  });

  it.each([403, 500])("un HTTP %i es un error", async (status) => {
    vi.stubGlobal("fetch", minsaResponding([], status));

    await expect(listReferences("12345678", "01", SESSION_TOKEN)).resolves.toEqual(SIN_RESPUESTA);
  });

  it("un 401 pide verificar de nuevo, no es un error ni ausencia", async () => {
    vi.stubGlobal("fetch", minsaResponding([], 401));

    await expect(listReferences("12345678", "01", SESSION_TOKEN)).resolves.toMatchObject({ statusReference: ReferenceStatus.UNAUTHORIZED });
  });

  it("un cuerpo que no es JSON es un error y queda en el log", async () => {
    const records: Array<Record<string, unknown>> = [];
    const restore = configureLogger({ level: "warn", sink: (_level, line) => records.push(JSON.parse(line) as Record<string, unknown>) });
    vi.stubGlobal("fetch", minsaResponding("<html>"));

    try {
      await expect(listReferences("12345678", "01", SESSION_TOKEN)).resolves.toEqual(SIN_RESPUESTA);
      expect(records.find((record) => record.event === "minsa.catalog.contract_mismatch")).toMatchObject({
        endpoint: MinsaEndpoint.REFERENCIAS,
      });
    } finally {
      restore();
    }
  });
});
