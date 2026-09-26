export const LOG_EVENTS = [
  "turn.start",
  "turn.note",
  "turn.external",
  "turn.end",
  "turn.failed",
  "turn.lock_timeout",
  "turn_lock.waited",
  "external.http",
  "minsa.book_appointment.failed",
  "ai.fallback",
  "ai.provider_unknown",
  "perimeter.dropped",
  "perimeter.rejected",
  "perimeter.muted",
  "perimeter.banned",
  "webhook.message_failed",
  "webhook.entry_failed",
  "webhook.fixed_reply_failed",
  "whatsapp.send_failed",
  "whatsapp.typing_failed",
  "whatsapp.media_failed",
  "sandbox.cors_invalid_origin",
  "config.invalid",
] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];

export const TURN_NOTE_KINDS = [
  "shortcut",
  "lexical_guard",
  "session_expired",
  "confirmation_unknown",
  "menu_fallback",
  "no_coverage",
  "booking_retry",
  "booking_rejected",
  "first_contact",
  "out_of_scope",
  "hora_declined",
  "cita_closed",
] as const;

export type TurnNoteKind = (typeof TURN_NOTE_KINDS)[number];
