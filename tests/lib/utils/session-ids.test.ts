import { describe, expect, it } from "vitest";
import { hasSandboxPrefix } from "@/lib/utils/session-ids";

describe("hasSandboxPrefix", () => {
  it("recognizes the Chat-bot identifiers", () => {
    expect(hasSandboxPrefix("sandbox-1234")).toBe(true);
    expect(hasSandboxPrefix("sandbox-")).toBe(true);
  });

  it("does not take a WhatsApp number or a closed session for a Chat-bot identifier", () => {
    expect(hasSandboxPrefix("51987654321")).toBe(false);
    expect(hasSandboxPrefix("cerrada-sandbox-1234-1")).toBe(false);
  });
});
