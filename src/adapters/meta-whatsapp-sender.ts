import type pino from "pino";
import type { ButtonMessage, InteractiveList, WhatsappOutboundSender } from "../ports/whatsapp-outbound-sender.js";
import { TransientFailureError } from "../domain/errors.js";

export interface MetaWhatsappSenderDeps {
  config: {
    metaGraphApiVersion: string;
    metaPhoneNumberId: string;
    metaAccessToken: string;
  };
  logger: pino.Logger;
  /** Injected for testability (no module mocks) — defaults to Node's global `fetch`. */
  fetchImpl?: typeof fetch;
}

// D15: WhatsApp's own wire limits for an interactive list row. Truncating —
// never throwing — is deliberate: the domain must not know Meta's wire
// limits, and throwing would convert a copy-length slip into a retried, then
// dead-lettered, citizen-facing silence.
const LIST_ITEM_TITLE_MAX = 24;
const LIST_ITEM_DESCRIPTION_MAX = 72;

// This is the one fetch timeout/error convention the ~8 later HTTP clients
// reuse (design note) — Stage A owns it so Stages B/C do not each invent one.
const REQUEST_TIMEOUT_MS = 10_000;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function graphApiUrl(config: MetaWhatsappSenderDeps["config"]): string {
  return `https://graph.facebook.com/${config.metaGraphApiVersion}/${config.metaPhoneNumberId}/messages`;
}

// Synchronous constructor, no I/O at construction time (same discipline as
// the other adapters in this codebase) — there is nothing to connect, but
// the shape stays consistent: a factory that returns the port, never throws.
export function createMetaWhatsappSender(deps: MetaWhatsappSenderDeps): WhatsappOutboundSender {
  const { config, logger, fetchImpl = fetch } = deps;
  const url = graphApiUrl(config);

  // Shared error wrapper (design note): every send method funnels through
  // this so a non-2xx response and a network/timeout failure both surface
  // uniformly as TransientFailureError — the worker's outcome classifier
  // (PR6) retries either case, since a Graph API hiccup is not a citizen's
  // business rejection.
  async function post(body: unknown): Promise<void> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.metaAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new TransientFailureError("[whatsapp-sender:meta] Fallo de red al llamar a la Graph API", { cause: err });
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body: responseBody },
        "[whatsapp-sender:meta] La Graph API respondió con error"
      );
      throw new TransientFailureError(`[whatsapp-sender:meta] La Graph API respondió ${response.status}`);
    }
  }

  return {
    async sendText(to: string, body: string) {
      await post({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      });
    },

    async sendInteractiveList(to: string, list: InteractiveList) {
      await post({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          ...(list.header !== undefined ? { header: { type: "text", text: list.header } } : {}),
          body: { text: list.body },
          ...(list.footer !== undefined ? { footer: { text: list.footer } } : {}),
          action: {
            button: list.buttonLabel,
            sections: list.sections.map((section) => ({
              ...(section.title !== undefined ? { title: section.title } : {}),
              rows: section.rows.map((row) => ({
                id: row.id,
                title: truncate(row.title, LIST_ITEM_TITLE_MAX),
                ...(row.description !== undefined
                  ? { description: truncate(row.description, LIST_ITEM_DESCRIPTION_MAX) }
                  : {}),
              })),
            })),
          },
        },
      });
    },

    async sendButtons(to: string, buttons: ButtonMessage) {
      await post({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: buttons.body },
          action: {
            buttons: buttons.buttons.map((button) => ({
              type: "reply",
              reply: { id: button.id, title: button.title },
            })),
          },
        },
      });
    },
  };
}
