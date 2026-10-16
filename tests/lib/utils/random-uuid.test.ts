import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuid } from "@/lib/utils/random-uuid";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomUuid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a different version 4 UUID each time", () => {
    const first = randomUuid();
    const second = randomUuid();

    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(first).not.toBe(second);
  });

  it("builds a version 4 UUID from getRandomValues when randomUUID is missing, without touching Math.random", () => {
    const mathRandom = vi.spyOn(Math, "random");
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) });

    expect(randomUuid()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(mathRandom).not.toHaveBeenCalled();
  });
});
