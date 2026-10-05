// Contrato de la bandeja web (lib/inbox/dto.ts los traduce desde los ids de los catalogos de la base).
export enum MessageType {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
  DOCUMENT = "DOCUMENT",
  LOCATION = "LOCATION",
  TEMPLATE = "TEMPLATE",
  UNKNOWN = "UNKNOWN",
}
