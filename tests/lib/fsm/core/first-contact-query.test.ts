import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/fsm/core/types";

const store = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  buscar: vi.fn<(payload: unknown) => Promise<unknown>>(),
  consentimiento: vi.fn<(from: string) => Promise<boolean>>(),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
}));
vi.mock("@/lib/establecimientos/buscar", () => ({ buscarEstablecimiento: store.buscar }));
vi.mock("@/lib/composition/stores", () => import("@/tests/support/memory-stores"));
vi.mock("@/lib/recepcion/repositorio", () => ({
  tieneConsentimientoAceptado: store.consentimiento,
  marcarConsentimientoAceptado: async () => undefined,
}));

import { runTurnUnlocked } from "@/lib/fsm/core/executor";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";

const FROM = "sandbox-primer-contacto";
const QR = "Hola quiero presentar una incidencia HOSPITAL NACIONAL DOS DE MAYO - CODIGO-IPRESS 6206";
const DOS_DE_MAYO = { id: 7, areaId: 9, codigoRenipress: "6206", nombre: "HOSPITAL NACIONAL DOS DE MAYO", distrito: null };

describe("a first contact whose answer needs a lookup (the QR)", () => {
  beforeEach(() => {
    store.sessions.clear();
    store.buscar.mockReset();
    store.consentimiento.mockReset();
    store.consentimiento.mockResolvedValue(true);
  });

  it("the consent check and the lookup run in the same turn and the person is asked to confirm the place, with the notice on top", async () => {
    store.buscar.mockResolvedValueOnce({ by: "codigo", status: "found", establecimiento: DOS_DE_MAYO });
    const first = handleFirstContact(QR, "whatsapp");

    const turn = await runTurnUnlocked(FROM, { channel: "whatsapp", from: FROM, type: "text", text: QR }, undefined, first);

    expect(store.consentimiento).toHaveBeenCalledWith(FROM, expect.anything());
    expect(store.buscar).toHaveBeenCalledWith({ codigo: "6206" });
    expect(turn.session.state).toBe("incidencia_confirm_ubicacion");
    expect(turn.sent).toHaveLength(1);
    expect(turn.sent[0]).toMatchObject({ kind: "send_buttons" });
    expect((turn.sent[0] as { text: string }).text).toContain("ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS");
    expect((turn.sent[0] as { text: string }).text).toContain("*HOSPITAL NACIONAL DOS DE MAYO*");
    expect(store.sessions.get(FROM)?.state).toBe("incidencia_confirm_ubicacion");
  });

  it("when the lookup cannot be done, the person is offered to go on without the establecimiento and the session is saved", async () => {
    store.buscar.mockResolvedValueOnce({ by: "codigo", status: "unavailable" });
    const turn = await runTurnUnlocked(
      FROM,
      { channel: "whatsapp", from: FROM, type: "text", text: QR },
      undefined,
      handleFirstContact(QR, "whatsapp"),
    );

    expect(turn.session.state).toBe("incidencia_confirm_omitir");
    expect(store.sessions.get(FROM)?.state).toBe("incidencia_confirm_omitir");
  });

  it("without a consent given, the turn stops at the authorization and the lookup waits for it", async () => {
    store.consentimiento.mockResolvedValueOnce(false);
    const turn = await runTurnUnlocked(
      FROM,
      { channel: "whatsapp", from: FROM, type: "text", text: QR },
      undefined,
      handleFirstContact(QR, "whatsapp"),
    );

    expect(turn.session.state).toBe("incidencia_consent_choice");
    expect(store.buscar).not.toHaveBeenCalled();
    expect(turn.sent).toHaveLength(1);
    expect(turn.sent[0]).toMatchObject({ kind: "send_consent", title: "Autorización de datos" });
  });

  it("a first contact with no lookup (the menu) is unchanged", async () => {
    const first = handleFirstContact("necesito hablar con alguien", "whatsapp");
    expect(first.effects.some((effect) => "payload" in effect)).toBe(false);
  });
});
