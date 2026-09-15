import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { TransientFailureError } from "../domain/errors.js";
import { createMetaWhatsappSender } from "./meta-whatsapp-sender.js";

const BASE_CONFIG = {
  metaGraphApiVersion: "v21.0",
  metaPhoneNumberId: "test-phone-number-id",
  metaAccessToken: "test-meta-access-token",
};

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

function okFetch() {
  return vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
}

describe("createMetaWhatsappSender", () => {
  describe("sendText", () => {
    it("POSTs a text message to the Graph API URL built from metaGraphApiVersion/metaPhoneNumberId, Bearer-authenticated", async () => {
      const fetchImpl = okFetch();
      const sender = createMetaWhatsappSender({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await sender.sendText("+51987654321", "Hola, ¿en qué te ayudamos?");

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://graph.facebook.com/v21.0/test-phone-number-id/messages");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-meta-access-token");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body as string)).toEqual({
        messaging_product: "whatsapp",
        to: "+51987654321",
        type: "text",
        text: { body: "Hola, ¿en qué te ayudamos?" },
      });
    });

    it("builds the URL from a different metaGraphApiVersion/metaPhoneNumberId — proves it is not hardcoded", async () => {
      const fetchImpl = okFetch();
      const sender = createMetaWhatsappSender({
        config: { ...BASE_CONFIG, metaGraphApiVersion: "v19.0", metaPhoneNumberId: "another-phone-id" },
        logger: fakeLogger(),
        fetchImpl,
      });

      await sender.sendText("+51900000000", "hola");

      const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://graph.facebook.com/v19.0/another-phone-id/messages");
    });
  });

  describe("sendInteractiveList — D15 truncation, not rejection", () => {
    it("truncates a row title longer than 24 chars instead of throwing", async () => {
      const fetchImpl = okFetch();
      const sender = createMetaWhatsappSender({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });
      const longTitle = "Este título es demasiado largo para un row"; // > 24 chars

      await expect(
        sender.sendInteractiveList("+51987654321", {
          body: "Elegí una opción",
          buttonLabel: "Ver opciones",
          sections: [{ rows: [{ id: "opt_1", title: longTitle }] }],
        })
      ).resolves.toBeUndefined();

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      const sentTitle: string = body.interactive.action.sections[0].rows[0].title;
      expect(sentTitle).toHaveLength(24);
      expect(sentTitle).toBe(longTitle.slice(0, 24));
      expect(longTitle.length).toBeGreaterThan(24);
    });

    it("truncates a row description longer than 72 chars instead of throwing", async () => {
      const fetchImpl = okFetch();
      const sender = createMetaWhatsappSender({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });
      const longDescription =
        "Esta descripción es intencionalmente muy larga para superar el límite de setenta y dos caracteres impuesto por WhatsApp.";

      await sender.sendInteractiveList("+51987654321", {
        body: "Elegí una opción",
        buttonLabel: "Ver opciones",
        sections: [{ rows: [{ id: "opt_1", title: "Corto", description: longDescription }] }],
      });

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      const sentDescription: string = body.interactive.action.sections[0].rows[0].description;
      expect(sentDescription).toHaveLength(72);
      expect(sentDescription).toBe(longDescription.slice(0, 72));
      expect(longDescription.length).toBeGreaterThan(72);
    });

    it("does not truncate a title/description within the limits, and sends header/footer/section title when provided", async () => {
      const fetchImpl = okFetch();
      const sender = createMetaWhatsappSender({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await sender.sendInteractiveList("+51987654321", {
        body: "Elegí una opción",
        header: "Menú principal",
        footer: "MINSA",
        buttonLabel: "Ver opciones",
        sections: [{ title: "Trámites", rows: [{ id: "agendar_cita", title: "Agendar cita", description: "Reserva tu cita" }] }],
      });

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        messaging_product: "whatsapp",
        to: "+51987654321",
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "Menú principal" },
          body: { text: "Elegí una opción" },
          footer: { text: "MINSA" },
          action: {
            button: "Ver opciones",
            sections: [
              {
                title: "Trámites",
                rows: [{ id: "agendar_cita", title: "Agendar cita", description: "Reserva tu cita" }],
              },
            ],
          },
        },
      });
    });
  });

  describe("sendButtons", () => {
    it("POSTs an interactive button message with reply buttons", async () => {
      const fetchImpl = okFetch();
      const sender = createMetaWhatsappSender({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await sender.sendButtons("+51987654321", {
        body: "¿Confirmás?",
        buttons: [
          { id: "yes", title: "Sí" },
          { id: "no", title: "No" },
        ],
      });

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        messaging_product: "whatsapp",
        to: "+51987654321",
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "¿Confirmás?" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "yes", title: "Sí" } },
              { type: "reply", reply: { id: "no", title: "No" } },
            ],
          },
        },
      });
    });
  });

  describe("error classification — non-2xx and network failures are TransientFailureError, not thrown-through", () => {
    it("throws TransientFailureError when the Graph API responds non-2xx", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
      const sender = createMetaWhatsappSender({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await expect(sender.sendText("+51987654321", "hola")).rejects.toBeInstanceOf(TransientFailureError);
    });

    it("throws TransientFailureError when the Graph API responds 500", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response("server error", { status: 500 }));
      const sender = createMetaWhatsappSender({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await expect(sender.sendText("+51987654321", "hola")).rejects.toBeInstanceOf(TransientFailureError);
    });

    it("throws TransientFailureError when fetch itself rejects (network error / timeout)", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("network unreachable"));
      const sender = createMetaWhatsappSender({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await expect(sender.sendText("+51987654321", "hola")).rejects.toBeInstanceOf(TransientFailureError);
    });

    it("passes an AbortSignal to fetch so a hung request is bounded", async () => {
      const fetchImpl = okFetch();
      const sender = createMetaWhatsappSender({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await sender.sendText("+51987654321", "hola");

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
