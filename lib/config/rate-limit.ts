const DISABLED_VALUE = "off";

export function isInboundRateLimitEnabled(): boolean {
  return process.env.INBOUND_RATE_LIMIT !== DISABLED_VALUE;
}
