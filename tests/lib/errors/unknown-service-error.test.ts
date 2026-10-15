import { describe, expect, it } from "vitest";
import { UnknownServiceError } from "@/lib/errors/unknown-service-error";
import { MenuChoice } from "@/lib/enums/menu-choice";

describe("UnknownServiceError", () => {
  it("keeps the message byte for byte", () => {
    expect(new UnknownServiceError(MenuChoice.REGISTRAR_INCIDENCIA).message).toBe('ServiceCatalog: unknown service "registrar_incidencia"');
  });

  it("is an Error named after its class that carries the service id", () => {
    const error = new UnknownServiceError(MenuChoice.REGISTRAR_INCIDENCIA);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UnknownServiceError);
    expect(error.name).toBe("UnknownServiceError");
    expect(error.serviceId).toBe("registrar_incidencia");
  });
});
