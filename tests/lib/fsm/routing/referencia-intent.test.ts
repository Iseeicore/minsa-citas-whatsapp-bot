import { afterEach, describe, expect, it, vi } from "vitest";
import { LLM_FAKE, llmAvailable } from "@/tests/support/llm-lookup";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session, SessionChannel } from "@/lib/fsm/core/types";
import type { LlmClient, LlmJsonOutcome, LlmJsonRequest } from "@/lib/fsm/parsing/ai/llm";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai/main-menu-intent";
import { REFERENCIA_LOGIN_REQUIRED_TEXT } from "@/lib/constants/textos/referencia";
import { MainMenuIntent } from "@/lib/enums/main-menu-intent";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { SessionChannel as Channel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";

afterEach(() => {
  vi.unstubAllEnvs();
});

const FROM = "sandbox-referencia-intencion";
const CHANNELS = [Channel.WHATSAPP, Channel.WEB];
const FLAGS = ["true", "false"];
const TYPO_REQUEST = "quiero ver mi refrencia del hospital";

const typed = (value: string, channel: SessionChannel): InboundEvent => ({ from: FROM, type: "text", text: value, channel });
const menu = (): Session => ({ state: SessionState.MAIN_MENU, slots: {}, counters: {} });
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

function recordingClient(json: unknown) {
  const requests: LlmJsonRequest[] = [];
  const client: LlmClient = {
    provider: "gemini",
    generateJson: async (request): Promise<LlmJsonOutcome> => {
      requests.push(request);
      return { ok: true, json };
    },
  };
  return { client, requests };
}

const intents = (request: LlmJsonRequest): string[] => JSON.parse(JSON.stringify(request.schema)).properties.intent.enum;

const aiAnswer = (result: unknown, channel: SessionChannel): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind: "analyze_main_menu_intent",
  result,
  channel,
});

describe("the AI offers and reads the referencia", () => {
  it.each(FLAGS)("the schema and the prompt offer «referencia» with INCIDENCIAS_ENABLED=%s", async (flag) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", flag);
    const { client, requests } = recordingClient({ intent: "referencia", detalle: "x" });

    await expect(analyzeMainMenuIntent(TYPO_REQUEST, llmAvailable(client))).resolves.toEqual({ intent: MainMenuIntent.REFERENCIA });

    expect(intents(requests[0])).toContain("referencia");
    expect(requests[0].systemPrompt).toContain('"intent": "referencia"');
    expect(requests[0].systemPrompt).toContain("consultar una referencia médica");
  });

  it.each(["referencia", "Referencia", " REFERENCIA "])("reads %j as a referencia", async (intent) => {
    await expect(analyzeMainMenuIntent(TYPO_REQUEST, llmAvailable(recordingClient({ intent, detalle: "x" }).client))).resolves.toEqual({
      intent: MainMenuIntent.REFERENCIA,
    });
  });

  it("a referencia carries no cita hints even if the model sent some", async () => {
    const { client } = recordingClient({ intent: "referencia", especialidad: "Cardiología", distrito: "Lince", detalle: "x" });

    await expect(analyzeMainMenuIntent(TYPO_REQUEST, llmAvailable(client))).resolves.toEqual({ intent: MainMenuIntent.REFERENCIA });
  });
});

describe("the boundary between a cita and a referencia", () => {
  it.each(FLAGS)("the prompt tells the model that a cita asked for with a referencia is a cita (INCIDENCIAS_ENABLED=%s)", async (flag) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", flag);
    const { client, requests } = recordingClient({ intent: "cita", detalle: "x" });

    await analyzeMainMenuIntent("quiero sacar cita", llmAvailable(client));

    expect(requests[0].systemPrompt).toContain("«quiero sacar cita»");
    expect(requests[0].systemPrompt).toContain("«cita por referencia»");
  });

  it.each([
    ["quiero sacar cita con el cardiólogo", "Cardiología"],
    ["me derivaron al hospital y necesito que me atiendan allá", undefined],
  ])("%j, answered cita by the model, stays a cita with its hints", async (message, especialidad) => {
    const result = await analyzeMainMenuIntent(
      message,
      llmAvailable(recordingClient({ intent: "cita", especialidad, detalle: "x" }).client),
    );

    expect(result).toEqual({ intent: MainMenuIntent.CITA, especialidad, distrito: undefined });
  });

  it.each(CHANNELS)("a cita answer from the AI opens the cita, not the referencias (%s)", (channel) => {
    const pending: Session = { state: SessionState.MAIN_MENU_INTENT_PENDING, slots: {}, counters: {} };

    const result = handle(pending, aiAnswer({ intent: "cita", especialidad: "Cardiología" }, channel));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]).toBe("Cardiología");
  });

  it.each(["quiero sacar cita", "quiero sacar una cita de pediatría"])(
    "%j typed in the menu is still a cita, without the AI",
    (message) => {
      const result = handle(menu(), typed(message, Channel.WHATSAPP));

      expect(queries(result)).toHaveLength(0);
      expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
      expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
    },
  );

  it("the keyword still runs before the AI", () => {
    const result = handle(menu(), typed("quiero saber el estado de mi referencia", Channel.WHATSAPP));

    expect(queries(result)).toHaveLength(0);
    expect(result.notes).toContainEqual({ kind: "shortcut", detail: { name: "referencia_keyword" } });
  });

  it("without the AI, a derivación is read as a referencia and a cita with a derivación as a cita", async () => {
    await expect(analyzeMainMenuIntent("me dieron una derivación al hospital, ya la aprobaron?", LLM_FAKE)).resolves.toEqual({
      intent: MainMenuIntent.REFERENCIA,
    });
    await expect(analyzeMainMenuIntent("quiero una cita por mi derivación", LLM_FAKE)).resolves.toMatchObject({
      intent: MainMenuIntent.CITA,
    });
  });
});

describe("what the menu does when the AI says referencia", () => {
  it.each(CHANNELS)("a free message ends in the login of the referencias, like the row and the keyword (%s)", (channel) => {
    for (const flag of FLAGS) {
      vi.stubEnv("INCIDENCIAS_ENABLED", flag);
      const asked = handle(menu(), typed(TYPO_REQUEST, channel));
      expect(asked.session.state).toBe(SessionState.MAIN_MENU_INTENT_PENDING);
      expect(queries(asked).map((effect) => effect.kind)).toEqual(["analyze_main_menu_intent"]);

      const result = handle(asked.session, aiAnswer({ intent: "referencia" }, channel));

      expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
      expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
      expect(result.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBeUndefined();
      expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBeUndefined();
      expect(result.effects).toEqual([{ kind: "send_text", text: REFERENCIA_LOGIN_REQUIRED_TEXT }]);
      expect(result.notes).toContainEqual({ kind: "shortcut", detail: { name: "referencia_ai" } });
    }
  });
});
