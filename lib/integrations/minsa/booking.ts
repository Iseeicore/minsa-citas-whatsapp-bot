import { logger } from "@/lib/observability/logger";
import type { BookAppointmentParams, BookAppointmentResult } from "@/lib/integrations/minsa/types";
import { minsaDigitalUrl, postWithBearer, isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { ACTIVE_CITA_MESSAGE } from "@/lib/constants/regex/integrations";
import { BookingStatus } from "@/lib/enums/booking-status";
import { stringOr, stringOrUndefined } from "@/lib/utils/text-values";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { BOOKING_LOG_BODY_LIMIT } from "@/lib/constants/limits/minsa";

function minsaMessageOf(body: string): string | undefined {
  const parsed = parseJsonOr(body, null) as { message?: unknown } | null;
  return stringOrUndefined(parsed?.message);
}

function logBookingFailure(params: BookAppointmentParams, httpStatus: number, body: string): void {
  logger.error("minsa.book_appointment.failed", {
    endpoint: MinsaEndpoint.CITAS,
    status: httpStatus,
    minsaMessage: minsaMessageOf(body),
    response: body.slice(0, BOOKING_LOG_BODY_LIMIT),
    payload: {
      codigoRenipress: params.codigoRenipress,
      codigoUps: params.codigoUps,
      fechaCita: params.fechaCita,
      horaCita: params.horaCita,
      referenciaId: params.referenciaId,
    },
  });
}

export async function bookAppointment(
  params: BookAppointmentParams,
  bearer: string,
): Promise<BookAppointmentResult> {
  if (isRealMinsaEnabled()) {
    const response = await postWithBearer(
      MinsaEndpoint.CITAS,
      {
        codigo_renipress: params.codigoRenipress,
        codigo_ups: params.codigoUps,
        fecha_cita: params.fechaCita,
        hora_cita: params.horaCita,
        numero_documento_paciente: params.numeroDocumentoPaciente,
        ...(params.referenciaId ? { referencia_id: params.referenciaId } : {}),
      },
      bearer,
    );
    if (response.status === 401) return { status: BookingStatus.UNAUTHORIZED };

    const rawBody = await response.text().catch(() => "");

    const duplicateMessage = minsaMessageOf(rawBody);
    if (duplicateMessage && ACTIVE_CITA_MESSAGE.test(duplicateMessage)) {
      return { status: BookingStatus.DUPLICATE, message: duplicateMessage };
    }

    if (!response.ok) {
      logBookingFailure(params, response.status, rawBody);
      return { status: BookingStatus.ERROR };
    }

    const body = parseJsonOr(rawBody, {}) as { data?: { url?: string }; message?: string } | null;
    const message = stringOr(body?.message);

    if (body?.data?.url) {
      return { status: BookingStatus.BOOKED, url: body.data.url, message };
    }
    logBookingFailure(params, response.status, rawBody);
    return { status: BookingStatus.REJECTED, message };
  }

  return {
    status: BookingStatus.BOOKED,
    url: minsaDigitalUrl("/citas/confirmacion/FAKE123") ?? "",
    message: "Cita registrada correctamente",
  };
}
