import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { MissingSlotError } from "@/lib/errors/missing-slot-error";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionChannel } from "@/lib/enums/session-channel";
import { TerminosResume } from "@/lib/enums/terminos-resume";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";
import { TERMINOS_VERSION } from "@/lib/constants/textos/terminos";

const fakes = vi.hoisted(() => ({
  verifyCode: vi.fn(),
  saveDni: vi.fn(async () => undefined),
  findAceptacion: vi.fn(async () => undefined as { aceptadoEn: Date } | undefined),
  saveAceptacion: vi.fn(async () => undefined),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async () => ({ state: "main_menu", slots: {}, counters: {} }),
  saveSession: async () => undefined,
}));
vi.mock("@/lib/integrations/minsa/identity", () => ({ validateUser: vi.fn(), verifyCode: fakes.verifyCode }));
vi.mock("@/lib/composition/stores", () => ({
  getDniVerificadoStore: () => ({ save: fakes.saveDni }),
  getAceptacionTerminosStore: () => ({ save: fakes.saveAceptacion, find: fakes.findAceptacion }),
}));

import { runTurnUnlocked } from "@/lib/fsm/core/executor";

const FROM = "51999000444";
const DNI = "45678912";
const event = { from: FROM, type: "text" as const, text: "123456", channel: SessionChannel.WHATSAPP };

const startWith = (state: SessionState, slots: Session["slots"], kind: QueryKind, payload: Record<string, unknown>): HandlerResult => ({
  session: { state, slots, counters: {} },
  effects: [{ kind, payload }],
  outcome: "continue",
});

const verifying = () =>
  startWith(
    SessionState.CITA_VERIFY_PENDING,
    { [SlotKey.CITA_DNI_PENDING]: DNI, [SlotKey.CITA_TWOFA_ID]: "twofa" },
    QueryKind.VERIFY_CODE,
    {
      twofaId: "twofa",
      code: "123456",
      numeroDocumento: DNI,
    },
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("after MINSA verifies the code", () => {
  it("keeps the verified DNI for the sender and goes on with the cita", async () => {
    fakes.verifyCode.mockResolvedValue({ status: VerifyCodeStatus.VERIFIED, token: "token" });

    const result = await runTurnUnlocked(FROM, event, undefined, verifying());

    expect(fakes.saveDni).toHaveBeenCalledWith(FROM, DNI);
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
  });

  it("a failure keeping the DNI does not stop the cita", async () => {
    fakes.verifyCode.mockResolvedValue({ status: VerifyCodeStatus.VERIFIED, token: "token" });
    fakes.saveDni.mockRejectedValueOnce(new Error("conexion caida"));

    const result = await runTurnUnlocked(FROM, event, undefined, verifying());

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe(DNI);
  });

  it("a wrong code keeps nothing", async () => {
    fakes.verifyCode.mockResolvedValue({ status: VerifyCodeStatus.INVALID });

    await runTurnUnlocked(FROM, event, undefined, verifying());

    expect(fakes.saveDni).not.toHaveBeenCalled();
  });
});

describe("the terms of the cita", () => {
  it("are looked up for the sender and the version, and an earlier acceptance skips them", async () => {
    fakes.findAceptacion.mockResolvedValueOnce({ aceptadoEn: new Date() });
    const lookup = startWith(
      SessionState.CITA_TERMINOS_LOOKUP_PENDING,
      { [SlotKey.TERMINOS_RESUME]: TerminosResume.ASK_DOCUMENTO },
      QueryKind.CONSULTAR_ACEPTACION_TERMINOS,
      { version: TERMINOS_VERSION },
    );

    const result = await runTurnUnlocked(FROM, event, undefined, lookup);

    expect(fakes.findAceptacion).toHaveBeenCalledWith(FROM, TERMINOS_VERSION);
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_CUENTA_MINSA);
  });

  it("are not saved without the service they were accepted in", async () => {
    const accept = startWith(SessionState.CITA_TERMINOS_REGISTER_PENDING, {}, QueryKind.REGISTRAR_ACEPTACION_TERMINOS, {
      canal: SessionChannel.WHATSAPP,
      version: TERMINOS_VERSION,
      flujo: "OTRO",
    });

    await expect(runTurnUnlocked(FROM, event, undefined, accept)).rejects.toThrow(MissingSlotError);
    expect(fakes.saveAceptacion).not.toHaveBeenCalled();
  });
});
