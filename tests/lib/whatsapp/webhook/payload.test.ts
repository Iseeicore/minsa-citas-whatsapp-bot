import { describe, expect, it, vi } from "vitest";

const media = vi.hoisted(() => ({ download: vi.fn(async () => "data:image/png;base64,AAAA") }));
vi.mock("@/lib/whatsapp/whatsapp-media", () => ({ downloadWhatsAppMediaAsDataUri: media.download }));

import { toInboundEvent, type WhatsAppMessage } from "@/lib/whatsapp/webhook/payload";

const WA = "51999000111";
const base = { id: "wamid.1", from_user_id: WA, timestamp: "1" };
const message = (extra: Partial<WhatsAppMessage> & { type: string }): WhatsAppMessage => ({ ...base, ...extra });

describe("toInboundEvent: what reaches the flow when an incidencia asks for evidence", () => {
  it("an image while the evidence is asked becomes an image event, and it is never downloaded", async () => {
    const event = await toInboundEvent(WA, message({ type: "image", image: { id: "m1", caption: "el cobro" } }), "incidencia_awaiting_foto");

    expect(event).toEqual({ from: WA, type: "image", text: "el cobro" });
    expect(media.download).not.toHaveBeenCalled();
  });

  it("a document (a PDF) while the evidence is asked becomes a document event, with no download and without its file name", async () => {
    const event = await toInboundEvent(WA, message({ type: "document", document: { id: "m2", filename: "recibo-juan-quispe.pdf" } }), "incidencia_awaiting_foto");

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
    await expect(toInboundEvent(WA, incoming, "incidencia_awaiting_foto")).resolves.toBeNull();
  });

  it.each(["main_menu", "incidencia_awaiting_descripcion", "cita_awaiting_dni", "incidencia_confirm_ubicacion"])(
    "an image or a document in %s is ignored: evidence is only read when it was asked for",
    async (state) => {
      await expect(toInboundEvent(WA, message({ type: "image", image: { id: "m1" } }), state)).resolves.toBeNull();
      await expect(toInboundEvent(WA, message({ type: "document", document: { id: "m2" } }), state)).resolves.toBeNull();
    },
  );

  it("text and taps keep working in any state", async () => {
    await expect(toInboundEvent(WA, message({ type: "text", text: { body: "hola" } }), "main_menu")).resolves.toEqual({ from: WA, type: "text", text: "hola" });
    await expect(
      toInboundEvent(WA, message({ type: "interactive", interactive: { button_reply: { id: "incidencia_anonimo" } } }), "incidencia_identity_choice"),
    ).resolves.toEqual({ from: WA, type: "button", listId: "incidencia_anonimo" });
  });
});
