import { DocumentoAceptacion } from "@/lib/enums/documento-aceptacion";
import { TERMINOS_CONTENIDO, TERMINOS_TITULO_TEXT, TERMINOS_VERSION } from "@/lib/constants/textos/terminos";
import {
  DATOS_PERSONALES_CONTENIDO,
  DATOS_PERSONALES_TITULO_TEXT,
  DATOS_PERSONALES_VERSION,
} from "@/lib/constants/textos/datos-personales";
import type { DocumentoSeccion, DocumentoVigente } from "@/lib/types/aceptacion-terminos.types";

export const DOCUMENTOS_CITA: readonly DocumentoVigente[] = [
  { documento: DocumentoAceptacion.TERMINOS, version: TERMINOS_VERSION },
  { documento: DocumentoAceptacion.DATOS_PERSONALES, version: DATOS_PERSONALES_VERSION },
];

export const DOCUMENTOS_SECCIONES: readonly DocumentoSeccion[] = [
  { ancla: "terminos", titulo: TERMINOS_TITULO_TEXT, contenido: TERMINOS_CONTENIDO },
  { ancla: "datos-personales", titulo: DATOS_PERSONALES_TITULO_TEXT, contenido: DATOS_PERSONALES_CONTENIDO },
];
