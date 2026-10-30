import { describe, expect, it } from "vitest";
import { cutToLimit } from "@/lib/utils/text-limit";

describe("cutToLimit", () => {
  it.each([
    ["keeps a text that fits, without marking it as cut", "hola", { text: "hola", cut: false }],
    ["cuts a text over the limit to exactly the limit and marks it as cut", "holas", { text: "hola", cut: true }],
  ])("%s", (_case, text, expected) => {
    expect(cutToLimit(text, 4)).toEqual(expected);
  });
});
