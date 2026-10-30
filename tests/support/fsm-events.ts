import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryEffect, QueryResultEvent, SendEffect } from "@/lib/fsm/core/types";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { SendType } from "@/lib/enums/send-type";
import { SessionChannel } from "@/lib/enums/session-channel";

const SYNTHETIC_FROM = "synthetic-fsm";

export const text = (value: string, channel: SessionChannel = SessionChannel.WHATSAPP): InboundEvent => ({
  from: SYNTHETIC_FROM,
  type: InboundEventType.TEXT,
  text: value,
  channel,
});

export const tap = (id: string, channel: SessionChannel = SessionChannel.WHATSAPP): InboundEvent => ({
  from: SYNTHETIC_FROM,
  type: InboundEventType.BUTTON,
  listId: id,
  channel,
});

export const pick = (id: string, channel: SessionChannel = SessionChannel.WHATSAPP): InboundEvent => ({
  from: SYNTHETIC_FROM,
  type: InboundEventType.LIST,
  listId: id,
  channel,
});

export const queryResult = (
  queryKind: QueryResultEvent["queryKind"],
  result: unknown,
  channel: SessionChannel = SessionChannel.WHATSAPP,
): QueryResultEvent => ({
  from: SYNTHETIC_FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
  channel,
});

export const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

export const texts = (result: HandlerResult): string[] =>
  sent(result).flatMap((effect) => (effect.kind === SendType.TEXT ? [effect.text] : []));

export const queries = (result: HandlerResult): QueryEffect[] => result.effects.filter(isQueryEffect);
