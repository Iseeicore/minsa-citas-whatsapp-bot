import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  usuarioFindUnique: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  mensajeFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    usuario: { findUnique: db.usuarioFindUnique },
    mensaje: { findFirst: db.mensajeFindFirst },
  },
}));

import { findLastInbound, findUser, findUserState } from "@/lib/inbox/repository";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inbox repository", () => {
  it("answers undefined, not null, when the conversation does not exist", async () => {
    await expect(findUser("nope")).resolves.toBeUndefined();
    await expect(findUserState("nope")).resolves.toBeUndefined();
  });

  it("answers undefined when the citizen never wrote", async () => {
    await expect(findLastInbound("u-1")).resolves.toBeUndefined();
  });

  it("returns the row when it exists", async () => {
    db.usuarioFindUnique.mockResolvedValueOnce({ id: "u-1" });
    await expect(findUser("u-1")).resolves.toEqual({ id: "u-1" });
  });
});
