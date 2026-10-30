import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import { deriveTraceId } from "@/lib/observability/tracer";
import { checkFirstMessagePayload, type RejectReason } from "@/lib/security/payload-filter";
import type { RateLimiter } from "@/lib/security/rate-limiter";
import { RateVerdict } from "@/lib/enums/rate-verdict";
import { RejectReason as RejectReasonEnum } from "@/lib/enums/reject-reason";
import { PerimeterAction } from "@/lib/enums/perimeter-action";
import { muteNoticeText } from "@/lib/constants/textos/seguridad";
import { PayloadVerdictKind } from "@/lib/enums/payload-verdict-kind";
import { SessionState } from "@/lib/enums/session-state";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { EVIDENCE_IMAGE_BURST_LIMIT, EVIDENCE_IMAGE_BURST_WINDOW_MS, INBOUND_MUTE_MS } from "@/lib/constants/limits/perimeter";

export type PerimeterDecision =
  | { action: PerimeterAction.DROP; reason: RateVerdict.THROTTLED | RateVerdict.BANNED | RejectReasonEnum.NOISE | RejectReasonEnum.STICKER }
  | { action: PerimeterAction.REJECT; reason: RejectReason | RateVerdict.MUTED; reply: string }
  | { action: PerimeterAction.CONTINUE };

export const MUTE_NOTICE_TEXT = muteNoticeText(INBOUND_MUTE_MS / 60_000);

export type PerimeterDeps = {
  limiter: RateLimiter;
  evidenceLimiter: RateLimiter;
  hasSession: (waId: string) => Promise<boolean>;
  sessionState: (waId: string) => Promise<string | null>;
};

type InboundToScreen = { waId: string; type: string; text?: string; messageId?: string };

type ImageScreen = { decision: PerimeterDecision } | { sessionExists: boolean };

const EVIDENCE_IMAGE_LIMIT_LABEL = `more than ${EVIDENCE_IMAGE_BURST_LIMIT} evidence images in ${EVIDENCE_IMAGE_BURST_WINDOW_MS / 1000} s`;

const traceOf = (message: { waId: string; messageId?: string }) =>
  message.messageId ? deriveTraceId(message.waId, message.messageId) : undefined;

function dropImage(message: InboundToScreen, reason: RateVerdict.THROTTLED | RateVerdict.BANNED, limit?: string): PerimeterDecision {
  logger.info("perimeter.dropped", { traceId: traceOf(message), waId: tail(message.waId), reason, messageType: message.type, limit });
  return { action: PerimeterAction.DROP, reason };
}

async function screenImage(message: InboundToScreen, deps: PerimeterDeps): Promise<ImageScreen> {
  const blocked = deps.limiter.peek(message.waId);
  if (blocked === RateVerdict.BANNED || blocked === RateVerdict.THROTTLED) return { decision: dropImage(message, blocked) };

  const verdict = deps.evidenceLimiter.check(message.waId);
  if (verdict === RateVerdict.BANNED) {
    deps.limiter.ban(message.waId);
    return { decision: dropImage(message, RateVerdict.BANNED) };
  }
  if (verdict !== RateVerdict.ALLOW) return { decision: dropImage(message, RateVerdict.THROTTLED, EVIDENCE_IMAGE_LIMIT_LABEL) };

  const state = await deps.sessionState(message.waId);
  if (state === SessionState.INCIDENCIA_AWAITING_FOTO) return { decision: { action: PerimeterAction.CONTINUE } };
  return { sessionExists: state !== null };
}

export async function screenInbound(message: InboundToScreen, deps: PerimeterDeps): Promise<PerimeterDecision> {
  const image = message.type === InboundEventType.IMAGE ? await screenImage(message, deps) : null;
  if (image && "decision" in image) return image.decision;

  const verdict = deps.limiter.check(message.waId);
  if (verdict === RateVerdict.BANNED) {
    logger.info("perimeter.dropped", { traceId: traceOf(message), waId: tail(message.waId), reason: RateVerdict.BANNED });
    return { action: PerimeterAction.DROP, reason: RateVerdict.BANNED };
  }
  if (verdict === RateVerdict.MUTED) {
    logger.info("perimeter.dropped", {
      traceId: traceOf(message),
      waId: tail(message.waId),
      reason: RateVerdict.THROTTLED,
      limit: "more than 5 in 10 s",
      noticeSent: true,
    });
    return { action: PerimeterAction.REJECT, reason: RateVerdict.MUTED, reply: MUTE_NOTICE_TEXT };
  }
  if (verdict === RateVerdict.THROTTLED) {
    logger.info("perimeter.dropped", {
      traceId: traceOf(message),
      waId: tail(message.waId),
      reason: RateVerdict.THROTTLED,
      limit: "more than 5 in 10 s",
    });
    return { action: PerimeterAction.DROP, reason: RateVerdict.THROTTLED };
  }

  const payload = checkFirstMessagePayload(message);
  if (payload.kind === PayloadVerdictKind.OK) return { action: PerimeterAction.CONTINUE };

  if (image?.sessionExists ?? (await deps.hasSession(message.waId))) return { action: PerimeterAction.CONTINUE };

  if (payload.reason === RejectReasonEnum.NOISE || payload.reason === RejectReasonEnum.STICKER) {
    logger.info("perimeter.dropped", {
      traceId: traceOf(message),
      waId: tail(message.waId),
      reason: payload.reason,
      messageType: message.type,
      inputLength: message.text?.length,
    });
    return { action: PerimeterAction.DROP, reason: payload.reason };
  }

  logger.info("perimeter.rejected", {
    traceId: traceOf(message),
    waId: tail(message.waId),
    reason: payload.reason,
    messageType: message.type,
    inputLength: message.text?.length,
  });
  return { action: PerimeterAction.REJECT, reason: payload.reason, reply: payload.reply };
}
