import { afterEach, describe, expect, it, vi } from "vitest";
import { findTerminosUrl } from "@/lib/config/terminos";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("findTerminosUrl", () => {
  it("returns the configured page without surrounding spaces", () => {
    vi.stubEnv("TERMINOS_URL", " https://bot.minsa.test/terminos ");

    expect(findTerminosUrl()).toBe("https://bot.minsa.test/terminos");
  });

  it.each([undefined, "", "   "])("has no page when the value is %j", (value) => {
    vi.stubEnv("TERMINOS_URL", value);

    expect(findTerminosUrl()).toBeUndefined();
  });
});
