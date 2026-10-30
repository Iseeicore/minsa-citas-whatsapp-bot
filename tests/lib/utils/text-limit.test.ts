import { describe, expect, it } from "vitest";
import { cutToLimit } from "@/lib/utils/text-limit";

describe("cutToLimit", () => {
  it("keeps a text that fits, without marking it as cut", () => {
    expect(cutToLimit("hola", 4)).toEqual({ text: "hola", cut: false });
  });

  it("cuts a text over the limit to exactly the limit and marks it as cut", () => {
    expect(cutToLimit("holas", 4)).toEqual({ text: "hola", cut: true });
  });
});
