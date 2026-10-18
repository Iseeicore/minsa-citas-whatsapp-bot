import { ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-ubicacion";
import { ReauthButtonId } from "@/lib/enums/reauth-button-id";
import { RegistrationButtonId } from "@/lib/enums/registration-button-id";

export const MINSADIGITAL_BUTTON_TEXT = "Ir a MINSADIGITAL";
export const REGISTRATION_RETRY_BUTTON_TEXT = "Ya me registré";
export const REGISTRATION_CANCEL_BUTTON_TEXT = "No quiero continuar";
export const REGISTRATION_REJECTED_TEXT =
  "No pudimos encontrar tu registro después de varios intentos. Intenta de nuevo más tarde en MINSADIGITAL.\n\nSi el problema continúa, puedes revisar el portal de MINSA para encontrar el correo o número de contacto que te pueda ayudar a resolverlo.";
export const REGISTRATION_FIRST_MISS_TEXT =
  "No encontramos tu documento en MINSADIGITAL. Si aún no tienes cuenta, regístrate en la plataforma; el registro puede tardar unos minutos en reflejarse.";
export const REGISTRATION_SECOND_MISS_TEXT =
  "Qué raro, seguimos sin encontrar tu registro — esta ya es la segunda vez. Si aún no te registraste, hazlo en MINSADIGITAL; este será tu último intento antes de cerrar el proceso.";
export const REGISTRATION_WAIT_TEXT =
  "Cuando termines, toca el botón para que volvamos a intentarlo, o si prefieres no continuar, dínoslo.";
export const REGISTRATION_RETRY_PROMPT_TEXT = "Toca el botón para que volvamos a intentarlo, o si prefieres no continuar, dínoslo.";
export const VALIDATING_AGAIN_TEXT = "Validando de nuevo…";
export const ANALYZING_CUENTA_TEXT = "Un momento, estamos analizando tu cuenta…";
export const OTP_LOCKED_TEXT = "Superaste el número de intentos permitidos. Por favor, inicia el proceso nuevamente más tarde.";
export const REVERIFICATION_PROMPT_TEXT =
  "Tu verificación anterior expiró por inactividad. No te preocupes, no perdimos los datos de tu cita — ingresa tu número de documento para continuar justo donde quedaste.";
export const CITA_REAUTH_PROMPT_TEXT =
  "⏳ Tu sesión ha expirado por inactividad. Por tu seguridad, necesitamos confirmar nuevamente tu identidad para continuar con tu cita. ¿Deseas solicitar un nuevo código de verificación?\n\n[1] Sí, enviar código\n[2] Cancelar";
export const CITA_REAUTH_YES_BUTTON_TEXT = "Sí, enviar código";
export const CITA_REAUTH_NO_BUTTON_TEXT = "Cancelar";
export const REAUTH_ASK_DOCUMENTO_TEXT = "Para enviarte un nuevo código, ingresa tu número de documento.";
export const REAUTH_SENDING_CODIGO_TEXT = "Enviándote un nuevo código de verificación…";
export const VERIFIED_ASK_DISTRITO_TEXT = `¡Verificado! ${ASK_DISTRITO_TEXT}`;
export const reverifiedText = (searching: string): string => `¡Listo! Continuemos con tu cita. ${searching}`;

export const CITA_REAUTH_BUTTONS = [
  { id: ReauthButtonId.YES, title: CITA_REAUTH_YES_BUTTON_TEXT },
  { id: ReauthButtonId.NO, title: CITA_REAUTH_NO_BUTTON_TEXT },
];

export const REGISTRATION_BUTTONS = [
  { id: RegistrationButtonId.RETRY, title: REGISTRATION_RETRY_BUTTON_TEXT },
  { id: RegistrationButtonId.CANCEL, title: REGISTRATION_CANCEL_BUTTON_TEXT },
];
