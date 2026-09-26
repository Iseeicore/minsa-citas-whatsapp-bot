import { INVALID_DOCUMENT_TEXT } from "@/lib/fsm/core/failure-texts";
import { mentionsPlacePreposition } from "@/lib/fsm/flows/cita/cita-hints";
import { isValidDniFormat, isValidOtpFormat } from "@/lib/fsm/parsing/identity-format";
import { resolveDistritoText } from "@/lib/fsm/flows/cita/distrito-resolver";
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
        "No pudimos encontrar tu registro después de varios intentos. Por favor, acércate al establecimiento de salud más cercano.",
      ),
    ]);
  }

  next.state = "cita_registration_wait";
  return buildResult(next, [
    sendCtaUrl(
      "Todavía no encontramos tu registro en MINSADIGITAL. Este proceso puede tardar unos minutos.",
      MINSADIGITAL_BUTTON_TEXT,
      MINSADIGITAL_REGISTRATION_URL,
    ),
    sendButtons("Cuando termines, toca el botón para que volvamos a intentarlo.", [
      { id: REGISTRATION_RETRY_BUTTON_ID, title: REGISTRATION_RETRY_BUTTON_TEXT },
    ]),
  ]);
}

export function handleRegistrationWait(session: Session, event: InboundEvent): HandlerResult {
  const isRetry = readReply(event) === REGISTRATION_RETRY_BUTTON_ID;

  if (!isRetry) {
    return buildResult(session, [
      sendButtons("Toca el botón para que volvamos a intentarlo.", [
        { id: REGISTRATION_RETRY_BUTTON_ID, title: REGISTRATION_RETRY_BUTTON_TEXT },
      ]),
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
    next.state = "cita_awaiting_distrito_ai";

    const resumeState = next.slots.citaResumeState as string | undefined;
    if (resumeState) {
      delete next.slots.citaResumeState;
      return resumeAfterReverification(next, resumeState);
    }

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
