import type { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";

export type PendingInbound = {
  usuarioId: string;
  waMessageId: string;
  contenido: string | null;
  mediaId: string | null;
  tipoMensajeId: TipoMensajeId;
  fechaHora: Date;
  arrivedAt: Date;
};

export type PendingSummary = {
  count: number;
  newestWaMessageId: string | undefined;
  oldestArrivedAt: Date | undefined;
};

export type InboundBuffer = {
  summarize(usuarioId: string): Promise<PendingSummary>;
  claim(usuarioId: string, limit: number, ownerWaMessageId: string): Promise<PendingInbound[]>;
  discard(waMessageId: string): Promise<void>;
  wasRepeated(usuarioId: string, waMessageId: string, contenido: string, since: Date): Promise<boolean>;
  expireStale(olderThan: Date): Promise<number>;
};
