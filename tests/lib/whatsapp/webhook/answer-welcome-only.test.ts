import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendType } from "@/lib/enums/send-type";
import { OOS_MESSAGES } from "@/lib/constants/textos/fuera-de-alcance";
import { OosCategory } from "@/lib/enums/oos-category";

const mocks = vi.hoisted(() => ({
  sendAndRecordEffect: vi.fn(async () => ({ kind: "sent_no_id" })),
  saveSession: vi.fn(async () => undefined),
  runTurnUnlocked: vi.fn(),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  findSession: async () => ({ state: "cita_awaiting_dni", slots: {}, counters: {} }),
  saveSession: mocks.saveSession,
}));
vi.mock("@/lib/whatsapp/whatsapp-send", () => ({
  sendTypingIndicator: vi.fn(async () => undefined),
  sendAndRecordEffect: mocks.sendAndRecordEffect,
  sendWhatsAppEffect: vi.fn(async () => undefined),
  logSendFailure: vi.fn(),
}));
vi.mock("@/lib/fsm/core/executor", () => ({ runTurnUnlocked: mocks.runTurnUnlocked }));

import { answerMessage } from "@/lib/whatsapp/webhook/answer";

const textMessage = (body: string) =>
  ({
    from_user_id: "wa-bienvenida",
    id: "wamid.bienvenida",
    timestamp: "1700000000",
    type: "text",
    text: { body },
  }) as unknown as Parameters<typeof answerMessage>[0];

const sentEffects = () => mocks.sendAndRecordEffect.mock.calls.map((call) => (call as unknown[])[2]);

describe("answerMessage con los flujos de WhatsApp apagados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WHATSAPP_FLOWS_ENABLED", "false");
    vi.stubEnv("CONTACT_PHONE_NUMBER", "989 655 177");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("a mitad de un flujo, cualquier mensaje recibe la bienvenida con el teléfono y sin botones", async () => {
    await answerMessage(textMessage("12345678"), undefined);

    expect(mocks.runTurnUnlocked).not.toHaveBeenCalled();
    expect(sentEffects()).toHaveLength(1);
    const [welcome] = sentEffects() as { kind: string; text: string }[];
    expect(welcome.kind).toBe(SendType.TEXT);
    expect(welcome.text).toContain("https://fake-minsa-digital.test");
    expect(welcome.text).toContain("Si tienes alguna duda, llámanos al 989 655 177.");
    expect(mocks.saveSession).toHaveBeenCalledWith("wa-bienvenida", expect.objectContaining({ state: "main_menu", slots: {} }));
  });

  it("una emergencia sigue recibiendo el aviso del 106", async () => {
    await answerMessage(textMessage("me estoy desangrando, es una emergencia"), undefined);

    expect(sentEffects()).toEqual([{ kind: SendType.TEXT, text: OOS_MESSAGES[OosCategory.OOS_01] }]);
  });
});
