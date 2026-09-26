import { offerOtherEspecialidad } from "@/lib/fsm/flows/cita/steps/duplicate";
import { buildResult, cloneSession, query, sendText, sendCtaUrl, withNote } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/reverification";

const MAX_BOOKING_FAILURES = 3;
const SLOT_TAKEN_MESSAGE = /cupo|horario|disponib|agotad|ocupad|tomad/i;

/** Un error del MINSA no se presenta como «horario tomado»: no se inventa una causa que el MINSA no dio. */
export function handleBookingPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; url?: string; message?: string };
  const next = cloneSession(session);

  if (result.status === "unauthorized") {
    return beginReverification(next, "cita_hora_pending");
  }

  if (result.status === "booked") {
    next.state = "cita_booked";
    const constanciaText = `*MINISTERIO DE SALUD DEL PERÚ*
*Constancia de Registro de Cita*

Estimado(a) usuario(a), su solicitud ha sido procesada con éxito:
${result.message ?? "Cita creada correctamente"}

Nota: Recuerde acudir a su cita portando su DNI o documento de identidad físico.`;
    return buildResult(next, [
      sendText(constanciaText),
      sendCtaUrl(
        "Ingrese a la plataforma oficial para visualizar los detalles de su atención (establecimiento, fecha, hora y consultorio):",
        "Ver mi cita",
        result.url ?? "",
      ),
      sendText(
        "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Si necesitas agendar otra cita o realizar una consulta, escríbenos nuevamente cuando lo necesites. ¡Que tengas un buen día! 👋",
      ),
    ]);
  }

  if (result.status === "duplicate") {
    return offerOtherEspecialidad(next);
  }

  const failures = (next.counters.citaBookingFailures ?? 0) + 1;
  const isRawError = result.status === "error";
  const isAmbiguousRejection =
    result.status === "rejected" && (!result.message || SLOT_TAKEN_MESSAGE.test(result.message));
  const slotMayBeGone = isRawError || isAmbiguousRejection;

  if (slotMayBeGone && failures < MAX_BOOKING_FAILURES) {
    next.counters.citaBookingFailures = failures;
    delete next.counters.citaHoraPage;
    next.state = "cita_hora_pending";
    const retryText = isRawError
      ? "Tuvimos un problema técnico al intentar reservar tu cita. Vamos a intentarlo de nuevo — estos son los horarios disponibles de la misma fecha:"
      : "No pudimos reservar ese horario, puede que otra persona lo haya tomado justo antes. Te muestro los horarios disponibles de la misma fecha:";
    return withNote(buildResult(next, [
      sendText(retryText),
      query("list_horas", {
        codEess: String(next.slots.citaCodEess ?? ""),
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        fecha: String(next.slots.citaFecha ?? ""),
      }),
    ]), {
      kind: "booking_retry",
      level: "warn",
      detail: { failures, status: result.status, reason: isRawError ? "http_error" : "ambiguous_rejection" },
    });
  }

  next.state = "cita_booking_rejected";
  return withNote(
    buildResult(next, [sendText(result.message ?? "No pudimos agendar tu cita. Intenta de nuevo más tarde.")]),
    {
      kind: "booking_rejected",
      level: "warn",
      detail: { failures, status: result.status, reason: isRawError ? "http_error" : "ambiguous_rejection" },
    },
  );
}
