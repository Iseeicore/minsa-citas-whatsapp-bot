import { SlotKey } from "@/lib/enums/slot-key";
import { readTappedId } from "@/lib/fsm/core/handlers-shared";
import { isInteractiveEffect } from "@/lib/utils/interactive-effect";
import type { HandleEvent, InboundEvent, InteractiveTracking, SendEffect, SendOutcome, Session, Slots } from "@/lib/fsm/core/types";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { SendOutcomeKind } from "@/lib/enums/send-outcome-kind";
import type { TurnTrace } from "@/lib/observability/tracer";

function isTap(event: HandleEvent): event is InboundEvent {
  return event.type !== InternalEventType.QUERY_RESULT && readTappedId(event) !== undefined;
}

function isUndelivered(outcome: SendOutcome): boolean {
  return outcome.kind === SendOutcomeKind.REJECTED || outcome.kind === SendOutcomeKind.FAILED;
}

export function readInteractiveTracking(slots: Slots): InteractiveTracking {
  return {
    messageId: slots[SlotKey.INTERACTIVE_MESSAGE_ID] || undefined,
    consumed: slots[SlotKey.INTERACTIVE_MESSAGE_CONSUMED] === true,
  };
}

export function currentInteractiveId(slots: Slots): string | undefined {
  const { messageId, consumed } = readInteractiveTracking(slots);
  return consumed ? undefined : messageId;
}

export function isStaleTap(session: Session, event: HandleEvent): boolean {
  if (!isTap(event) || !event.replyTo) return false;
  const { messageId, consumed } = readInteractiveTracking(session.slots);
  if (!messageId) return false;
  return consumed || event.replyTo !== messageId;
}

export function acceptTap(tracking: InteractiveTracking, event: HandleEvent): InteractiveTracking {
  return isTap(event) && tracking.messageId ? { ...tracking, consumed: true } : tracking;
}

export function trackSent(tracking: InteractiveTracking, effect: SendEffect, outcome: SendOutcome): InteractiveTracking {
  if (!isInteractiveEffect(effect)) return tracking;
  switch (outcome.kind) {
    case SendOutcomeKind.SENT:
      return { messageId: outcome.messageId, consumed: false };
    case SendOutcomeKind.SENT_NO_ID:
      return { consumed: false };
    case SendOutcomeKind.REJECTED:
    case SendOutcomeKind.FAILED:
      return { ...tracking, consumed: true };
  }
}

export function trackDelivery(
  trace: Pick<TurnTrace, "note">,
  tracking: InteractiveTracking,
  effect: SendEffect,
  outcome: SendOutcome,
): InteractiveTracking {
  if (isUndelivered(outcome)) trace.note({ kind: "send_failed", level: "warn", detail: { effect: effect.kind, outcome: outcome.kind } });
  return trackSent(tracking, effect, outcome);
}

export function consumeOnStateChange(start: InteractiveTracking, current: InteractiveTracking, stateChanged: boolean): InteractiveTracking {
  if (!stateChanged || !current.messageId || current.messageId !== start.messageId) return current;
  return { ...current, consumed: true };
}

export function withInteractiveTracking(session: Session, tracking: InteractiveTracking): Session {
  const slots = { ...session.slots };
  delete slots[SlotKey.INTERACTIVE_MESSAGE_ID];
  delete slots[SlotKey.INTERACTIVE_MESSAGE_CONSUMED];
  if (tracking.messageId) slots[SlotKey.INTERACTIVE_MESSAGE_ID] = tracking.messageId;
  if (tracking.messageId && tracking.consumed) slots[SlotKey.INTERACTIVE_MESSAGE_CONSUMED] = true;
  return { ...session, slots };
}
