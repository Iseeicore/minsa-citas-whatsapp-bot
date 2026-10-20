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
const CITA_REFERENCIA_REJECTION =
  "Mensaje no reconocido. El asistente del MINSA solo atiende solicitudes de citas médicas y consulta de referencias. Por favor elija una opción: [1] Citas [2] Referencia.";

describe("the first-message rejection with INCIDENCIAS_ENABLED off", () => {
  it.each([
    ["too long", TOO_LONG, RejectReason.TOO_LONG],
    ["a link", LINK, RejectReason.LINK],
    ["a wall of one letter", REPEAT, RejectReason.REPEAT],
  ])("offers only the citas and the referencias when the message is %s", (_label, message, reason) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(checkFirstMessagePayload(message)).toEqual({ kind: PayloadVerdictKind.REJECTED, reason, reply: CITA_REFERENCIA_REJECTION });
  });

  it("offers only the citas and the referencias when the variable is not defined", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", undefined);

    expect(checkFirstMessagePayload(TOO_LONG)).toMatchObject({ reply: CITA_REFERENCIA_REJECTION });
  });

  it("keeps the silent verdicts silent", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(checkFirstMessagePayload({ type: "sticker" })).toMatchObject({ reply: "" });
  });
});

describe("the first-message rejection with INCIDENCIAS_ENABLED on", () => {
  it.each([TOO_LONG, LINK, REPEAT])("names the referencias at 2 and the incidencias at 3, like the menu", (message) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");

    expect(checkFirstMessagePayload(message)).toMatchObject({ reply: FIRST_MESSAGE_REJECTION_TEXT });
    expect(FIRST_MESSAGE_REJECTION_TEXT).toContain("[2] Referencia [3] Incidencias");
  });
});
