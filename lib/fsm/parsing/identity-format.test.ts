import { describe, expect, it } from "vitest";
import { isValidDniFormat, isValidOtpFormat } from "./identity-format";

describe("isValidDniFormat", () => {
  it("accepts exactly 8 digits (trimmed)", () => {
    expect(isValidDniFormat("12345678")).toBe(true);
    expect(isValidDniFormat(" 12345678 ")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidDniFormat("1234567")).toBe(false);
    expect(isValidDniFormat("123456789")).toBe(false);
    expect(isValidDniFormat("1234567a")).toBe(false);
  });
});

describe("isValidOtpFormat", () => {
  it("accepts 4 to 8 digits", () => {
    expect(isValidOtpFormat("1234")).toBe(true);
    expect(isValidOtpFormat("12345678")).toBe(true);
  });

  it("rejects short, long, or non-numeric codes", () => {
    expect(isValidOtpFormat("123")).toBe(false);
    expect(isValidOtpFormat("123456789")).toBe(false);
    expect(isValidOtpFormat("12a4")).toBe(false);
  });
});
