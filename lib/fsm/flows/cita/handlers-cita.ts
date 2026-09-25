import { handleOtherDistrito, OTHER_DISTRITO_STATE } from "@/lib/fsm/flows/cita/steps/no-coverage";
import { handleOtherFecha, OTHER_FECHA_STATE } from "@/lib/fsm/flows/cita/steps/other-fecha";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import {
  handleAwaitingDni,
  handleValidatePending,
  handleRegistrationWait,
  handleAwaitingOtp,
  handleVerifyPending,
} from "@/lib/fsm/flows/cita/steps/identity";
import {
  handleAwaitingDistritoAi,
  handleDistritoAiPending,
  handleAwaitingDistritoDisambiguation,
  handleAwaitingDepartamento,
  handleAwaitingProvincia,
  handleAwaitingDistrito,
  handleUbigeoPending,
  handleAwaitingUbigeoSelect,
} from "@/lib/fsm/flows/cita/steps/ubigeo";
import {
  handleEspecialidadPending,
  handleAwaitingEspecialidadSelect,
  handleEstablecimientoPending,
  handleAwaitingEstablecimientoSelect,
  handleSelectionHintsPending,
} from "@/lib/fsm/flows/cita/steps/catalog";
import { handleFechaPending, handleAwaitingFechaSelect, handleFechaAiPending } from "@/lib/fsm/flows/cita/steps/fecha";
import { handleHoraPending, handleHoraPagePending } from "@/lib/fsm/flows/cita/steps/hora/list";
import { handleAwaitingHoraSelect } from "@/lib/fsm/flows/cita/steps/hora/select";
import { handleHoraConfirm } from "@/lib/fsm/flows/cita/steps/hora/confirm";
import { handleHoraChoice } from "@/lib/fsm/flows/cita/steps/hora/choice";
import { handleBookingPending } from "@/lib/fsm/flows/cita/steps/booking";

export function handleCita(session: Session, event: HandleEvent): HandlerResult {
  switch (session.state) {
    case "cita_awaiting_dni":
      return handleAwaitingDni(session, event as InboundEvent);
    case "cita_validate_pending":
      return handleValidatePending(session, event as QueryResultEvent);
    case "cita_registration_wait":
      return handleRegistrationWait(session, event as InboundEvent);
    case "cita_awaiting_otp":
      return handleAwaitingOtp(session, event as InboundEvent);
    case "cita_verify_pending":
      return handleVerifyPending(session, event as QueryResultEvent);
    case "cita_awaiting_distrito_ai":
      return handleAwaitingDistritoAi(session, event as InboundEvent);
    case "cita_distrito_ai_pending":
      return handleDistritoAiPending(session, event as QueryResultEvent);
    case "cita_awaiting_distrito_disambiguation":
      return handleAwaitingDistritoDisambiguation(session, event as InboundEvent);
    case "cita_awaiting_departamento":
      return handleAwaitingDepartamento(session, event as InboundEvent);
    case "cita_awaiting_provincia":
      return handleAwaitingProvincia(session, event as InboundEvent);
    case "cita_awaiting_distrito":
      return handleAwaitingDistrito(session, event as InboundEvent);
    case "cita_ubigeo_pending":
      return handleUbigeoPending(session, event as QueryResultEvent);
    case "cita_awaiting_ubigeo_select":
      return handleAwaitingUbigeoSelect(session, event as InboundEvent);
    case OTHER_DISTRITO_STATE:
      return handleOtherDistrito(session, event as InboundEvent);
    case "cita_especialidad_pending":
      return handleEspecialidadPending(session, event as QueryResultEvent);
    case "cita_awaiting_especialidad_select":
      return handleAwaitingEspecialidadSelect(session, event as InboundEvent);
    case "cita_establecimiento_pending":
      return handleEstablecimientoPending(session, event as QueryResultEvent);
    case "cita_awaiting_establecimiento_select":
      return handleAwaitingEstablecimientoSelect(session, event as InboundEvent);
    case "cita_selection_hints_pending":
      return handleSelectionHintsPending(session, event as QueryResultEvent);
    case "cita_fecha_pending":
      return handleFechaPending(session, event as QueryResultEvent);
    case OTHER_FECHA_STATE:
      return handleOtherFecha(session, event as InboundEvent);
    case "cita_awaiting_fecha_select":
      return handleAwaitingFechaSelect(session, event as InboundEvent);
    case "cita_fecha_ai_pending":
      return handleFechaAiPending(session, event as QueryResultEvent);
    case "cita_hora_pending":
      return handleHoraPending(session, event as QueryResultEvent);
    case "cita_hora_page_pending":
      return handleHoraPagePending(session, event as QueryResultEvent);
    case "cita_awaiting_hora_select":
      return handleAwaitingHoraSelect(session, event as InboundEvent);
    case "cita_awaiting_hora_confirm":
      return handleHoraConfirm(session, event as InboundEvent);
    case "cita_awaiting_hora_choice":
      return handleHoraChoice(session, event as InboundEvent);
    case "cita_booking_pending":
      return handleBookingPending(session, event as QueryResultEvent);
    default:
      throw new Error(`handleCita: unknown state "${session.state}"`);
  }
}
