import { describe, expect, it } from "vitest";
import { avatarColor, initials } from "@/lib/utils/avatar";

describe("avatarColor", () => {
  it("returns the same color for the same seed every time", () => {
    expect(avatarColor("51987654321")).toBe(avatarColor("51987654321"));
  });

  it("returns one of the fixed Tailwind background classes", () => {
    expect(avatarColor("51987654321")).toMatch(/^bg-\w+-500$/);
  });
});

describe("initials", () => {
  it("returns the first two letters of a single word", () => {
    expect(initials("Wanda")).toBe("WA");
  });

  it("returns the first letter of the first two words", () => {
    expect(initials("Wanda Maximoff")).toBe("WM");
  });

  it("ignores extra whitespace", () => {
    expect(initials("  Wanda   Maximoff  ")).toBe("WM");
  });

  it("returns a placeholder for an empty name", () => {
    expect(initials("")).toBe("?");
  });
});
