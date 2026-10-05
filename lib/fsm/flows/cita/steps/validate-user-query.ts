import { query } from "@/lib/fsm/core/handlers-shared";
import type { QueryEffect } from "@/lib/fsm/core/types";
import { tipoDocumentoDe } from "@/lib/fsm/parsing/identity-format";

export function validateUserQuery(numeroDocumento: string): QueryEffect {
  return query("validate_user", { numeroDocumento, tipoDocumento: tipoDocumentoDe(numeroDocumento) });
}
