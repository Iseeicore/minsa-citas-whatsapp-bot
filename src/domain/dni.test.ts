import { describe, expect, it } from "vitest";
import { isValidDniFormat } from "./dni.js";

// Spec (identity-verification / DNI Format Validation): a pure, I/O-free
// function validating a DNI as exactly 8 ASCII digits, no other characters.
// This MUST run before any RENIEC call — no external call happens here.
describe("isValidDniFormat", () => {
  it("accepts exactly 8 digits", () => {
    expect(isValidDniFormat("12345678")).toBe(true);
  });

  it("rejects 7 digits (too short)", () => {
    expect(isValidDniFormat("1234567")).toBe(false);
  });

  it("rejects 9 digits (too long)", () => {
    expect(isValidDniFormat("123456789")).toBe(false);
  });

  it("rejects a value containing letters", () => {
    expect(isValidDniFormat("1234567a")).toBe(false);
  });

  it("rejects a value containing an internal space", () => {
    expect(isValidDniFormat("1234 567")).toBe(false);
  });

  it("accepts a value with surrounding whitespace, trimmed before validation", () => {
    expect(isValidDniFormat("  12345678  ")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidDniFormat("")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidDniFormat(undefined)).toBe(false);
  });
});
