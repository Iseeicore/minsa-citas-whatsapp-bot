import { mentionsPlacePreposition } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { isValidDocumentoFormat, isValidOtpFormat } from "@/lib/fsm/parsing/text/identity-format";
import { validateUserQuery } from "@/lib/fsm/flows/cita/steps/identity/validate-user-query";
import { resolveDistritoText } from "@/lib/fsm/flows/cita/parsing/distrito-resolver";
import { isDemoReferenciaDni } from "@/lib/fsm/flows/cita/steps/demo/demo-referencia";
import { offerDemoReferencias } from "@/lib/fsm/flows/cita/steps/demo/demo-booking";
import { askToLeave } from "@/lib/fsm/flows/cita/steps/exit/exit-core";
import { buildResult, cloneSession, query, readReply, sendText, sendButtons, readTrimmedText } from "@/lib/fsm/core/handlers-shared";
import { startReferenciasLookup } from "@/lib/fsm/flows/referencia/lookup";
import { sendMinsaDigitalCta } from "@/lib/fsm/core/minsa-digital-cta";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { resumeAfterReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";
import { MINSA_DIGITAL_LOGIN_PATH } from "@/lib/integrations/minsa/wire";
import { RegistrationButtonId } from "@/lib/enums/registration-button-id";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  MINSADIGITAL_BUTTON_TEXT,
  REGISTRATION_REJECTED_TEXT,
  REGISTRATION_FIRST_MISS_TEXT,
  REGISTRATION_SECOND_MISS_TEXT,
  REGISTRATION_WAIT_TEXT,
  REGISTRATION_RETRY_PROMPT_TEXT,
  VALIDATING_AGAIN_TEXT,
  OTP_LOCKED_TEXT,
  VERIFIED_ASK_DISTRITO_TEXT,
  REGISTRATION_BUTTONS,
} from "@/lib/constants/textos/cita-identidad";
import { VALIDANDO_DOCUMENTO_TEXT, ASK_OTP_TEXT, VERIFICANDO_CODIGO_TEXT, codigoIncorrectoText } from "@/lib/constants/textos/identidad";
import { INVALID_DOCUMENT_TEXT } from "@/lib/constants/textos/fallas";
import { ValidateUserStatus } from "@/lib/enums/validate-user-status";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { isString } from "@/lib/utils/type-guards";
import { stringOrUndefined } from "@/lib/utils/text-values";
import { MAX_REGISTRATION_CHECKS, MAX_OTP_ATTEMPTS } from "@/lib/constants/limits/cita";

function registrationRetryButtons(text: string) {
  return sendButtons(text, REGISTRATION_BUTTONS);
}

export function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  const documento = readTrimmedText(event);

  if (!isValidDocumentoFormat(documento)) {
    return buildResult(session, [sendText(INVALID_DOCUMENT_TEXT)]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.CITA_DNI_PENDING] = documento;
  next.state = SessionState.CITA_VALIDATE_PENDING;
  return buildResult(next, [sendText(VALIDANDO_DOCUMENTO_TEXT), validateUserQuery(documento)]);
}

export function handleValidatePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; twofaId?: string };
  const next = cloneSession(session);

  if (result.status === ValidateUserStatus.VALID && isString(result.twofaId)) {
    next.slots[SlotKey.CITA_TWOFA_ID] = result.twofaId;
    next.state = SessionState.CITA_AWAITING_OTP;
    return buildResult(next, [sendText(ASK_OTP_TEXT)]);
  }

  const checks = (next.counters[CounterKey.CITA_REGISTRATION_CHECKS] ?? 0) + 1;
  next.counters[CounterKey.CITA_REGISTRATION_CHECKS] = checks;

  if (checks >= MAX_REGISTRATION_CHECKS) {
    next.state = SessionState.CITA_REGISTRATION_REJECTED;
    return buildResult(next, [sendText(REGISTRATION_REJECTED_TEXT)]);
  }

  next.state = SessionState.CITA_REGISTRATION_WAIT;
  const introText = checks === 1 ? REGISTRATION_FIRST_MISS_TEXT : REGISTRATION_SECOND_MISS_TEXT;
  return buildResult(next, [
    sendMinsaDigitalCta(introText, MINSADIGITAL_BUTTON_TEXT, MINSA_DIGITAL_LOGIN_PATH),
    registrationRetryButtons(REGISTRATION_WAIT_TEXT),
  ]);
}

