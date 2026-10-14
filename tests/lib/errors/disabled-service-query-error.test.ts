import { describe, expect, it } from "vitest";
import { DisabledServiceQueryError } from "@/lib/errors/disabled-service-query-error";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { QueryKind } from "@/lib/enums/query-kind";

describe("DisabledServiceQueryError", () => {
  it("keeps the message byte for byte", () => {
    expect(new DisabledServiceQueryError(QueryKind.INCIDENCIA_REGISTER, MenuChoice.REGISTRAR_INCIDENCIA).message).toBe(
      'resolveQuery: query "incidencia_register" belongs to the disabled service "registrar_incidencia"',
    );
  });

  it("is an Error named after its class that carries the query kind and the service id", () => {
    const error = new DisabledServiceQueryError(QueryKind.INCIDENCIA_REGISTER, MenuChoice.REGISTRAR_INCIDENCIA);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DisabledServiceQueryError);
    expect(error.name).toBe("DisabledServiceQueryError");
    expect(error.kind).toBe("incidencia_register");
    expect(error.serviceId).toBe("registrar_incidencia");
  });
});
