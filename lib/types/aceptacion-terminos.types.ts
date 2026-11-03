import type { DocumentoAceptacion } from "@/lib/enums/consentimiento/documento-aceptacion";
import type { FlujoAceptacion } from "@/lib/enums/consentimiento/flujo-aceptacion";
import type { SessionChannel } from "@/lib/enums/session-channel";

export type DocumentoVigente = {
  documento: DocumentoAceptacion;
  version: string;
};

export type ConsultaAceptacionTerminos = {
  waId: string;
  flujo: FlujoAceptacion;
  documentos: readonly DocumentoVigente[];
};

export type AceptacionTerminos = ConsultaAceptacionTerminos & {
  canal: SessionChannel;
};

export type DocumentoSeccion = {
  ancla: string;
  titulo: string;
  contenido: string;
};

export type AceptacionTerminosStore = {
  save(aceptacion: AceptacionTerminos): Promise<void>;
  findAceptados(consulta: ConsultaAceptacionTerminos): Promise<DocumentoAceptacion[]>;
};
