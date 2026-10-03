// Espejo de prisma/schema.prisma -> enum MessageType. Mantener sincronizado.
export enum MessageType {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
  DOCUMENT = "DOCUMENT",
  LOCATION = "LOCATION",
  TEMPLATE = "TEMPLATE",
  UNKNOWN = "UNKNOWN",
}
