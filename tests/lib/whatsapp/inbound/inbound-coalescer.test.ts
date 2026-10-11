import { describe, expect, it } from "vitest";
import {
  createInboundCoalescer,
  type InboundCoalescerDeps,
} from "@/lib/whatsapp/inbound/inbound-coalescer";
import type { InboundBuffer, PendingInbound } from "@/lib/whatsapp/inbound/inbound-buffer";
import { INBOUND_MAX_AGE_MS, INBOUND_MAX_BATCH, INBOUND_MAX_WAIT_MS } from "@/lib/whatsapp/inbound/inbound-policy";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";
import type { WhatsAppMessage } from "@/lib/whatsapp/webhook/payload";

const T0 = Date.parse("2026-10-10T12:00:00.000Z");

type Row = PendingInbound & { processed: boolean };

function createFakeBuffer(rows: Row[]): InboundBuffer {
  const pending = (usuarioId: string) =>
    rows.filter((row) => row.usuarioId === usuarioId && !row.processed).sort((a, b) => a.arrivedAt.getTime() - b.arrivedAt.getTime());

  return {
    async summarize(usuarioId) {
      const list = pending(usuarioId);
      if (list.length === 0) return { count: 0, newestWaMessageId: null, oldestArrivedAt: null };
      return { count: list.length, newestWaMessageId: list[list.length - 1].waMessageId, oldestArrivedAt: list[0].arrivedAt };
    },
    async claim(usuarioId, limit, ownerWaMessageId) {
      const claimed = pending(usuarioId)
        .filter((candidate) => candidate.tipoMensajeId === TipoMensajeId.TEXTO || candidate.waMessageId === ownerWaMessageId)
        .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime() || a.arrivedAt.getTime() - b.arrivedAt.getTime())
        .slice(0, limit);
      for (const row of claimed) row.processed = true;
      return claimed;
    },
    async discard(waMessageId) {
      const row = rows.find((candidate) => candidate.waMessageId === waMessageId);
      if (row) row.processed = true;
    },
    async wasRepeated(usuarioId, waMessageId, contenido, since) {
      return rows.some(
        (row) =>
          row.usuarioId === usuarioId &&
          row.waMessageId !== waMessageId &&
          row.contenido === contenido &&
          row.processed &&
          row.arrivedAt.getTime() >= since.getTime(),
      );
    },
    async expireStale() {
      return 0;
    },
  };
}

function row(id: string, contenido: string | null, secondsAfter: number, overrides: Partial<Row> = {}): Row {
  const at = new Date(T0 + secondsAfter * 1000);
  return {
    usuarioId: "u1",
    waMessageId: id,
    contenido,
    tipoMensajeId: TipoMensajeId.TEXTO,
    fechaHora: at,
    arrivedAt: at,
    processed: false,
    ...overrides,
  };
}

function messageFor(source: Row, type = "text"): WhatsAppMessage {
  return {
    id: source.waMessageId,
    from_user_id: "wa1",
    timestamp: String(Math.floor(source.fechaHora.getTime() / 1000)),
    type,
    text: { body: source.contenido ?? undefined },
  };
}

function setup(rows: Row[], options: { nowMs?: number } = {}) {
  const answered: Array<{ message: WhatsAppMessage; usuarioId: string }> = [];
  const notified: string[] = [];
  const slept: number[] = [];
  const clock = { nowMs: options.nowMs ?? T0 };

  const deps: InboundCoalescerDeps = {
    buffer: createFakeBuffer(rows),
    runTurn: async (_waId, task) => task(),
    answer: async (message, usuarioId) => {
      answered.push({ message, usuarioId });
    },
    notifyStale: async (waId) => {
      notified.push(waId);
    },
    sleep: async (ms) => {
      slept.push(ms);
    },
    now: () => clock.nowMs,
  };

  return { coalescer: createInboundCoalescer(deps), answered, notified, slept, clock };
}

