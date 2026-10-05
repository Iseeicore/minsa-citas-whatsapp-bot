import { INVALID_DOCUMENT_TEXT } from "@/lib/fsm/core/failure-texts";
import { mentionsPlacePreposition } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { isValidDocumentoFormat, isValidOtpFormat, tipoDocumentoDe } from "@/lib/fsm/parsing/text/identity-format";
import { validateUserQuery } from "@/lib/fsm/flows/cita/steps/identity/validate-user-query";
import { resolveDistritoText } from "@/lib/fsm/flows/cita/parsing/distrito-resolver";
import { isDemoReferenciaDni } from "@/lib/fsm/flows/cita/steps/demo/demo-referencia";
import { offerDemoReferencias } from "@/lib/fsm/flows/cita/steps/demo/demo-booking";
import { askToLeave } from "@/lib/fsm/flows/cita/steps/exit/exit-core";
import {
  buildResult,
  cloneSession,
  query,
  readReply,
  sendText,
  sendButtons,
  sendCtaUrl,
} from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { resumeAfterReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";
import { minsaDigitalAppUrl } from "@/lib/integrations/minsa/wire";
import { RegistrationButtonId } from "@/lib/enums/registration-button-id";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";

const MAX_REGISTRATION_CHECKS = 3;
const MAX_OTP_ATTEMPTS = 3;
const MINSADIGITAL_BUTTON_TEXT = "Ir a MINSADIGITAL";
const REGISTRATION_RETRY_BUTTON_ID = RegistrationButtonId.RETRY;
const REGISTRATION_RETRY_BUTTON_TEXT = "Ya me registré";
const REGISTRATION_CANCEL_BUTTON_ID = RegistrationButtonId.CANCEL;
const REGISTRATION_CANCEL_BUTTON_TEXT = "No quiero continuar";

function registrationRetryButtons(text: string) {
  return sendButtons(text, [
    { id: REGISTRATION_RETRY_BUTTON_ID, title: REGISTRATION_RETRY_BUTTON_TEXT },
    { id: REGISTRATION_CANCEL_BUTTON_ID, title: REGISTRATION_CANCEL_BUTTON_TEXT },
  ]);
}

export function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  const documento = (event.text ?? "").trim();

  if (!isValidDocumentoFormat(documento)) {
    return buildResult(session, [sendText(INVALID_DOCUMENT_TEXT)]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.CITA_DNI_PENDING] = documento;
  next.state = SessionState.CITA_VALIDATE_PENDING;
  return buildResult(next, [sendText("Validando tu documento…"), validateUserQuery(documento)]);
}

export function handleValidatePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; twofaId?: string };
  const next = cloneSession(session);

  if (result.status === "valid" && typeof result.twofaId === "string") {
    next.slots[SlotKey.CITA_TWOFA_ID] = result.twofaId;
    next.state = SessionState.CITA_AWAITING_OTP;
    return buildResult(next, [
      sendText("Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos)."),
    ]);
  }

  const checks = (next.counters[CounterKey.CITA_REGISTRATION_CHECKS] ?? 0) + 1;
  next.counters[CounterKey.CITA_REGISTRATION_CHECKS] = checks;

  if (checks >= MAX_REGISTRATION_CHECKS) {
    next.state = SessionState.CITA_REGISTRATION_REJECTED;
    return buildResult(next, [
      sendText(
        "No pudimos encontrar tu registro después de varios intentos. Intenta de nuevo más tarde en MINSADIGITAL.\n\nSi el problema continúa, puedes revisar el portal de MINSA para encontrar el correo o número de contacto que te pueda ayudar a resolverlo.",
      ),
    ]);
  }

  next.state = SessionState.CITA_REGISTRATION_WAIT;
  const introText =
    checks === 1
      ? "Todavía no encontramos tu registro en MINSADIGITAL. Este proceso puede tardar unos minutos."
      : "Qué raro, seguimos sin encontrar tu registro — esta ya es la segunda vez. Si aún no te registraste, hazlo en MINSADIGITAL; este será tu último intento antes de cerrar el proceso.";
  return buildResult(next, [
    sendCtaUrl(introText, MINSADIGITAL_BUTTON_TEXT, `${minsaDigitalAppUrl()}/login`),
    registrationRetryButtons("Cuando termines, toca el botón para que volvamos a intentarlo, o si prefieres no continuar, dínoslo."),
  ]);
}

