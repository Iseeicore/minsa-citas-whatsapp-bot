import { describe, expect, it } from "vitest";
import { parseAllowedOrigins } from "@/lib/security/allowed-origins";

describe("parseAllowedOrigins", () => {
  it("reads nothing from an unset or empty value", () => {
    expect(parseAllowedOrigins(undefined)).toEqual({ origins: [], invalid: [] });
    expect(parseAllowedOrigins("  ,  ")).toEqual({ origins: [], invalid: [] });
  });

  it("reduces each entry to its origin, so a trailing slash or a path still matches the browser's Origin", () => {
    expect(parseAllowedOrigins("https://dminsadigital.minsa.gob.pe/, https://front.example.org/app")).toEqual({
      origins: ["https://dminsadigital.minsa.gob.pe", "https://front.example.org"],
      invalid: [],
    });
  });

  it("sets aside every entry that is not a URL, a wildcard included", () => {
    expect(parseAllowedOrigins("dminsadigital.minsa.gob.pe, *, https://ok.example.org")).toEqual({
      origins: ["https://ok.example.org"],
      invalid: ["dminsadigital.minsa.gob.pe", "*"],
    });
  });
});
