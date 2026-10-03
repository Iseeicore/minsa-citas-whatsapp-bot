import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai/main-menu-intent";
import { extractCitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { configureLogger } from "@/lib/observability/logger";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { detectCitaRequest, isContinueReply } from "@/lib/fsm/routing/menu-shortcuts";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";

const FROM = "sandbox-main-menu";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const menu = (slots: Session["slots"] = {}): Session => ({ state: "main_menu", slots, counters: {} });

const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const FIELD_TEST_MESSAGE = "Quiero una cita en San Juan de Lurigancho para poder atenderme en medicina general";

describe("an explicit cita request typed in the main menu", () => {
  it("goes straight to the Cita flow with the specialty and district seeded, without asking the AI", () => {
    const result = handle(menu(), text(FIELD_TEST_MESSAGE));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(normalizeText(String(result.session.slots[SlotKey.CITA_DISTRITO_HINT_TEXT]))).toBe("SAN JUAN DE LURIGANCHO");
    expect(normalizeText(String(result.session.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]))).toBe("MEDICINA GENERAL");
    expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBe(FIELD_TEST_MESSAGE);
    expect(sent(result)[0]).toMatchObject({ kind: "send_text", text: expect.stringContaining("ingresa tu número de documento") });
  });

  it.each([
    "quiero una cita de odontología",
    "necesito agendar en Miraflores",
    "quiero sacar un turno de pediatría en San Borja",
    "Si claro deseo una cita",
    "quiero una cita",
  ])("also handles %j (no especialidad/distrito needed to skip the AI)", (message) => {
    const result = handle(menu(), text(message));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_dni");
  });

  it.each([
    ["an existing appointment", "quiero cancelar mi cita de odontología en Miraflores"],
    ["an existing appointment", "cuándo es mi cita de pediatría en San Borja"],
    ["a complaint", "quiero poner una queja de la cita en Miraflores"],
    ["no cita at all", "hay odontología en San Borja"],
  ])("leaves %s to the AI: %j", (_why, message) => {
    const result = handle(menu(), text(message));

    expect(result.session.state).toBe("main_menu_intent_pending");
    expect(queries(result).map((effect) => effect.kind)).toEqual(["analyze_main_menu_intent"]);
  });

  it("reads the same hints extractCitaHints finds", () => {
    expect(detectCitaRequest(FIELD_TEST_MESSAGE)).toEqual(extractCitaHints(FIELD_TEST_MESSAGE));
    expect(extractCitaHints("cita de medico general")).toMatchObject({ especialidad: "Medicina General" });
  });
});

describe("when the AI is used and answers cita", () => {
  const aiAnswer = (result: unknown): QueryResultEvent => ({
    from: FROM,
    type: "query_result",
    queryKind: "analyze_main_menu_intent",
    result,
  });

  it("moves to the Cita flow with what the model extracted", () => {
    const pending: Session = { state: "main_menu_intent_pending", slots: { [SlotKey.INITIAL_MESSAGE_TEXT]: "x" }, counters: {} };
    const result = handle(pending, aiAnswer({ intent: "cita", especialidad: "Medicina General", distrito: "San Juan de Lurigancho" }));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]).toBe("Medicina General");
    expect(result.session.slots[SlotKey.CITA_DISTRITO_HINT_TEXT]).toBe("San Juan de Lurigancho");
  });
});

describe("noise-looking text: silenced before ever asking the AI", () => {
  it.each([
    ["symbols/digits only", '12213133123}231333!#"!#!#!"$#"!#%$%"$#'],
    ["symbols plus emoji (including multi-codepoint ones)", "@(#(+7281(#))@//#982+#((@🦤🦤🫪🫪🦤😘🧑🏿‍🍳🧑🏿‍🍳🐁🥹"],
  ])("%s: no AI query is dispatched, no reply is sent, stays in main_menu", (_why, message) => {
    const result = handle(menu(), text(message));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("main_menu");
    expect(result.effects).toHaveLength(0);
  });

  it("an ambiguous message that still has real words keeps going to the AI (no change)", () => {
    const result = handle(menu(), text("mmm no se"));

    expect(result.session.state).toBe("main_menu_intent_pending");
    expect(queries(result).map((effect) => effect.kind)).toEqual(["analyze_main_menu_intent"]);
  });

  it("unclear from the AI (real ambiguous text, not noise) keeps today's behavior: shows the menu", () => {
    const pending: Session = { state: "main_menu_intent_pending", slots: {}, counters: {} };
    const result = handle(pending, {
      from: FROM,
      type: "query_result",
      queryKind: "analyze_main_menu_intent",
      result: { intent: "unclear" },
    });

    expect(result.session.state).toBe("main_menu");
    expect(sent(result)[0].kind).toBe("send_interactive_list");
  });
});

