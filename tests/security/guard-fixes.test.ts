import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractCitaHints } from "@/lib/fsm/flows/cita/cita-hints";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { PLACE_NAME_WORDS } from "@/lib/security/place-names";

beforeEach(() => {
  vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const action = (text: string) => evaluateLexicalGuard(text).action;

describe("A.1c canonical initials are not the insult 'csm' / 'ptm'", () => {
  it.each(["Atentamente C. S. M.", "Dra. Rosario P. T. M.", "Luis C. T. M. Rojas", "Att. C. S. M"])(
    "ALLOW: %s",
    (text) => {
      expect(action(text)).toBe("ALLOW");
    },
  );

  it.each(["c s m", "c.s.m", "C S M", "C-S-M", "csm", "i.d.i.o.t.a", "m.i.e.r.d.a", "p t m", "1.m.b.3.c.1.l."])(
    "the evasion %s is still caught",
    (text) => {
      expect(action(text)).toBe("DROP_AND_WARN");
    },
  );

  it("documents the accepted trade-off: an abuser typing canonical initials slips through", () => {
    expect(action("Ustedes son unos C. S. M.")).toBe("ALLOW");
  });
});

describe("A.1d place names are exempt from fuzzy matching", () => {
  it("covers the district words that used to be flagged", () => {
    expect(PLACE_NAME_WORDS.has("tarata")).toBe(true);
    expect(PLACE_NAME_WORDS.has("taraco")).toBe(true);
    expect(action("Tarata")).toBe("ALLOW");
    expect(action("Taraco")).toBe("ALLOW");
    expect(action("vivo en Tarata, Tacna")).toBe("ALLOW");
  });

  it("does not weaken insult detection", () => {
    expect(action("eres un idiota")).toBe("DROP_AND_WARN");
    expect(action("cojudo")).toBe("DROP_AND_WARN");
    expect(action("imbecill")).toBe("DROP_AND_WARN");
    expect(action("estupidoo")).toBe("DROP_AND_WARN");
  });
});

describe("B.3 extractCitaHints (specialty and district from an insulting request)", () => {
  it("extracts both from the sample message", () => {
    expect(extractCitaHints("Apúrense cojudos quiero cita de odontología en San Borja")).toEqual({
      especialidad: "Odontología",
      distrito: "San Borja",
    });
  });

  it.each([
    ["quiero cita de pediatría en Miraflores", { especialidad: "Pediatría", distrito: "Miraflores" }],
    ["denme una cita en Lurigancho", { distrito: "Lurigancho" }],
    ["cita de ginecología", { especialidad: "Ginecología" }],
    ["quiero una cita", {}],
    ["cita cardiología por Barranco", { especialidad: "Cardiología", distrito: "Barranco" }],
  ])("%s", (message, expected) => {
    expect(extractCitaHints(message)).toEqual(expected);
  });

  it("does not invent a district from unrelated words or a non-Lima place", () => {
    expect(extractCitaHints("quiero cita para mi hijo por favor")).toEqual({});
    expect(extractCitaHints("cita en Tarata")).toEqual({});
  });
});
