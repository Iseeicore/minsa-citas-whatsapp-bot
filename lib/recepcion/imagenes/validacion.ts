import { IMAGE_SIGNATURES } from "@/lib/constants/image-signatures";
import { ImageMimeType } from "@/lib/enums/image-mime-type";
import { ImageValidationFailure } from "@/lib/enums/image-validation-failure";
import { parseImageDataUri } from "@/lib/recepcion/imagenes/data-uri";
import { ParsedImageStatus } from "@/lib/enums/parsed-image-status";
import type { ImagenRechazada, ImagenValidada } from "@/lib/types/almacen-evidencias.types";

const TIPOS_PERMITIDOS: readonly string[] = Object.values(ImageMimeType);

const esTipoPermitido = (mimeType: string): mimeType is ImageMimeType => TIPOS_PERMITIDOS.includes(mimeType);

const rechazada = (failure: ImageValidationFailure): ImagenRechazada => ({ failure });

function tieneFirma(bytes: Buffer, mimeType: ImageMimeType): boolean {
  return IMAGE_SIGNATURES[mimeType].every(({ offset, bytes: firma }) =>
    bytes.subarray(offset, offset + firma.length).equals(Buffer.from(firma)),
  );
}

export const esImagenRechazada = (imagen: ImagenValidada | ImagenRechazada): imagen is ImagenRechazada => "failure" in imagen;

export function validarImagen(dataUri: string): ImagenValidada | ImagenRechazada {
  const parsed = parseImageDataUri(dataUri);
  if (parsed.status === ParsedImageStatus.INVALID) return rechazada(ImageValidationFailure.INVALID);
  if (parsed.status === ParsedImageStatus.TOO_LARGE) return rechazada(ImageValidationFailure.TOO_LARGE);

  const { mimeType, bytes } = parsed;
  if (!esTipoPermitido(mimeType)) return rechazada(ImageValidationFailure.INVALID);
  if (!tieneFirma(bytes, mimeType)) return rechazada(ImageValidationFailure.INVALID);
  return { mimeType, bytes };
}
