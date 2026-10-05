import { query } from "@/lib/fsm/core/handlers-shared";
import type { QueryEffect } from "@/lib/fsm/core/types";
import { tipoDocumentoDe } from "@/lib/fsm/parsing/text/identity-format";
import { QueryKind } from "@/lib/enums/query-kind";

export function validateUserQuery(numeroDocumento: string): QueryEffect {
  return query(QueryKind.VALIDATE_USER, { numeroDocumento, tipoDocumento: tipoDocumentoDe(numeroDocumento) });
}
