import { isFlagDisabled } from "@/lib/utils/env-flags";

export function isInboundRateLimitEnabled(): boolean {
  return !isFlagDisabled(process.env.INBOUND_RATE_LIMIT);
}
