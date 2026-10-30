import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryEffect, QueryResultEvent, SendEffect } from "@/lib/fsm/core/types";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { SendType } from "@/lib/enums/send-type";
import type { SessionChannel } from "@/lib/enums/session-channel";

const SYNTHETIC_FROM = "synthetic-fsm";

const withChannel = (channel?: SessionChannel) => (channel ? { channel } : {});

export const text = (value: string, channel?: SessionChannel): InboundEvent => ({
  from: SYNTHETIC_FROM,
  type: InboundEventType.TEXT,
  text: value,
  ...withChannel(channel),
});

export const tap = (id: string, channel?: SessionChannel): InboundEvent => ({
  from: SYNTHETIC_FROM,
  type: InboundEventType.BUTTON,
  listId: id,
  ...withChannel(channel),
});

export const pick = (id: string): InboundEvent => ({ from: SYNTHETIC_FROM, type: InboundEventType.LIST, listId: id });

export const queryResult = (queryKind: QueryResultEvent["queryKind"], result: unknown): QueryResultEvent => ({
  from: SYNTHETIC_FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
});

export const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

export const texts = (result: HandlerResult): string[] =>
  sent(result).flatMap((effect) => (effect.kind === SendType.TEXT ? [effect.text] : []));

export const queries = (result: HandlerResult): QueryEffect[] => result.effects.filter(isQueryEffect);
