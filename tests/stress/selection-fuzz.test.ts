import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { serializeOffered, type OfferedList } from "@/lib/fsm/parsing/selection-matchers";
import { packHoraSlots } from "@/lib/fsm/parsing/time-parser";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { createRandom, pick } from "@/tests/support/prng";

const FROM = "sandbox-fuzz";

const list = (text: string, rows: Array<[string, string, string?]>): OfferedList => ({
  text,
  rows: rows.map(([id, title, description]) => ({ id, title, description })),
});

const ubigeo = list("Selecciona tu ubigeo:", [
  ["150101", "San Juan de Lurigancho", "Lima — Lima"],
  ["150701", "San Juan de Iris", "Huarochirí — Lima"],
]);
const especialidades = list("Selecciona la especialidad:", [
  ["01", "MEDICINA GENERAL", "5 cupo(s) disponibles"],
  ["02", "ODONTOLOGIA", "3 cupo(s) disponibles"],
]);
const establecimientos = list("Selecciona el establecimiento:", [
  ["0000123", "CENTRO DE SALUD SAN BORJA"],
  ["0000456", "HOSPITAL DE LURIGANCHO"],
]);
const fechas = list("Selecciona la fecha:", [
  ["22/09/2026", "22/09/2026"],
  ["23/09/2026", "23/09/2026"],
]);
const horas = list("Selecciona el horario:", [
  ["08:00|08:30", "08:00 - 08:30"],
  ["13:00|13:30", "13:00 - 13:30"],
]);
const distritos = list("Encontramos varias opciones. ¿Cuál es tu distrito?", [
  ["Lima|Lima|San Juan de Lurigancho", "San Juan de Lurigancho", "Lima — Lima"],
  ["Lima|Huarochirí|San Juan de Iris", "San Juan de Iris", "Huarochirí — Lima"],
]);

type StepSpec = {
  state: string;
  offered: OfferedList;
  idChecks: Record<string, string>;
};

const STEPS: StepSpec[] = [
  { state: "cita_awaiting_ubigeo_select", offered: ubigeo, idChecks: { list_especialidades: "ubigeo" } },
  { state: "cita_awaiting_especialidad_select", offered: especialidades, idChecks: { list_establecimientos: "especialidadId" } },
  { state: "cita_awaiting_establecimiento_select", offered: establecimientos, idChecks: { list_fechas: "codEess" } },
  { state: "cita_awaiting_fecha_select", offered: fechas, idChecks: { list_horas: "fecha" } },
  { state: "cita_awaiting_hora_select", offered: horas, idChecks: {} },
  { state: "cita_awaiting_distrito_disambiguation", offered: distritos, idChecks: {} },
];

const ALLOWED_AI_KINDS = new Set(["resolve_fecha_ai", "extract_selection_hints", "resolve_distrito_ai"]);

function sessionFor(step: StepSpec): Session {
  return {
    state: step.state,
    slots: {
      citaBearer: "token",
      citaUbigeo: "150101",
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "22/09/2026",
      citaDni: "12345678",
      citaOffered: serializeOffered(step.offered),
      citaHorasDia: packHoraSlots([
        { start: "08:00", end: "08:30", cupos: 1 },
        { start: "13:00", end: "13:30", cupos: 1 },
      ]),
    },
    counters: {},
  };
}

const TOKENS = [
  "1", "2", "3", "10", "99", "0", "-1", "la", "el", "a las", "y media", "pm", "am", "tarde", "mañana",
  "noche", "mediodía", "hoy", "lunes", "22/09", "san juan", "lurigancho", "odontología", "hospital",
  "semana", "próxima", "cojudo", "hdp", "sí", "no", "🕐", "😡", "||", "%", "<script>alert(1)</script>",
  "'; DROP TABLE sessions;--", "\n", "\t", "   ", "１２", "٣", "a|b|c", "150101", "01|02", "09:99",
  "8:45", "13:00|13:30", "hora_confirm_si", "hora_pagina_siguiente", "continuar_menu", "reclamo_con_dni",
];

