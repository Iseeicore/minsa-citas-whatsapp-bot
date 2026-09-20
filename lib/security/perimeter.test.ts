import { describe, expect, it, vi } from "vitest";
import { FIRST_MESSAGE_REJECTION_TEXT, MEDIA_WITHOUT_SESSION_TEXT } from "./payload-filter";
import { screenInbound } from "./perimeter";
import { createRateLimiter } from "./rate-limiter";

function setup(options: { hasSession?: boolean } = {}) {
  const hasSession = vi.fn(async () => options.hasSession ?? false);
  const limiter = createRateLimiter();
  return { hasSession, limiter, deps: { limiter, hasSession } };
}

const text = (body: string) => ({ waId: "wa-1", type: "text", text: body });

describe("screenInbound: the cheapest checks run first and touch no database", () => {
  it("a normal message continues and never asks about the session", async () => {
    const { deps, hasSession } = setup();

    expect(await screenInbound(text("Hola, quiero una cita"), deps)).toEqual({ action: "continue" });
    expect(hasSession).not.toHaveBeenCalled();
  });

  it("a flood is dropped silently WITHOUT any session lookup", async () => {
    const { deps, hasSession } = setup();

    const decisions = [];
    for (let i = 0; i < 8; i++) decisions.push(await screenInbound(text("hola"), deps));

    expect(decisions.slice(0, 5).every((decision) => decision.action === "continue")).toBe(true);
    expect(decisions.slice(5)).toEqual(Array(3).fill({ action: "drop", reason: "throttled" }));
    expect(hasSession).not.toHaveBeenCalled();
  });

  it("a banned waId is dropped even with a spam payload (no reply, no lookup)", async () => {
    const { deps, hasSession } = setup();
    for (let i = 0; i < 25; i++) await screenInbound(text("hola"), deps);

    const decision = await screenInbound(text("http://spam.com"), deps);

    expect(decision).toEqual({ action: "drop", reason: "banned" });
    expect(hasSession).not.toHaveBeenCalled();
  });
});

describe("screenInbound: payload rules apply only to a first message", () => {
  it.each([
    ["a very long first message", text("a".repeat(301)), FIRST_MESSAGE_REJECTION_TEXT, "too_long"],
    ["a link", text("visita https://ofertas.com"), FIRST_MESSAGE_REJECTION_TEXT, "link"],
    ["a wa.me link", text("wa.me/51999999999"), FIRST_MESSAGE_REJECTION_TEXT, "link"],
    ["a photo", { waId: "wa-1", type: "image" }, MEDIA_WITHOUT_SESSION_TEXT, "media"],
    ["a sticker", { waId: "wa-1", type: "sticker" }, MEDIA_WITHOUT_SESSION_TEXT, "media"],
    ["a voice note", { waId: "wa-1", type: "audio" }, MEDIA_WITHOUT_SESSION_TEXT, "media"],
  ])("%s without a session is answered with the fixed text", async (_name, message, reply, reason) => {
    const { deps, hasSession } = setup({ hasSession: false });

    const decision = await screenInbound(message, deps);

    expect(decision).toEqual({ action: "reject", reason, reply });
    expect(hasSession).toHaveBeenCalledTimes(1); // one read, no transaction, no lock
  });

  it.each([
    ["a long complaint", text("a".repeat(900))],
    ["a link inside a flow", text("mi dirección está en https://maps.example.org/x")],
    ["the photo of a complaint", { waId: "wa-1", type: "image" }],
  ])("%s WITH an open session goes through untouched", async (_name, message) => {
    const { deps } = setup({ hasSession: true });

    expect(await screenInbound(message, deps)).toEqual({ action: "continue" });
  });
});
