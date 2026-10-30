export type ConsentimientoStore = {
  tieneAceptado(waId: string): Promise<boolean>;
  marcarAceptado(waId: string): Promise<void>;
};
