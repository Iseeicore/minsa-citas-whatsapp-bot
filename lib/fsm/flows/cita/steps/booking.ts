import { offerOtherFecha } from "@/lib/fsm/flows/cita/steps/other-fecha";
import { buildResult, cloneSession, query, sendText, sendCtaUrl, withNote } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/reverification";

const MAX_BOOKING_FAILURES = 3;
const SLOT_TAKEN_MESSAGE = /cupo|horario|disponib|agotad|ocupad|tomad/i;

export function handleBookingPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; url?: string; message?: string };
  const next = cloneSession(session);

  if (result.status === "unauthorized") {
    // Resumes one step earlier (re-listing horarios) rather than
    // resubmitting the exact same booking blindly — real time passed while
    // re-verifying, so the previously-picked slot might no longer be free.
    return beginReverification(next, "cita_hora_pending");
  }

  if (result.status === "booked") {
    next.state = "cita_booked";
    // Three separate messages — the webhook's send loop already puts a
    // typing indicator + short pause between every effect it sends
    // (app/webhook/whatsapp/route.ts), so this reads as the constancy
    // arriving, a brief pause, the link button, another pause, then a
    // closing message, with no extra delay logic needed here.
    const constanciaText = `*MINISTERIO DE SALUD DEL PERÚ*
*Constancia de Registro de Cita*

Estimado(a) usuario(a), su solicitud ha sido procesada con éxito:
${result.message ?? "Cita creada correctamente"}

Nota: Recuerde acudir a su cita portando su DNI o documento de identidad físico.`;
    return buildResult(next, [
      sendText(constanciaText),
      sendCtaUrl(
        "Ingrese a la plataforma oficial para visualizar los detalles de su atención (establecimiento, fecha, hora y consultorio):",
        "Ver mi cita", // 11 chars — cta_url's display_text caps at 20
        result.url ?? "",
      ),
      sendText(
        "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Si necesitas agendar otra cita o realizar una consulta, escríbenos nuevamente cuando lo necesites. ¡Que tengas un buen día! 👋",
      ),
    ]);
  }

  if (result.status === "duplicate") {
    // Not a dead end: the citizen isn't blocked from booking altogether,
    // just from this exact turno/servicio they already have. Same recovery
    // as an empty list_horas — offer another date, forgetting this one
    // (offerOtherFecha clears citaFecha/citaHoraConfirmId/citaHorasDia and
    // remembers this date as discarded). result.message (MINSA's raw
    // "Error al generar la cita en el servicio externo: ..." string) is
    // deliberately not shown — offerOtherFecha's own wording is clearer.
    return offerOtherFecha(next, "duplicate");
  }

  // The quota may have been taken a moment before the citizen confirmed (or
  // MINSA answered without saying why). Instead of closing the flow, show the
  // same day's horarios again — bounded, so a systematic failure ends instead
  // of looping. A rejection that states a business reason still closes.
  //
  // "error" is any non-2xx/non-401 HTTP response from the booking endpoint —
  // a raw transport/server failure, not MINSA telling us the slot is gone.
  // Treating it identically to a real "slot taken" rejection invents a reason
  // MINSA never gave, so the retry/closing text is kept separate: honest
  // about a technical hiccup on our side, never blaming another citizen for
  // something we can't actually confirm.
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
