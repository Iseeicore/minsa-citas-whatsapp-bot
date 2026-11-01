export type DniVerificadoStore = {
  save(waId: string, dni: string): Promise<void>;
};
