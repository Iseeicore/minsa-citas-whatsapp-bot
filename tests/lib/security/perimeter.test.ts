import { describe, expect, it, vi } from "vitest";
import { MUTE_NOTICE_TEXT, screenInbound } from "@/lib/security/perimeter";
import { createEvidenceImageRateLimiter, createRateLimiter } from "@/lib/security/rate-limiter";
import { FIRST_MESSAGE_REJECTION_TEXT, MEDIA_WITHOUT_SESSION_TEXT } from "@/lib/constants/textos/seguridad";
import { MAX_IMAGENES_POR_INCIDENCIA } from "@/lib/constants/limits/incidencia";
import { EVIDENCE_IMAGE_BURST_LIMIT } from "@/lib/constants/limits/perimeter";
import { SessionState } from "@/lib/enums/session-state";

function setup(options: { hasSession?: boolean; state?: string } = {}) {
  const hasSession = vi.fn(async () => options.hasSession ?? false);
  const state = options.state ?? (options.hasSession ? SessionState.MAIN_MENU : undefined);
  const sessionState = vi.fn(async (): Promise<string | undefined> => state);
  const limiter = createRateLimiter();
  const evidenceLimiter = createEvidenceImageRateLimiter();
  return { hasSession, sessionState, limiter, deps: { limiter, evidenceLimiter, hasSession, sessionState } };
}

const text = (body: string) => ({ waId: "wa-1", type: "text", text: body });
const image = () => ({ waId: "wa-1", type: "image" });
const tap = () => ({ waId: "wa-1", type: "interactive" });

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
    const deps = { ...setup().deps, limiter };

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

