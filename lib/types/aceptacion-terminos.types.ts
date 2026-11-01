import type { FlujoAceptacion } from "@/lib/enums/flujo-aceptacion";
import type { SessionChannel } from "@/lib/enums/session-channel";

export type AceptacionTerminos = {
  waId: string;
  canal: SessionChannel;
  version: string;
  flujo: FlujoAceptacion;
};

export type AceptacionTerminosRegistrada = {
  aceptadoEn: Date;
};

export type AceptacionTerminosStore = {
  save(aceptacion: AceptacionTerminos): Promise<void>;
  find(waId: string, version: string): Promise<AceptacionTerminosRegistrada | undefined>;
};
