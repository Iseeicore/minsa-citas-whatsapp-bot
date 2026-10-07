import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { formatHora12 } from "@/lib/fsm/flows/cita/steps/hora/format";
import {
  buildResult,
  cloneSession,
  offerPagedList,
  sendButtons,
  sendText,
  truncateForRow,
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_TITLE_MAX,
} from "@/lib/fsm/core/handlers-shared";
import { clearOffered, resolveSelection } from "@/lib/fsm/flows/cita/parsing/selection";
import { continueCitaAfterVerification } from "@/lib/fsm/flows/cita/steps/identity/identity";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import type { ListReferencesResult, ReferenciaItem } from "@/lib/integrations/minsa/types";
import { ReferencesOfferButtonId } from "@/lib/enums/references-offer-button-id";
import { ReferenciaConfirmButtonId } from "@/lib/enums/referencia-confirm-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

const REFERENCES_OFFER_YES_ID = ReferencesOfferButtonId.YES;
const REFERENCES_OFFER_NO_ID = ReferencesOfferButtonId.NO;
const REFERENCIA_CONFIRM_YES_ID = ReferenciaConfirmButtonId.YES;
const REFERENCIA_CONFIRM_NO_ID = ReferenciaConfirmButtonId.NO;

const ESTADO_LABEL: Record<number, string> = {
  3: "ACEPTADO",
  5: "PACIENTE RECIBIDO",
  7: "PACIENTE CITADO",
};

/** "DD/MM/YYYY HH:MM" (24h) -> "DD/MM/YYYY H:MM AM/PM", reutilizando formatHora12 solo sobre la parte de hora. */
function formatFechaHora12(fechaHora: string): string {
  const [fecha, hora] = fechaHora.split(" ");
  if (!fecha || !hora || !/^\d{2}:\d{2}$/.test(hora)) return fechaHora;
  return `${fecha} ${formatHora12(hora)}`;
}

function readReferencias(session: Session): ReferenciaItem[] {
  const raw = session.slots[SlotKey.CITA_REFERENCIAS_DATA];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ReferenciaItem[]) : [];
  } catch {
    return [];
  }
}

function referenciaRows(items: ReferenciaItem[]): ListRow[] {
  return items.map((item) => ({
    id: item.idReferencia,
    title: truncateForRow(item.ipressDestino, WHATSAPP_ROW_TITLE_MAX),
    description: truncateForRow(`${formatFechaHora12(item.fechaInicio)} · ${item.ipressOrigen}`, WHATSAPP_ROW_DESCRIPTION_MAX),
  }));
}

function withLeadingText(result: HandlerResult, text: string): HandlerResult {
  return { ...result, effects: [sendText(text), ...result.effects] };
}

function offerReferenciasList(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_REFERENCIA_SELECT;
  return buildResult(next, offerPagedList(next, "Estas son tus referencias:", referenciaRows(readReferencias(next))));
}

function askReferenciaConfirmation(session: Session, item: ReferenciaItem | undefined): HandlerResult {
  const detalle = `N° : ${item?.numero ?? ""}
Fecha: ${formatFechaHora12(item?.fechaInicio ?? "")}
Origen: ${item?.ipressOrigen ?? ""} (${item?.upsOrigen ?? ""})
Destino: ${item?.ipressDestino ?? ""} (${item?.upsDestino ?? ""})
Estado: ${ESTADO_LABEL[item?.estado ?? 0] ?? ""}

¿Es esta tu referencia?`;
  return buildResult(session, [
    sendText(detalle),
    sendButtons("¿Es esta tu referencia?", [
      { id: REFERENCIA_CONFIRM_YES_ID, title: "Sí" },
      { id: REFERENCIA_CONFIRM_NO_ID, title: "No, ver otra" },
    ]),
  ]);
}

export function handleReferencesPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as ListReferencesResult;
  const next = cloneSession(session);

  if (result.status !== "found" || result.items.length === 0) {
    return continueCitaAfterVerification(next);
  }

  next.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(result.items);
  next.state = SessionState.CITA_AWAITING_REFERENCES_OFFER;
  return buildResult(next, [
    sendText("Tienes una referencia médica registrada.\n¿Deseas revisar tus referencias?"),
    sendButtons("¿Deseas revisar tus referencias?", [
      { id: REFERENCES_OFFER_YES_ID, title: "Sí" },
      { id: REFERENCES_OFFER_NO_ID, title: "No" },
    ]),
  ]);
}

export function handleAwaitingReferenciasOffer(session: Session, event: InboundEvent): HandlerResult {
  const reply =
    event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
  const typed = event.type === InboundEventType.TEXT ? resolveConfirmation(event.text ?? "") : Confirmation.UNKNOWN;

  if (reply === REFERENCES_OFFER_YES_ID || typed === Confirmation.YES) {
    return offerReferenciasList(session);
  }

  if (reply === REFERENCES_OFFER_NO_ID || typed === Confirmation.NO) {
    return withLeadingText(continueCitaAfterVerification(session), "Entendido, continuamos con tu cita médica.");
  }

  return buildResult(session, [
    sendButtons("¿Deseas revisar tus referencias?", [
      { id: REFERENCES_OFFER_YES_ID, title: "Sí" },
      { id: REFERENCES_OFFER_NO_ID, title: "No" },
    ]),
  ]);
}

export function handleAwaitingReferenciaSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event);
  if ("result" in outcome) return outcome.result;

  const item = readReferencias(session).find((r) => r.idReferencia === outcome.replyId);
  const next = clearOffered(session);
  next.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID] = outcome.replyId;
  next.state = SessionState.CITA_AWAITING_REFERENCIA_CONFIRM;
  return askReferenciaConfirmation(next, item);
}

export function handleAwaitingReferenciaConfirm(session: Session, event: InboundEvent): HandlerResult {
  const reply =
    event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
  const typed = event.type === InboundEventType.TEXT ? resolveConfirmation(event.text ?? "") : Confirmation.UNKNOWN;

  if (reply === REFERENCIA_CONFIRM_NO_ID || typed === Confirmation.NO) {
    return offerReferenciasList(session);
  }

  if (reply === REFERENCIA_CONFIRM_YES_ID || typed === Confirmation.YES) {
    return continueCitaAfterVerification(session);
  }

  const selectedId = String(session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID] ?? "");
  const item = readReferencias(session).find((r) => r.idReferencia === selectedId);
  return askReferenciaConfirmation(session, item);
}
