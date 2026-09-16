// Webhook channel viewer (no-SDD fast path, explicit user decision): a
// deliberately simple, non-durable buffer so a human can see real inbound
// WhatsApp messages and reply manually from a frontend viewer — PARALLEL to
// the existing bot pipeline (/webhook/whatsapp -> ingestion.ingest() ->
// BullMQ -> worker.ts), which is untouched by this module.
//
// Trade-off accepted explicitly: this is a plain module-scope array, same
// "state lives in the process" discipline as vercel-handler.ts's
// cachedAppPromise — NOT durable storage. It is lost on every process
// restart, and on Vercel specifically it is PER SERVERLESS INSTANCE: if more
// than one instance is warm (common, not just under load), a POST from the
// webhook can land on a different instance than the GET a polling client
// hits, and the message will simply never appear there even though it truly
// arrived. Acceptable for this simple viewer, not a bug to fix here.

export interface WebhookChannelMessage {
  readonly id: string;
  readonly direction: "in" | "out";
  readonly from?: string;
  readonly to?: string;
  readonly text: string;
  readonly timestamp: string;
}

const MAX_BUFFER_SIZE = 200;

const buffer: WebhookChannelMessage[] = [];

export function pushMessage(entry: WebhookChannelMessage): void {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
  }
}

export function getMessages(): readonly WebhookChannelMessage[] {
  return buffer;
}

// Test-only: mirrors vercel-handler.ts's resetVercelHandlerCache — module
// state must be resettable between tests, or one test's messages leak into
// the next.
export function resetWebhookChannelBuffer(): void {
  buffer.length = 0;
}
