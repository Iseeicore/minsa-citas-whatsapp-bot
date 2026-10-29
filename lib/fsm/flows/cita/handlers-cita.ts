import { handleOtherDistrito } from "@/lib/fsm/flows/cita/steps/catalog/no-coverage";
import { handleOtherFecha } from "@/lib/fsm/flows/cita/steps/fecha/other-fecha";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import {
  handleAwaitingDni,
  handleValidatePending,
  handleRegistrationWait,
  handleAwaitingOtp,
  handleVerifyPending,
} from "@/lib/fsm/flows/cita/steps/identity/identity";
import {
  handleAwaitingDistritoAi,
  handleDistritoAiPending,
  handleAwaitingDistritoDisambiguation,
  handleAwaitingDepartamento,
  handleAwaitingProvincia,
  handleAwaitingDistrito,
  handleUbigeoPending,
  handleAwaitingUbigeoSelect,
} from "@/lib/fsm/flows/cita/steps/ubigeo/ubigeo";
import {
  handleEspecialidadPending,
  handleAwaitingEspecialidadSelect,
  handleEstablecimientoPending,
  handleAwaitingEstablecimientoSelect,
  handleAwaitingEstablecimientoConfirm,
  handleSelectionHintsPending,
} from "@/lib/fsm/flows/cita/steps/catalog/catalog";
import { handleFechaPending, handleAwaitingFechaSelect, handleFechaAiPending } from "@/lib/fsm/flows/cita/steps/fecha/fecha";
import { handleHoraPending, handleHoraPagePending } from "@/lib/fsm/flows/cita/steps/hora/list";
import { handleAwaitingHoraSelect } from "@/lib/fsm/flows/cita/steps/hora/select";
import { handleHoraConfirm } from "@/lib/fsm/flows/cita/steps/hora/confirm";
import { handleHoraChoice } from "@/lib/fsm/flows/cita/steps/hora/choice";
import { handleBookingPending } from "@/lib/fsm/flows/cita/steps/booking/booking";
import { handleDuplicateChoice } from "@/lib/fsm/flows/cita/steps/booking/duplicate";
import { handleOtherEstablecimiento } from "@/lib/fsm/flows/cita/steps/catalog/other-establecimiento";
import { handleExitConfirm } from "@/lib/fsm/flows/cita/steps/exit/exit";
import {
  handleDemoAwaitingConfirm,
  handleDemoAwaitingHoraSelect,
  handleDemoAwaitingReferenciaSelect,
} from "@/lib/fsm/flows/cita/steps/demo/demo-booking";
import { handleAwaitingReferenciaConfirm, handleAwaitingReferenciaSelect } from "@/lib/fsm/flows/cita/steps/booking/references";
import { handleAwaitingTerminos, handleTerminosRegisterPending } from "@/lib/fsm/flows/cita/steps/terminos/terminos";
import { SessionState } from "@/lib/enums/session-state";
import { UnknownStateError } from "@/lib/errors/unknown-state-error";