describe("createInboundCoalescer", () => {
  it("answers immediately, without sleeping, when the window is 0", async () => {
    const a = row("m1", "12345678", 0);
    const { coalescer, answered, slept } = setup([a]);

    await coalescer.handle({ message: messageFor(a), usuarioId: "u1", windowMs: 0 });

    expect(slept).toEqual([]);
    expect(answered).toHaveLength(1);
    expect(answered[0].message.text?.body).toBe("12345678");
    expect(answered[0].usuarioId).toBe("u1");
  });

  it("lets only the last of several fast messages answer, with the texts merged in order", async () => {
    const a = row("m1", "quiero una cita", 0);
    const b = row("m2", "en san borja", 1);
    const c = row("m3", "con cardiologia", 2);
    const { coalescer, answered } = setup([a, b, c], { nowMs: T0 + 2000 });

    await Promise.all([
      coalescer.handle({ message: messageFor(a), usuarioId: "u1", windowMs: 3000 }),
      coalescer.handle({ message: messageFor(b), usuarioId: "u1", windowMs: 3000 }),
      coalescer.handle({ message: messageFor(c), usuarioId: "u1", windowMs: 3000 }),
    ]);

    expect(answered).toHaveLength(1);
    expect(answered[0].message.id).toBe("m3");
    expect(answered[0].message.text?.body).toBe("quiero una cita\nen san borja\ncon cardiologia");
  });

  it("orders the merge by the Meta timestamp, then by arrival, when messages come out of order", async () => {
    const late = row("m2", "segundo", 0, { fechaHora: new Date(T0 + 1000), arrivedAt: new Date(T0 + 100) });
    const early = row("m1", "primero", 0, { fechaHora: new Date(T0), arrivedAt: new Date(T0 + 200) });
    const { coalescer, answered } = setup([late, early], { nowMs: T0 + 300 });

    await coalescer.handle({ message: messageFor(early), usuarioId: "u1", windowMs: 3000 });

    expect(answered[0].message.text?.body).toBe("primero\nsegundo");
  });

  it("does nothing when another handler already claimed the pending messages", async () => {
    const a = row("m1", "hola", 0, { processed: true });
    const { coalescer, answered } = setup([a]);

    await coalescer.handle({ message: messageFor(a), usuarioId: "u1", windowMs: 3000 });

    expect(answered).toEqual([]);
  });

  it("flushes anyway when the oldest pending message has waited the maximum, even if newer ones keep coming", async () => {
    const old = row("m1", "uno", 0);
    const newer = row("m2", "dos", 0, { arrivedAt: new Date(T0 + INBOUND_MAX_WAIT_MS) });
    const { coalescer, answered } = setup([old, newer], { nowMs: T0 + INBOUND_MAX_WAIT_MS });

    await coalescer.handle({ message: messageFor(old), usuarioId: "u1", windowMs: 3000 });

    expect(answered).toHaveLength(1);
    expect(answered[0].message.text?.body).toBe("uno\ndos");
  });

  it("splits a flood into batches of at most INBOUND_MAX_BATCH messages, in order", async () => {
    const rows = Array.from({ length: INBOUND_MAX_BATCH + 2 }, (_, index) => row(`m${index}`, `t${index}`, index));
    const last = rows[rows.length - 1];
    const { coalescer, answered } = setup(rows, { nowMs: T0 + 20_000 });

    await coalescer.handle({ message: messageFor(last), usuarioId: "u1", windowMs: 3000 });

    expect(answered).toHaveLength(2);
    expect(answered[0].message.text?.body?.split("\n")).toHaveLength(INBOUND_MAX_BATCH);
    expect(answered[1].message.text?.body).toBe(`t${INBOUND_MAX_BATCH}\nt${INBOUND_MAX_BATCH + 1}`);
  });

  it("answers only the last message when the batch mixes text with a button or an image", async () => {
    const text = row("m1", "texto suelto", 0);
    const button = row("m2", null, 1, { tipoMensajeId: TipoMensajeId.IMAGEN });
    const { coalescer, answered } = setup([text, button], { nowMs: T0 + 1000 });

    await coalescer.handle({ message: messageFor(button, "image"), usuarioId: "u1", windowMs: 0 });

    expect(answered).toHaveLength(1);
    expect(answered[0].message.id).toBe("m2");
  });

  it("drops a message older than the maximum age, notifies once and never feeds it to the flow", async () => {
    const stale = row("m1", "hola", 0);
    const rows = [stale];
    const { coalescer, answered, notified } = setup(rows, { nowMs: T0 + INBOUND_MAX_AGE_MS + 1000 });

    await coalescer.handle({ message: messageFor(stale), usuarioId: "u1", windowMs: 3000 });

    expect(answered).toEqual([]);
    expect(notified).toEqual(["wa1"]);
    expect(rows[0].processed).toBe(true);
  });

  it("marks a stale message as processed so a later flush does not pick it up", async () => {
    const stale = row("m1", "hola", 0);
    const fresh = row("m2", "nuevo", INBOUND_MAX_AGE_MS / 1000 + 5);
    const rows = [stale, fresh];
    const { coalescer, answered } = setup(rows, { nowMs: T0 + INBOUND_MAX_AGE_MS + 5000 });

    await coalescer.handle({ message: messageFor(stale), usuarioId: "u1", windowMs: 0 });
    await coalescer.handle({ message: messageFor(fresh), usuarioId: "u1", windowMs: 0 });

    expect(rows[0].processed).toBe(true);
    expect(answered).toHaveLength(1);
    expect(answered[0].message.text?.body).toBe("nuevo");
  });

  it("ignores an identical text that arrives right after an already processed one when no window applies", async () => {
    const first = row("m1", "123456", 0, { processed: true });
    const second = row("m2", "123456", 1);
    const { coalescer, answered } = setup([first, second], { nowMs: T0 + 1000 });

    await coalescer.handle({ message: messageFor(second), usuarioId: "u1", windowMs: 0 });

    expect(answered).toEqual([]);
  });

  it("does not ignore a repeated text once the repeat window has passed", async () => {
    const first = row("m1", "123456", 0, { processed: true });
    const second = row("m2", "123456", 30);
    const { coalescer, answered } = setup([first, second], { nowMs: T0 + 30_000 });

    await coalescer.handle({ message: messageFor(second), usuarioId: "u1", windowMs: 0 });

    expect(answered).toHaveLength(1);
  });
});
