import { sendCtaUrl, sendText } from "@/lib/fsm/core/handlers-shared";
import type { SendEffect, SessionChannel } from "@/lib/fsm/core/types";

export const WELCOME_MESSAGE_TEXT = `¡Hola! Te damos la bienvenida al canal oficial del *Ministerio de Salud del Perú (MINSA)* 🇵🇪.

Para agendar tu cita médica de manera rápida en menos de 2 minutos, elegir tu establecimiento de salud y obtener tu ticket de atención sin colas, abre *MINSA Digital*.

Encuentra citas para Medicina General, Odontología, Pediatría y más especialidades a nivel nacional.

⚠️ En caso de emergencia médica, llama al *106* (SAMU).

¿Prefieres seguir por aquí mismo? Escríbeme lo que necesitas y te ayudo.`;

export const WEB_WELCOME_MESSAGE_TEXT = `¡Hola! Soy el asistente virtual de MINSA Digital 🇵🇪. Puedo ayudarte a agendar tu cita médica, elegir tu establecimiento de salud y obtener tu ticket de atención, todo desde este mismo chat.

Encuentra citas para Medicina General, Odontología, Pediatría y más especialidades a nivel nacional.

⚠️ En caso de emergencia médica, llama al *106* (SAMU).

Escríbeme lo que necesitas y te ayudo.`;

export const WELCOME_CTA_BUTTON_TEXT = "Continuar mi cita";

/** El botón «Continuar mi cita» solo aplica a WhatsApp: en el widget web el ciudadano ya está dentro de MINSA Digital. */
export function buildWelcomeEffect(channel: SessionChannel): SendEffect {
  if (channel === "web") return sendText(WEB_WELCOME_MESSAGE_TEXT);

  return sendCtaUrl(WELCOME_MESSAGE_TEXT, WELCOME_CTA_BUTTON_TEXT, process.env.MINSA_DIGITAL_APP_URL as string);
}
