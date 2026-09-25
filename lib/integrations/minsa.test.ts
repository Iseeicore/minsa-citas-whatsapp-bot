import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookAppointment, listFechas, listHoras } from "@/lib/integrations/minsa";
import { configureLogger } from "@/lib/observability/logger";

// The Sandbox's FAKE catalog (SANDBOX_USE_REAL_MINSA off). It exists so a human
// can walk the whole Cita flow by hand, so it must never go stale and must offer
// both morning and afternoon slots (a bare "1" is only ambiguous when the day has
// a position 1 AND a 13:00).

describe("fake catalog", () => {
  beforeEach(() => {
    delete process.env.SANDBOX_USE_REAL_MINSA;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers the next three days, as seen in Lima, whatever today is", async () => {
    vi.setSystemTime(new Date("2026-12-30T22:00:00-05:00")); // Dec 30, 22:00 in Lima (Dec 31 03:00 UTC)

    const result = await listFechas("0000123", "02", "fake-bearer-token");

    expect(result).toEqual({
      status: "found",
      items: [
        { fechaCupo: "20261231", cantidadCupos: 5 },
        { fechaCupo: "20270101", cantidadCupos: 3 },
        { fechaCupo: "20270102", cantidadCupos: 2 },
      ],
    });
  });

  it("uses Lima's calendar, not the server's (a UTC server just after midnight is still 'yesterday' in Lima)", async () => {
    vi.setSystemTime(new Date("2026-09-20T02:00:00Z")); // Sep 19, 21:00 in Lima

    const result = await listFechas("0000123", "02", "fake-bearer-token");

    expect(result).toMatchObject({
      items: [{ fechaCupo: "20260920" }, { fechaCupo: "20260921" }, { fechaCupo: "20260922" }],
    });
  });

  it("the third day has ONE horario, to try the confirmation asked before booking a lone horario", async () => {
    vi.setSystemTime(new Date("2026-09-20T02:00:00Z")); // Sep 19 in Lima: the third day is Sep 22

    const result = await listHoras("0000123", "02", "20260922", "fake-bearer-token");

    expect(result).toEqual({ status: "found", items: [{ horaInicio: "13:00", horaFin: "13:30", cantidadCupos: 2 }] });
  });

  it("offers morning and afternoon slots so the 12h/24h cases can be tried by hand", async () => {
    const result = await listHoras("0000123", "02", "20260920", "fake-bearer-token");

    expect(result).toEqual({
      status: "found",
      items: [
        { horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 2 },
        { horaInicio: "09:30", horaFin: "10:00", cantidadCupos: 1 },
        { horaInicio: "13:00", horaFin: "13:30", cantidadCupos: 2 },
      ],
    });
  });
});

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
