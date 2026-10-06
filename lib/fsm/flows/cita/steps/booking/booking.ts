import { offerOtherEspecialidad } from "@/lib/fsm/flows/cita/steps/booking/duplicate";
import { buildResult, cloneSession, query, sendText, sendCtaUrl, withNote } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";

const MAX_BOOKING_FAILURES = 3;
const APPOINTMENT_DETAILS_TEXT =
  "Ingrese a la plataforma oficial para visualizar los detalles de su atención (establecimiento, fecha, hora y consultorio):";
const APPOINTMENT_BUTTON_TEXT = "Ver mi cita";
const SLOT_TAKEN_MESSAGE = /cupo|horario|disponib|agotad|ocupad|tomad/i;

/** Un error del MINSA no se presenta como «horario tomado»: no se inventa una causa que el MINSA no dio. */
export function handleBookingPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; url?: string; message?: string };
  const next = cloneSession(session);

  if (result.status === "unauthorized") {
    return beginReverification(next, SessionState.CITA_HORA_PENDING);
  }

  if (result.status === "booked") {
    next.state = SessionState.CITA_BOOKED;
    const constanciaText = `*MINISTERIO DE SALUD DEL PERÚ*
*Constancia de Registro de Cita*

Estimado(a) usuario(a), su solicitud ha sido procesada con éxito:
${result.message ?? "Cita creada correctamente"}

Nota: Recuerde acudir a su cita portando su DNI o documento de identidad físico.`;
    return buildResult(next, [
      sendText(constanciaText),
      result.url ? sendCtaUrl(APPOINTMENT_DETAILS_TEXT, APPOINTMENT_BUTTON_TEXT, result.url) : sendText(APPOINTMENT_DETAILS_TEXT),
      sendText(
        "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Si necesitas agendar otra cita o realizar una consulta, escríbenos nuevamente cuando lo necesites. ¡Que tengas un buen día! 👋",
      ),
    ]);
  }

  if (result.status === "duplicate") {
    return offerOtherEspecialidad(next);
  }

  const failures = (next.counters[CounterKey.CITA_BOOKING_FAILURES] ?? 0) + 1;
  const isRawError = result.status === "error";
  const isAmbiguousRejection =
    result.status === "rejected" && (!result.message || SLOT_TAKEN_MESSAGE.test(result.message));
  const slotMayBeGone = isRawError || isAmbiguousRejection;

  if (slotMayBeGone && failures < MAX_BOOKING_FAILURES) {
    next.counters[CounterKey.CITA_BOOKING_FAILURES] = failures;
    delete next.counters[CounterKey.CITA_HORA_PAGE];
    next.state = SessionState.CITA_HORA_PENDING;
    const retryText = isRawError
      ? "Tuvimos un problema técnico al intentar reservar tu cita. Vamos a intentarlo de nuevo — estos son los horarios disponibles de la misma fecha:"
      : "No pudimos reservar ese horario, puede que otra persona lo haya tomado justo antes. Te muestro los horarios disponibles de la misma fecha:";
    return withNote(buildResult(next, [
      sendText(retryText),
      query(QueryKind.LIST_HORAS, {
        codEess: String(next.slots[SlotKey.CITA_COD_EESS] ?? ""),
        especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
        fecha: String(next.slots[SlotKey.CITA_FECHA] ?? ""),
      }),
    ]), {
      kind: "booking_retry",
      level: "warn",
      detail: { failures, status: result.status, reason: isRawError ? "http_error" : "ambiguous_rejection" },
    });
  }

  next.state = SessionState.CITA_BOOKING_REJECTED;
  return withNote(
    buildResult(next, [sendText(result.message ?? "No pudimos agendar tu cita. Intenta de nuevo más tarde.")]),
    {
      kind: "booking_rejected",
      level: "warn",
      detail: { failures, status: result.status, reason: isRawError ? "http_error" : "ambiguous_rejection" },
    },
  );
}
