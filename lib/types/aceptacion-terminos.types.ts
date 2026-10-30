import type { SessionChannel } from "@/lib/enums/session-channel";

export type AceptacionTerminos = {
  waId: string;
  canal: SessionChannel;
  version: string;
};

export type AceptacionTerminosStore = {
  save(aceptacion: AceptacionTerminos): Promise<void>;
};
