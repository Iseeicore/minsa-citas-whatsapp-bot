import type { AlmacenEvidencias } from "@/lib/types/almacen-evidencias.types";

export const almacenEnLaBase: AlmacenEvidencias = {
  guardar: async ({ mimeType, bytes }) => ({ ruta: `data:${mimeType};base64,${bytes.toString("base64")}` }),
};
