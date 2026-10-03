import { describe, expect, it } from "vitest";
import { createInboundDedupe, INBOUND_DEDUPE_TTL_MS } from "@/lib/whatsapp/webhook/inbound-dedupe";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("createInboundDedupe", () => {
  it("lets the first delivery of a message id through and refuses its redeliveries", () => {
    const dedupe = createInboundDedupe();
    expect(dedupe.claim("wamid.1")).toBe(true);
    expect(dedupe.claim("wamid.1")).toBe(false);
    expect(dedupe.claim("wamid.1")).toBe(false);
    expect(dedupe.claim("wamid.2")).toBe(true);
  });

  it("forgets an id after the TTL, so memory cannot grow without bound", () => {
    const time = clock();
    const dedupe = createInboundDedupe({ now: time.now, ttlMs: 1000 });
    expect(dedupe.claim("wamid.old")).toBe(true);
    time.advance(500);
    expect(dedupe.claim("wamid.recent")).toBe(true);
    time.advance(600);

    expect(dedupe.claim("wamid.old")).toBe(true);
    expect(dedupe.claim("wamid.recent")).toBe(false);
  });

  it("keeps ids for a day by default", () => {
    expect(INBOUND_DEDUPE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
