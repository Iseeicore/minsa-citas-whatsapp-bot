import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";
import type { WhatsAppMessage } from "@/lib/whatsapp/webhook/payload";
import type { InboundBuffer, PendingInbound } from "@/lib/whatsapp/inbound/inbound-buffer";
import type { LatencyMarks } from "@/lib/observability/inbound-latency";
import {
  INBOUND_MAX_AGE_MS,
  INBOUND_MAX_BATCH,
  INBOUND_MAX_WAIT_MS,
  INBOUND_REPEAT_WINDOW_MS,
} from "@/lib/whatsapp/inbound/inbound-policy";

export type InboundTurn = { message: WhatsAppMessage; mediaIds?: string[] };

export type InboundCoalescerDeps = {
  buffer: InboundBuffer;
  runTurn: (waId: string, task: () => Promise<void>) => Promise<void>;
  answer: (turn: InboundTurn, usuarioId: string, marks?: LatencyMarks) => Promise<void>;
  notifyStale: (waId: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export type InboundInput = { message: WhatsAppMessage; usuarioId: string; windowMs: number; marks?: LatencyMarks };

type Run = { tipo: TipoMensajeId | null; rows: PendingInbound[] };

const groupedTipo = (row: PendingInbound): TipoMensajeId | null =>
  (row.tipoMensajeId === TipoMensajeId.TEXTO && row.contenido) || row.tipoMensajeId === TipoMensajeId.IMAGEN ? row.tipoMensajeId : null;

function baseMessage(row: PendingInbound, own: WhatsAppMessage, type: string): WhatsAppMessage {
  return {
    id: row.waMessageId,
    from_user_id: own.from_user_id,
    ...(own.from ? { from: own.from } : {}),
    timestamp: String(Math.floor(row.fechaHora.getTime() / 1000)),
    type,
  };
}

function textTurn(rows: PendingInbound[], own: WhatsAppMessage): InboundTurn {
  const last = rows[rows.length - 1];
  if (rows.length === 1 && last.waMessageId === own.id) return { message: own };
  return { message: { ...baseMessage(last, own, "text"), text: { body: rows.map((row) => row.contenido).join("\n") } } };
}

function imageTurn(rows: PendingInbound[], own: WhatsAppMessage): InboundTurn {
  const mediaIds = rows.map((row) => row.mediaId).filter((mediaId): mediaId is string => !!mediaId);
  const last = rows[rows.length - 1];
  if (rows.length === 1 && last.waMessageId === own.id) return { message: own, mediaIds };
  return { message: { ...baseMessage(last, own, "image"), image: { id: mediaIds[mediaIds.length - 1] } }, mediaIds };
}

export function groupBatch(rows: PendingInbound[], own: WhatsAppMessage): InboundTurn[] {
  const runs: Run[] = [];
  for (const row of rows) {
    const tipo = groupedTipo(row);
    const current = runs[runs.length - 1];
    if (current && tipo !== null && current.tipo === tipo) current.rows.push(row);
    else runs.push({ tipo, rows: [row] });
  }

  return runs.flatMap((run): InboundTurn[] => {
    if (run.tipo === TipoMensajeId.TEXTO) return [textTurn(run.rows, own)];
    if (run.tipo === TipoMensajeId.IMAGEN) return [imageTurn(run.rows, own)];
    return run.rows.some((row) => row.waMessageId === own.id) ? [{ message: own }] : [];
  });
}

export function createInboundCoalescer(deps: InboundCoalescerDeps) {
  const { buffer } = deps;

  async function flush(input: InboundInput): Promise<void> {
    const { message, usuarioId, marks } = input;
    let claimed = 0;

    do {
      claimed = 0;
      await deps.runTurn(message.from_user_id, async () => {
        marks?.mark("lock");
        const rows = await buffer.claim(usuarioId, INBOUND_MAX_BATCH, message.id);
        claimed = rows.length;
        for (const turn of groupBatch(rows, message)) await deps.answer(turn, usuarioId, marks);
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
    input.marks?.mark("window");

    await flush(input);
  }

  return { handle };
}
