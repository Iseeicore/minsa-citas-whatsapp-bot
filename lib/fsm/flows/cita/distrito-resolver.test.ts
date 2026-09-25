import { describe, expect, it } from "vitest";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { looksLikePlaceName, resolveDistritoCandidates, resolveDistritoText } from "@/lib/fsm/flows/cita/distrito-resolver";
import type { HandlerResult, SendEffect, Session } from "@/lib/fsm/core/types";

// Characterization tests for the district-resolution pipeline, moved here from
// lib/fsm/flows/cita/handlers-cita.ts (where it was private) so lib/fsm/flows/cita/steps/no-coverage.ts
// can reuse it without a circular import. Nothing about the logic changed —
// these pin the exact behavior the FSM-level tests (handlers-cita.test.ts,
// district-and-coverage.test.ts) already exercise indirectly through `handle()`.

const session = (extra: Session["slots"] = {}): Session => ({
  state: "cita_awaiting_distrito_ai",
  slots: { citaBearer: "token", ...extra },
  counters: {},
});

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

describe("looksLikePlaceName: guards the local -> AI chain", () => {
  it.each(["San Borja", "Miraflores", "San Juan de Lurigancho", "Ate", "O'Higgins", "Villa El Salvador"])(
    "%j is",
    (text) => {
      expect(looksLikePlaceName(text)).toBe(true);
    },
  );

  it.each(["quee ?", "a|b|c", "12345", "no, mejor en Miraflores", "", "a"])("%j is not", (text) => {
    expect(looksLikePlaceName(text)).toBe(false);
  });
});

describe("resolveDistritoText: local dataset first, then gibberish, then AI", () => {
  it("an exact match in Lima resolves directly and queries its ubigeo", () => {
    const result = resolveDistritoText(session(), "San Borja", undefined);

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(result.session.slots.citaDistrito).toBe("SAN BORJA"); // the padrón's own casing
    expect(queries(result)).toEqual([
      { kind: "search_ubigeo", payload: { departamento: "LIMA", provincia: "LIMA", distrito: "SAN BORJA" } },
    ]);
  });

  it("a name that matches more than once in Lima asks to disambiguate", () => {
    const result = resolveDistritoText(session(), "Miraflores", undefined);

    expect(result.session.state).toBe("cita_awaiting_distrito_disambiguation");
    expect(sent(result)[0]).toMatchObject({ kind: "send_interactive_list" });
  });

  it("a district named at the tail of a sentence resolves the same way", () => {
    const result = resolveDistritoText(session(), "Quiero una cita en San Borja", undefined);

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(result.session.slots.citaDistrito).toBe("SAN BORJA");
  });

  it("gibberish never reaches the AI query", () => {
    const result = resolveDistritoText(session(), "asdfghjk", undefined);

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_distrito_ai"); // unchanged
    expect(sent(result)[0]).toMatchObject({ text: expect.stringContaining("No reconocimos ese distrito") });
  });

  it("a real-looking name the local dataset can't find falls to the AI query", () => {
    const result = resolveDistritoText(session(), "Sam Borja", undefined);

    expect(result.session.state).toBe("cita_distrito_ai_pending");
    expect(queries(result)).toEqual([{ kind: "resolve_distrito_ai", payload: { distritoText: "Sam Borja", contextText: undefined } }]);
  });

  it("a district outside Lima resolves to zero candidates within scope, not a local match", () => {
    const result = resolveDistritoText(session(), "Chachapoyas", undefined);

    // Not a Lima district, and not gibberish either: goes to the AI, same as
    // any name the local (Lima-filtered) dataset doesn't resolve.
    expect(result.session.state).toBe("cita_distrito_ai_pending");
  });
});

describe("resolveDistritoCandidates: what to do with N candidates (shared by the local and AI paths)", () => {
  const candidate = (departamento: string, provincia: string, distrito: string) => ({ departamento, provincia, distrito });

  it("one candidate resolves directly and queries the ubigeo", () => {
    const result = resolveDistritoCandidates(session(), [candidate("LIMA", "LIMA", "SAN BORJA")]);

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(queries(result)).toEqual([
      { kind: "search_ubigeo", payload: { departamento: "LIMA", provincia: "LIMA", distrito: "SAN BORJA" } },
    ]);
  });

  it("candidates outside Lima are filtered out before counting", () => {
    const result = resolveDistritoCandidates(session(), [
      candidate("LIMA", "LIMA", "SAN ISIDRO"),
      candidate("HUANCAVELICA", "HUAYTARA", "SAN ISIDRO"),
    ]);

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(result.session.slots.citaDepartamento).toBe("LIMA");
  });

  it("more than one Lima candidate asks to disambiguate", () => {
    const result = resolveDistritoCandidates(session(), [
      candidate("LIMA", "LIMA", "MIRAFLORES"),
      candidate("AREQUIPA", "AREQUIPA", "MIRAFLORES"),
      candidate("LIMA", "YAUYOS", "MIRAFLORES"),
    ]);

    // Only the two Lima ones remain.
    expect(result.session.state).toBe("cita_awaiting_distrito_disambiguation");
    expect(sent(result)[0]).toMatchObject({ kind: "send_interactive_list", rows: expect.arrayContaining([expect.objectContaining({ title: "MIRAFLORES" })]) });
    const rows = (sent(result)[0] as { rows: Array<{ id: string }> }).rows;
    expect(rows).toHaveLength(2);
  });

  it("zero candidates within Lima redirects to the national booking site", () => {
    const result = resolveDistritoCandidates(session(), [candidate("CUSCO", "CUSCO", "CUSCO")]);

    expect(result.session.state).toBe("cita_national_redirect");
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)[0]).toMatchObject({ kind: "send_cta_url" });
  });

  it("an empty candidate list also redirects to the national booking site", () => {
    expect(resolveDistritoCandidates(session(), []).session.state).toBe("cita_national_redirect");
  });
});
