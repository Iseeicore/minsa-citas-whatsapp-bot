import { describe, expect, it } from "vitest";
import { DatabaseDisabledError } from "@/lib/errors/database-disabled-error";

describe("DatabaseDisabledError", () => {
  it("keeps the message byte for byte", () => {
    expect(new DatabaseDisabledError().message).toBe(
      "Prisma was used while DATABASE_ENABLED=false; this code path must not touch the database",
    );
  });

  it("is an Error named after its class", () => {
    const error = new DatabaseDisabledError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DatabaseDisabledError);
    expect(error.name).toBe("DatabaseDisabledError");
  });
});
