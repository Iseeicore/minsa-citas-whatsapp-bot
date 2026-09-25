import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai";
import { extractCitaHints } from "@/lib/fsm/flows/cita/cita-hints";
import { configureLogger } from "@/lib/observability/logger";
import { normalizeText } from "@/lib/fsm/parsing/domain";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { detectCitaRequest, isContinueReply } from "./menu-shortcuts";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

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
    expect(normalizeText(String(result.session.slots.citaDistritoHintText))).toBe("SAN JUAN DE LURIGANCHO");
    expect(normalizeText(String(result.session.slots.citaEspecialidadHintText))).toBe("MEDICINA GENERAL");
    expect(result.session.slots.initialMessageText).toBe(FIELD_TEST_MESSAGE);
    expect(sent(result)[0]).toMatchObject({ kind: "send_text", text: expect.stringContaining("ingresa tu número de documento") });
  });

  it.each([
    "quiero una cita de odontología",
    "necesito agendar en Miraflores",
    "quiero sacar un turno de pediatría en San Borja",
  ])("also handles %j", (message) => {
    const result = handle(menu(), text(message));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_dni");
  });

  it.each([
    ["no hints to seed, so the AI decides", "quiero una cita"],
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
    const pending: Session = { state: "main_menu_intent_pending", slots: { initialMessageText: "x" }, counters: {} };
    const result = handle(pending, aiAnswer({ intent: "cita", especialidad: "Medicina General", distrito: "San Juan de Lurigancho" }));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(result.session.slots.citaEspecialidadHintText).toBe("Medicina General");
    expect(result.session.slots.citaDistritoHintText).toBe("San Juan de Lurigancho");
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
      expect(result.session.slots.awaitingContinue).toBeUndefined();
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
    expect(afterOther.session.slots.awaitingContinue).toBeUndefined();

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
    slots: { citaBearer: "stale-token", citaDni: "12345678", citaCodEess: "1", citaEspecialidadId: "02", citaFecha: "31/12/2099" },
    counters: { citaBookingFailures: 2 },
  });

  it("does not keep MINSA's token once it is closed", () => {
    const closed = handle(rejected(), { from: FROM, type: "query_result", queryKind: "book_appointment", result: { status: "error" } });

    expect(closed.session.state).toBe("cita_booking_rejected");
    expect(closed.session.slots.citaBearer).toBeUndefined();
  });

  it("starts the next message from a clean main_menu", () => {
    const closed = handle(rejected(), { from: FROM, type: "query_result", queryKind: "book_appointment", result: { status: "error" } });
    const next = handle(closed.session, text("hola"));

    expect(next.session.state).toBe("main_menu");
    expect(next.session.slots).toEqual({});
    expect(next.session.counters).toEqual({});
  });
});
