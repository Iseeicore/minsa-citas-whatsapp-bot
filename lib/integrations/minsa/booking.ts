import { logger } from "@/lib/observability/logger";
import type { BookAppointmentParams, BookAppointmentResult } from "@/lib/integrations/minsa/types";
import { postWithBearer } from "@/lib/integrations/minsa/wire";

// A failed booking used to reach the citizen as a generic message with nothing
// in the logs. This keeps what is needed to diagnose it: the endpoint, the HTTP
// status, what MINSA said and the payload without the patient's document (the
// logger also masks any long digit run, such as a DNI echoed back).
const BOOKING_ENDPOINT = "/whatsapp/api/v1/appointments";
const BOOKING_LOG_BODY_LIMIT = 300;

function minsaMessageOf(body: string): string | undefined {
  try {
    const message = (JSON.parse(body) as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  } catch {
    return undefined;
  }
}

function logBookingFailure(params: BookAppointmentParams, httpStatus: number, body: string): void {
  logger.error("minsa.book_appointment.failed", {
    endpoint: BOOKING_ENDPOINT,
    status: httpStatus,
    minsaMessage: minsaMessageOf(body),
    response: body.slice(0, BOOKING_LOG_BODY_LIMIT),
    payload: {
      codigoRenipress: params.codigoRenipress,
      codigoUps: params.codigoUps,
      fechaCita: params.fechaCita,
      horaCita: params.horaCita,
    },
  });
}

export async function bookAppointment(
  params: BookAppointmentParams,
  bearer: string,
): Promise<BookAppointmentResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      BOOKING_ENDPOINT,
      {
        codigo_renipress: params.codigoRenipress,
        codigo_ups: params.codigoUps,
        fecha_cita: params.fechaCita,
        hora_cita: params.horaCita,
        numero_documento_paciente: params.numeroDocumentoPaciente,
      },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };

    const rawBody = await response.text().catch(() => "");

    // MINSA doesn't reliably use HTTP status to mean "business rejection"
    // vs. "server error": this exact rule (the patient already has an
    // active appointment for the same turno/servicio) has been observed
    // arriving as a raw HTTP 500, not a graceful 2xx body. Checking for it
    // before the !response.ok branch means a citizen who already booked
    // gets a clear, final answer instead of 3 pointless retries that would
    // all fail the exact same way (confirmed in production: a real
    // duplicate booking looped through booking_retry x3 as "problema
    // técnico" before this fix). Not logged as a failure — it's an
    // expected business outcome, not something to diagnose.
    const duplicateMessage = minsaMessageOf(rawBody);
    if (duplicateMessage && /ya tiene una cita activa/i.test(duplicateMessage)) {
      return { status: "duplicate", message: duplicateMessage };
    }

    if (!response.ok) {
      logBookingFailure(params, response.status, rawBody);
      return { status: "error" };
    }

    let body: { data?: { url?: string }; message?: string } = {};
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      // Leave body empty — falls through to "rejected" below, same as an
      // unparsable 2xx body always did.
    }
    const message = typeof body?.message === "string" ? body.message : "";

    if (body?.data?.url) {
      return { status: "booked", url: body.data.url, message };
    }
    logBookingFailure(params, response.status, rawBody);
    return { status: "rejected", message };
  }

  return {
    status: "booked",
    url: "https://dminsadigital.minsa.gob.pe/citas/confirmacion/FAKE123",
    message: "Cita registrada correctamente",
  };
}
