import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { LlmClient } from "@/lib/fsm/parsing/ai/llm";
import { analyzeMainMenuIntent, MAIN_MENU_INTENT_RESPONSE_SCHEMA } from "@/lib/fsm/parsing/ai/main-menu-intent";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-intencion";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const menu = (slots: Session["slots"] = {}): Session => ({ state: "main_menu", slots, counters: {} });
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const modelSays = (json: unknown): LlmClient => ({
  provider: "gemini",
  generateJson: async () => ({ ok: true, json }),
});

const STORY = "El doctor me trató mal y además me cobraron sin recibo en la ventanilla";

describe("the AI recognises an incidencia", () => {
  it("the schema lets the model answer «incidencia»", () => {
    expect(JSON.stringify(MAIN_MENU_INTENT_RESPONSE_SCHEMA)).toContain('"enum":["cita","incidencia","fuera_de_alcance","unclear"]');
  });

  it.each(["incidencia", "Incidencia", " INCIDENCIA "])("reads %j as an incidencia", async (intent) => {
    await expect(analyzeMainMenuIntent(STORY, modelSays({ intent, detalle: "x" }))).resolves.toEqual({ intent: "incidencia" });
  });

  it("an incidencia carries no cita hints even if the model sent some", async () => {
    await expect(analyzeMainMenuIntent(STORY, modelSays({ intent: "incidencia", especialidad: "Pediatría", detalle: "x" }))).resolves.toEqual({ intent: "incidencia" });
  });

  it("an unknown intent is still «unclear»", async () => {
    await expect(analyzeMainMenuIntent(STORY, modelSays({ intent: "queja_formal", detalle: "x" }))).resolves.toEqual({ intent: "unclear" });
  });
});

describe("without the AI, the words of an incidencia are read inside a longer sentence", () => {
  it.each([
    "quiero poner una queja contra el doctor que me atendió mal",
    "necesito hacer un reclamo por un cobro indebido",
    "quiero hacer una denuncia de lo que pasó en el hospital",
    "tengo una incidencia que reportar sobre el trato recibido",
  ])("%j is an incidencia", async (message) => {
    await expect(analyzeMainMenuIntent(message, null)).resolves.toEqual({ intent: "incidencia" });
  });

  it("a cita request is still a cita", async () => {
    await expect(analyzeMainMenuIntent("quiero una cita de odontología", null)).resolves.toMatchObject({ intent: "cita" });
  });

  it("a message with no words of either is unclear", async () => {
    await expect(analyzeMainMenuIntent("hola que tal", null)).resolves.toEqual({ intent: "unclear" });
  });
});

describe("what the menu does with that answer", () => {
  const answer = (result: unknown): QueryResultEvent => ({ from: FROM, type: "query_result", queryKind: "analyze_main_menu_intent", result });

  it("a free message goes to the AI and the person's own words are kept aside as a draft", () => {
    const result = handle(menu(), text(STORY));

    expect(result.session.state).toBe("main_menu_intent_pending");
    expect(queries(result).map((effect) => effect.kind)).toEqual(["analyze_main_menu_intent"]);
    expect(result.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBe(STORY);
  });

  it("when the AI says incidencia, it asks where it happened and keeps the words as the draft", () => {
    const asked = handle(menu(), text(STORY));
    const result = handle(asked.session, answer({ intent: "incidencia" }));

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(result.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBe(STORY);
    expect(result.session.slots[SlotKey.INCIDENCIA_ORIGEN]).toBe("ia");
    expect((sent(result)[0] as { text: string }).text).toContain("¿En qué establecimiento de salud ocurrió?");
  });

  it("the draft is offered to use or to add to once the person has said who they are", () => {
    const asked = handle(menu(), text(STORY));
    const located = handle(asked.session, answer({ intent: "incidencia" }));
    const identity = { ...located.session, state: "incidencia_identity_choice" as const };

    const result = handle(identity, { from: FROM, type: "button", listId: "incidencia_anonimo" });
    expect(result.session.state).toBe("incidencia_confirm_borrador");
    expect((sent(result)[0] as { text: string }).text).toContain(STORY);
  });

  it("any other answer leaves no draft behind", () => {
    for (const intent of ["cita", "unclear", "fuera_de_alcance"]) {
      const asked = handle(menu(), text(STORY));
      const result = handle(asked.session, answer({ intent }));
      expect(result.session.slots[SlotKey.INCIDENCIA_BORRADOR], intent).toBeUndefined();
    }
  });

  it("explicit words still skip the AI, as before", () => {
    const result = handle(menu(), text("quiero hacer un reclamo"));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
  });
});
