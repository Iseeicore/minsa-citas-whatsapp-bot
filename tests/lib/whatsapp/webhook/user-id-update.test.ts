import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = { id: string; waId: string };

const db = vi.hoisted(() => ({
  usuarios: [] as Array<{ id: string; waId: string }>,
  sesiones: [] as Array<{ id: string; waId: string }>,
  actores: [] as string[],
  fallar: false,
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/db/actor", () => ({
  ACTOR_EXTERNO_META: "externo:meta",
  declararActorEn: async (_tx: unknown, actor: string) => {
    db.actores.push(actor);
  },
}));
vi.mock("@/lib/observability/logger", () => ({ logger: { warn: db.warn, info: db.info, error: db.error } }));

const tabla = (filas: Fila[]) => ({
  findUnique: async ({ where }: { where: { waId: string } }) => filas.find((fila) => fila.waId === where.waId) ?? null,
  update: async ({ where, data }: { where: { id: string }; data: { waId: string } }) => {
    const fila = filas.find((candidate) => candidate.id === where.id);
    if (fila) fila.waId = data.waId;
    return fila;
  },
  updateMany: async ({ where, data }: { where: { waId: string }; data: { waId: string } }) => {
    for (const fila of filas.filter((candidate) => candidate.waId === where.waId)) fila.waId = data.waId;
  },
  deleteMany: async ({ where }: { where: { waId: string } }) => {
    for (let index = filas.length - 1; index >= 0; index--) if (filas[index].waId === where.waId) filas.splice(index, 1);
  },
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      if (db.fallar) throw new Error("connection refused");
      return run({ usuario: tabla(db.usuarios), sesionConversacion: tabla(db.sesiones) });
    },
  },
}));

import { applyBsuidChange, extractBsuidChanges, processBsuidChanges } from "@/lib/whatsapp/webhook/user-id-update";

const OLD = "PE.111111111111";
const NEW = "PE.222222222222";

describe("extractBsuidChanges", () => {
  it("lee el webhook user_id_update (previous → current)", () => {
    expect(
      extractBsuidChanges({
        user_id_update: [{ wa_id: "5199", user_id: { previous: OLD, current: NEW } }],
      }),
    ).toEqual([{ previous: OLD, current: NEW }]);
  });

  it("lee el mensaje de sistema user_changed_user_id cuando trae el identificador anterior", () => {
    expect(
      extractBsuidChanges({
        messages: [
          { id: "m1", from_user_id: NEW, timestamp: "1", type: "system", system: { type: "user_changed_user_id", user_id: NEW, previous_user_id: OLD } },
        ],
      }),
    ).toEqual([{ previous: OLD, current: NEW }]);
  });

  it("ignora lo que no tiene la forma esperada (sin anterior, iguales, vacío o de otro tipo)", () => {
    expect(
      extractBsuidChanges({
        user_id_update: [{ user_id: { current: NEW } }, { user_id: { previous: OLD, current: OLD } }, {}, { user_id: { previous: "", current: NEW } }],
        messages: [
          { id: "m1", from_user_id: NEW, timestamp: "1", type: "system", system: { type: "user_changed_user_id", user_id: NEW } },
          { id: "m2", from_user_id: NEW, timestamp: "1", type: "system", system: { type: "otro", user_id: NEW, previous_user_id: OLD } },
          { id: "m3", from_user_id: NEW, timestamp: "1", type: "text", text: { body: "hola" } },
        ],
      }),
    ).toEqual([]);
    expect(extractBsuidChanges({})).toEqual([]);
  });
});

describe("applyBsuidChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.usuarios.splice(0, db.usuarios.length, { id: "u-ana", waId: OLD });
    db.sesiones.splice(0, db.sesiones.length, { id: "s-ana", waId: OLD });
    db.actores.length = 0;
  });

  it("caso feliz: el usuario y su sesión pasan al identificador nuevo, firmado por Meta", async () => {
    await expect(applyBsuidChange({ previous: OLD, current: NEW })).resolves.toBe("migrated");

    expect(db.usuarios).toEqual([{ id: "u-ana", waId: NEW }]);
    expect(db.sesiones).toEqual([{ id: "s-ana", waId: NEW }]);
    expect(db.actores).toEqual(["externo:meta"]);
    expect(db.info).toHaveBeenCalledWith("webhook.bsuid_updated", { previous: "...1111", current: "...2222" });
  });

  it("idempotente: una reentrega no cambia nada", async () => {
    await applyBsuidChange({ previous: OLD, current: NEW });
    const antes = JSON.stringify([db.usuarios, db.sesiones]);

    await expect(applyBsuidChange({ previous: OLD, current: NEW })).resolves.toBe("unchanged");

    expect(JSON.stringify([db.usuarios, db.sesiones])).toBe(antes);
  });

  it("si el identificador nuevo ya tiene usuario propio no se fusionan: queda igual y se avisa", async () => {
    db.usuarios.push({ id: "u-nuevo", waId: NEW });

    await expect(applyBsuidChange({ previous: OLD, current: NEW })).resolves.toBe("conflict");

    expect(db.usuarios).toEqual([
      { id: "u-ana", waId: OLD },
      { id: "u-nuevo", waId: NEW },
    ]);
    expect(db.sesiones).toEqual([{ id: "s-ana", waId: OLD }]);
    expect(db.warn).toHaveBeenCalledWith("webhook.bsuid_conflict", { previous: "...1111", current: "...2222" });
  });

  it("si el identificador nuevo ya tenía sesión, la anterior se descarta en vez de chocar con el índice único", async () => {
    db.sesiones.push({ id: "s-nueva", waId: NEW });

    await expect(applyBsuidChange({ previous: OLD, current: NEW })).resolves.toBe("migrated");

    expect(db.sesiones).toEqual([{ id: "s-nueva", waId: NEW }]);
  });

  it("un identificador anterior desconocido no hace nada", async () => {
    await expect(applyBsuidChange({ previous: "PE.999", current: NEW })).resolves.toBe("unchanged");

    expect(db.usuarios).toEqual([{ id: "u-ana", waId: OLD }]);
  });
});

describe("processBsuidChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.fallar = false;
    db.usuarios.splice(0, db.usuarios.length, { id: "u-ana", waId: OLD });
    db.sesiones.splice(0, db.sesiones.length);
  });

  it("aplica cada cambio del valor del webhook", async () => {
    await processBsuidChanges({ user_id_update: [{ user_id: { previous: OLD, current: NEW } }] });

    expect(db.usuarios).toEqual([{ id: "u-ana", waId: NEW }]);
  });

  it("un fallo de la base se registra y no se propaga (no tumba los mensajes del mismo webhook)", async () => {
    db.fallar = true;

    await expect(processBsuidChanges({ user_id_update: [{ user_id: { previous: OLD, current: NEW } }] })).resolves.toBeUndefined();

    expect(db.error).toHaveBeenCalledWith("webhook.bsuid_update_failed", expect.objectContaining({ previous: "...1111", current: "...2222" }));
    expect(db.usuarios).toEqual([{ id: "u-ana", waId: OLD }]);
  });
});