function randomText(random: () => number): string {
  const parts = 1 + Math.floor(random() * 6);
  const words = Array.from({ length: parts }, () => pick(random, TOKENS));
  if (random() < 0.1) words.push("x".repeat(Math.floor(random() * 3000)));
  if (random() < 0.05) {
    words.push(String.fromCodePoint(...Array.from({ length: 20 }, () => 0x20 + Math.floor(random() * 0xd000))));
  }
  return words.join(random() < 0.5 ? " " : "");
}

function assertSafe(step: StepSpec, result: HandlerResult, input: string) {
  const offeredIds = step.offered.rows.map((row) => row.id);

  for (const effect of result.effects.filter(isQueryEffect)) {
    expect(effect.kind, `input ${JSON.stringify(input)}`).not.toBe("book_appointment");

    const key = step.idChecks[effect.kind];
    if (key) {
      expect(offeredIds, `input ${JSON.stringify(input)}`).toContain(String(effect.payload[key]));
    } else {
      const allowed = ALLOWED_AI_KINDS.has(effect.kind) || effect.kind === "search_ubigeo";
      expect(allowed, `${effect.kind} for ${JSON.stringify(input)}`).toBe(true);
    }
  }

  expect(result.session.state.startsWith("cita_") || result.session.state === "main_menu").toBe(true);
}

describe("Step 5 robustness: hostile typed text in every selection step", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(() => {
      throw new Error("network call during a pure handler test");
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(STEPS.map((step) => [step.state, step] as const))(
    "%s: 1500 random inputs never throw, never book and never forward an id that was not offered",
    (_state, step) => {
      const random = createRandom(0xc0ffee);

      for (let i = 0; i < 1500; i++) {
        const input = randomText(random);
        let result!: HandlerResult;
        expect(() => {
          result = handle(sessionFor(step), { from: FROM, type: "text", text: input });
        }, `input ${JSON.stringify(input.slice(0, 60))}`).not.toThrow();
        assertSafe(step, result, input.slice(0, 60));
      }

      expect(fetchSpy).not.toHaveBeenCalled();
    },
    30_000,
  );

  it.each(STEPS.map((step) => [step.state, step] as const))(
    "%s: taps on ids that were not offered are rejected",
    (_state, step) => {
      for (const id of ["999999", "01|02", "a|b|c", "'; DROP TABLE x;--", "", "hora_confirm_si", "00:00|00:00"]) {
        const result = handle(sessionFor(step), { from: FROM, type: "list", listId: id });
        const offeredIds = step.offered.rows.map((row) => row.id);

        const queried = result.effects.filter(isQueryEffect);
        for (const effect of queried) {
          expect(effect.kind).not.toBe("book_appointment");
          const key = step.idChecks[effect.kind];
          if (key) expect(offeredIds).toContain(String(effect.payload[key]));
        }
      }
    },
  );

  it("non-text, non-tap events (an image) are ignored safely in every step", () => {
    for (const step of STEPS) {
      const result = handle(sessionFor(step), { from: FROM, type: "image", mediaDataUri: "data:image/png;base64,AAAA" });
      expect(result.effects.filter(isQueryEffect)).toHaveLength(0);
    }
  });

  const aiCalls = (step: StepSpec, input: string) =>
    handle(sessionFor(step), { from: FROM, type: "text", text: input })
      .effects.filter(isQueryEffect)
      .filter((effect) => ALLOWED_AI_KINDS.has(effect.kind));

  it("AI helpers are not reached by pure junk (digits, symbols, emoji, ids) in any step", () => {
    for (const step of STEPS) {
      for (const input of ["12345", "%%%%", "🙂🙂🙂", "a|b|c", "xx", "asdf"]) {
        if (step.state === "cita_awaiting_distrito_disambiguation" && input === "asdf") continue;
        expect(aiCalls(step, input), `${step.state} <- ${input}`).toHaveLength(0);
      }
    }
  });

  it("keyboard mashing in the district disambiguation list does not spend an AI call", () => {
    expect(aiCalls(STEPS[5], "asdf")).toHaveLength(0);
    expect(aiCalls(STEPS[5], "qwertyuiop")).toHaveLength(0);
    expect(aiCalls(STEPS[5], "asdfghjk")).toHaveLength(0);
  });

  it("a genuine typo of a district still gets its AI call", () => {
    expect(aiCalls(STEPS[5], "Mirafloers").length).toBeGreaterThan(0);
  });
});
