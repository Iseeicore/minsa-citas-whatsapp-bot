import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookAppointment } from "@/lib/integrations/minsa/booking";
import { configureLogger, logger } from "@/lib/observability/logger";

describe("real MINSA — bookAppointment", () => {
  const params = {
    codigoRenipress: "6181",
    codigoUps: "222400",
    fechaCita: "20260923",
    horaCita: "1115",
    numeroDocumentoPaciente: "12345678",
  };

  const minsaResponding = (body: string, status: number) => vi.fn().mockResolvedValue(new Response(body, { status }));

  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
    vi.stubEnv("MINSA_INTEGRATION_SECRET", "test-secret");
    vi.stubEnv("MINSA_API_HOST", "https://minsa-api.test");
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
    vi.stubGlobal("fetch", minsaResponding(JSON.stringify({ success: false, data: null, message: minsaMessage }), 500));

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

  it("MINSA code 9000 «tiene una cita por atender» is already_has_appointment, logged as a rejection and never as a failure", async () => {
    const minsaMessage = "Error al generar la cita en el servicio externo: 9000 | El paciente tiene una cita por atender en este servicio";
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");
    vi.stubGlobal("fetch", minsaResponding(JSON.stringify({ success: false, data: null, message: minsaMessage }), 500));

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({ status: "already_has_appointment", message: minsaMessage });
    expect(warn).toHaveBeenCalledWith("minsa.booking_rejected", expect.objectContaining({ httpStatus: 500, minsaCode: "9000" }));
    expect(error).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", minsaResponding(JSON.stringify({ message: "El paciente tiene una cita por atender" }), 500));
    await expect(bookAppointment(params, "bearer-token")).resolves.toMatchObject({ status: "already_has_appointment" });
  });

  it.each([500, 502, 503])("a genuine HTTP %i with no recognizable business message means the service is unavailable", async (status) => {
    vi.stubGlobal("fetch", minsaResponding(JSON.stringify({ success: false, message: "Internal Server Error" }), status));

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({ status: "unavailable" });
  });

  it("a network failure or timeout is an unavailable service, logged, not a crashed turn", async () => {
    const error = vi.spyOn(logger, "error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({ status: "unavailable" });
    expect(error).toHaveBeenCalledWith("minsa.book_appointment.failed", expect.objectContaining({ status: 0 }));
  });

  it("a client error such as HTTP 400 stays a raw 'error' that may be retried", async () => {
    vi.stubGlobal("fetch", minsaResponding(JSON.stringify({ success: false, message: "Bad Request" }), 400));

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({ status: "error" });
  });

  it("a real booking success still works", async () => {
    vi.stubGlobal(
      "fetch",
      minsaResponding(
        JSON.stringify({
          success: true,
          data: { url: "https://dminsadigital.minsa.gob.pe/citas/confirmacion/ABC" },
          message: "Cita creada correctamente",
        }),
        200,
      ),
    );

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({
      status: "booked",
      url: "https://dminsadigital.minsa.gob.pe/citas/confirmacion/ABC",
      message: "Cita creada correctamente",
    });
  });

  it.each([
    ["not JSON", () => "<html>"],
    ["unreadable", () => new ReadableStream({ start: (controller) => controller.error(new TypeError("terminated")) })],
  ])("a 2xx whose body is %s is a logged error, never a rejection", async (_case, body) => {
    const error = vi.spyOn(logger, "error");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body(), { status: 200 })));

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({ status: "error" });
    expect(error).toHaveBeenCalledWith("minsa.book_appointment.failed", expect.objectContaining({ status: 200 }));
  });

  it.each([
    ["booked", { data: { url: "https://x.test/ok" } }],
    ["rejected", { success: false }],
  ])("a %s answer without a MINSA message leaves the message missing so the default text applies", async (status, body) => {
    vi.stubGlobal("fetch", minsaResponding(JSON.stringify(body), 200));

    const result = await bookAppointment(params, "bearer-token");

    expect(result.status).toBe(status);
    expect("message" in result ? result.message : undefined).toBeUndefined();
  });

  it("a 401 is unauthorized regardless of body", async () => {
    vi.stubGlobal("fetch", minsaResponding("", 401));

    await expect(bookAppointment(params, "bearer-token")).resolves.toEqual({ status: "unauthorized" });
  });
});
