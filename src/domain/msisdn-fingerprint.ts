import crypto from "node:crypto";

// D18: extracted from inbound-conversation-event-log-view.ts so the session
// store (D17) and the log view share one construction instead of two
// independent HMAC implementations that could silently drift.
//
// Keyed HMAC, not masking (last-four digits are still semi-identifying) and
// not plain SHA-256 (the MSISDN space is small enough to brute-force
// exhaustively, so an unkeyed digest is not a redaction).
//
// D17: this is PSEUDONYMIZATION, NOT ENCRYPTION. There is no inverse and
// there will never be one. Anything that needs the real MSISDN must take it
// from the in-flight InboundConversationEvent, never from a stored digest.

/** Full 64-hex keyed HMAC-SHA256 digest of the MSISDN — used as a lookup key. */
export function msisdnDigest(msisdn: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(msisdn).digest("hex");
}

/** 12-hex truncation of {@link msisdnDigest} — log correlation only, not a lookup key. */
export function msisdnFingerprint(msisdn: string, secret: string): string {
  return msisdnDigest(msisdn, secret).slice(0, 12);
}
