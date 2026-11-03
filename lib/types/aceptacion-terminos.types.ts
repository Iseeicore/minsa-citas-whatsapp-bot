import type { DocumentoAceptacion } from "@/lib/enums/consentimiento/documento-aceptacion";
import type { DocumentoBloqueTipo } from "@/lib/enums/consentimiento/documento-bloque-tipo";
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

export type DocumentoItem = {
  texto: string;
  subitems?: readonly string[];
};

export type DocumentoBloque =
  | { tipo: DocumentoBloqueTipo.PARRAFO; texto: string }
  | { tipo: DocumentoBloqueTipo.SUBTITULO; texto: string }
  | { tipo: DocumentoBloqueTipo.LISTA; items: readonly DocumentoItem[] };

export type DocumentoApartado = {
  titulo?: string;
  bloques: readonly DocumentoBloque[];
};

export type DocumentoSeccion = {
  ancla: string;
  titulo: string;
  apartados: readonly DocumentoApartado[];
};

export type AceptacionTerminosStore = {
  save(aceptacion: AceptacionTerminos): Promise<void>;
  findAceptados(consulta: ConsultaAceptacionTerminos): Promise<DocumentoAceptacion[]>;
};
