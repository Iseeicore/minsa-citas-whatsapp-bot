import { logger } from "@/lib/observability/logger";
import type { BookAppointmentParams, BookAppointmentResult } from "@/lib/integrations/minsa/types";
import { postWithBearer } from "@/lib/integrations/minsa/wire";

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
