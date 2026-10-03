import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import { deriveTraceId } from "@/lib/observability/tracer";
import { checkFirstMessagePayload, type RejectReason } from "@/lib/security/payload-filter";
import { DEFAULT_MUTE_MS, type RateLimiter } from "@/lib/security/rate-limiter";
import { RateVerdict } from "@/lib/enums/rate-verdict";
import { RejectReason as RejectReasonEnum } from "@/lib/enums/reject-reason";
import { PerimeterAction } from "@/lib/enums/perimeter-action";

export type PerimeterDecision =
  | { action: PerimeterAction.DROP; reason: RateVerdict.THROTTLED | RateVerdict.BANNED | RejectReasonEnum.NOISE | RejectReasonEnum.STICKER }
  | { action: PerimeterAction.REJECT; reason: RejectReason | RateVerdict.MUTED; reply: string }
  | { action: PerimeterAction.CONTINUE };

export const MUTE_NOTICE_TEXT = `Está enviando mensajes muy rápido. Por favor, espere ${DEFAULT_MUTE_MS / 60_000} minutos y vuelva a escribirnos.`;

export type PerimeterDeps = {
  limiter: RateLimiter;
  hasSession: (waId: string) => Promise<boolean>;
};

const traceOf = (message: { waId: string; messageId?: string }) =>
  message.messageId ? deriveTraceId(message.waId, message.messageId) : undefined;

export async function screenInbound(
  message: { waId: string; type: string; text?: string; messageId?: string },
  deps: PerimeterDeps,
): Promise<PerimeterDecision> {
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
  if (payload.kind === "ok") return { action: PerimeterAction.CONTINUE };

  if (await deps.hasSession(message.waId)) return { action: PerimeterAction.CONTINUE };

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
