import { describe, expect, it } from "vitest";
import { areAllChecked, toggleCheck } from "@/lib/utils/consent-checks";

const CHECKS = [
  { id: "a", label: "Acepto A" },
  { id: "b", label: "Acepto B" },
];

describe("consent checks", () => {
  it("toggles one box without touching the set it receives", () => {
    const empty: ReadonlySet<string> = new Set();

    const ticked = toggleCheck(empty, "a");

    expect([...ticked]).toEqual(["a"]);
    expect([...toggleCheck(ticked, "a")]).toEqual([]);
    expect(empty.size).toBe(0);
  });

  it("is complete only when every box is ticked, and a consent without boxes is complete", () => {
    expect(areAllChecked(CHECKS, new Set(["a"]))).toBe(false);
    expect(areAllChecked(CHECKS, new Set(["a", "b"]))).toBe(true);
    expect(areAllChecked([], new Set())).toBe(true);
  });
});
