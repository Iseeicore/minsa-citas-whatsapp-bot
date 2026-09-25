import type { TurnNote } from "@/lib/observability/types";

export type SlotValue = string | number | boolean | null;

export type Session = {
  state: string;
  slots: Record<string, SlotValue>;
  counters: Record<string, number>;
  updatedAt?: Date;
};

export type InboundEventType = "text" | "button" | "list" | "image";

export type InboundEvent = {
  from: string;
  type: InboundEventType;
  text?: string;
  listId?: string;
  mediaId?: string;
  mediaDataUri?: string;
  messageId?: string;
};

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
  payload: Record<string, unknown>;
};

export type HandlerOutcome = "continue" | "awaiting_query" | "closed";

export type HandlerResult = {
  session: Session;
  effects: (SendEffect | QueryEffect)[];
  outcome: HandlerOutcome;
  notes?: TurnNote[];
};
