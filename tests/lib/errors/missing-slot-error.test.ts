import { describe, expect, it } from "vitest";
import { MissingSlotError } from "@/lib/errors/missing-slot-error";

describe("MissingSlotError", () => {
  it("names the missing value and the query, never the value itself", () => {
    expect(new MissingSlotError("citaBearer", "list_fechas").message).toBe(
      'resolveQuery: "citaBearer" is required for "list_fechas" and is missing',
    );
  });

  it("is an Error named after its class that carries the field and the query kind", () => {
    const error = new MissingSlotError("codEess", "list_horas");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MissingSlotError");
    expect(error.field).toBe("codEess");
    expect(error.queryKind).toBe("list_horas");
  });
});
