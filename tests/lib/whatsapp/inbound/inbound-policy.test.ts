import { describe, expect, it } from "vitest";
import {
  INBOUND_FREE_TEXT_WINDOW_MS,
  INBOUND_MAX_AGE_MS,
  INBOUND_MAX_BATCH,
  INBOUND_MAX_WAIT_MS,
  resolveWindowMs,
} from "@/lib/whatsapp/inbound/inbound-policy";
import { SessionState } from "@/lib/enums/session-state";

describe("resolveWindowMs", () => {
  it("waits the free-text window in states where the user writes a sentence", () => {
    for (const state of [
      SessionState.INCIDENCIA_AWAITING_DESCRIPCION,
      SessionState.CITA_AWAITING_DISTRITO,
      SessionState.MAIN_MENU,
    ]) {
      expect(resolveWindowMs({ state, type: "text" })).toBe(INBOUND_FREE_TEXT_WINDOW_MS);
    }
  });

  it("waits the free-text window on first contact, when there is no session yet", () => {
    expect(resolveWindowMs({ state: null, type: "text" })).toBe(INBOUND_FREE_TEXT_WINDOW_MS);
  });

  it("never waits in states that expect a single exact answer such as DNI or OTP", () => {
    for (const state of [
      SessionState.CITA_AWAITING_DNI,
      SessionState.CITA_AWAITING_OTP,
      SessionState.INCIDENCIA_AWAITING_DNI,
      SessionState.CITA_AWAITING_HORA_CONFIRM,
      SessionState.CITA_AWAITING_EXIT_CONFIRM,
    ]) {
      expect(resolveWindowMs({ state, type: "text" })).toBe(0);
    }
  });

  it("never waits for buttons, lists, images or any non-text message", () => {
    for (const type of ["interactive", "image", "audio", "location"]) {
      expect(resolveWindowMs({ state: SessionState.MAIN_MENU, type })).toBe(0);
    }
  });

  it("keeps the cap, the batch size and the age limit within sane bounds", () => {
    expect(INBOUND_FREE_TEXT_WINDOW_MS).toBeLessThan(INBOUND_MAX_WAIT_MS);
    expect(INBOUND_MAX_BATCH).toBe(10);
    expect(INBOUND_MAX_AGE_MS).toBe(120_000);
  });
});
