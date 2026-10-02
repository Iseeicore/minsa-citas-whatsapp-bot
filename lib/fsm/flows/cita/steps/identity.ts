import { INVALID_DOCUMENT_TEXT } from "@/lib/fsm/core/failure-texts";
import { mentionsPlacePreposition } from "@/lib/fsm/flows/cita/cita-hints";
import { isValidDniFormat, isValidOtpFormat } from "@/lib/fsm/parsing/identity-format";
import { resolveDistritoText } from "@/lib/fsm/flows/cita/distrito-resolver";
import { isDemoReferenciaDni } from "@/lib/fsm/flows/cita/demo-referencia";
import { offerDemoReferencias } from "@/lib/fsm/flows/cita/steps/demo-booking";
import { askToLeave } from "@/lib/fsm/flows/cita/steps/exit-core";
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
import { resumeAfterReverification } from "@/lib/fsm/flows/cita/steps/reverification";

const MAX_REGISTRATION_CHECKS = 3;
const MAX_OTP_ATTEMPTS = 3;
const MINSADIGITAL_REGISTRATION_URL = "https://dminsadigital.minsa.gob.pe/login";
const MINSADIGITAL_BUTTON_TEXT = "Ir a MINSADIGITAL";
const REGISTRATION_RETRY_BUTTON_ID = "cita_registration_retry";
const REGISTRATION_RETRY_BUTTON_TEXT = "Ya me registré";
const REGISTRATION_CANCEL_BUTTON_ID = "cita_registration_cancel";
const REGISTRATION_CANCEL_BUTTON_TEXT = "No quiero continuar";

function registrationRetryButtons(text: string) {
  return sendButtons(text, [
    { id: REGISTRATION_RETRY_BUTTON_ID, title: REGISTRATION_RETRY_BUTTON_TEXT },
    { id: REGISTRATION_CANCEL_BUTTON_ID, title: REGISTRATION_CANCEL_BUTTON_TEXT },
  ]);
}

export function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  const dni = (event.text ?? "").trim();

  if (!isValidDniFormat(dni)) {
    return buildResult(session, [sendText(INVALID_DOCUMENT_TEXT)]);
  }

  const next = cloneSession(session);
  next.slots.citaDniPending = dni;
  next.state = "cita_validate_pending";
  return buildResult(next, [
    sendText("Validando tu documento…"),
    query("validate_user", { numeroDocumento: dni }),
  ]);
}

export function handleValidatePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; twofaId?: string };
  const next = cloneSession(session);

  if (result.status === "valid" && typeof result.twofaId === "string") {
    next.slots.citaTwofaId = result.twofaId;
    next.state = "cita_awaiting_otp";
    return buildResult(next, [
      sendText("Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos)."),
    ]);
  }

  const checks = (next.counters.citaRegistrationChecks ?? 0) + 1;
  next.counters.citaRegistrationChecks = checks;

  if (checks >= MAX_REGISTRATION_CHECKS) {
    next.state = "cita_registration_rejected";
    return buildResult(next, [
      sendText(
        "No pudimos encontrar tu registro después de varios intentos. Intenta de nuevo más tarde en MINSADIGITAL.\n\nSi el problema continúa, puedes revisar el portal de MINSA para encontrar el correo o número de contacto que te pueda ayudar a resolverlo.",
      ),
    ]);
  }

  next.state = "cita_registration_wait";
  const introText =
    checks === 1
      ? "Todavía no encontramos tu registro en MINSADIGITAL. Este proceso puede tardar unos minutos."
      : "Qué raro, seguimos sin encontrar tu registro — esta ya es la segunda vez. Si aún no te registraste, hazlo en MINSADIGITAL; este será tu último intento antes de cerrar el proceso.";
  return buildResult(next, [
    sendCtaUrl(introText, MINSADIGITAL_BUTTON_TEXT, MINSADIGITAL_REGISTRATION_URL),
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
  next.state = "cita_validate_pending";
  return buildResult(next, [
    sendText("Validando de nuevo…"),
    query("validate_user", { numeroDocumento: String(next.slots.citaDniPending ?? "") }),
  ]);
}

export function handleAwaitingOtp(session: Session, event: InboundEvent): HandlerResult {
  const code = (event.text ?? "").trim();

  if (!isValidOtpFormat(code)) {
    return buildResult(session, [sendText("Código inválido. Debe tener entre 4 y 8 dígitos.")]);
  }

  const next = cloneSession(session);
  next.state = "cita_verify_pending";
  return buildResult(next, [
    sendText("Verificando código…"),
    query("verify_code", { twofaId: String(next.slots.citaTwofaId ?? ""), code }),
  ]);
}

/** Cola común tras el paso de referencias: usar la pista de distrito ya dicha o preguntarlo (el resume por reverificación ya se resolvió antes, en handleVerifyPending). */
export function continueCitaAfterVerification(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = "cita_awaiting_distrito_ai";

  const distritoHint = next.slots.citaDistritoHintText as string | undefined;
  if (distritoHint) {
    delete next.slots.citaDistritoHintText;
    return resolveDistritoText(
      next,
      distritoHint,
      next.slots.initialMessageText as string | undefined,
    );
  }

  const initialMessageText = next.slots.initialMessageText as string | undefined;
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
    const dni = next.slots.citaDniPending;
    delete next.slots.citaDniPending;
    delete next.slots.citaTwofaId;
    delete next.counters.citaRegistrationChecks;
    delete next.counters.citaOtpAttempts;

    next.slots.citaBearer = result.token;
    next.slots.citaDni = dni ?? null;

    if (isDemoReferenciaDni(typeof dni === "string" ? dni : undefined)) {
      delete next.slots.citaResumeState;
      delete next.slots.citaDistritoHintText;
      return offerDemoReferencias(next);
    }

    const resumeState = next.slots.citaResumeState as string | undefined;
    if (resumeState) {
      delete next.slots.citaResumeState;
      return resumeAfterReverification(next, resumeState);
    }

    next.state = "cita_references_pending";
    return buildResult(next, [
      sendText("Un momento, estamos analizando tu cuenta…"),
      query("list_references", { numeroDocumento: String(dni ?? ""), tipoDocumento: "01" }),
    ]);
  }

  const attempts = (next.counters.citaOtpAttempts ?? 0) + 1;
  next.counters.citaOtpAttempts = attempts;

  if (attempts >= MAX_OTP_ATTEMPTS) {
    next.state = "cita_otp_locked";
    return buildResult(next, [
      sendText("Superaste el número de intentos permitidos. Por favor, inicia el proceso nuevamente más tarde."),
    ]);
  }

  next.state = "cita_awaiting_otp";
  return buildResult(next, [
    sendText(`Código incorrecto. Te quedan ${MAX_OTP_ATTEMPTS - attempts} intento(s).`),
  ]);
}
