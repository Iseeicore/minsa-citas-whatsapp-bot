import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookAppointment } from "@/lib/integrations/minsa/booking";
import { configureLogger } from "@/lib/observability/logger";

describe("real MINSA — bookAppointment", () => {
  const params = {
    codigoRenipress: "6181",
    codigoUps: "222400",
    fechaCita: "20260923",
    horaCita: "1115",
    numeroDocumentoPaciente: "12345678",
  };

  const minsaResponding = (body: string, status: number) =>
    vi.fn().mockResolvedValue(new Response(body, { status }));

  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
    vi.stubEnv("MINSA_INTEGRATION_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("con referencia_id: lo envía en el cuerpo junto a los datos de la cita", async () => {
    const fetchMock = minsaResponding(JSON.stringify({ data: { url: "https://x.test/ok" }, message: "ok" }), 200);
    vi.stubGlobal("fetch", fetchMock);

    await bookAppointment({ ...params, referenciaId: "1364486" }, "bearer-token");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({
      codigo_renipress: "6181",
      codigo_ups: "222400",
      fecha_cita: "20260923",
      hora_cita: "1115",
      numero_documento_paciente: "12345678",
      referencia_id: "1364486",
    });
  });

  it("sin referencia (cita normal): el cuerpo no lleva la clave referencia_id", async () => {
    const fetchMock = minsaResponding(JSON.stringify({ data: { url: "https://x.test/ok" }, message: "ok" }), 200);
    vi.stubGlobal("fetch", fetchMock);

    await bookAppointment(params, "bearer-token");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).not.toHaveProperty("referencia_id");
  });

  it("a duplicate-booking rejection arriving as a raw HTTP 500 is still classified as 'duplicate', not 'error'", async () => {
    const minsaMessage =
      "Error al generar la cita en el servicio externo: El paciente ya tiene una cita activa en el mismo turno o servicio.";
    vi.stubGlobal(
      "fetch",
      minsaResponding(JSON.stringify({ success: false, data: null, message: minsaMessage }), 500),
    );

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({
      status: "duplicate",
      message: minsaMessage,
    });
  });

  it("a duplicate rejection is not logged as a failure", async () => {
    const lines: string[] = [];
    const restoreLogger = configureLogger({ sink: (_level, line) => lines.push(line), level: "info" });
    vi.stubGlobal(
      "fetch",
      minsaResponding(
        JSON.stringify({
          success: false,
          data: null,
          message: "Error al generar la cita en el servicio externo: El paciente ya tiene una cita activa en el mismo turno o servicio.",
        }),
        500,
      ),
    );

    await bookAppointment(params, "bearer-token");
    restoreLogger();

    expect(lines.some((line) => JSON.parse(line).event === "minsa.book_appointment.failed")).toBe(false);
  });

  it("a genuine HTTP 500 with no recognizable business message is still a raw 'error'", async () => {
    vi.stubGlobal("fetch", minsaResponding(JSON.stringify({ success: false, message: "Internal Server Error" }), 500));

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({ status: "error" });
  });

  it("a real booking success still works", async () => {
    vi.stubGlobal(
      "fetch",
      minsaResponding(
        JSON.stringify({ success: true, data: { url: "https://dminsadigital.minsa.gob.pe/citas/confirmacion/ABC" }, message: "Cita creada correctamente" }),
        200,
      ),
    );

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({
      status: "booked",
      url: "https://dminsadigital.minsa.gob.pe/citas/confirmacion/ABC",
      message: "Cita creada correctamente",
    });
  });

  it("a 401 is unauthorized regardless of body", async () => {
    vi.stubGlobal("fetch", minsaResponding("", 401));

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({ status: "unauthorized" });
  });
});
