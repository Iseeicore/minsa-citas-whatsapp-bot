import { describe, expect, it } from "vitest";
import { handleMainMenuIntentPending, OUT_OF_SCOPE_REQUEST_TEXT } from "@/lib/fsm/routing/main-menu";
import { buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import type { QueryResultEvent, Session } from "@/lib/fsm/core/types";

const pending: Session = { state: "main_menu_intent_pending", slots: { initialMessageText: "dame código" }, counters: {} };

const aiSays = (result: unknown): QueryResultEvent => ({
  from: "wa-1",
  type: "query_result",
  queryKind: "analyze_main_menu_intent",
  result,
});

describe("handleMainMenuIntentPending: a request outside the bot's scope", () => {
  it("answers with the fixed text and offers the bot's own options (the main menu)", () => {
    const result = handleMainMenuIntentPending(pending, aiSays({ intent: "fuera_de_alcance" }));

    expect(result.session.state).toBe("main_menu");
    expect(result.effects).toEqual([{ kind: "send_text", text: OUT_OF_SCOPE_REQUEST_TEXT }, buildMenuEffect()]);
    expect(result.notes).toContainEqual({ kind: "out_of_scope", detail: { reason: "ai_request" } });
  });

  it("uses the text agreed with the team", () => {
    expect(OUT_OF_SCOPE_REQUEST_TEXT).toBe(
      "Solo puedo ayudarte a agendar una cita médica o a registrar un reclamo en el Libro de Reclamaciones. Elige una opción:",
    );
  });

  it("an unclear intent still just shows the menu, as before", () => {
    const result = handleMainMenuIntentPending(pending, aiSays({ intent: "unclear" }));

    expect(result.effects).toEqual([buildMenuEffect()]);
  });
});
