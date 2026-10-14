import { describe, expect, it } from "vitest";
import { UnhandledQueryKindError } from "@/lib/errors/unhandled-query-kind-error";

describe("UnhandledQueryKindError", () => {
  it("keeps the message byte for byte", () => {
    expect(new UnhandledQueryKindError("ghost_query").message).toBe('resolveQuery: unhandled query kind "ghost_query"');
  });

  it("is an Error named after its class that carries the query kind", () => {
    const error = new UnhandledQueryKindError("ghost_query");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UnhandledQueryKindError);
    expect(error.name).toBe("UnhandledQueryKindError");
    expect(error.kind).toBe("ghost_query");
  });
});
