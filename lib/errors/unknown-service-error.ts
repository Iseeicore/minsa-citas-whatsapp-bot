import type { MenuChoice } from "@/lib/enums/menu-choice";

export class UnknownServiceError extends Error {
  constructor(readonly serviceId: MenuChoice) {
    super(`ServiceCatalog: unknown service "${serviceId}"`);
    this.name = "UnknownServiceError";
  }
}
