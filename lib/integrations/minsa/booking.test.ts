import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookAppointment } from "@/lib/integrations/minsa/booking";
import { configureLogger } from "@/lib/observability/logger";

// Real MINSA's booking endpoint (SANDBOX_USE_REAL_MINSA=true). Confirmed in
// production: a duplicate-booking rejection ("the patient already has an
// active appointment for the same turno/servicio") arrives as a raw HTTP
// 500, not a graceful 2xx — so the duplicate check has to run before the
// generic !response.ok branch, not after it.
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
