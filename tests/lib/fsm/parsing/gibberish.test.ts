import { describe, expect, it } from "vitest";
import distritos from "@/data/peru-distritos.json";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { serializeOffered } from "@/lib/fsm/parsing/selection-matchers";
import { isGibberishPlaceText, UNRECOGNIZED_DISTRITO_TEXT } from "@/lib/fsm/parsing/gibberish";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";

type Row = { departamento: string; provincia: string; distrito: string };
const names = [...new Set((distritos as Row[]).flatMap((row) => [row.departamento, row.provincia, row.distrito]))];

describe("isGibberishPlaceText: keyboard mashing is rejected", () => {
  it.each([
    "asdfghjk",
    "qwertyuiop",
    "asdf",
    "zxcvbnm",
    "hjkl",
    "poiuytr",
    "asdf asdf",
    "aaaaaaa",
    "xxxxxxxxxx",
    "bcdfghjklm",
    "jjjjjj hhhhhh",
  ])("%s", (text) => {
    expect(isGibberishPlaceText(text)).toBe(true);
  });

  it.each(["", "   ", "abc", "xy", "12345", "!!!!", "🙂🙂🙂🙂", "a|b|c"])("too little to be a name: %j", (text) => {
    expect(isGibberishPlaceText(text)).toBe(true);
  });
});

describe("isGibberishPlaceText: real places, typos and sentences are NOT rejected", () => {
  it("accepts every official department, province and district name", () => {
    const rejected = names.filter((name) => name.replace(/[^\p{L}]/gu, "").length >= 4 && isGibberishPlaceText(name));
    expect(rejected).toEqual([]);
  });

  it.each([
    "Mirafloers",
    "Sen BorjU",
    "Lurigancjo",
    "San Juan de Lurigancho",
    "villa maria del triunfo",
    "no se mi distrito es cerca del parque",
    "vivo en Miraflores",
    "Ccorca",
    "Chinchaypujio",
    "Llochegua",
    "Secclla",
    "Huancavelica",
  ])("%s", (text) => {
    expect(isGibberishPlaceText(text)).toBe(false);
  });
});

const FROM = "sandbox-gibberish";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const sent = (r: HandlerResult) => r.effects.filter((e): e is SendEffect => !isQueryEffect(e));
const queries = (r: HandlerResult) => r.effects.filter(isQueryEffect);
const texts = (r: HandlerResult) => sent(r).map((e) => (e as { text: string }).text);

describe("free-text district step: gibberish never reaches the AI", () => {
  const session = (): Session => ({ state: "cita_awaiting_distrito_ai", slots: { citaBearer: "token" }, counters: {} });

  it.each(["asdfghjk", "qwertyuiop", "asdf", "zxcvbnm", "aaaaaaaa"])("%s gets the fixed message and no query", (value) => {
    const result = handle(session(), text(value));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
    expect(texts(result)).toEqual([UNRECOGNIZED_DISTRITO_TEXT]);
  });

  it("the message is the fixed one asked for", () => {
    expect(UNRECOGNIZED_DISTRITO_TEXT).toBe("No reconocimos ese distrito. Por favor escribe el nombre de tu distrito o comuna:");
  });

  it("a typo of a real district still goes to the AI (only gibberish is blocked)", () => {
    const result = handle(session(), text("Mirafloers"));

    expect(result.session.state).toBe("cita_distrito_ai_pending");
    expect(queries(result)[0].kind).toBe("resolve_distrito_ai");
  });

  it("a real 3-letter district resolves locally before any gibberish check ('Ate')", () => {
    const result = handle(session(), text("Ate"));

    expect(texts(result)).not.toContain(UNRECOGNIZED_DISTRITO_TEXT);
    expect(["cita_ubigeo_pending", "cita_awaiting_distrito_disambiguation"]).toContain(result.session.state);
  });
});

describe("district disambiguation list: gibberish never reaches the AI", () => {
  const offered = {
    text: "Encontramos varias opciones. ¿Cuál es tu distrito?",
    rows: [
      { id: "Lima|Lima|San Juan de Lurigancho", title: "San Juan de Lurigancho", description: "Lima — Lima" },
      { id: "Lima|Huarochirí|San Juan de Iris", title: "San Juan de Iris", description: "Huarochirí — Lima" },
    ],
  };
  const session = (): Session => ({
    state: "cita_awaiting_distrito_disambiguation",
    slots: { citaBearer: "token", citaOffered: serializeOffered(offered) },
    counters: {},
  });

  it.each(["asdf", "asdfghjk", "qwertyuiop"])("%s: fixed message, the list again, no query", (value) => {
    const result = handle(session(), text(value));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_distrito_disambiguation");
    expect(texts(result)[0]).toBe(UNRECOGNIZED_DISTRITO_TEXT);
    expect(sent(result).some((e) => e.kind === "send_interactive_list")).toBe(true);
  });

  it("a corrected real district still re-runs the chain", () => {
    const result = handle(session(), text("Barranco"));
    expect(queries(result)[0].kind).toBe("search_ubigeo");
  });
});
