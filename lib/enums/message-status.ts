// Contrato de la bandeja web (lib/inbox/dto.ts los traduce desde los ids de los catalogos de la base).
export enum MessageStatus {
  PENDING = "PENDING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  READ = "READ",
  FAILED = "FAILED",
}
