import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFirstMessagePayload } from "@/lib/security/payload-filter";
import { FIRST_MESSAGE_REJECTION_TEXT } from "@/lib/constants/textos/seguridad";
import { PayloadVerdictKind } from "@/lib/enums/payload-verdict-kind";
import { RejectReason } from "@/lib/enums/reject-reason";

afterEach(() => {
  vi.unstubAllEnvs();
});

const TOO_LONG = { type: "text", text: "a".repeat(301) };
const LINK = { type: "text", text: "visita https://ofertas.com" };
const REPEAT = { type: "text", text: "a".repeat(48) };
const ONLY_CITA_REJECTION =
  "Mensaje no reconocido. El asistente del MINSA solo atiende solicitudes de citas médicas. Por favor elija una opción: [1] Citas.";

describe("the first-message rejection with INCIDENCIAS_ENABLED off", () => {
  it.each([
    ["too long", TOO_LONG, RejectReason.TOO_LONG],
    ["a link", LINK, RejectReason.LINK],
    ["a wall of one letter", REPEAT, RejectReason.REPEAT],
  ])("offers only the citas when the message is %s", (_label, message, reason) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(checkFirstMessagePayload(message)).toEqual({ kind: PayloadVerdictKind.REJECTED, reason, reply: ONLY_CITA_REJECTION });
  });

  it("offers only the citas when the variable is not defined", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", undefined);

    expect(checkFirstMessagePayload(TOO_LONG)).toMatchObject({ reply: ONLY_CITA_REJECTION });
  });

  it("keeps the silent verdicts silent", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(checkFirstMessagePayload({ type: "sticker" })).toMatchObject({ reply: "" });
  });
});

describe("the first-message rejection with INCIDENCIAS_ENABLED on", () => {
  it.each([TOO_LONG, LINK, REPEAT])("keeps the original text, which names the incidencias", (message) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");

    expect(checkFirstMessagePayload(message)).toMatchObject({ reply: FIRST_MESSAGE_REJECTION_TEXT });
    expect(FIRST_MESSAGE_REJECTION_TEXT).toContain("[2] Incidencias");
  });
});
