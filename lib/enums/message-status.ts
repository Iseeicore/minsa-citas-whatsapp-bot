// Espejo de prisma/schema.prisma -> enum MessageStatus. Mantener sincronizado.
export enum MessageStatus {
  PENDING = "PENDING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  READ = "READ",
  FAILED = "FAILED",
}
