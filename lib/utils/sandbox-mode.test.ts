import { describe, expect, it } from "vitest";
import { initialModeFromQuery } from "@/lib/utils/sandbox-mode";

describe("initialModeFromQuery", () => {
  it("returns 'real' outside the browser", () => {
    expect(initialModeFromQuery()).toBe("real");
  });
});
