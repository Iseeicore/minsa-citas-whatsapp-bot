import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationMessages } from "@/app/components/types";
import { useConversationActions } from "@/app/hooks/use-conversation-actions";
import { ConversationStatus } from "@/lib/enums/conversation-status";

type Actions = ReturnType<typeof useConversationActions>;
type Change = (data: ConversationMessages) => ConversationMessages;

const CURRENT: ConversationMessages = { messages: [], windowOpen: true, windowExpiresAt: null, status: ConversationStatus.OPEN };

function renderActions(update: (change: Change) => void): Actions {
  let actions: Actions | undefined;
  function Probe() {
    actions = useConversationActions("c-1", update);
    return createElement("span", null, `${actions.sending} ${actions.closing} ${actions.sendError ?? "-"} ${actions.closeError ?? "-"}`);
  }
  expect(renderToStaticMarkup(createElement(Probe))).toBe("<span>false false - -</span>");
  return actions as Actions;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useConversationActions", () => {
  it("sends the text and appends the created message to the conversation", async () => {
    const created = { id: "m-1", content: "hola" };
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json(created));
    vi.stubGlobal("fetch", fetchMock);
    const update = vi.fn<(change: Change) => void>();

    await expect(renderActions(update).send("hola")).resolves.toBe(true);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/messages/send");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ conversationId: "c-1", text: "hola" });
    expect(update.mock.calls[0][0](CURRENT).messages).toEqual([created]);
  });

  it("does not call the server for blank text nor touch the conversation when sending fails", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const update = vi.fn<(change: Change) => void>();
    const { send } = renderActions(update);

    await expect(send("   ")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(send("hola")).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("closes the conversation with the status the server returns", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => Response.json({ id: "c-1", status: ConversationStatus.CLOSED }));
    vi.stubGlobal("fetch", fetchMock);
    const update = vi.fn<(change: Change) => void>();

    await renderActions(update).close();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/conversations/c-1/close");
    expect(update.mock.calls[0][0](CURRENT).status).toBe(ConversationStatus.CLOSED);
  });
});
