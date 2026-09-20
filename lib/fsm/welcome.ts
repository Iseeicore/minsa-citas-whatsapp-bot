import { sendButtons, sendCtaUrl } from "./handlers-shared";
import type { SendEffect } from "./types";

// Shared between two callers: app/webhook/whatsapp/route.ts sends this as
// the entire response to a citizen's very first-ever message (before any
// FSM turn runs), and lib/fsm/handlers.ts's terminal-state re-entry sends
// the same text+button as a normal FSM effect when a citizen returns after
// a finished cita/reclamo — one source of truth for the copy either way.
export const WELCOME_MESSAGE_TEXT = `¡Hola! Te damos la bienvenida al canal oficial del *Ministerio de Salud del Perú (MINSA)* 🇵🇪.

Para agendar tu cita médica de manera rápida en menos de 2 minutos, elegir tu establecimiento de salud y obtener tu ticket de atención sin colas, abre *MINSA Digital*.

Encuentra citas para Medicina General, Odontología, Pediatría y más especialidades a nivel nacional.`;

export const WELCOME_CTA_BUTTON_TEXT = "Continuar mi cita"; // 17 chars — cta_url's display_text caps at 20
export const WELCOME_CTA_URL = "https://minsa-citas-whatsapp-bot.vercel.app/sandbox";

export function buildWelcomeEffect(): SendEffect {
  return sendCtaUrl(WELCOME_MESSAGE_TEXT, WELCOME_CTA_BUTTON_TEXT, WELCOME_CTA_URL);
}

// A WhatsApp interactive message carries ONE action type, so the link button
// above and the reply button below can't share a message: the welcome is two
// messages. Titles are capped at 20 characters, hence "Seguir aquí".
export const WELCOME_FOLLOWUP_TEXT = "¿Prefieres seguir por aquí mismo?";
export const FOLLOW_HERE_BUTTON_ID = "seguir_aqui";

export function buildWelcomeFollowupEffect(): SendEffect {
  return sendButtons(WELCOME_FOLLOWUP_TEXT, [{ id: FOLLOW_HERE_BUTTON_ID, title: "Seguir aquí" }]);
}
