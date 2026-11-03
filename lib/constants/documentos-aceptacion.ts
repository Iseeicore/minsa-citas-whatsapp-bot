import { DocumentoAceptacion } from "@/lib/enums/consentimiento/documento-aceptacion";
import { FlujoAceptacion } from "@/lib/enums/consentimiento/flujo-aceptacion";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { TERMINOS_CONTENIDO, TERMINOS_TITULO_TEXT, TERMINOS_VERSION } from "@/lib/constants/textos/terminos";
import {
  DATOS_PERSONALES_CONTENIDO,
  DATOS_PERSONALES_TITULO_TEXT,
  DATOS_PERSONALES_VERSION,
} from "@/lib/constants/textos/datos-personales";
import { AUTORIZACION_DENUNCIA_VERSION } from "@/lib/constants/textos/incidencia";
import type { DocumentoSeccion, DocumentoVigente } from "@/lib/types/aceptacion-terminos.types";

export const DOCUMENTOS_CITA: readonly DocumentoVigente[] = [
  { documento: DocumentoAceptacion.TERMINOS, version: TERMINOS_VERSION },
  { documento: DocumentoAceptacion.DATOS_PERSONALES, version: DATOS_PERSONALES_VERSION },
];

export const DOCUMENTOS_DENUNCIA: readonly DocumentoVigente[] = [
  { documento: DocumentoAceptacion.DATOS_PERSONALES, version: AUTORIZACION_DENUNCIA_VERSION },
];

export const SERVICIO_POR_FLUJO_ACEPTACION: Readonly<Record<FlujoAceptacion, MenuChoice>> = {
  [FlujoAceptacion.CITA]: MenuChoice.AGENDAR_CITA,
  [FlujoAceptacion.DENUNCIA]: MenuChoice.REGISTRAR_INCIDENCIA,
};

export const DOCUMENTOS_SECCIONES: readonly DocumentoSeccion[] = [
  { ancla: "terminos", titulo: TERMINOS_TITULO_TEXT, contenido: TERMINOS_CONTENIDO },
  { ancla: "datos-personales", titulo: DATOS_PERSONALES_TITULO_TEXT, contenido: DATOS_PERSONALES_CONTENIDO },
];
