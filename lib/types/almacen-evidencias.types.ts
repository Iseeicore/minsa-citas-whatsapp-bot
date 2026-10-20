import type { ImageMimeType } from "@/lib/enums/image-mime-type";
import type { ImageValidationFailure } from "@/lib/enums/image-validation-failure";

export type ImagenValidada = { bytes: Buffer; mimeType: ImageMimeType };

export type ImagenRechazada = { failure: ImageValidationFailure };

export type EvidenciaGuardada = { ruta: string };

export type AlmacenEvidencias = { guardar: (imagen: ImagenValidada) => Promise<EvidenciaGuardada> };