export function handleCita(session: Session, event: HandleEvent): HandlerResult {
  switch (session.state) {
    case SessionState.CITA_AWAITING_TERMINOS:
      return handleAwaitingTerminos(session, event as InboundEvent);
    case SessionState.CITA_TERMINOS_REGISTER_PENDING:
      return handleTerminosRegisterPending(session);
    case SessionState.CITA_AWAITING_DNI:
      return handleAwaitingDni(session, event as InboundEvent);
    case SessionState.CITA_VALIDATE_PENDING:
      return handleValidatePending(session, event as QueryResultEvent);
    case SessionState.CITA_REGISTRATION_WAIT:
      return handleRegistrationWait(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_OTP:
      return handleAwaitingOtp(session, event as InboundEvent);
    case SessionState.CITA_VERIFY_PENDING:
      return handleVerifyPending(session, event as QueryResultEvent);
    case SessionState.CITA_AWAITING_DISTRITO_AI:
      return handleAwaitingDistritoAi(session, event as InboundEvent);
    case SessionState.CITA_DISTRITO_AI_PENDING:
      return handleDistritoAiPending(session, event as QueryResultEvent);
    case SessionState.CITA_AWAITING_DISTRITO_DISAMBIGUATION:
      return handleAwaitingDistritoDisambiguation(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_DEPARTAMENTO:
      return handleAwaitingDepartamento(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_PROVINCIA:
      return handleAwaitingProvincia(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_DISTRITO:
      return handleAwaitingDistrito(session, event as InboundEvent);
    case SessionState.CITA_UBIGEO_PENDING:
      return handleUbigeoPending(session, event as QueryResultEvent);
    case SessionState.CITA_AWAITING_UBIGEO_SELECT:
      return handleAwaitingUbigeoSelect(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_OTHER_DISTRITO:
      return handleOtherDistrito(session, event as InboundEvent);
    case SessionState.CITA_ESPECIALIDAD_PENDING:
      return handleEspecialidadPending(session, event as QueryResultEvent);
    case SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT:
      return handleAwaitingEspecialidadSelect(session, event as InboundEvent);
    case SessionState.CITA_ESTABLECIMIENTO_PENDING:
      return handleEstablecimientoPending(session, event as QueryResultEvent);
    case SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT:
      return handleAwaitingEstablecimientoSelect(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_ESTABLECIMIENTO_CONFIRM:
      return handleAwaitingEstablecimientoConfirm(session, event as InboundEvent);
    case SessionState.CITA_SELECTION_HINTS_PENDING:
      return handleSelectionHintsPending(session, event as QueryResultEvent);
    case SessionState.CITA_FECHA_PENDING:
      return handleFechaPending(session, event as QueryResultEvent);
    case SessionState.CITA_AWAITING_OTHER_FECHA:
      return handleOtherFecha(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_FECHA_SELECT:
      return handleAwaitingFechaSelect(session, event as InboundEvent);
    case SessionState.CITA_FECHA_AI_PENDING:
      return handleFechaAiPending(session, event as QueryResultEvent);
    case SessionState.CITA_HORA_PENDING:
      return handleHoraPending(session, event as QueryResultEvent);
    case SessionState.CITA_HORA_PAGE_PENDING:
      return handleHoraPagePending(session, event as QueryResultEvent);
    case SessionState.CITA_AWAITING_HORA_SELECT:
      return handleAwaitingHoraSelect(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_HORA_CONFIRM:
      return handleHoraConfirm(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_HORA_CHOICE:
      return handleHoraChoice(session, event as InboundEvent);
    case SessionState.CITA_BOOKING_PENDING:
      return handleBookingPending(session, event as QueryResultEvent);
    case SessionState.CITA_AWAITING_DUPLICATE_CHOICE:
      return handleDuplicateChoice(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_OTHER_ESTABLECIMIENTO:
      return handleOtherEstablecimiento(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_EXIT_CONFIRM:
      return handleExitConfirm(session, event as InboundEvent);
    case SessionState.CITA_DEMO_AWAITING_REFERENCIA_SELECT:
      return handleDemoAwaitingReferenciaSelect(session, event as InboundEvent);
    case SessionState.CITA_DEMO_AWAITING_HORA_SELECT:
      return handleDemoAwaitingHoraSelect(session, event as InboundEvent);
    case SessionState.CITA_DEMO_AWAITING_CONFIRM:
      return handleDemoAwaitingConfirm(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_REFERENCIA_SELECT:
      return handleAwaitingReferenciaSelect(session, event as InboundEvent);
    case SessionState.CITA_AWAITING_REFERENCIA_CONFIRM:
      return handleAwaitingReferenciaConfirm(session, event as InboundEvent);
    default:
      throw new UnknownStateError("handleCita", session.state);
  }
}
