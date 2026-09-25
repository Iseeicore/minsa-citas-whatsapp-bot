import { sendCtaUrl } from "@/lib/fsm/core/handlers-shared";
import type { SendEffect } from "@/lib/fsm/core/types";

// Shared between two callers: app/webhook/whatsapp/route.ts sends this as
// the entire response to a citizen's very first-ever message (before any
// FSM turn runs), and lib/fsm/core/handlers.ts's terminal-state re-entry sends
// the same text+button as a normal FSM effect when a citizen returns after
// a finished cita/reclamo — one source of truth for the copy either way.
export const WELCOME_MESSAGE_TEXT = `¡Hola! Te damos la bienvenida al canal oficial del *Ministerio de Salud del Perú (MINSA)* 🇵🇪.

Para agendar tu cita médica de manera rápida en menos de 2 minutos, elegir tu establecimiento de salud y obtener tu ticket de atención sin colas, abre *MINSA Digital*.

Encuentra citas para Medicina General, Odontología, Pediatría y más especialidades a nivel nacional.

⚠️ En caso de emergencia médica, llama al *106* (SAMU).

¿Prefieres seguir por aquí mismo? Escríbeme lo que necesitas y te ayudo.`;

export const WELCOME_CTA_BUTTON_TEXT = "Continuar mi cita"; // 17 chars — cta_url's display_text caps at 20
export const WELCOME_CTA_URL = "https://minsa-citas-whatsapp-bot.vercel.app/sandbox";

export function buildWelcomeEffect(): SendEffect {
  return sendCtaUrl(WELCOME_MESSAGE_TEXT, WELCOME_CTA_BUTTON_TEXT, WELCOME_CTA_URL);
}

