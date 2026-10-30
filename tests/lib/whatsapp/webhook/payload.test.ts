import { beforeEach, describe, expect, it, vi } from "vitest";

const media = vi.hoisted(() => ({
  download: vi.fn(async (): Promise<unknown> => ({ kind: "data", dataUri: "data:image/png;base64,AAAA" })),
}));
vi.mock("@/lib/whatsapp/whatsapp-media", () => ({ downloadWhatsAppMediaAsDataUri: media.download }));

import { mapStatus, toInboundEvent, type WhatsAppMessage } from "@/lib/whatsapp/webhook/payload";
import { EstadoMensajeId } from "@/lib/enums/estado-mensaje-id";
import { InboundMediaKind } from "@/lib/enums/inbound-media-kind";
import { MediaFailure } from "@/lib/enums/media-failure";

const WA = "51999000111";
const base = { id: "wamid.1", from_user_id: WA, timestamp: "1" };
const message = (extra: Partial<WhatsAppMessage> & { type: string }): WhatsAppMessage => ({ ...base, ...extra });

describe("toInboundEvent: what reaches the flow when an incidencia asks for evidence", () => {
  beforeEach(() => media.download.mockClear());

  it("an image while the evidence is asked is downloaded and travels as a data URI", async () => {
    const event = await toInboundEvent(
      WA,
      message({ type: "image", image: { id: "m1", caption: "el cobro" } }),
      "incidencia_awaiting_foto",
    );

    expect(event).toEqual({ from: WA, type: "image", text: "el cobro", mediaDataUri: "data:image/png;base64,AAAA" });
    expect(media.download).toHaveBeenCalledWith("m1");
  });

  it("an image that could not be downloaded still reaches the flow, with the reason", async () => {
    media.download.mockResolvedValueOnce({ kind: "failure", failure: "unreadable" });
    const event = await toInboundEvent(WA, message({ type: "image", image: { id: "m1" } }), "incidencia_awaiting_foto");

    expect(event).toEqual({ from: WA, type: "image", text: undefined, mediaFailure: "unreadable" });
  });

  it("an image over the size limit reaches the flow flagged as too large", async () => {
    media.download.mockResolvedValueOnce({ kind: "failure", failure: "too_large" });
    const event = await toInboundEvent(WA, message({ type: "image", image: { id: "m1" } }), "incidencia_awaiting_foto");

    expect(event).toEqual({ from: WA, type: "image", text: undefined, mediaFailure: "too_large" });
  });

  it("an album downloads every image in parallel and travels as one event with one entry per image, in order", async () => {
    const pending: Array<(value: unknown) => void> = [];
    for (let call = 0; call < 3; call += 1) media.download.mockImplementationOnce(() => new Promise((resolve) => pending.push(resolve)));

    const eventPromise = toInboundEvent(WA, message({ type: "image", image: { id: "m3" } }), "incidencia_awaiting_foto", [
      "m1",
      "m2",
      "m3",
    ]);
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    pending[2]({ kind: "data", dataUri: "data:image/png;base64,CCCC" });
    pending[0]({ kind: "data", dataUri: "data:image/png;base64,AAAA" });
    pending[1]({ kind: "failure", failure: "too_large" });

    expect(await eventPromise).toEqual({
      from: WA,
      type: "image",
      media: [
        { kind: InboundMediaKind.DATA, dataUri: "data:image/png;base64,AAAA" },
        { kind: InboundMediaKind.FAILURE, failure: MediaFailure.TOO_LARGE },
        { kind: InboundMediaKind.DATA, dataUri: "data:image/png;base64,CCCC" },
      ],
    });
    expect(media.download.mock.calls.map((call) => (call as unknown[])[0])).toEqual(["m1", "m2", "m3"]);
  });

  it("an album over the cap downloads only the first five and marks the rest as over the limit", async () => {
    const ids = ["m1", "m2", "m3", "m4", "m5", "m6", "m7"];
    const event = await toInboundEvent(WA, message({ type: "image", image: { id: "m7" } }), "incidencia_awaiting_foto", ids);

    expect(media.download).toHaveBeenCalledTimes(5);
    expect(event?.media).toHaveLength(7);
    const overLimit = { kind: InboundMediaKind.FAILURE, failure: MediaFailure.OVER_LIMIT };
    expect(event?.media?.slice(5)).toEqual([overLimit, overLimit]);
  });

  it("a single media id keeps the single-image event", async () => {
    const event = await toInboundEvent(WA, message({ type: "image", image: { id: "m1" } }), "incidencia_awaiting_foto", ["m1"]);

    expect(event).toEqual({ from: WA, type: "image", text: undefined, mediaDataUri: "data:image/png;base64,AAAA" });
  });

  it("an album outside the evidence step is ignored and nothing is downloaded", async () => {
    await expect(toInboundEvent(WA, message({ type: "image", image: { id: "m2" } }), "main_menu", ["m1", "m2"])).resolves.toBeUndefined();
    expect(media.download).not.toHaveBeenCalled();
  });

  it("a document (a PDF) becomes a document event: it is never downloaded and its file name is not read", async () => {
    const event = await toInboundEvent(
      WA,
      message({ type: "document", document: { id: "m2", filename: "recibo-juan-quispe.pdf" } }),
      "incidencia_awaiting_foto",
    );

    expect(event).toEqual({ from: WA, type: "document" });
    expect(media.download).not.toHaveBeenCalled();
  });

  it.each([
    ["a sticker", message({ type: "sticker" })],
    ["an audio", message({ type: "audio", audio: { id: "m3" } })],
    ["a location", message({ type: "location", location: { latitude: 1, longitude: 2 } })],
    ["a video", message({ type: "video" })],
    ["an image with no id", message({ type: "image", image: {} })],
    ["a document with no id", message({ type: "document", document: { filename: "x.pdf" } })],
  ])("%s is not a file: it is ignored in silence", async (_label, incoming) => {
    await expect(toInboundEvent(WA, incoming, "incidencia_awaiting_foto")).resolves.toBeUndefined();
  });

  it.each(["main_menu", "incidencia_awaiting_descripcion", "cita_awaiting_dni", "incidencia_confirm_ubicacion"])(
    "an image or a document in %s is ignored: evidence is only read when it was asked for",
    async (state) => {
      await expect(toInboundEvent(WA, message({ type: "image", image: { id: "m1" } }), state)).resolves.toBeUndefined();
      await expect(toInboundEvent(WA, message({ type: "document", document: { id: "m2" } }), state)).resolves.toBeUndefined();
    },
  );

  it("text and taps keep working in any state", async () => {
    await expect(toInboundEvent(WA, message({ type: "text", text: { body: "hola" } }), "main_menu")).resolves.toEqual({
      from: WA,
      type: "text",
      text: "hola",
    });
    await expect(
      toInboundEvent(
        WA,
        message({ type: "interactive", interactive: { button_reply: { id: "incidencia_anonimo" } } }),
        "incidencia_identity_choice",
      ),
    ).resolves.toEqual({ from: WA, type: "button", listId: "incidencia_anonimo" });
  });

  it("a tap carries the id of the message its button or list row belonged to", async () => {
    const context = { from: "15550000000", id: "wamid.resumen" };

    await expect(
      toInboundEvent(WA, message({ type: "interactive", interactive: { button_reply: { id: "si" } }, context }), "main_menu"),
    ).resolves.toEqual({ from: WA, type: "button", listId: "si", replyTo: "wamid.resumen" });
    await expect(
      toInboundEvent(WA, message({ type: "interactive", interactive: { list_reply: { id: "3" } }, context }), "main_menu"),
    ).resolves.toEqual({ from: WA, type: "list", listId: "3", replyTo: "wamid.resumen" });
  });

  it("a quoted text reply is still plain text: its context is not a tap", async () => {
    const event = await toInboundEvent(
      WA,
      message({ type: "text", text: { body: "si" }, context: { from: "15550000000", id: "wamid.resumen" } }),
      "main_menu",
    );

    expect(event).toEqual({ from: WA, type: "text", text: "si" });
  });
});

describe("mapStatus", () => {
  it("traduce los estados que Meta informa", () => {
    expect(mapStatus("read")).toBe(EstadoMensajeId.LEIDO);
  });

  it("un estado que no se guarda no tiene valor", () => {
    expect(mapStatus("deleted")).toBeUndefined();
  });
});