export function handleRegistrationWait(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);

  if (replyId === REGISTRATION_CANCEL_BUTTON_ID) return askToLeave(session, "local");

  const isRetry = replyId === REGISTRATION_RETRY_BUTTON_ID;

  if (!isRetry) {
    return buildResult(session, [
      registrationRetryButtons("Toca el botón para que volvamos a intentarlo, o si prefieres no continuar, dínoslo."),
    ]);
  }

  const next = cloneSession(session);
  next.state = SessionState.CITA_VALIDATE_PENDING;
  return buildResult(next, [
    sendText("Validando de nuevo…"),
    validateUserQuery(String(next.slots[SlotKey.CITA_DNI_PENDING] ?? "")),
  ]);
}

export function handleAwaitingOtp(session: Session, event: InboundEvent): HandlerResult {
  const code = (event.text ?? "").trim();

  if (!isValidOtpFormat(code)) {
    return buildResult(session, [sendText("Código inválido. Debe tener entre 4 y 8 dígitos.")]);
  }

  const next = cloneSession(session);
  next.state = SessionState.CITA_VERIFY_PENDING;
  return buildResult(next, [
    sendText("Verificando código…"),
    query(QueryKind.VERIFY_CODE, { twofaId: String(next.slots[SlotKey.CITA_TWOFA_ID] ?? ""), code }),
  ]);
}

/** Cola común tras el paso de referencias: usar la pista de distrito ya dicha o preguntarlo (el resume por reverificación ya se resolvió antes, en handleVerifyPending). */
export function continueCitaAfterVerification(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_DISTRITO_AI;

  const distritoHint = next.slots[SlotKey.CITA_DISTRITO_HINT_TEXT];
  if (distritoHint) {
    delete next.slots[SlotKey.CITA_DISTRITO_HINT_TEXT];
    return resolveDistritoText(
      next,
      distritoHint,
      next.slots[SlotKey.INITIAL_MESSAGE_TEXT],
    );
  }

  const initialMessageText = next.slots[SlotKey.INITIAL_MESSAGE_TEXT];
  if (initialMessageText && mentionsPlacePreposition(initialMessageText)) {
    return resolveDistritoText(next, initialMessageText, undefined);
  }

  return buildResult(next, [
    sendText('¡Verificado! Cuéntanos en qué distrito buscas atención (ej. "Miraflores").'),
  ]);
}

export function handleVerifyPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; token?: string };
  const next = cloneSession(session);

  if (result.status === "verified" && typeof result.token === "string") {
    const dni = next.slots[SlotKey.CITA_DNI_PENDING];
    delete next.slots[SlotKey.CITA_DNI_PENDING];
    delete next.slots[SlotKey.CITA_TWOFA_ID];
    delete next.counters[CounterKey.CITA_REGISTRATION_CHECKS];
    delete next.counters[CounterKey.CITA_OTP_ATTEMPTS];

    next.slots[SlotKey.CITA_BEARER] = result.token;
    next.slots[SlotKey.CITA_DNI] = dni ?? null;

    if (isDemoReferenciaDni(typeof dni === "string" ? dni : undefined)) {
      delete next.slots[SlotKey.CITA_RESUME_STATE];
      delete next.slots[SlotKey.CITA_DISTRITO_HINT_TEXT];
      return offerDemoReferencias(next);
    }

    const resumeState = next.slots[SlotKey.CITA_RESUME_STATE];
    if (resumeState) {
      delete next.slots[SlotKey.CITA_RESUME_STATE];
      return resumeAfterReverification(next, resumeState);
    }

    next.state = SessionState.CITA_REFERENCES_PENDING;
    const numeroDocumento = String(dni ?? "");
    return buildResult(next, [
      sendText("Un momento, estamos analizando tu cuenta…"),
      query(QueryKind.LIST_REFERENCES, { numeroDocumento, tipoDocumento: tipoDocumentoDe(numeroDocumento) }),
    ]);
  }

  const attempts = (next.counters[CounterKey.CITA_OTP_ATTEMPTS] ?? 0) + 1;
  next.counters[CounterKey.CITA_OTP_ATTEMPTS] = attempts;

  if (attempts >= MAX_OTP_ATTEMPTS) {
    next.state = SessionState.CITA_OTP_LOCKED;
    return buildResult(next, [
      sendText("Superaste el número de intentos permitidos. Por favor, inicia el proceso nuevamente más tarde."),
    ]);
  }

  next.state = SessionState.CITA_AWAITING_OTP;
  return buildResult(next, [
    sendText(`Código incorrecto. Te quedan ${MAX_OTP_ATTEMPTS - attempts} intento(s).`),
  ]);
}
