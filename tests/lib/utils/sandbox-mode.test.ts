import { describe, expect, it } from "vitest";
import { initialModeFromQuery } from "@/lib/utils/sandbox-mode";
import { SandboxMode } from "@/lib/enums/sandbox-mode";

describe("initialModeFromQuery", () => {
  it("returns the real panel outside the browser", () => {
    expect(initialModeFromQuery()).toBe(SandboxMode.REAL);
  });
});
