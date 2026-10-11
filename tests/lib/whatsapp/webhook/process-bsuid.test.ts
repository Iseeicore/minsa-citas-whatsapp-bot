import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  enabled: true,
  screened: [] as string[],
  processBsuidChanges: vi.fn<(value: unknown) => Promise<void>>(async () => undefined),
}));

vi.mock("@/lib/db/persistence", () => ({ isDatabaseEnabled: () => state.enabled }));
vi.mock("@/lib/db/actor", () => ({
  ACTOR_EXTERNO_META: "externo:meta",
  actorCiudadano: (waId: string) => `ciudadano:${waId}`,
  declararActor: () => Promise.resolve(0),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    usuario: { upsert: () => Promise.resolve({ id: "u1" }) },
    mensaje: { create: () => Promise.resolve(undefined), updateMany: () => Promise.resolve(undefined) },
  },
}));
vi.mock("@/lib/fsm/session/session-store", () => ({
  findSession: async () => ({ state: "main_menu" }),
  sessionRowExists: async () => true,
}));
vi.mock("@/lib/security/perimeter", () => ({
  screenInbound: async ({ waId }: { waId: string }) => {
    state.screened.push(waId);
    return { action: "DROP" };
  },
}));
vi.mock("@/lib/whatsapp/webhook/answer", () => ({ answerMessage: vi.fn(), sendFixedReply: vi.fn(), answerFailure: vi.fn() }));
vi.mock("@/lib/whatsapp/inbound/postgres-inbound-buffer", () => ({ createPostgresInboundBuffer: () => ({}) }));
vi.mock("@/lib/whatsapp/inbound/inbound-coalescer", () => ({ createInboundCoalescer: () => ({ handle: async () => undefined }) }));
vi.mock("@/lib/whatsapp/webhook/user-id-update", () => ({ processBsuidChanges: state.processBsuidChanges }));

import { processValue } from "@/lib/whatsapp/webhook/process";

type Value = Parameters<typeof processValue>[0];

describe("processValue: cambios de identificador de Meta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.enabled = true;
    state.screened.length = 0;
  });

  it("aplica los cambios de BSUID del valor del webhook antes de los mensajes", async () => {
    const value = { user_id_update: [{ user_id: { previous: "PE.1", current: "PE.2" } }] } as unknown as Value;

    await processValue(value);

    expect(state.processBsuidChanges).toHaveBeenCalledTimes(1);
    expect(state.processBsuidChanges).toHaveBeenCalledWith(value);
  });

  it("sin base de datos no intenta migrar nada", async () => {
    state.enabled = false;

    await processValue({ user_id_update: [{ user_id: { previous: "PE.1", current: "PE.2" } }] } as unknown as Value);

    expect(state.processBsuidChanges).not.toHaveBeenCalled();
  });

  it("un mensaje de sistema no pasa por el perímetro ni se responde; el de texto sigue igual", async () => {
    await processValue({
      messages: [
        { id: "s1", from_user_id: "PE.2", timestamp: "1700000000", type: "system", system: { type: "user_changed_user_id", user_id: "PE.2" } },
        { id: "m1", from_user_id: "PE.2", timestamp: "1700000001", type: "text", text: { body: "hola" } },
      ],
    } as unknown as Value);

    expect(state.screened).toEqual(["PE.2"]);
  });
});
