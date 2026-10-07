import { z } from "zod";
import { isValidDniFormat } from "@/lib/fsm/parsing/text/identity-format";

export const MAX_DESCRIPCION_LENGTH = 1000;

/** Frontera del módulo: lo que no valida acá no llega a la base. */
export const registrarIncidenciaSchema = z.object({
  waId: z.string().min(1),
  dni: z.string().refine(isValidDniFormat, "DNI inválido").nullable().default(null),
  nombreCompleto: z.string().min(1).nullable().default(null),
  descripcion: z.string().trim().min(1).max(MAX_DESCRIPCION_LENGTH),
  mediaDataUri: z.string().optional(),
});

export type RegistrarIncidenciaInput = z.infer<typeof registrarIncidenciaSchema>;

export type RegistrarIncidenciaResult =
  | { status: "accepted" }
  | { status: "rejected"; reason: "media_too_large" | "other" }
  | { status: "error" };
