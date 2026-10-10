import type { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";

export type PendingInbound = {
  usuarioId: string;
  waMessageId: string;
  contenido: string | null;
  tipoMensajeId: TipoMensajeId;
  fechaHora: Date;
  arrivedAt: Date;
};

export type PendingSummary = {
  count: number;
  newestWaMessageId: string | null;
  oldestArrivedAt: Date | null;
};

/** Puerto de la cola de entrada: hoy lo implementa Postgres; si mañana hace falta Redis solo se cambia el adaptador. */
export type InboundBuffer = {
  summarize(usuarioId: string): Promise<PendingSummary>;
  /** Toma de forma atómica hasta `limit` mensajes pendientes; los que no son texto solo los puede tomar su dueño. */
  claim(usuarioId: string, limit: number, ownerWaMessageId: string): Promise<PendingInbound[]>;
  discard(waMessageId: string): Promise<void>;
  wasRepeated(usuarioId: string, waMessageId: string, contenido: string, since: Date): Promise<boolean>;
  expireStale(olderThan: Date): Promise<number>;
};
