import type { TurnNote } from "@/lib/observability/types";
import { SendType } from "@/lib/enums/send-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";

export type SlotValue = string | number | boolean | null;

export type SlotTypes = {
  [SlotKey.CITA_HORA_CONFIRM_ID]: string;
  [SlotKey.CITA_ESPECIALIDAD_ID]: string;
  [SlotKey.CITA_BEARER]: string;
  [SlotKey.CITA_DISTRITO]: string;
  [SlotKey.CITA_COD_EESS]: string;
  [SlotKey.INITIAL_MESSAGE_TEXT]: string;
  [SlotKey.CITA_FECHA]: string;
  [SlotKey.CITA_RESUME_STATE]: string;
  [SlotKey.CITA_UBIGEO]: string;
  [SlotKey.CITA_DNI]: string | null;
  [SlotKey.CITA_HORA_CONFIRM_ONLY]: string;
  [SlotKey.CITA_EXIT_RESUME_STATE]: string;
  [SlotKey.CITA_ESPECIALIDAD_NOMBRE]: string;
  [SlotKey.CITA_DEPARTAMENTO]: string;
  [SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]: string;
  [SlotKey.CITA_DISTRITO_HINT_TEXT]: string;
  [SlotKey.CITA_PROVINCIA]: string;
  [SlotKey.CITA_FECHAS_DESCARTADAS]: string;
  [SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT]: string;
  [SlotKey.CITA_HORA_CHOICE_A]: string;
  [SlotKey.CITA_DNI_PENDING]: string;
  [SlotKey.QUEJA]: string;
  [SlotKey.NOMBRE_COMPLETO]: string;
  [SlotKey.CITA_HORAS_DIA]: string;
  [SlotKey.CITA_DEMO_REFERENCIA_CODIGO]: string;
  [SlotKey.CITA_DEMO_HORA_ID]: string;
  [SlotKey.CITA_SELECTION_STEP]: string;
  [SlotKey.CITA_HORA_CHOICE_B]: string;
  [SlotKey.MENU_CHOICE]: string;
  [SlotKey.DNI]: string;
  [SlotKey.CITA_TWOFA_ID]: string;
  [SlotKey.CITA_OFFERED]: string;
  [SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]: string;
  [SlotKey.NOMBRE]: string;
  [SlotKey.MEDIA_DATA_URI]: string;
  [SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS]: string;
  [SlotKey.CITA_ESPECIALIDADES_DESCARTADAS]: string;
  [SlotKey.AWAITING_CONTINUE]: boolean;
  [SlotKey.CITA_OFFERED_NAMES]: string;
  [SlotKey.CITA_REFERENCIAS_DATA]: string;
  [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: string;
  [SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS]: string;
  [SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]: string;
  [SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE]: string;
};

export type Slots = { [K in SlotKey]?: SlotTypes[K] };

export type Counters = Partial<Record<CounterKey, number>>;

export type SessionChannel = "whatsapp" | "web";

export type Session = {
  state: string;
  slots: Slots;
  counters: Counters;
  updatedAt?: Date;
  channel?: SessionChannel;
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
  kind: SendType.TEXT;
  text: string;
};

export type ListRow = {
  id: string;
  title: string;
  description?: string;
};

export type SendInteractiveListEffect = {
  kind: SendType.INTERACTIVE_LIST;
  text: string;
  rows: ListRow[];
};

export type ButtonOption = {
  id: string;
  title: string;
};

export type SendButtonsEffect = {
  kind: SendType.BUTTONS;
  text: string;
  buttons: ButtonOption[];
};

export type SendCtaUrlEffect = {
  kind: SendType.CTA_URL;
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
  | "book_appointment"
  | "list_references"
  | "analyze_reclamo_foto_intent";

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
