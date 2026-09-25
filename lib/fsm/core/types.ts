import type { TurnNote } from "@/lib/observability/types";

export type SlotValue = string | number | boolean | null;

export type Session = {
  state: string;
  slots: Record<string, SlotValue>;
  counters: Record<string, number>;
  // Time of the last save, filled in by session-store.getSession only. Handlers
  // never carry it forward: it exists for the idle check on a citizen's message.
  updatedAt?: Date;
};

export type InboundEventType = "text" | "button" | "list" | "image";

export type InboundEvent = {
  from: string;
  type: InboundEventType;
  text?: string;
  listId?: string;
  mediaId?: string;
  // Base64 data URI of a real uploaded image (Sandbox-only — there's no real
  // WhatsApp media round-trip here). Kept separate from `mediaId` since that
  // field is just an opaque reference, not actual image bytes.
  mediaDataUri?: string;
  // WhatsApp's id of the message (the Sandbox has none). Only used to give the
  // turn a traceId that is the same when Meta delivers the message again.
  messageId?: string;
};

// Synthesized by lib/fsm/core/executor.ts after resolving a QueryEffect, and fed
// back into handle() as its second-pass event — this is the "evento
// sintético X_result" the plan's state tables refer to (e.g.
// `reniec_lookup_result`, `validate_user_result`).
export type QueryResultEvent = {
  from: string;
  type: "query_result";
  queryKind: QueryEffectKind;
  result: unknown;
};

export type HandleEvent = InboundEvent | QueryResultEvent;

export type SendTextEffect = {
  kind: "send_text";
  text: string;
};

export type ListRow = {
  id: string;
  title: string;
  description?: string;
};

export type SendInteractiveListEffect = {
  kind: "send_interactive_list";
  text: string;
  rows: ListRow[];
};

export type ButtonOption = {
  id: string;
  title: string;
};

export type SendButtonsEffect = {
  kind: "send_buttons";
  text: string;
  buttons: ButtonOption[];
};

// Same interactive subtype the real webhook already sends for the welcome
// message (see lib/whatsapp/whatsapp-send.ts's sendCtaUrlMessage) — a single
// tappable link button that opens an external URL. Exposed as a normal
// SendEffect so an FSM handler can produce one (e.g. redirecting a citizen
// outside the pilot's Lima scope to the national booking site) without
// route.ts needing a special case.
export type SendCtaUrlEffect = {
  kind: "send_cta_url";
  text: string;
  buttonText: string;
  url: string;
};

export type SendEffect =
  | SendTextEffect
  | SendInteractiveListEffect
  | SendButtonsEffect
  | SendCtaUrlEffect;

export type QueryEffectKind =
  | "reniec_lookup"
  | "quejas_submit"
  | "validate_user"
  | "verify_code"
  | "analyze_main_menu_intent"
  | "resolve_distrito_ai"
  | "resolve_fecha_ai"
  | "extract_selection_hints"
  | "search_ubigeo"
  | "list_especialidades"
  | "list_establecimientos"
  | "list_fechas"
  | "list_horas"
  | "book_appointment";

export type QueryEffect = {
  kind: QueryEffectKind;
  // Plain payload passed to the matching function in lib/integrations (minsa/, reniec.ts, quejas.ts).
  // Left untyped-ish (Record<string, unknown>) since each query kind has its own shape.
  payload: Record<string, unknown>;
};

export type HandlerOutcome = "continue" | "awaiting_query" | "closed";

export type HandlerResult = {
  session: Session;
  effects: (SendEffect | QueryEffect)[];
  outcome: HandlerOutcome;
  // Decisions and friction the executor should put on record (see TurnNote).
  notes?: TurnNote[];
};
