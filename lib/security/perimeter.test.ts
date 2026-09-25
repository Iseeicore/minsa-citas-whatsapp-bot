import { describe, expect, it, vi } from "vitest";
import { FIRST_MESSAGE_REJECTION_TEXT, MEDIA_WITHOUT_SESSION_TEXT } from "@/lib/security/payload-filter";
import { MUTE_NOTICE_TEXT, screenInbound } from "@/lib/security/perimeter";
import { createRateLimiter } from "@/lib/security/rate-limiter";

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

  it("a flood is dropped WITHOUT any session lookup: one notice when the mute starts, silence after it", async () => {
    const { deps, hasSession } = setup();

    const decisions = [];
    for (let i = 0; i < 8; i++) decisions.push(await screenInbound(text("hola"), deps));

    expect(decisions.slice(0, 5).every((decision) => decision.action === "continue")).toBe(true);
    expect(decisions[5]).toEqual({ action: "reject", reason: "muted", reply: MUTE_NOTICE_TEXT });
    expect(decisions.slice(6)).toEqual(Array(2).fill({ action: "drop", reason: "throttled" }));
    expect(hasSession).not.toHaveBeenCalled();
  });

  it("the notice tells the citizen how long to wait, in the same formal register as the other fixed replies", () => {
    expect(MUTE_NOTICE_TEXT).toContain("2 minutos");
    expect(MUTE_NOTICE_TEXT).toMatch(/^Está enviando mensajes muy rápido/);
    expect(MUTE_NOTICE_TEXT.length).toBeLessThan(200);
  });

  it("a flood that is also spam gets the notice, not the spam rejection: the flood is what stops it", async () => {
    const { deps } = setup();
    for (let i = 0; i < 5; i++) await screenInbound(text("hola"), deps);

    const decision = await screenInbound(text("visita https://ofertas.com"), deps);

    expect(decision).toEqual({ action: "reject", reason: "muted", reply: MUTE_NOTICE_TEXT });
  });

  it("without a mute (muteMs 0) there is nothing to announce: the flood is dropped in silence", async () => {
    const limiter = createRateLimiter({ muteMs: 0 });
    const deps = { limiter, hasSession: vi.fn(async () => false) };

    const decisions = [];
    for (let i = 0; i < 7; i++) decisions.push(await screenInbound(text("hola"), deps));

    expect(decisions.slice(5)).toEqual(Array(2).fill({ action: "drop", reason: "throttled" }));
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
    ["a wall of one letter", text("a".repeat(48)), FIRST_MESSAGE_REJECTION_TEXT, "repeat"],
    ["a pile of emojis", text("🔥🔥🔥💰💰💰"), FIRST_MESSAGE_REJECTION_TEXT, "repeat"],
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
    ["a stretch of the same letter inside a flow", text("a".repeat(30))],
    ["a link inside a flow", text("mi dirección está en https://maps.example.org/x")],
    ["the photo of a complaint", { waId: "wa-1", type: "image" }],
  ])("%s WITH an open session goes through untouched", async (_name, message) => {
    const { deps } = setup({ hasSession: true });

    expect(await screenInbound(message, deps)).toEqual({ action: "continue" });
  });
});
