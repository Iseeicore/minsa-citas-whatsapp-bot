import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/fsm/core/types";

const store = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  buscar: vi.fn<(payload: unknown) => Promise<unknown>>(),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
}));
vi.mock("@/lib/establecimientos/buscar", () => ({ buscarEstablecimiento: store.buscar }));

import { runTurnUnlocked } from "@/lib/fsm/core/executor";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";

const FROM = "sandbox-primer-contacto";
const QR = "Hola quiero presentar una incidencia HOSPITAL NACIONAL DOS DE MAYO - CODIGO-IPRESS 6206";
const DOS_DE_MAYO = { id: 7, areaId: 9, codigoRenipress: "6206", nombre: "HOSPITAL NACIONAL DOS DE MAYO", distrito: null };

describe("a first contact whose answer needs a lookup (the QR)", () => {
  beforeEach(() => {
    store.sessions.clear();
    store.buscar.mockReset();
  });

  it("the lookup runs in the same turn and the person is asked to confirm the place, instead of the session waiting for an answer that never comes", async () => {
    store.buscar.mockResolvedValueOnce({ by: "codigo", status: "found", establecimiento: DOS_DE_MAYO });
    const first = handleFirstContact(QR, "whatsapp");

    const turn = await runTurnUnlocked(FROM, { from: FROM, type: "text", text: QR }, undefined, first);

    expect(store.buscar).toHaveBeenCalledWith({ codigo: "6206" });
    expect(turn.session.state).toBe("incidencia_confirm_ubicacion");
    expect(turn.sent).toHaveLength(1);
    expect(turn.sent[0]).toMatchObject({ kind: "send_buttons" });
    expect((turn.sent[0] as { text: string }).text).toContain("*HOSPITAL NACIONAL DOS DE MAYO*");
    expect(store.sessions.get(FROM)?.state).toBe("incidencia_confirm_ubicacion");
  });

  it("when the lookup cannot be done, the person is offered to go on without the establecimiento and the session is saved", async () => {
    store.buscar.mockResolvedValueOnce({ by: "codigo", status: "unavailable" });
    const turn = await runTurnUnlocked(FROM, { from: FROM, type: "text", text: QR }, undefined, handleFirstContact(QR, "whatsapp"));

    expect(turn.session.state).toBe("incidencia_confirm_omitir");
    expect(store.sessions.get(FROM)?.state).toBe("incidencia_confirm_omitir");
  });

  it("a first contact with no lookup (the menu) is unchanged", async () => {
    const first = handleFirstContact("necesito hablar con alguien", "whatsapp");
    expect(first.effects.some((effect) => "payload" in effect)).toBe(false);
  });
});
