import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureLogger } from "@/lib/observability/logger";
import { sendAndRecordCtaUrl, sendAndRecordEffect, sendTypingIndicator, sendWhatsAppEffect } from "@/lib/whatsapp/whatsapp-send";
import { SendType } from "@/lib/enums/send-type";
import { GraphResultStatus } from "@/lib/enums/graph-result-status";
import { LIST_OPEN_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { WHATSAPP_TEXT_BODY_MAX } from "@/lib/constants/limits/whatsapp";
import type { SendButtonsEffect } from "@/lib/fsm/core/types";

type Line = { level: string; event: string } & Record<string, unknown>;

describe("WhatsApp send failures reach the masked logger", () => {
  let lines: Line[];
  let restore: () => void;

  beforeEach(() => {
    lines = [];
    restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line) as Line), level: "info" });
    vi.stubEnv("META_PHONE_NUMBER_ID", "123");
    vi.stubEnv("META_ACCESS_TOKEN", "token");
  });

  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("logs a Graph API rejection with its status and the masked Meta error code and message, never the rest of the body", async () => {
    const body = `{"error":{"message":"Recipient 51987654321 is not a valid WhatsApp user","code":131026,"details":"${"x".repeat(400)}"}}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 400 })),
    );

    await sendAndRecordEffect(null, "51987654321", { kind: SendType.TEXT, text: "hola" });

    const failure = lines.find((line) => line.event === "outbound.rejected");
    expect(failure).toMatchObject({ level: "error", kind: SendType.TEXT, status: 400, errorCodeNumber: 131026 });
    expect(String(failure?.errorMessage)).toContain("is not a valid WhatsApp user");
    expect(JSON.stringify(failure)).not.toContain("51987654321");
    expect(JSON.stringify(failure)).not.toContain("xxxx");
    expect(JSON.stringify(failure)).not.toContain("hola");
  });

  it("logs a network error while sending a CTA button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await sendAndRecordCtaUrl(null, "51987654321", { bodyText: "Regístrate", buttonText: "Ir", url: "https://example.org" });

    expect(lines.find((line) => line.event === "whatsapp.send_failed")).toMatchObject({
      level: "error",
      operation: "send_cta_url",
      error: { name: "TypeError", message: "fetch failed" },
    });
  });

  it("labels the list opener with the shared list button text", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendAndRecordEffect(null, "51987654321", {
      kind: SendType.INTERACTIVE_LIST,
      text: "Elige",
      rows: [{ id: "1", title: "Uno" }],
    });

    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(sent.interactive.action.button).toBe(LIST_OPEN_BUTTON_TEXT);
  });

  it("a network failure on the direct send resolves as a Graph error instead of throwing", async () => {
    const failure = new TypeError("fetch failed");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw failure;
      }),
    );

    await expect(sendWhatsAppEffect("51987654321", { kind: SendType.TEXT, text: "hola" })).resolves.toEqual({
      status: GraphResultStatus.ERROR,
      httpStatus: 502,
      error: failure,
    });
  });

  it("a network failure while sending an effect is logged as a send failure and not as a rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(sendAndRecordEffect(null, "51987654321", { kind: SendType.TEXT, text: "hola" })).resolves.toBeNull();

    expect(lines.find((line) => line.event === "whatsapp.send_failed")).toMatchObject({ operation: "send_effect" });
    expect(lines.some((line) => line.event === "outbound.rejected")).toBe(false);
  });

  it("logs a failed typing indicator as a warning and never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(sendTypingIndicator("wamid.1")).resolves.toBeUndefined();

    expect(lines.find((line) => line.event === "whatsapp.typing_failed")).toMatchObject({ level: "warn" });
  });
});

describe("safety net: the person always receives something Meta accepts", () => {
  const WA_ID = "51987654321";
  const META_REJECTION = JSON.stringify({ error: { message: "(#131009) Parameter value is not valid", code: 131009 } });
  const graphOk = () => new Response(JSON.stringify({ messages: [{ id: "wamid.ok" }] }), { status: 200 });
  const graphRejected = () => new Response(META_REJECTION, { status: 400 });
  const confirmButtons: SendButtonsEffect = {
    kind: SendType.BUTTONS,
    text: "¿Confirmas la cita del 12345678?",
    buttons: [
      { id: "si", title: "Sí, confirmar" },
      { id: "no", title: "No, salir" },
    ],
  };

  let lines: Line[];
  let restore: () => void;
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

  const sentBodies = () => fetchMock.mock.calls.map((call) => JSON.parse(String(call[1].body)));
  const events = (event: string) => lines.filter((line) => line.event === event);

  beforeEach(() => {
    lines = [];
    restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line) as Line), level: "info" });
    vi.stubEnv("META_PHONE_NUMBER_ID", "123");
    vi.stubEnv("META_ACCESS_TOKEN", "token");
    fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => graphOk());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends an interactive message that breaks Meta limits as one plain text with numbered options", async () => {
    await sendAndRecordEffect(null, WA_ID, {
      kind: SendType.BUTTONS,
      text: "Elige una opción",
      buttons: [
        { id: "a", title: "Uno" },
        { id: "b", title: "Dos" },
        { id: "c", title: "Tres" },
        { id: "d", title: "Cuatro" },
      ],
    });

    expect(sentBodies()).toHaveLength(1);
    expect(sentBodies()[0]).toMatchObject({ type: "text", text: { body: "Elige una opción\n\n1. Uno\n2. Dos\n3. Tres\n4. Cuatro" } });
  });

  it("warns outbound.limit_violation with the broken limits, but not the text nor the phone", async () => {
    await sendAndRecordEffect(null, WA_ID, { ...confirmButtons, buttons: [{ id: "si", title: "Sí, quiero confirmar esta cita ahora" }] });

    const [warning] = events("outbound.limit_violation");
    expect(warning).toMatchObject({
      level: "warn",
      kind: SendType.BUTTONS,
      violations: [{ field: "button_title", rule: "max_length", index: 0, limit: 20 }],
    });
    expect(JSON.stringify(warning)).not.toContain(WA_ID);
    expect(JSON.stringify(warning)).not.toContain("Confirmas");
    expect(JSON.stringify(warning)).not.toContain("quiero confirmar");
  });

  it("sends a message within limits untouched and without warnings", async () => {
    await sendAndRecordEffect(null, WA_ID, confirmButtons);

    expect(sentBodies()).toHaveLength(1);
    expect(sentBodies()[0]).toMatchObject({ type: "interactive" });
    expect(events("outbound.limit_violation")).toEqual([]);
  });

  it("when Meta rejects an interactive message, sends ONE plain-text fallback with the numbered options", async () => {
    fetchMock.mockImplementationOnce(async () => graphRejected());

    await sendAndRecordEffect(null, WA_ID, confirmButtons);

    expect(sentBodies()).toHaveLength(2);
    expect(sentBodies()[1]).toMatchObject({
      type: "text",
      text: { body: "¿Confirmas la cita del 12345678?\n\n1. Sí, confirmar\n2. No, salir" },
    });
    const [rejection] = events("outbound.rejected");
    expect(rejection).toMatchObject({ level: "error", kind: SendType.BUTTONS, status: 400, errorCodeNumber: 131009 });
    expect(String(rejection.errorMessage)).toContain("Parameter value is not valid");
    expect(JSON.stringify(rejection)).not.toContain(WA_ID);
    expect(JSON.stringify(rejection)).not.toContain("12345678");
  });

  it("if the fallback is rejected too, it only logs and never sends a third time", async () => {
    fetchMock.mockImplementation(async () => graphRejected());

    await sendAndRecordEffect(null, WA_ID, confirmButtons);

    expect(sentBodies()).toHaveLength(2);
    expect(events("outbound.rejected").map((line) => line.kind)).toEqual([SendType.BUTTONS, SendType.TEXT]);
  });

  it("a rejected plain text is logged and not retried", async () => {
    fetchMock.mockImplementation(async () => graphRejected());

    await sendAndRecordEffect(null, WA_ID, { kind: SendType.TEXT, text: "hola" });

    expect(sentBodies()).toHaveLength(1);
    expect(events("outbound.rejected")).toHaveLength(1);
  });

  it("a fallback text that fails on the network is logged once and not retried", async () => {
    fetchMock
      .mockImplementationOnce(async () => graphRejected())
      .mockImplementationOnce(async () => {
        throw new TypeError("fetch failed");
      });

    await sendAndRecordEffect(null, WA_ID, confirmButtons);

    expect(sentBodies()).toHaveLength(2);
    expect(events("whatsapp.send_failed")).toHaveLength(1);
  });

  it("sends the plain-text fallback exactly once when Meta rejects the format with 400", async () => {
    fetchMock.mockImplementationOnce(async () => graphRejected());

    await expect(sendAndRecordEffect(null, WA_ID, confirmButtons)).resolves.toBe("wamid.ok");

    expect(sentBodies()).toHaveLength(2);
    expect(sentBodies()[1]).toMatchObject({ type: "text" });
  });

  it.each([401, 403, 404, 429, 500])("when Meta answers %i it only logs the rejection and sends no fallback", async (status) => {
    fetchMock.mockImplementationOnce(async () => new Response(META_REJECTION, { status }));

    await expect(sendAndRecordEffect(null, WA_ID, confirmButtons)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events("outbound.rejected")).toEqual([expect.objectContaining({ kind: SendType.BUTTONS, status })]);
  });

  it("the direct send used for fixed replies also degrades a message beyond the limits", async () => {
    await sendWhatsAppEffect(WA_ID, { kind: SendType.TEXT, text: "a".repeat(WHATSAPP_TEXT_BODY_MAX + 10) });

    expect(sentBodies()[0].text.body.length).toBeLessThanOrEqual(WHATSAPP_TEXT_BODY_MAX);
    expect(events("outbound.limit_violation")).toHaveLength(1);
  });
});
