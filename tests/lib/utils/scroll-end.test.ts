import { describe, expect, it } from "vitest";
import { isScrolledToEnd } from "@/lib/utils/scroll-end";

describe("isScrolledToEnd", () => {
  it("is false until the box reaches its last pixels, allowing the rounding of the browser", () => {
    expect(isScrolledToEnd({ scrollTop: 0, clientHeight: 320, scrollHeight: 2000 })).toBe(false);
    expect(isScrolledToEnd({ scrollTop: 1679, clientHeight: 320, scrollHeight: 2000 })).toBe(true);
  });

  it("is true for content that already fits, and false for a box that is not laid out yet", () => {
    expect(isScrolledToEnd({ scrollTop: 0, clientHeight: 200, scrollHeight: 200 })).toBe(true);
    expect(isScrolledToEnd({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 })).toBe(false);
  });
});
