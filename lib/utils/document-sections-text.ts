import { isNonEmptyString } from "@/lib/utils/type-guards";
import type { DocumentoSeccion } from "@/lib/types/aceptacion-terminos.types";

export function documentSectionsText(secciones: readonly DocumentoSeccion[]): string {
  return secciones
    .filter((seccion) => isNonEmptyString(seccion.contenido))
    .map((seccion) => `${seccion.titulo}\n${seccion.contenido}`)
    .join("\n\n");
}
