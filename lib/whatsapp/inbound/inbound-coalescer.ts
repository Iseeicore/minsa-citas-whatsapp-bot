import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";
import type { WhatsAppMessage } from "@/lib/whatsapp/webhook/payload";
import type { InboundBuffer, PendingInbound } from "@/lib/whatsapp/inbound/inbound-buffer";
import {
  INBOUND_MAX_AGE_MS,
  INBOUND_MAX_BATCH,
  INBOUND_MAX_WAIT_MS,
  INBOUND_REPEAT_WINDOW_MS,
} from "@/lib/whatsapp/inbound/inbound-policy";

export type InboundCoalescerDeps = {
  buffer: InboundBuffer;
  runTurn: (waId: string, task: () => Promise<void>) => Promise<void>;
  answer: (message: WhatsAppMessage, usuarioId: string) => Promise<void>;
  notifyStale: (waId: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export type InboundInput = { message: WhatsAppMessage; usuarioId: string; windowMs: number };

/** Une los textos pendientes en un solo mensaje; si hay algo que no es texto, solo responde al mensaje propio. */
function mergeBatch(rows: PendingInbound[], own: WhatsAppMessage): WhatsAppMessage {
  const texts = rows.filter((row) => row.tipoMensajeId === TipoMensajeId.TEXTO && row.contenido);
  if (texts.length !== rows.length) return own;

  const last = rows[rows.length - 1];
  if (rows.length === 1 && last.waMessageId === own.id) return own;

  return {
    ...own,
    id: last.waMessageId,
    type: "text",
    text: { body: rows.map((row) => row.contenido).join("\n") },
  };
}

/**
 * Agrupa los mensajes seguidos de una misma persona: cada uno espera su ventana y solo responde el último en llegar
 * (o el más antiguo si ya esperó el máximo). Un mensaje viejo se descarta y no entra al flujo.
 */
export function createInboundCoalescer(deps: InboundCoalescerDeps) {
  const { buffer } = deps;

  async function flush(input: InboundInput): Promise<void> {
    const { message, usuarioId } = input;
    let claimed = 0;

    do {
      claimed = 0;
      await deps.runTurn(message.from_user_id, async () => {
        const rows = await buffer.claim(usuarioId, INBOUND_MAX_BATCH, message.id);
        claimed = rows.length;
        if (rows.length === 0) return;
        await deps.answer(mergeBatch(rows, message), usuarioId);
      });
    } while (claimed === INBOUND_MAX_BATCH);
  }

  async function handle(input: InboundInput): Promise<void> {
    const { message, usuarioId, windowMs } = input;
    const nowMs = deps.now();

    if (nowMs - Number(message.timestamp) * 1000 > INBOUND_MAX_AGE_MS) {
      await buffer.discard(message.id);
      await deps.notifyStale(message.from_user_id);
      return;
    }

    const text = message.type === "text" ? message.text?.body : undefined;
    if (windowMs === 0 && text) {
      const since = new Date(nowMs - INBOUND_REPEAT_WINDOW_MS);
      if (await buffer.wasRepeated(usuarioId, message.id, text, since)) {
        await buffer.discard(message.id);
        return;
      }
    }

    if (windowMs > 0) {
      await deps.sleep(windowMs);
      const summary = await buffer.summarize(usuarioId);
      if (summary.count === 0 || !summary.oldestArrivedAt) return;

      const waitedMs = deps.now() - summary.oldestArrivedAt.getTime();
      if (summary.newestWaMessageId !== message.id && waitedMs < INBOUND_MAX_WAIT_MS) return;
    }

    await flush(input);
  }

  return { handle };
}