describe("screenInbound: noise (spam with no real language) is dropped in silence, not replied to", () => {
  it("a message that is mostly digits/symbols with no session is dropped, no reply, no echo", async () => {
    const { deps, hasSession } = setup({ hasSession: false });

    const decision = await screenInbound(text('12213133123}231333!#"!#!#!"$#"!#%$%"$#'), deps);

    expect(decision).toEqual({ action: "drop", reason: "noise" });
    expect(hasSession).toHaveBeenCalledTimes(1);
  });

  it("the same noise WITH an open session goes through untouched", async () => {
    const { deps } = setup({ hasSession: true });

    expect(await screenInbound(text('12213133123}231333!#"!#!#!"$#"!#%$%"$#'), deps)).toEqual({ action: "continue" });
  });

  it("a sticker without a session is silenced completely, not answered", async () => {
    const { deps, hasSession } = setup({ hasSession: false });

    const decision = await screenInbound({ waId: "wa-1", type: "sticker" }, deps);

    expect(decision).toEqual({ action: "drop", reason: "sticker" });
    expect(hasSession).toHaveBeenCalledTimes(1);
  });

  it("a sticker WITH an open session goes through untouched", async () => {
    const { deps } = setup({ hasSession: true });

    expect(await screenInbound({ waId: "wa-1", type: "sticker" }, deps)).toEqual({ action: "continue" });
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
    ["a voice note", { waId: "wa-1", type: "audio" }, MEDIA_WITHOUT_SESSION_TEXT, "media"],
  ])("%s without a session is answered with the fixed text, after a single session lookup", async (_name, message, reply, reason) => {
    const { deps, hasSession, sessionState } = setup({ hasSession: false });

    const decision = await screenInbound(message, deps);

    expect(decision).toEqual({ action: "reject", reason, reply });
    expect(hasSession.mock.calls.length + sessionState.mock.calls.length).toBe(1);
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

describe("screenInbound: the evidence images have their own limit and never silence the number", () => {
  const evidence = () => setup({ hasSession: true, state: SessionState.INCIDENCIA_AWAITING_FOTO });
  const album = async (deps: ReturnType<typeof setup>["deps"], count: number) => {
    const decisions = [];
    for (let i = 0; i < count; i++) decisions.push(await screenInbound(image(), deps));
    return decisions;
  };

  it("the burst allows one more image than an incidencia can keep", () => {
    expect(EVIDENCE_IMAGE_BURST_LIMIT).toBe(MAX_IMAGENES_POR_INCIDENCIA + 1);
  });

  it("an album of five images and the «Listo» tap all go through, with no mute", async () => {
    const { deps } = evidence();

    const decisions = await album(deps, MAX_IMAGENES_POR_INCIDENCIA);
    const listo = await screenInbound(tap(), deps);

    expect(decisions).toEqual(Array(MAX_IMAGENES_POR_INCIDENCIA).fill({ action: "continue" }));
    expect(listo).toEqual({ action: "continue" });
  });

  it("the images do not consume the general budget: five texts still pass after the album", async () => {
    const { deps } = evidence();
    await album(deps, MAX_IMAGENES_POR_INCIDENCIA);

    const texts = [];
    for (let i = 0; i < 5; i++) texts.push(await screenInbound(text("Listo"), deps));

    expect(texts).toEqual(Array(5).fill({ action: "continue" }));
  });

  it("an image over the burst is dropped in silence: no notice, and the number is not muted", async () => {
    const { deps } = evidence();

    const decisions = await album(deps, EVIDENCE_IMAGE_BURST_LIMIT + 1);

    expect(decisions.slice(0, EVIDENCE_IMAGE_BURST_LIMIT)).toEqual(Array(EVIDENCE_IMAGE_BURST_LIMIT).fill({ action: "continue" }));
    expect(decisions[EVIDENCE_IMAGE_BURST_LIMIT]).toEqual({ action: "drop", reason: "throttled" });
    expect(decisions.some((decision) => decision.action === "reject")).toBe(false);
    expect(await screenInbound(tap(), deps)).toEqual({ action: "continue" });
  });

  it("the images over the burst are not even looked up in the session", async () => {
    const { deps, sessionState } = evidence();

    await album(deps, EVIDENCE_IMAGE_BURST_LIMIT + 4);

    expect(sessionState).toHaveBeenCalledTimes(EVIDENCE_IMAGE_BURST_LIMIT);
  });

  it("insisting with images still ends in the one-hour ban, and the ban covers texts too", async () => {
    const { deps } = evidence();

    const decisions = await album(deps, 21);

    expect(decisions[20]).toEqual({ action: "drop", reason: "banned" });
    expect(await screenInbound(tap(), deps)).toEqual({ action: "drop", reason: "banned" });
    expect(await screenInbound(image(), deps)).toEqual({ action: "drop", reason: "banned" });
  });

  it("a muted number has its images dropped too, without asking the session", async () => {
    const { deps, sessionState } = evidence();
    for (let i = 0; i < 6; i++) await screenInbound(text("hola"), deps);

    expect(await screenInbound(image(), deps)).toEqual({ action: "drop", reason: "throttled" });
    expect(sessionState).not.toHaveBeenCalled();
  });

  it("outside the evidence step the images still count in the general limit", async () => {
    const { deps, hasSession } = setup({ hasSession: true, state: SessionState.MAIN_MENU });

    const decisions = await album(deps, 5);
    const sixth = await screenInbound(text("hola"), deps);

    expect(decisions).toEqual(Array(5).fill({ action: "continue" }));
    expect(sixth).toEqual({ action: "reject", reason: "muted", reply: MUTE_NOTICE_TEXT });
    expect(hasSession).not.toHaveBeenCalled();
  });

  it("a flood of texts in the evidence step still mutes as before", async () => {
    const { deps, sessionState } = evidence();

    const decisions = [];
    for (let i = 0; i < 6; i++) decisions.push(await screenInbound(text("hola"), deps));

    expect(decisions[5]).toEqual({ action: "reject", reason: "muted", reply: MUTE_NOTICE_TEXT });
    expect(sessionState).not.toHaveBeenCalled();
  });
});
