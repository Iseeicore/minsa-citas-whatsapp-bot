import type { MenuChoice } from "@/lib/enums/menu-choice";
import type { QueryEffectKind } from "@/lib/fsm/core/types";

export class DisabledServiceQueryError extends Error {
  constructor(
    readonly kind: QueryEffectKind,
    readonly serviceId: MenuChoice,
  ) {
    super(`resolveQuery: query "${kind}" belongs to the disabled service "${serviceId}"`);
    this.name = "DisabledServiceQueryError";
  }
}
