import { logger } from "@/lib/observability/logger";
import type { BookAppointmentParams, BookAppointmentResult } from "@/lib/integrations/minsa/types";
import { minsaDigitalUrl, postWithBearer, isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { ACTIVE_CITA_MESSAGE } from "@/lib/constants/regex/integrations";
import { BookingStatus } from "@/lib/enums/booking-status";
import { stringOrUndefined } from "@/lib/utils/text-values";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { isRecord } from "@/lib/utils/type-guards";
import { BOOKING_LOG_BODY_LIMIT, HTTP_SERVER_ERROR_MIN_STATUS } from "@/lib/constants/limits/minsa";
import { HTTP_UNAUTHORIZED } from "@/lib/constants/http-status";

const UNPARSABLE_BODY = Symbol("unparsable_body");

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

export async function bookAppointment(params: BookAppointmentParams, bearer: string): Promise<BookAppointmentResult> {
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
    if (response.status === HTTP_UNAUTHORIZED) return { status: BookingStatus.UNAUTHORIZED };

    let rawBody: string;
    try {
      rawBody = await response.text();
    } catch (error: unknown) {
      logger.error("minsa.book_appointment.failed", { endpoint: MinsaEndpoint.CITAS, status: response.status, error });
      return { status: BookingStatus.ERROR };
    }

    const duplicateMessage = minsaMessageOf(rawBody);
    if (duplicateMessage && ACTIVE_CITA_MESSAGE.test(duplicateMessage)) {
      return { status: BookingStatus.DUPLICATE, message: duplicateMessage };
    }

    if (response.status >= HTTP_SERVER_ERROR_MIN_STATUS) {
      logBookingFailure(params, response.status, rawBody);
      return { status: BookingStatus.UNAVAILABLE };
    }

    if (!response.ok) {
      logBookingFailure(params, response.status, rawBody);
      return { status: BookingStatus.ERROR };
    }

    const body = parseJsonOr(rawBody, UNPARSABLE_BODY);
    if (body === UNPARSABLE_BODY) {
      logBookingFailure(params, response.status, rawBody);
      return { status: BookingStatus.ERROR };
    }

    const message = isRecord(body) ? stringOrUndefined(body.message) : undefined;
    const url = isRecord(body) && isRecord(body.data) ? stringOrUndefined(body.data.url) : undefined;
    if (url) return { status: BookingStatus.BOOKED, url, message };

    logBookingFailure(params, response.status, rawBody);
    return { status: BookingStatus.REJECTED, message };
  }

  return {
    status: BookingStatus.BOOKED,
    url: minsaDigitalUrl("/citas/confirmacion/FAKE123") ?? "",
    message: "Cita registrada correctamente",
  };
}
