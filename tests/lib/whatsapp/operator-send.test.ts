import { beforeEach, describe, expect, it, vi } from "vitest";
import { SendOutcomeKind } from "@/lib/enums/send-outcome-kind";
import { OperatorSendStatus } from "@/lib/enums/operator-send-status";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import type { SendOutcome } from "@/lib/fsm/core/types";
import { captureLogs } from "@/tests/support/capture-logs";

const mocks = vi.hoisted(() => ({
  sendOperatorText: vi.fn<(waId: string, text: string) => Promise<SendOutcome>>(),
  recordOutboundMessage: vi.fn(async () => ({ id: "m-1" })),
}));

vi.mock("@/lib/whatsapp/whatsapp-send", () => ({ sendOperatorText: mocks.sendOperatorText }));
vi.mock("@/lib/inbox/repository", () => ({ recordOutboundMessage: mocks.recordOutboundMessage }));

import { sendOperatorMessage } from "@/lib/whatsapp/operator-send";

const CONVERSATION = { id: "u-1", waId: "wa-1" };

describe("sendOperatorMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each<[string, SendOutcome, string | null]>([
    ["with its id", { kind: SendOutcomeKind.SENT, messageId: "wamid.out" }, "wamid.out"],
    ["without an id", { kind: SendOutcomeKind.SENT_NO_ID }, null],
  ])("records a message WhatsApp accepted %s, signed by the inbox operator", async (_label, outcome, waMessageId) => {
    mocks.sendOperatorText.mockResolvedValueOnce(outcome);

    const result = await sendOperatorMessage(CONVERSATION, "hola");

    expect(result).toEqual({ status: OperatorSendStatus.SENT, message: { id: "m-1" } });
    expect(mocks.sendOperatorText).toHaveBeenCalledWith("wa-1", "hola");
    expect(mocks.recordOutboundMessage).toHaveBeenCalledWith("u-1", "hola", waMessageId, "operador:bandeja");
  });

  it.each<[string, SendOutcome, ApiErrorCode]>([
    ["rejected", { kind: SendOutcomeKind.REJECTED, status: 400 }, ApiErrorCode.WHATSAPP_REJECTED],
    ["throttled", { kind: SendOutcomeKind.REJECTED, status: 429 }, ApiErrorCode.WHATSAPP_UNAVAILABLE],
    ["never sent", { kind: SendOutcomeKind.FAILED }, ApiErrorCode.WHATSAPP_UNAVAILABLE],
  ])("records nothing and logs inbox.send_failed when the message was %s", async (_label, outcome, errorCode) => {
    mocks.sendOperatorText.mockResolvedValueOnce(outcome);
    const logs = captureLogs();

    const result = await sendOperatorMessage(CONVERSATION, "hola");

    expect(result).toEqual({ status: OperatorSendStatus.FAILED, errorCode });
    expect(mocks.recordOutboundMessage).not.toHaveBeenCalled();
    expect(logs).toContainEqual(expect.objectContaining({ level: "error", event: "inbox.send_failed", conversationId: "u-1" }));
  });
});
