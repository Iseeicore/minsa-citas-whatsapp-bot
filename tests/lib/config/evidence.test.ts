import { describe, expect, it } from "vitest";
import { evidenceImageMaxBytes, evidenceImageMaxMegabytes, invalidEvidenceImageMaxMb } from "@/lib/config/evidence";
import { checkConfig, CONFIG_ERRORS } from "@/lib/config/config-errors";

const MEGABYTE = 1024 * 1024;
const HEALTHY_ENV = { MINSA_DIGITAL_APP_URL: "https://dminsadigital.minsa.gob.pe" };

describe("EVIDENCE_IMAGE_MAX_MB", () => {
  it("defaults to 5 MB when it is not defined or is empty", () => {
    expect(evidenceImageMaxMegabytes({})).toBe(5);
    expect(evidenceImageMaxMegabytes({ EVIDENCE_IMAGE_MAX_MB: "" })).toBe(5);
    expect(evidenceImageMaxMegabytes({ EVIDENCE_IMAGE_MAX_MB: "  " })).toBe(5);
    expect(evidenceImageMaxBytes({})).toBe(5 * MEGABYTE);
  });

  it("takes any whole number from 1 to 5, the Meta ceiling", () => {
    expect(evidenceImageMaxMegabytes({ EVIDENCE_IMAGE_MAX_MB: "3" })).toBe(3);
    expect(evidenceImageMaxMegabytes({ EVIDENCE_IMAGE_MAX_MB: " 1 " })).toBe(1);
    expect(evidenceImageMaxMegabytes({ EVIDENCE_IMAGE_MAX_MB: "5" })).toBe(5);
    expect(evidenceImageMaxBytes({ EVIDENCE_IMAGE_MAX_MB: "3" })).toBe(3 * MEGABYTE);
  });

  it.each(["0", "9", "abc", "2.5", "-1", "0x3"])("ignores %s and keeps the 5 MB default", (value) => {
    expect(evidenceImageMaxMegabytes({ EVIDENCE_IMAGE_MAX_MB: value })).toBe(5);
    expect(invalidEvidenceImageMaxMb({ EVIDENCE_IMAGE_MAX_MB: value })).toBe(value);
  });

  it("reports an invalid value through the config check, and only then", () => {
    expect(checkConfig({ ...HEALTHY_ENV, EVIDENCE_IMAGE_MAX_MB: "9" })).toEqual([
      { code: "EVIDENCE_IMAGE_MAX_MB_INVALID", value: "9", message: CONFIG_ERRORS.EVIDENCE_IMAGE_MAX_MB_INVALID.message },
    ]);
    expect(checkConfig({ ...HEALTHY_ENV, EVIDENCE_IMAGE_MAX_MB: "abc" })).toHaveLength(1);
    expect(checkConfig({ ...HEALTHY_ENV, EVIDENCE_IMAGE_MAX_MB: "3" })).toEqual([]);
    expect(checkConfig({ ...HEALTHY_ENV, EVIDENCE_IMAGE_MAX_MB: "" })).toEqual([]);
    expect(checkConfig(HEALTHY_ENV)).toEqual([]);
  });
});
