import { describe, expect, it } from "vitest";
import { namesMatch, normalizeNameTokens } from "./reniec-name-match.js";

// Spec (identity-verification / RENIEC Word-Set Name Match): word-set
// containment — every word the citizen typed (uppercased, split on
// whitespace) must appear among the words of RENIEC's returned full name
// (nombres + apellidoPaterno + apellidoMaterno, uppercased, split). Order-
// independent set containment, NOT equality, NOT fuzzy/edit-distance.
// Replicated exactly from the reference Twilio implementation (design D-
// numbered rationale: "Known weakness, deliberately preserved" — a single
// correct first name matches, and no minimum-token rule is added).

describe("normalizeNameTokens", () => {
  it("uppercases and splits on whitespace", () => {
    expect(normalizeNameTokens("juan perez")).toEqual(["JUAN", "PEREZ"]);
  });

  it("strips accents (accent-insensitive)", () => {
    expect(normalizeNameTokens("José García")).toEqual(["JOSE", "GARCIA"]);
  });

  it("folds Ñ to N", () => {
    expect(normalizeNameTokens("Muñoz")).toEqual(["MUNOZ"]);
  });

  it("collapses punctuation into a separator and drops empty tokens", () => {
    expect(normalizeNameTokens("  perez,   lopez  ")).toEqual(["PEREZ", "LOPEZ"]);
  });
});

describe("namesMatch", () => {
  const official = { nombres: "JUAN CARLOS", apellidoPaterno: "PEREZ", apellidoMaterno: "LOPEZ" };

  it("matches when the citizen types the full official name (any order, any case)", () => {
    expect(namesMatch("lopez perez juan carlos", official)).toBe(true);
  });

  it("matches on a subset — a single surname that is one of the official words (containment, not equality)", () => {
    expect(namesMatch("perez", official)).toBe(true);
  });

  it("matches case- and accent-insensitively", () => {
    expect(namesMatch("JUAN cárlos", official)).toBe(true);
  });

  it("matches Ñ against the same official name folded to N", () => {
    const withEnye = { nombres: "JUAN CARLOS", apellidoPaterno: "MUÑOZ", apellidoMaterno: "LOPEZ" };
    expect(namesMatch("munoz", withEnye)).toBe(true);
  });

  it("does not match when the citizen types a word absent from the official name", () => {
    expect(namesMatch("perez garcia", official)).toBe(false);
  });

  it("does not match on empty citizen input", () => {
    expect(namesMatch("", official)).toBe(false);
  });

  it("does not match on whitespace-only citizen input", () => {
    expect(namesMatch("   ", official)).toBe(false);
  });
});
