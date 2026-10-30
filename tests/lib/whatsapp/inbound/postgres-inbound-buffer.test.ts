import { beforeEach, describe, expect, it, vi } from "vitest";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";

const db = vi.hoisted(() => ({
  queryRaw: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => []),
  executeRaw: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => 0),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: db.queryRaw,
    $executeRaw: db.executeRaw,
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  },
}));

import { createPostgresInboundBuffer } from "@/lib/whatsapp/inbound/postgres-inbound-buffer";

const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

describe("createPostgresInboundBuffer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("summarizes the pending inbound messages of one user with a single query", async () => {
    db.queryRaw.mockResolvedValueOnce([{ count: 2, newest: "m2", oldest: new Date("2026-10-10T12:00:00Z") }]);

    const summary = await createPostgresInboundBuffer().summarize("u1");

    expect(summary).toEqual({ count: 2, newestWaMessageId: "m2", oldestArrivedAt: new Date("2026-10-10T12:00:00Z") });
    expect(db.queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlOf(db.queryRaw.mock.calls[0])).toMatch(/procesado_en IS NULL/);
  });

  it("returns an empty summary when nothing is pending", async () => {
    db.queryRaw.mockResolvedValueOnce([{ count: 0, newest: null, oldest: null }]);

    await expect(createPostgresInboundBuffer().summarize("u1")).resolves.toEqual({
      count: 0,
      newestWaMessageId: null,
      oldestArrivedAt: null,
    });
  });

  it("claims the pending rows in one UPDATE ... RETURNING and sorts them by Meta timestamp, then arrival", async () => {
    db.queryRaw.mockResolvedValueOnce([
      {
        usuario_id: "u1",
        wa_message_id: "m2",
        contenido: "b",
        media_id: null,
        tipo_mensaje_id: 1,
        fecha_hora: new Date(2000),
        fecha_creacion: new Date(10),
      },
      {
        usuario_id: "u1",
        wa_message_id: "m1",
        contenido: "a",
        media_id: null,
        tipo_mensaje_id: 1,
        fecha_hora: new Date(1000),
        fecha_creacion: new Date(20),
      },
    ]);

    const rows = await createPostgresInboundBuffer().claim("u1", 10, "m2");

    expect(rows.map((row) => row.waMessageId)).toEqual(["m1", "m2"]);
    expect(rows[0]).toEqual({
      usuarioId: "u1",
      waMessageId: "m1",
      contenido: "a",
      mediaId: null,
      tipoMensajeId: TipoMensajeId.TEXTO,
      fechaHora: new Date(1000),
      arrivedAt: new Date(20),
    });
    const sql = sqlOf(db.queryRaw.mock.calls[0]);
    expect(sql).toMatch(/UPDATE chatbot\.mensaje/);
    expect(sql).toMatch(/RETURNING/);
  });

  it("claims the pending images together with the texts and returns their media id", async () => {
    db.queryRaw.mockResolvedValueOnce([
      {
        usuario_id: "u1",
        wa_message_id: "m1",
        contenido: null,
        media_id: "media-1",
        tipo_mensaje_id: TipoMensajeId.IMAGEN,
        fecha_hora: new Date(1000),
        fecha_creacion: new Date(10),
      },
    ]);

    const rows = await createPostgresInboundBuffer().claim("u1", 10, "m9");

    expect(rows).toEqual([
      {
        usuarioId: "u1",
        waMessageId: "m1",
        contenido: null,
        mediaId: "media-1",
        tipoMensajeId: TipoMensajeId.IMAGEN,
        fechaHora: new Date(1000),
        arrivedAt: new Date(10),
      },
    ]);
    const [strings, ...values] = db.queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).toMatch(/tipo_mensaje_id IN \(\?, \?\) OR wa_message_id = \?/);
    expect(strings.join("?")).toMatch(/RETURNING .*media_id/);
    expect(values).toEqual(expect.arrayContaining([TipoMensajeId.TEXTO, TipoMensajeId.IMAGEN, "m9"]));
  });

  it("marks a single message as processed on discard", async () => {
    await createPostgresInboundBuffer().discard("m1");

    expect(sqlOf(db.executeRaw.mock.calls.at(-1) ?? [])).toMatch(/procesado_en/);
  });

  it("reports whether an identical text was already processed after a given moment", async () => {
    db.queryRaw.mockResolvedValueOnce([{ existe: 1 }]).mockResolvedValueOnce([]);
    const buffer = createPostgresInboundBuffer();

    await expect(buffer.wasRepeated("u1", "m2", "123456", new Date())).resolves.toBe(true);
    await expect(buffer.wasRepeated("u1", "m2", "123456", new Date())).resolves.toBe(false);
  });

  it("expires every pending inbound message older than a moment and returns how many", async () => {
    db.queryRaw.mockResolvedValueOnce([{ count: 3 }]);

    await expect(createPostgresInboundBuffer().expireStale(new Date())).resolves.toBe(3);
  });
});
