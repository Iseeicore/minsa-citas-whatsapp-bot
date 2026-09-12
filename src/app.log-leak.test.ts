import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { createMemoryConversationEventDao } from "./adapters/memory-conversation-event-dao.js";
import { createWebhookIngestionService } from "./services/webhook-ingestion.js";

function sign(rawBody: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

// Reuses the { writable: true, write(msg) } collector pattern used
// throughout this change's log-assertion tests.
function collectingLogger() {
  const lines: string[] = [];
  const logger = createLogger({
    writable: true,
    write(msg: string) {
      lines.push(msg);
    },
  });
  return { logger, raw: () => lines.join("\n") };
}

// D7 — the single highest-value test in this revision: drives a realistic
// signed payload containing a fake MSISDN and message body through the REAL
// composition (buildApp + the real service + the real memory DAO), end to
// end, and proves neither string ever reaches the log stream. This is
// health-adjacent personal data (a MINSA appointment flow) — the assertion
// is that the data is absent, not masked or truncated.
describe("log-leak guard (D7) — MSISDN and message body never reach the log stream", () => {
  it("no emitted log line contains the phone number or the message text, end to end", async () => {
    const { logger, raw } = collectingLogger();
    const dao = createMemoryConversationEventDao({ logger });
    const ingestion = createWebhookIngestionService({ dao, logger, logHashSecret: config.logHashSecret });
    const app = await buildApp({ logger, ingestion });

    const FAKE_MSISDN = "51987654321";
    const FAKE_TEXT = "Necesito una cita para el 14 de marzo, mi DNI es 87654321";
    const FAKE_CONTACT_NAME = "Ciudadano De Prueba";

    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "1234567890" },
                contacts: [{ profile: { name: FAKE_CONTACT_NAME }, wa_id: FAKE_MSISDN }],
                messages: [
                  {
                    from: FAKE_MSISDN,
                    id: "wamid.log-leak-guard",
                    timestamp: "1700000000",
                    type: "text",
                    text: { body: FAKE_TEXT },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody, config.metaAppSecret);

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);

    const output = raw();
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toContain(FAKE_MSISDN);
    expect(output).not.toContain(FAKE_TEXT);
    expect(output).not.toContain(FAKE_CONTACT_NAME);
  });
});
