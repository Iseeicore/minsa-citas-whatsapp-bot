import { describe, expect, it } from "vitest";
import { isFlagDisabled, isFlagEnabled } from "@/lib/utils/env-flags";

describe("isFlagEnabled", () => {
  it("turns on only with the exact value true", () => {
    expect(isFlagEnabled("true")).toBe(true);
  });

  it.each([undefined, "", "TRUE", " true", "1", "off"])("stays off with %j", (value) => {
    expect(isFlagEnabled(value)).toBe(false);
  });
});

describe("isFlagDisabled", () => {
  it.each([
    ["off", true],
    [undefined, false],
    ["OFF", false],
    ["false", false],
  ])("reads %j as disabled: %s", (value, expected) => {
    expect(isFlagDisabled(value)).toBe(expected);
  });
});