describe("analyzeMainMenuIntent against a real model", () => {
  let restoreLogger: (() => void) | undefined;
  const captureLogs = (): string[] => {
    const lines: string[] = [];
    restoreLogger = configureLogger({ sink: (_level, line) => lines.push(line), level: "info" });
    return lines;
  };

  afterEach(() => {
    restoreLogger?.();
    restoreLogger = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const geminiReplying = (body: string, status = 200) =>
    vi.fn().mockResolvedValue(
      new Response(status === 200 ? JSON.stringify({ candidates: [{ content: { parts: [{ text: body }] } }] }) : "{}", { status }),
    );

  it("accepts the intent whatever its letter case", async () => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "true");
    vi.stubGlobal("fetch", geminiReplying(JSON.stringify({ intent: "CITA", especialidad: "Medicina General", distrito: "San Juan de Lurigancho", detalle: "" })));

    await expect(analyzeMainMenuIntent(FIELD_TEST_MESSAGE)).resolves.toEqual({
      intent: "cita",
      especialidad: "Medicina General",
      distrito: "San Juan de Lurigancho",
    });
  });

  it("logs why it fell back when the model call fails, without the citizen's text", async () => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "true");
    vi.stubGlobal("fetch", geminiReplying("", 403));
    const lines = captureLogs();

    await expect(analyzeMainMenuIntent(FIELD_TEST_MESSAGE)).resolves.toEqual({ intent: "unclear" });

    const fallbacks = lines.map((line) => JSON.parse(line)).filter((record) => record.event === "ai.fallback");
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]).toMatchObject({ level: "warn", operation: "analyze_main_menu_intent", fellBackTo: "menu" });
    expect(fallbacks[0].reason).toContain("HTTP 403");
    expect(lines.join(" ")).not.toContain("Lurigancho");
  });

  it("does not log when the model itself says unclear", async () => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "true");
    vi.stubGlobal("fetch", geminiReplying(JSON.stringify({ intent: "unclear", detalle: "" })));
    const lines = captureLogs();

    await expect(analyzeMainMenuIntent("hola")).resolves.toEqual({ intent: "unclear" });
    expect(lines.map((line) => JSON.parse(line)).some((record) => record.event === "ai.fallback")).toBe(false);
  });
});

describe("«Continuar» after the institutional warning", () => {
  const warned = () => {
    const result = handle(menu(), text("eres un idiota"));
    expect(sent(result)[0].kind).toBe("send_buttons");
    return result.session;
  };

  it.each(["ya dale", "continuar", "vamos", "sigue", "estoy harto continuemos", "Ok", "sí"])(
    "%j unblocks the menu without an AI call",
    (message) => {
      const result = handle(warned(), text(message));

      expect(queries(result)).toHaveLength(0);
      expect(result.session.state).toBe("main_menu");
      expect(sent(result)[0].kind).toBe("send_interactive_list");
      expect(result.session.slots[SlotKey.AWAITING_CONTINUE]).toBeUndefined();
    },
  );

  it("still works with the button", () => {
    const result = handle(warned(), { from: FROM, type: "button", listId: "continuar_menu" });

    expect(sent(result)[0].kind).toBe("send_interactive_list");
  });

  it("does not swallow a real request typed after the warning", () => {
    const result = handle(warned(), text("quiero una cita en Miraflores de odontología"));

    expect(result.session.state).toBe("cita_awaiting_dni");
  });

  it("only applies right after a warning: a plain «ya dale» in the menu still goes to the AI", () => {
    const result = handle(menu(), text("ya dale"));

    expect(result.session.state).toBe("main_menu_intent_pending");
  });

  it("is consumed by the next message", () => {
    const afterOther = handle(warned(), text("mmm no se"));
    expect(afterOther.session.slots[SlotKey.AWAITING_CONTINUE]).toBeUndefined();

    const later = handle(afterOther.session.state === "main_menu" ? afterOther.session : menu(), text("ya dale"));
    expect(later.session.state).toBe("main_menu_intent_pending");
  });

  it.each(["no quiero continuar", "no", "", "quiero un reclamo por favor y una queja larga de este mes"])(
    "does not read %j as «continue»",
    (message) => {
      expect(isContinueReply(message)).toBe(false);
    },
  );
});

describe("a flow that ended in an error", () => {
  const rejected = (): Session => ({
    state: "cita_booking_pending",
    slots: { [SlotKey.CITA_BEARER]: "stale-token", [SlotKey.CITA_DNI]: "12345678", [SlotKey.CITA_COD_EESS]: "1", [SlotKey.CITA_ESPECIALIDAD_ID]: "02", [SlotKey.CITA_FECHA]: "31/12/2099" },
    counters: { [CounterKey.CITA_BOOKING_FAILURES]: 2 },
  });

  it("does not keep MINSA's token once it is closed", () => {
    const closed = handle(rejected(), { from: FROM, type: "query_result", queryKind: "book_appointment", result: { status: "error" } });

    expect(closed.session.state).toBe("cita_booking_rejected");
    expect(closed.session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
  });

  it("starts the next message from a clean main_menu", () => {
    const closed = handle(rejected(), { from: FROM, type: "query_result", queryKind: "book_appointment", result: { status: "error" } });
    const next = handle(closed.session, text("hola"));

    expect(next.session.state).toBe("main_menu");
    expect(next.session.slots).toEqual({});
    expect(next.session.counters).toEqual({});
  });
});
