import { z } from "zod";
import { isValidDniFormat } from "@/lib/fsm/parsing/text/identity-format";
import type { RegistrationStatus } from "@/lib/enums/registration-status";
import type { RegistrationRejectReason } from "@/lib/enums/registration-reject-reason";
import { MAX_DESCRIPCION_LENGTH } from "@/lib/constants/limits/incidencia";

export const registrarIncidenciaSchema = z.object({
  waId: z.string().min(1),
  dni: z.string().refine(isValidDniFormat, "DNI inválido").nullable().default(null),
  nombreCompleto: z.string().min(1).nullable().default(null),
  establecimientoId: z.number().int().positive().nullable().default(null),
  descripcion: z.string().trim().min(1).max(MAX_DESCRIPCION_LENGTH),
  mediaDataUri: z.string().optional(),
});

export type RegistrarIncidenciaInput = z.infer<typeof registrarIncidenciaSchema>;

export type RegistrarIncidenciaResult =
  | { status: RegistrationStatus.ACCEPTED; codigo?: string }
  | {
      status: RegistrationStatus.REJECTED;
      reason: RegistrationRejectReason.MEDIA_TOO_LARGE | RegistrationRejectReason.DAILY_LIMIT | RegistrationRejectReason.OTHER;
    }
  | { status: RegistrationStatus.ERROR };