export function handleRegistrationWait(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);

  if (replyId === RegistrationButtonId.CANCEL) return askToLeave(session, "local");

  const isRetry = replyId === RegistrationButtonId.RETRY;

  if (!isRetry) {
    return buildResult(session, [registrationRetryButtons(REGISTRATION_RETRY_PROMPT_TEXT)]);
  }

  const next = cloneSession(session);
  next.state = SessionState.CITA_VALIDATE_PENDING;
  return buildResult(next, [sendText(VALIDATING_AGAIN_TEXT), validateUserQuery(slotText(next.slots, SlotKey.CITA_DNI_PENDING))]);
}

function failOtpAttempt(next: Session): HandlerResult {
  const attempts = (next.counters[CounterKey.CITA_OTP_ATTEMPTS] ?? 0) + 1;
  next.counters[CounterKey.CITA_OTP_ATTEMPTS] = attempts;

  if (attempts >= MAX_OTP_ATTEMPTS) {
    next.state = SessionState.CITA_OTP_LOCKED;
    return buildResult(next, [sendText(OTP_LOCKED_TEXT)]);
  }

  next.state = SessionState.CITA_AWAITING_OTP;
  return buildResult(next, [sendText(codigoIncorrectoText(MAX_OTP_ATTEMPTS - attempts))]);
}

export function handleAwaitingOtp(session: Session, event: InboundEvent): HandlerResult {
  const code = readTrimmedText(event);

  if (!isValidOtpFormat(code)) {
    return failOtpAttempt(cloneSession(session));
  }

  const next = cloneSession(session);
  next.state = SessionState.CITA_VERIFY_PENDING;
  return buildResult(next, [
    sendText(VERIFICANDO_CODIGO_TEXT),
    query(QueryKind.VERIFY_CODE, { twofaId: slotText(next.slots, SlotKey.CITA_TWOFA_ID), code }),
  ]);
}

export function continueCitaAfterVerification(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_DISTRITO_AI;

  const distritoHint = next.slots[SlotKey.CITA_DISTRITO_HINT_TEXT];
  if (distritoHint) {
    delete next.slots[SlotKey.CITA_DISTRITO_HINT_TEXT];
    return resolveDistritoText(next, distritoHint, next.slots[SlotKey.INITIAL_MESSAGE_TEXT]);
  }

  const initialMessageText = next.slots[SlotKey.INITIAL_MESSAGE_TEXT];
  if (initialMessageText && mentionsPlacePreposition(initialMessageText)) {
    return resolveDistritoText(next, initialMessageText, undefined);
  }

  return buildResult(next, [sendText(VERIFIED_ASK_DISTRITO_TEXT)]);
}

export function handleVerifyPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; token?: string };
  const next = cloneSession(session);

  if (result.status === VerifyCodeStatus.VERIFIED && isString(result.token)) {
    const dni = next.slots[SlotKey.CITA_DNI_PENDING];
    delete next.slots[SlotKey.CITA_DNI_PENDING];
    delete next.slots[SlotKey.CITA_TWOFA_ID];
    delete next.counters[CounterKey.CITA_REGISTRATION_CHECKS];
    delete next.counters[CounterKey.CITA_OTP_ATTEMPTS];

    next.slots[SlotKey.CITA_BEARER] = result.token;
    next.slots[SlotKey.CITA_DNI] = dni ?? null;

    if (next.slots[SlotKey.POST_LOGIN_FLOW] === PostLoginFlow.REFERENCIAS) {
      if (isDemoReferenciaDni(stringOrUndefined(dni))) {
        delete next.slots[SlotKey.POST_LOGIN_FLOW];
        delete next.slots[SlotKey.CITA_RESUME_STATE];
        delete next.slots[SlotKey.CITA_DISTRITO_HINT_TEXT];
        return offerDemoReferencias(next);
      }
      return startReferenciasLookup(next);
    }

    const resumeState = next.slots[SlotKey.CITA_RESUME_STATE];
    if (resumeState) {
      delete next.slots[SlotKey.CITA_RESUME_STATE];
      return resumeAfterReverification(next, resumeState);
    }

    return continueCitaAfterVerification(next);
  }

  return failOtpAttempt(next);
}
