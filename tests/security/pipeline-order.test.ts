import { describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { FIRST_MESSAGE_REJECTION_TEXT } from "@/lib/security/payload-filter";
import { screenInbound } from "@/lib/security/perimeter";
import { createRateLimiter } from "@/lib/security/rate-limiter";

const WA_ID = "51999000111";
const menu = (): Session => ({ state: "main_menu", slots: {}, counters: {} });
const text = (body: string) => ({ from: WA_ID, type: "text" as const, text: body });
const asksTheAi = (result: HandlerResult) => result.effects.filter(isQueryEffect).some((effect) => effect.kind === "analyze_main_menu_intent");

function perimeter() {
  const hasSession = vi.fn(async () => false);
  const limiter = createRateLimiter();
  return { hasSession, screen: (body: string) => screenInbound({ waId: WA_ID, type: "text", text: body }, { limiter, hasSession }) };
}

describe("1. the perimeter comes first", () => {
  it("a long spam that also insults is stopped as spam: the lexical guard never sees it", async () => {
    const { screen } = perimeter();
    const spamWithInsult = `idiota ${"GANA DINERO FACIL ".repeat(18)}`;

    const decision = await screen(spamWithInsult);

    expect(decision).toEqual({ action: "reject", reason: "too_long", reply: FIRST_MESSAGE_REJECTION_TEXT });
  });

  it("a flood is dropped before any content is read, insulting or not", async () => {
    const { screen, hasSession } = perimeter();

    const decisions = [];
    for (let i = 0; i < 7; i++) decisions.push(await screen("eres un idiota"));

    expect(decisions.slice(0, 5).every((decision) => decision.action === "continue")).toBe(true);
    expect(decisions[5]).toMatchObject({ action: "reject", reason: "muted" });
    expect(decisions.slice(6)).toEqual([{ action: "drop", reason: "throttled" }]);
    expect(hasSession).not.toHaveBeenCalled();
  });
});

describe("2. the lexical guard comes second, and without AI", () => {
  it("a short insult passes the perimeter and is answered by the guard, with no query of any kind", async () => {
    const { screen } = perimeter();

    expect(await screen("eres un idiota")).toEqual({ action: "continue" });

    const result = handle(menu(), text("eres un idiota"));
    expect(result.effects.some(isQueryEffect)).toBe(false);
    expect(result.effects[0]).toMatchObject({ kind: "send_buttons" });
  });

  it("an insulting first message gets the same guard answer, not the welcome", () => {
    const neutral = handleFirstContact("Hola");
    expect(neutral.effects[0]).toMatchObject({ kind: "send_cta_url" });

    const abusive = handle(menu(), text("eres un idiota"));
    expect(abusive.effects[0]).toMatchObject({ kind: "send_buttons" });
  });
});

describe("3. deterministic reading comes third, still without AI", () => {
  it.each([
    ["a greeting", "hola"],
    ["a menu number", "1"],
    ["a request for a cita with what the flow needs", "quiero una cita de odontología en Miraflores"],
    ["a request to file a complaint", "quiero hacer un reclamo"],
  ])("%s never asks the AI", (_name, body) => {
    expect(asksTheAi(handle(menu(), text(body)))).toBe(false);
  });
});

describe("4. the AI is the last resort", () => {
  it("text that nothing above can read is the only thing that reaches it", () => {
    const result = handle(menu(), text("blah blah sin sentido"));

    expect(asksTheAi(result)).toBe(true);
    expect(result.session.state).toBe("main_menu_intent_pending");
  });
});
