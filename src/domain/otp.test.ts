// Task 7.1 (RED): pure, I/O-free format check for the OTP code, mirroring
// dni.test.ts's own discipline for isValidDniFormat. Fail-soft by
// construction — a format miss never emits a verify_code effect, it just
// re-prompts without burning an OTP attempt (design's FSM states table,
// `cita_awaiting_otp` row). The `/^[0-9]{4,8}$/` shape is a non-blocking
// open question (design's Open Questions) confined to this one file.
import { describe, expect, it } from "vitest";
import { isValidOtpFormat } from "./otp.js";

describe("isValidOtpFormat", () => {
  it("accepts a 4-digit code (the shortest allowed length)", () => {
    expect(isValidOtpFormat("1234")).toBe(true);
  });

  it("accepts an 8-digit code (the longest allowed length)", () => {
    expect(isValidOtpFormat("12345678")).toBe(true);
  });

  it("accepts a 6-digit code, trimming surrounding whitespace", () => {
    expect(isValidOtpFormat("  123456  ")).toBe(true);
  });

  it("rejects a 3-digit code (below the minimum length)", () => {
    expect(isValidOtpFormat("123")).toBe(false);
  });

  it("rejects a 9-digit code (above the maximum length)", () => {
    expect(isValidOtpFormat("123456789")).toBe(false);
  });

  it("rejects a code containing non-digit characters", () => {
    expect(isValidOtpFormat("12a456")).toBe(false);
  });

  it("rejects undefined (e.g. a media message with no text)", () => {
    expect(isValidOtpFormat(undefined)).toBe(false);
  });
});
